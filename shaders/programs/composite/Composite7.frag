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
//  DoF stage 2: CoC spread; TAA stage 1: velocity and blend weight
//

#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer3;
layout(location = 1) out vec4 texBuffer4;
layout(location = 2) out vec4 texBuffer5;

in float smoothCenterDepth;
in vec2 texcoord;

#define DEPTH_OF_FIELD
#define FOCUS_MODE 0 // [0 1]
#define HAND_DOF
#define COC_SPREAD_SAMPLES 10 // [2 3 4 5 6 7 8 9 10 12 14 16 18 20 22 25 30 35 40 45 50 60 70 80 90 100]
#define FOCAL_LENGTH 0.01 // [0.001 0.002 0.003 0.004 0.005 0.006 0.007 0.008 0.009 0.01 0.015 0.02 0.025 0.03 0.035 0.04 0.045 0.05 0.06 0.07 0.08 0.09 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.6 0.7 0.8 0.9 1.0]
#define MANUAL_FOCUS_DEPTH 100.0 // [0.1 0.2 0.3 0.4 0.5 0.6 0.8 1.0 1.2 1.4 1.6 1.8 2.0 2.3 2.6 2.9 3.2 3.5 4.0 4.5 5.0 5.5 6.0 6.5 7.0 7.5 8.0 8.5 9.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 18.0 20.0 22.0 24.0 27.0 30.0 35.0 40.0 45.0 50.0 55.0 60.0 65.0 70.0 80.0 90.0 100.0 110.0 120.0 130.0 140.0 160.0 180.0 200.0 250.0 300.0 400.0 500.0]
#define APERTURE_DIAMETER_SCALE 0.26 // [0.01 0.02 0.03 0.04 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.35 0.4 0.45 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0 22.0 24.0 26.0 28.0 30.0 32.0 34.0 36.0 38.0 40.0 42.0 44.0 46.0 48.0 50.0 55.0 60.0 65.0 70.0 75.0 80.0 85.0 90.0 95.0 100.0]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"

float getFarthestPrevDepth(vec2 coord) {
    float farthest = 0.0;

    vec4 samples = textureGather(colortex7, coord - vec2(0.5) * texelSize, 3);
    farthest = max(max(samples.x, samples.y), max(samples.z, samples.w));

    samples = textureGather(colortex7, coord + vec2(0.5) * texelSize, 3);
    farthest = max(max(samples.x, samples.y), max(samples.z, farthest));

    ivec2 texel = ivec2(coord * screenSize);
    farthest = max(farthest, texelFetch(colortex7, texel + ivec2( 1, -1), 0).w);
    farthest = max(farthest, texelFetch(colortex7, texel + ivec2(-1,  1), 0).w);

    return farthest;
}

#ifdef LOD
    vec4 depthGatherLod(vec2 coord) {
        #ifdef DISTANT_HORIZONS
            return textureGather(dhDepthTex0, coord, 0);
        #endif
        #ifdef VOXY
            return textureGather(vxDepthTexTrans, coord, 0);
        #endif
        return textureGather(depthtex0, coord, 0);
    }
#endif

float getClosestDepth(vec2 coord) {
    float closest = 2.0;

    vec4 samples = textureGather(depthtex0, coord - vec2(0.5) * texelSize, 0);
    #ifdef LOD
        samples += step(1.0, samples) * depthGatherLod(coord - vec2(0.5) * texelSize);
    #endif
    closest = min(min(samples.x, samples.y), min(samples.z, samples.w));

    samples = textureGather(depthtex0, coord + vec2(0.5) * texelSize, 0);
    #ifdef LOD
        samples += step(1.0, samples) * depthGatherLod(coord + vec2(0.5) * texelSize);
    #endif
    closest = min(min(samples.x, samples.y), min(samples.z, closest));

    samples.xy = vec2(
        textureLod(depthtex0, coord + vec2( texelSize.x, -texelSize.y), 0.0).r,
        textureLod(depthtex0, coord + vec2(-texelSize.x,  texelSize.y), 0.0).r
    );
    #ifdef LOD
        samples.xy += step(vec2(1.0), samples.xy) * vec2(
            getLodDepthWater(coord + vec2( texelSize.x, -texelSize.y)),
            getLodDepthWater(coord + vec2(-texelSize.x,  texelSize.y))
        );
    #endif

    closest = min(closest, min(samples.x, samples.y));

    return closest;
}

vec3 calculateVelocity(vec3 coord, ivec2 texel, float materialID, float parallaxOffset) {
    vec3 view = coord;
    vec3 geoNormal = decodeNormal(texelFetch(colortex1, texel, 0).zw);
    if (materialID == MAT_HAND) {
        view = projectionToViewPos(view * 2.0 - 1.0);
        #ifndef TEMPORAL_IGNORE_HAND_ANIMATION
            view += view * parallaxOffset / max(dot(geoNormal, -view), 1e-5);
            view -= gbufferModelView[3].xyz * MC_HAND_DEPTH;
            view += gbufferPreviousModelView[3].xyz * MC_HAND_DEPTH;
            view -= view * parallaxOffset / max(dot(geoNormal, -view), 1e-5);
        #endif
        view = viewToProjectionPos(view);
        view = view * 0.5 + 0.5;
    }
    else if (coord.z > 0.7) {
        #ifdef LOD
            if (coord.z > 1.0) {
                view.z -= 1.0;
                view = projectionToViewPosLod(view * 2.0 - 1.0);
            } else
        #endif
        {
            view = projectionToViewPos(view * 2.0 - 1.0);
        }
        if (coord.z - float(coord.z > 1.0) < 1.0 && materialID != MAT_END_PORTAL) {
            view += view * parallaxOffset / max(dot(geoNormal, -view), 1e-5);
            view = viewToWorldPos(view);
            view += cameraMovement;
            view = prevWorldToViewPos(view);

            vec3 prevViewNormal = mat3(gbufferPreviousModelView) * mat3(gbufferModelViewInverse) * geoNormal;
            view -= view * parallaxOffset / max(dot(prevViewNormal, -view), 1e-5);
        }
        else {
            view = mat3(gbufferModelViewInverse) * view;
            view = mat3(gbufferPreviousModelView) * view;
        }
        #ifdef LOD
            if (coord.z > 1.0) {
                view = prevViewToProjectionPosLod(view);
                view.z += 2.0;
            } else
        #endif
        {
            view = prevViewToProjectionPos(view);
        }
        view = view * 0.5 + 0.5;
    }
    vec3 velocity = view - coord;
    return velocity;
}

float getDepthConfidenceFactor(vec3 coord, vec3 velocity) {
    vec2 prevCoord = coord.st + velocity.xy;
    float prevDepth = getFarthestPrevDepth(prevCoord);
    float depthDiffFactor = step(coord.z + velocity.z, prevDepth + 1e-3);
    return depthDiffFactor;
}

float circleOfConfusionRadius(float sampleDepth, float focusDepth) {
    float circleRadius = 1.0;
    if (sampleDepth < 0.0) {
        #ifdef HAND_DOF
            sampleDepth = min(focusDepth, sampleDepth);
        #else
            circleRadius = 0.0;
        #endif
    }
    circleRadius *= (abs(sampleDepth) - focusDepth) / (abs(sampleDepth) * (focusDepth - FOCAL_LENGTH)) * APERTURE_DIAMETER_SCALE / MAX_BLUR_RADIUS;
    return circleRadius;
}

void main() {
    float focusDepth = far;
    #if FOCUS_MODE == 0
        const float minFocalLength = max(FOCAL_LENGTH + 0.01, 0.3);
        focusDepth = max(minFocalLength, screenToViewDepth(smoothCenterDepth));
    #elif FOCUS_MODE == 1
        focusDepth = MANUAL_FOCUS_DEPTH;
    #endif

    ivec2 texel = ivec2(gl_FragCoord.st);
    vec4 centerData = texelFetch(colortex3, texel, 0);
    float centerDepth = uintBitsToFloat(textureLod(colortex6, texcoord, 0.0).x);
    float centerCoC = circleOfConfusionRadius(centerDepth, focusDepth);
    float sampleRadius = clamp(abs(centerCoC), 0.0, 1.0);

    #ifdef DEPTH_OF_FIELD
        const mat2 goldenRotate = mat2(cos(2.39996323), sin(2.39996323), -sin(2.39996323), cos(2.39996323));
        float strength = 15.0 * MAX_BLUR_RADIUS;
        vec2 noise = blueNoiseTemporal(texcoord).xy;
        float radius2 = noise.y / COC_SPREAD_SAMPLES;
        float noiseAngle = noise.x * PI * 2.0;
        float cosNoise = cos(noiseAngle);
        float sinNoise = sin(noiseAngle);
        vec2 angle = vec2(cosNoise, sinNoise) * strength;

        for (int i = 0; i < COC_SPREAD_SAMPLES; i++) {
            float radius = radius2 * inversesqrt(radius2);
            vec2 sampleCoord = texcoord + texelSize * radius * angle;
            float sampleDepth = uintBitsToFloat(textureLod(colortex6, sampleCoord, 0.0).x);
            angle = goldenRotate * angle;
            radius2 += 1.0 / COC_SPREAD_SAMPLES;
            float sampleCoC = clamp(abs(circleOfConfusionRadius(sampleDepth, focusDepth)), 0.0, 1.0);
            if (sampleCoC > radius && sampleDepth <= centerDepth) {
                sampleRadius = max(sampleRadius, sampleCoC);
                if (abs(centerCoC) < sampleCoC - radius) {
                    centerCoC = radius - sampleCoC;
                }
            }
        }
    #else
        centerData.rgb = clamp(pow(0.005 * centerData.rgb, vec3(1.0 / 2.2)), vec3(0.0), vec3(1.0)) * 10.0;
    #endif

    texBuffer4 = vec4(texelFetch(colortex7, texel, 0).rgb, max(1e-5, sampleRadius));
    texBuffer3 = vec4(centerData.rgb, centerCoC);

    float closestDepth = getClosestDepth(texcoord);
    vec3 closest = vec3(texcoord, closestDepth);

    float materialID = round(texelFetch(colortex0, texel, 0).b * 255.0);
    vec3 velocity = calculateVelocity(closest, texel, materialID, centerData.w * PARALLAX_DEPTH * 0.2);

    float blendWeight = 1.0;
    #ifdef TAA
        vec2 reprojectCoord = closest.st + velocity.xy;
        float depthDiffFactor = getDepthConfidenceFactor(closest, velocity);

        blendWeight *= 0.95 - min(0.7, 4.0 * pow(dot(velocity.xy, velocity.xy), 0.25)) * step(closest.z, 0.999999);
        blendWeight *= float(all(lessThan(abs(closest.st - vec2(0.5)), vec2(0.5))));
        blendWeight *= depthDiffFactor;
    #endif

    texBuffer5 = vec4(velocity.st * clamp(inversesqrt(dot(velocity.xy, velocity.xy)), 0.0, 1.0), 0.0, blendWeight);
}

/* DRAWBUFFERS:345 */
