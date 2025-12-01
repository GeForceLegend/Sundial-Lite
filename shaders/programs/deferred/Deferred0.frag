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
//  Parallax depth offset for less calculation in upcoming shaders; Move previous visibility mask result to current frame position
//

#extension GL_ARB_shading_language_packing: enable

layout(location = 0) out vec4 texBuffer3;
layout(location = 1) out vec4 texBuffer5;

in vec2 texcoord;

uniform vec2 prevTaaOffset;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

vec2 getPrevCoord(inout vec3 prevWorldPos, vec3 viewPos, vec3 worldGeoNormal, float parallaxOffset, float materialID) {
    vec3 prevScreenPos;
    vec3 prevViewPos;
    if (materialID == MAT_HAND) {
        prevViewPos = viewPos;
        prevViewPos -= gbufferModelView[3].xyz * MC_HAND_DEPTH;
        prevViewPos += gbufferPreviousModelView[3].xyz * MC_HAND_DEPTH;
        vec3 prevViewNormal = mat3(gbufferModelView) * worldGeoNormal;
        prevViewPos -= parallaxOffset * prevViewPos / max(dot(prevViewPos, -prevViewNormal), 1e-5);
        prevScreenPos = viewToProjectionPos(prevViewPos);
    } else {
        prevWorldPos += cameraMovement;
        prevViewPos = prevWorldToViewPos(prevWorldPos);
        vec3 prevViewNormal = mat3(gbufferPreviousModelView) * worldGeoNormal;
        prevViewPos -= parallaxOffset * prevViewPos / max(dot(prevViewPos, -prevViewNormal), 1e-5);
        prevScreenPos = prevViewToProjectionPos(prevViewPos);
    }
    prevWorldPos = prevViewToWorldPos(prevViewPos);
    vec2 prevCoord = prevScreenPos.st * 0.5 + 0.5;
    return prevCoord;
}

vec4 samplePrevData(vec2 sampleTexelCoord, vec3 prevWorldPos, vec3 currNormal, vec3 geoNormal, float materialID, out float isPrevValid) {
    ivec2 sampleTexel = ivec2(sampleTexelCoord);
    vec4 prevSampleData = max(vec4(0.0), texelFetch(colortex5, sampleTexel, 0));
    #ifndef VBGI
        prevSampleData.rgb = vec3(0.0);
    #endif
    uvec2 prevGeometryData = texelFetch(colortex6, sampleTexel, 0).xy;
    float prevSampleDepth = min(1.0, uintBitsToFloat(prevGeometryData.y));
    vec3 prevNormal = decodeNormal(unpackUnorm2x16(prevGeometryData.x));

    vec2 sampleCoord = sampleTexelCoord * texelSize;
    vec2 screenCoord = sampleCoord;
    #ifdef TAA
        screenCoord -= prevTaaOffset;
    #endif
    vec3 prevSampleViewPos;
    #ifdef LOD
        if (prevSampleDepth < 0.0) {
            prevSampleViewPos = prevProjectionToViewPosLod(vec3(screenCoord, -prevSampleDepth) * 2.0 - 1.0);
        } else
    #endif
    {
        prevSampleViewPos = prevProjectionToViewPos(vec3(screenCoord, prevSampleDepth) * 2.0 - 1.0);
    }

    float normalFactor = pow(clamp(dot(currNormal, prevNormal) + 1e-5, 0.0, 1.0), 32.0);
    isPrevValid = step(dot(abs(sampleCoord - clamp(sampleCoord, 0.0, 1.0)) * screenSize, vec2(1.0)), 0.5) * normalFactor;

    vec3 prevSampleWorldPos = prevViewToWorldPos(prevSampleViewPos);
    vec3 positionDiff = prevSampleWorldPos - prevWorldPos;
    float positionDistance = inversesqrt((dot(prevSampleViewPos, prevSampleViewPos) + 2.0) / max(1e-8, abs(dot(positionDiff, geoNormal)))) * 50.0;
    #if MC_VERSION >= 11700
        if (materialID == MAT_HAND)
    #endif
    {
        positionDistance *= 0.3;
    }
    isPrevValid *= clamp(1.0 - positionDistance * positionDistance, 0.0, 1.0) * step(prevSampleDepth, 0.999999);

    return vec4(prevSampleData);
}

vec4 prevSSILVB(vec2 prevCoord, vec3 prevWorldPos, vec3 currNormal, vec3 geoNormal, float materialID) {
    vec2 sampleCoord = prevCoord;
    const float offset = 0.25;
    sampleCoord += prevTaaOffset * offset - taaOffset * 0.5 * offset;
    #ifdef TAA
        sampleCoord += taaOffset * 0.5;
    #endif

    float isPrevValid = 0.0;
    vec2 prevTexel = sampleCoord * screenSize;
    vec2 sampleCenter = round(prevTexel);
    vec4 dataAccum = vec4(0.0);
    float weightAccum = 0.0;
    float sampleOffsetX = -0.5;
    for (int i = 0; i < 2; i++) {
        float sampleOffsetY = -0.5;
        for (int j = 0; j < 2; j++) {
            vec2 sampleTexel = sampleCenter + vec2(sampleOffsetX, sampleOffsetY);
            float isSampleValid;
            vec4 sampleData = samplePrevData(sampleTexel, prevWorldPos, currNormal, geoNormal, materialID, isSampleValid);
            float weight = (1.0 - abs(sampleTexel.x - prevTexel.x)) * (1.0 - abs(sampleTexel.y - prevTexel.y));
            isSampleValid *= weight;
            dataAccum += sampleData * isSampleValid;
            weightAccum += isSampleValid;
            isPrevValid = max(isPrevValid, isSampleValid);
            sampleOffsetY += 1.0;
        }
        sampleOffsetX += 1.0;
    }
    vec4 prevData = dataAccum / max(1e-5, weightAccum);
    return prevData;
}

void main() {
    ivec2 texel = ivec2 (gl_FragCoord.st);
    GbufferData gbufferData = getGbufferData(texel, texcoord);
    gbufferData.parallaxOffset *= PARALLAX_DEPTH * 0.2;
    float depth = textureLod(depthtex1, texcoord, 0.0).x;
    vec3 viewPos = screenToViewPos(texcoord, depth);

    bool isHand = gbufferData.materialID == MAT_HAND;
    vec3 parallaxViewPos = viewPos;
    float parallaxDepthOrigin = depth;
    if (isHand) {
        parallaxDepthOrigin = depth / MC_HAND_DEPTH - 0.5 / MC_HAND_DEPTH + 0.5;
        parallaxViewPos = screenToViewPos(texcoord, parallaxDepthOrigin);
    }
    float parallaxViewDepth = parallaxViewPos.z + parallaxViewPos.z * gbufferData.parallaxOffset / max(1e-5, dot(parallaxViewPos, -gbufferData.geoNormal));
    float parallaxDepth = viewToScreenDepth(-parallaxViewDepth);
    float parallaxDepthDiff = (parallaxDepth - parallaxDepthOrigin) * 512.0;

    texBuffer3 = vec4(0.0, 0.0, 0.0, parallaxDepthDiff);

    #ifdef LOD
        depth -= float(depth == 1.0) * (1.0 + getLodDepthSolidDeferred(texcoord));
    #endif
    vec4 prevData = vec4(0.0);
    if (abs(depth) < 0.999999) {
        ivec2 texel = ivec2 (gl_FragCoord.st);
        #ifdef LOD
            if (depth < 0.0) {
                viewPos = screenToViewPosLod(texcoord, -depth);
            }
        #endif
        float NdotV = max(dot(viewPos, -gbufferData.geoNormal), 1e-6);
        viewPos += gbufferData.parallaxOffset * viewPos / NdotV;
        vec3 worldPos = viewToWorldPos(viewPos);
        vec3 worldNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.normal);
        vec3 worldGeoNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.geoNormal);

        vec3 prevWorldPos = worldPos;
        vec2 prevCoord = getPrevCoord(prevWorldPos, viewPos, worldGeoNormal, gbufferData.parallaxOffset, gbufferData.materialID);
        prevData = prevSSILVB(prevCoord, prevWorldPos, worldNormal, worldGeoNormal, gbufferData.materialID);
    }
    texBuffer5 = prevData;
}

/* DRAWBUFFERS:35 */
