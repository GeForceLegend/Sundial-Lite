//     _________      __        __     ___       __     __________      ________        ______        __           
//    /  _____  \    |  |      |  |   |   \     |  |   |   _____  \    |__    __|      /  __  \      |  |          
//   /  /     \__\   |  |      |  |   |    \    |  |   |  |     \  \      |  |        /  /  \  \     |  |          
//  |  |             |  |      |  |   |  |  \   |  |   |  |      |  |     |  |       /  /    \  \    |  |          
//   \  \______      |  |      |  |   |  |\  \  |  |   |  |      |  |     |  |      |  |______|  |   |  |          
//    \______  \     |  |      |  |   |  | \  \ |  |   |  |      |  |     |  |      |   ______   |   |  |          
//           \  \    |  |      |  |   |  |  \  \|  |   |  |      |  |     |  |      |  |      |  |   |  |          
//  ___       |  |   |  |      |  |   |  |   \  |  |   |  |      |  |     |  |      |  |      |  |   |  |          
//  \  \_____/  /     \  \____/  /    |  |    \    |   |  |_____/  /    __|  |__    |  |      |  |   |  |_________ 
//   \_________/       \________/     |__|     \___|   |__________/    |________|   |__|      |__|   |____________|
//
//  General Public License v3.0. © 2021-Now GeForceLegend.
//  https://github.com/GeForceLegend/Sundial-Lite
//  https://www.gnu.org/licenses/gpl-3.0.en.html
//
//  Lighting that don't need calculated in SSILVB
//

#extension GL_ARB_gpu_shader5 : enable
#extension GL_ARB_shading_language_packing: enable

layout(location = 0) out vec4 texBuffer3;

in vec2 texcoord;

uniform int heldBlockLightValue;
uniform vec3 relativeEyePosition;

#define VANILLA_BLOCK_LIGHT_FADE 2.0 // [0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    GbufferData gbufferData = getGbufferData(texel, texcoord);
    vec3 viewPos;
    #ifdef LOD
        if (gbufferData.depth == 1.0) {
            gbufferData.depth = getLodDepthSolidDeferred(texcoord);
            viewPos = screenToViewPosLod(texcoord, gbufferData.depth - 1e-7);
            gbufferData.depth = -gbufferData.depth;
        } else
    #endif
    {
        if (gbufferData.materialID == MAT_HAND) {
            gbufferData.depth = gbufferData.depth / MC_HAND_DEPTH - 0.5 / MC_HAND_DEPTH + 0.5;
        }
        viewPos = screenToViewPos(texcoord, gbufferData.depth - 1e-7);
    }

    vec4 finalColor = vec4(0.0);
    if (abs(gbufferData.depth) < 1.0) {
        vec3 viewDir = normalize(viewPos);
        vec3 worldPos = viewToWorldPos(viewPos);
        vec3 worldNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.normal);
        vec3 worldGeoNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.geoNormal);

        float diffuseWeight = pow(1.0 - gbufferData.smoothness, 5.0);
        vec3 n = vec3(1.5);
        vec3 k = vec3(0.0);
        #ifdef LABPBR_F0
            n = mix(n, vec3(f0ToIor(gbufferData.metalness)), step(0.001, gbufferData.metalness));
            hardcodedMetal(gbufferData.metalness, n, k);
            gbufferData.metalness = step(229.5 / 255.0, gbufferData.metalness);
        #endif
        #ifndef FULL_REFLECTION
            diffuseWeight = 1.0 - (1.0 - diffuseWeight) * sqrt(clamp(gbufferData.smoothness - (1.0 - gbufferData.smoothness) * (1.0 - 0.6666 * gbufferData.metalness), 0.0, 1.0));
        #endif
        finalColor.rgb = vec3(BASIC_LIGHT);

        vec4 visibilityBitmask = texelFetch(colortex5, texel, 0);
        #ifdef VBGI
            finalColor.rgb += visibilityBitmask.rgb;
        #endif

        finalColor.rgb += pow(texelFetch(colortex4, ivec2(0), 0).rgb, vec3(2.2)) * NIGHT_VISION_BRIGHTNESS;
        #ifdef IS_IRIS
            float eyeRelatedDistance = length(worldPos + relativeEyePosition);
            gbufferData.lightmap.x = max(gbufferData.lightmap.x, heldBlockLightValue / 15.0 * clamp(1.0 - eyeRelatedDistance / 15.0, 0.0, 1.0));
        #endif
        const float fadeFactor = VANILLA_BLOCK_LIGHT_FADE;
        vec3 blockLight = pow2(1.0 / (fadeFactor - fadeFactor * fadeFactor / (1.0 + fadeFactor) * gbufferData.lightmap.x) - 1.0 / fadeFactor) * lightColor;
        finalColor.rgb += blockLight * (1.0 - visibilityBitmask.w);
        float NdotV = clamp(dot(viewDir, -gbufferData.normal), 0.0, 1.0);
        vec3 diffuseAbsorption = (1.0 - gbufferData.metalness) * diffuseAbsorptionWeight(NdotV, gbufferData.smoothness, gbufferData.metalness, n, k);
        finalColor.rgb *= diffuseAbsorption + diffuseWeight / PI;
        finalColor.rgb *= gbufferData.albedo.rgb;
    }
    finalColor += texelFetch(colortex3, texel, 0);

    texBuffer3 = finalColor;
}

/* DRAWBUFFERS:3 */
