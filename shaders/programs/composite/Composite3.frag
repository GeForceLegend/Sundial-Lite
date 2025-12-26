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
//  Reflection filter stage 2, applying BRDF weight
//

layout(location = 0) out vec4 texBuffer4;

in vec2 texcoord;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    float waterDepth = texelFetch(depthtex0, texel, 0).r;
    vec3 reflectionColor = vec3(0.0);

    #ifdef REFLECTION
        bool isTerrain = waterDepth < 1.0;
        #ifdef LOD
            isTerrain = isTerrain || getLodDepthWater(texcoord) < 1.0;
        #endif
        if (isTerrain) {
            GbufferData gbufferData = getGbufferData(texel, texcoord);
            vec4 originData = texelFetch(colortex4, texel, 0);

            vec3 viewPos = screenToViewPos(texcoord, waterDepth);
            float NdotV = clamp(-dot(viewPos, gbufferData.normal) * inversesqrt(dot(viewPos, viewPos)), 0.0, 1.0);
            #ifdef LABPBR_F0
                gbufferData.metalness = step(229.5 / 255.0, gbufferData.metalness);
            #endif
            vec3 reflectionWeight = metalColor(gbufferData.albedo.rgb, NdotV, gbufferData.metalness, gbufferData.smoothness);
            if (waterDepth == texelFetch(depthtex1, texel, 0).r) {
                float diffuseWeight = pow(1.0 - gbufferData.smoothness, 5.0);
                #ifndef FULL_REFLECTION
                    diffuseWeight = 1.0 - (1.0 - diffuseWeight) * sqrt(clamp(gbufferData.smoothness - (1.0 - gbufferData.smoothness) * (1.0 - 0.6666 * gbufferData.metalness), 0.0, 1.0));
                #endif
                reflectionWeight *= 1.0 - diffuseWeight;
            }

            #if REFLECTION_FILTER > 0
                float originReflectionDepth = originData.w;
                float originSmoothness = gbufferData.smoothness;
                if (originSmoothness < 0.9975 && originReflectionDepth > 1e-5) {
                    float routhness = pow2(1.0 - originSmoothness);
                    float roughnessInv = 100.0 / max(routhness, 1e-5);
                    vec2 coordOffset = vec2(4.0 * clamp(routhness * 20.0, 0.0, 1.0) * (1.0 - exp(-sqrt(originReflectionDepth) * 50.0)));
                    coordOffset *= blueNoiseTemporal(texcoord).x + 0.5;

                    vec3 accumulation = originData.rgb;
                    float weightAccumulation = 1.0;

                    for (int i = -REFLECTION_FILTER; i < REFLECTION_FILTER + 1; i++) {
                        for (int j = -REFLECTION_FILTER; j < REFLECTION_FILTER + 1; j++) {
                            ivec2 sampleTexel = ivec2(texel + 0.5 + vec2(i, j) * coordOffset);
                            if (abs(i) + abs(j) > 0.5 && max(abs(sampleTexel.x / screenSize.x - 0.5), abs(sampleTexel.y / screenSize.y - 0.5)) < 0.5) {
                                vec4 sampleData = texelFetch(colortex4, sampleTexel, 0);
                                float sampleReflectionDepth = sampleData.w;
                                float sampleSmoothness = unpack2x8Bit(texelFetch(colortex2, sampleTexel, 0).g).x;

                                vec3 sampleNormal = getNormalTexel(sampleTexel);

                                float weight =
                                    pow(max(dot(gbufferData.normal, sampleNormal), 1e-6), roughnessInv) *
                                    pow(1.0 - abs(originSmoothness - sampleSmoothness), 100.0) *
                                    exp(-abs(originReflectionDepth - sampleReflectionDepth) * originSmoothness) *
                                    step(sampleSmoothness, 0.9975);
                                weight = clamp(weight, 0.0, 1.0);

                                accumulation += sampleData.rgb * weight;
                                weightAccumulation += weight;
                            }
                        }
                    }
                    originData.rgb = accumulation / weightAccumulation;
                }
            #endif

            reflectionColor = originData.rgb * reflectionWeight;
        }
    #endif

    texBuffer4 = vec4(reflectionColor, 1.0);
}

/* DRAWBUFFERS:4 */
