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
//  General Public License v3.0. Copyright (C) 2026 GeForceLegend.
//  https://github.com/GeForceLegend/Sundial-Lite
//  https://www.gnu.org/licenses/gpl-3.0.en.html
//
//  Bake depth containing parallax and hand correction for future shaders; Move previous visibility mask result to current frame position
//

#define VB_MAX_BLEDED_FRAMES 20 // [4 5 6 7 8 10 12 14 16 20 24 28 32 36 40 48 56 64 72 80 96 112 128]

layout(location = 0) out vec4 texBuffer0;
layout(location = 1) out vec4 texBuffer5;
layout(location = 2) out uint texBuffer6;

in vec2 texcoord;
in vec2 prevHandAnimation;
in vec2 temporalHandRotation;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"

#if SR_ENABLE && SR_ALGO_SUPPORTS_JITTER
    uniform vec2 SRPreviousJitterOffset;
    vec2 prevTaaOffset = SRPreviousJitterOffset * texelSize * vec2(1.0, -1.0);
#else
    uniform vec2 prevTaaOffset;
#endif

vec2 getPrevCoord(out vec3 prevViewPos, vec3 viewPos, vec3 worldGeoNormal, float parallaxOffset, float materialID) {
    vec3 prevScreenPos;
    if (materialID == MAT_HAND) {
        prevViewPos = viewPos;
        #ifndef TEMPORAL_IGNORE_HAND_ANIMATION
            prevViewPos -= gbufferModelView[3].xyz;
            mat3 xRotation = rotation(vec4(0.0, sin(prevHandAnimation.x * 0.5), 0.0, cos(prevHandAnimation.x * 0.5)));
            mat3 yRotation = rotation(vec4(sin(prevHandAnimation.y * 0.5), 0.0, 0.0, cos(prevHandAnimation.y * 0.5)));
            prevViewPos = xRotation * yRotation * prevViewPos;
            prevViewPos += gbufferPreviousModelView[3].xyz;
        #endif
        vec3 prevViewNormal = mat3(gbufferModelView) * worldGeoNormal;
        prevViewPos -= parallaxOffset * prevViewPos / max(dot(prevViewPos, -prevViewNormal), 1e-5);
        prevScreenPos = viewToProjectionPos(prevViewPos);
        prevScreenPos.z *= MC_HAND_DEPTH;
    } else {
        vec3 prevWorldPos = viewToWorldPos(viewPos) + cameraMovement;
        prevViewPos = prevWorldToViewPos(prevWorldPos);
        vec3 prevViewNormal = mat3(gbufferPreviousModelView) * worldGeoNormal;
        prevViewPos -= parallaxOffset * prevViewPos / max(dot(prevViewPos, -prevViewNormal), 1e-5);
        prevScreenPos = prevViewToProjectionPos(prevViewPos);
    }
    vec2 prevCoord = prevScreenPos.st * 0.5 + 0.5;
    return prevCoord;
}

vec4 samplePrevData(vec2 sampleTexelCoord, vec3 prevViewPos, vec3 geoNormal, out float isPrevValid, out float samplePrevFrames) {
    ivec2 sampleTexel = ivec2(sampleTexelCoord);
    vec4 prevSampleData = max(vec4(0.0), texelFetch(colortex5, sampleTexel, 0));
    #ifndef VBGI
        prevSampleData.rgb = vec3(0.0);
    #endif
    uint prevGeometryData = texelFetch(colortex6, sampleTexel, 0).x;
    vec2 prevFramesDepth = unpackF8D24(prevGeometryData);
    samplePrevFrames = min(prevFramesDepth.x, VB_MAX_BLEDED_FRAMES);
    float prevSampleDepth = prevFramesDepth.y + float(prevFramesDepth.y == 0.0);

    vec2 sampleCoord = sampleTexelCoord * texelSize;
    isPrevValid = float(all(lessThan(floatBitsToUint(sampleCoord), floatBitsToUint(screenEdge))));
    #ifdef TAA
        sampleCoord -= prevTaaOffset;
    #endif
    vec3 prevSampleViewPos;
    #ifdef LOD
        if (prevSampleDepth < 0.0) {
            prevSampleViewPos = prevProjectionToViewPosLod(vec3(sampleCoord, -prevSampleDepth) * 2.0 - 1.0);
        } else
    #endif
    {
        prevSampleViewPos = prevProjectionToViewPos(vec3(sampleCoord, prevSampleDepth) * 2.0 - 1.0);
    }

    vec3 positionDiff = prevSampleViewPos - prevViewPos;
    float positionDistance = abs(dot(positionDiff, geoNormal)) / (dot(prevSampleViewPos, prevSampleViewPos) + 2.0) * 5000.0;
    isPrevValid *= clamp(1.0 - positionDistance, 0.0, 1.0) * step(abs(prevSampleDepth), 0.999999);

    return vec4(prevSampleData);
}

vec4 prevVisibilityBitmask(vec2 prevCoord, vec3 prevWorldPos, vec3 geoNormal, inout float prevFrames) {
    vec2 sampleCoord = prevCoord;
    const float offset = 0.25;
    sampleCoord += prevTaaOffset * offset - taaOffset * 0.5 * offset;
    #ifdef TAA
        sampleCoord += taaOffset * 0.5;
    #endif

    vec3 prevViewGeoNormal = mat3(gbufferPreviousModelView) * geoNormal;
    vec2 prevTexel = sampleCoord * screenSize;
    vec2 sampleCenter = round(prevTexel);
    vec4 dataAccum = vec4(0.0);
    float framesAccum = 0.0;
    float weightAccum = 0.0;
    float sampleOffsetX = -0.5;
    for (int i = 0; i < 2; i++) {
        float sampleOffsetY = -0.5;
        for (int j = 0; j < 2; j++) {
            vec2 sampleTexel = sampleCenter + vec2(sampleOffsetX, sampleOffsetY);
            float isSampleValid, samplePrevFrames;
            vec4 sampleData = samplePrevData(sampleTexel, prevWorldPos, prevViewGeoNormal, isSampleValid, samplePrevFrames);
            float weight = (1.0 - abs(sampleTexel.x - prevTexel.x)) * (1.0 - abs(sampleTexel.y - prevTexel.y));
            isSampleValid *= weight;
            samplePrevFrames *= isSampleValid;
            dataAccum += sampleData * samplePrevFrames;
            framesAccum += samplePrevFrames;
            weightAccum += isSampleValid;
            sampleOffsetY += 1.0;
        }
        sampleOffsetX += 1.0;
    }
    vec4 prevData = dataAccum / max(1e-5, framesAccum);
    prevFrames = framesAccum / max(1e-5, weightAccum);
    return prevData;
}

void main() {
    ivec2 texel = ivec2 (gl_FragCoord.st);
    GbufferData gbufferData = getGbufferData(texel, texcoord);
    #ifdef LOD
        gbufferData.depth -= float(gbufferData.depth == 1.0) * (1.0 + getLodDepthSolidDeferred(texcoord));
    #endif
    vec4 prevData = vec4(0.0);
    float prevFrames = 0.0;
    if (abs(gbufferData.depth) < 0.999999) {
        bool isHand = gbufferData.materialID == MAT_HAND;
        float handDepth = gbufferData.depth / MC_HAND_DEPTH - 0.5 / MC_HAND_DEPTH + 0.5;
        if (isHand && abs(handDepth - 0.5) < 0.5) {
            gbufferData.depth = handDepth;
        }
        vec3 viewPos = screenToViewPos(texcoord, gbufferData.depth);
        gbufferData.parallaxOffset *= PARALLAX_DEPTH * 0.2;
        viewPos += viewPos * gbufferData.parallaxOffset / max(1e-5, dot(viewPos, -gbufferData.geoNormal));
        gbufferData.depth = viewToScreenDepth(-viewPos.z);
        ivec2 texel = ivec2 (gl_FragCoord.st);
        #ifdef LOD
            if (gbufferData.depth < 0.0) {
                viewPos = screenToViewPosLod(texcoord, -gbufferData.depth);
            }
        #endif
        gbufferData.depth += float(isHand);
        vec3 worldGeoNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.geoNormal);

        vec3 prevViewPos;
        vec2 prevCoord = getPrevCoord(prevViewPos, viewPos, worldGeoNormal, gbufferData.parallaxOffset, gbufferData.materialID);

        prevData = prevVisibilityBitmask(prevCoord, prevViewPos, worldGeoNormal, prevFrames);
    }
    if (texel.y < 1 && texel.x < 4) {
        if (texel.x > 1) {
            gbufferData.depth = texel.x > 2 ? prevHandAnimation.y : prevHandAnimation.x;
        } else {
            gbufferData.depth = texel.x == 0 ? temporalHandRotation.x : temporalHandRotation.y;
            gbufferData.depth = mod(gbufferData.depth + PI, 2.0 * PI) - PI;
        }
    }
    texBuffer0 = vec4(texelFetch(colortex0, texel, 0).rgb, clamp(prevFrames / 255.0 + 1.0 / 255.0, 0.0, 1.0));
    texBuffer5 = prevData;
    texBuffer6 = floatBitsToUint(gbufferData.depth);
}

/* DRAWBUFFERS:056 */
