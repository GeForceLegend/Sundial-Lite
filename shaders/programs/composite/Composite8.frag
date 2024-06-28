#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer1;
layout(location = 1) out vec4 texBuffer3;
layout(location = 2) out vec4 texBuffer4;

in float prevExposure;
in float smoothCenterDepth;
in vec2 texcoord;

// #define APERTURE_CORROSION
#define LENS_DIAMETER_SCALE 1.0 // [1.0 1.05 1.1 1.15 1.2 1.25 1.3 1.35 1.4 1.45 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0]
#define APERTURE_CORROSION_OFFSET 1.5 // [0.0 0.01 0.02 0.03 0.04 0.05 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.33 0.36 0.4 0.43 0.46 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0]
#define DOF_SAMPLES 10 // [2 3 4 5 6 7 8 9 10 12 14 16 18 20 22 25 30 35 40 45 50 60 70 80 90 100]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"

float circleOfConfusionRadius(vec2 coord, float sampleDepth, float focusDepth) {
    sampleDepth = max(0.31, sampleDepth);
    float circleRadius = clamp(abs((focusDepth - sampleDepth) / (sampleDepth * (focusDepth - FOCAL_LENGTH))) * 0.5, 0.0, 1.0);
    #ifndef HAND_DOF
        float materialID = round(unpack16Bit(textureLod(colortex2, coord, 0.0).a).x * 255.0);
        if (materialID == MAT_HAND) {
            circleRadius = 0.0;
        }
    #endif
    return circleRadius;
}

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

float getClosestDepth(vec2 coord) {
    float closest = 1.0;

    vec4 samples = textureGather(depthtex0, coord - vec2(0.5) * texelSize, 0);
    closest = min(min(samples.x, samples.y), min(samples.z, samples.w));

    samples = textureGather(depthtex0, coord + vec2(0.5) * texelSize, 0);
    closest = min(min(samples.x, samples.y), min(samples.z, closest));

    closest = min(closest, textureLod(depthtex0, coord + vec2( texelSize.x, -texelSize.y), 0.0).r);
    closest = min(closest, textureLod(depthtex0, coord + vec2(-texelSize.x,  texelSize.y), 0.0).r);

    return closest;
}

vec3 calculateVelocity(in vec3 coord, float materialID) {
    vec3 view = coord;
    ivec2 texel = ivec2(gl_FragCoord.st);
    float parallaxOffset = unpack16Bit(texelFetch(colortex2, texel, 0).w).y * PARALLAX_DEPTH * 0.2;
    vec3 geoNormal = decodeNormal(texelFetch(colortex1, texel, 0).zw);
    if (materialID == MAT_HAND) {
        view = projectionToViewPos(coord * 2.0 - 1.0);
        view += view * parallaxOffset / max(dot(geoNormal, -view), 1e-5);
        view -= gbufferModelView[3].xyz * MC_HAND_DEPTH;
        view += gbufferPreviousModelView[3].xyz * MC_HAND_DEPTH;

        view -= view * parallaxOffset / max(dot(geoNormal, -view), 1e-5);
        view = viewToProjectionPos(view);
        view = view * 0.5 + 0.5;
    } else if (coord.z > 0.7) {
        view = projectionToViewPos(coord * 2.0 - 1.0);
        if (coord.z < 1.0 && materialID != MAT_END_PORTAL) {
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
        view = prevViewToProjectionPos(view);
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

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);

    texBuffer4 = vec4(texelFetch(colortex7, texel, 0).rgb, 1.0);
    if (dot(texcoord, screenSize) < 1.1) {
        texBuffer4.w = prevExposure;
    }

    vec4 centerData = texelFetch(colortex3, texel, 0);
    #ifdef DEPTH_OF_FIELD
        float focusDepth = far;
        #if FOCUS_MODE == 0
            const float minFocalLength = max(FOCAL_LENGTH + 0.01, 0.3);
            focusDepth = max(minFocalLength, screenToViewDepth(smoothCenterDepth));
        #elif FOCUS_MODE == 1
            focusDepth = MANUAL_FOCUS_DEPTH;
        #endif

        float centerDepth = centerData.w;
        float centerCoCRadius = circleOfConfusionRadius(texcoord, centerDepth, focusDepth);

        const mat2 goldenRotate = mat2(cos(2.39996323), sin(2.39996323), -sin(2.39996323), cos(2.39996323));
        const float strength = 15.0 * APERTURE_DIAMETER_SCALE;
        vec2 noise = blueNoiseTemporal(texcoord).xy;
        float radius = noise.y / DOF_SAMPLES;
        float noiseAngle = noise.x * PI * 2.0;
        float cosNoise = cos(noiseAngle);
        float sinNoise = sin(noiseAngle);
        vec2 angle = vec2(cosNoise, sinNoise) * strength;

        float maxSampleRadius = texelFetch(colortex4, texel, 0).w;
        angle *= maxSampleRadius;

        vec3 totalColor = vec3(0.0);
        float totalSamples = 0.0;
        vec3 selfColor = centerData.rgb * 1e-5;
        float selfSamples = 1e-5;
        float selfWeight = 0.0;

        #ifdef APERTURE_CORROSION
            vec2 screenScale = APERTURE_CORROSION_OFFSET * screenSize / max(screenSize.x, screenSize.y);
            // vec2 scale = screenScale * (texcoord - 0.5);
            // float corrosionDistance = dot(scale, scale);
            // selfColor *= step(corrosionDistance, 1.0);
        #endif

        float centerWeight = maxSampleRadius * maxSampleRadius - maxSampleRadius + 1.0;
        centerWeight = mix(centerWeight, 1e-5, pow(centerCoCRadius / maxSampleRadius, 4.0));

        for (int i = 0; i < DOF_SAMPLES; i++) {
            float sampleRadius = radius * inversesqrt(radius);
            vec2 sampleCoord = texcoord + texelSize * sampleRadius * angle;
            vec4 sampleData = textureLod(colortex3, sampleCoord, 0.0);
            vec3 sampleColor = sampleData.rgb;
            float sampleDepth = sampleData.w;
            float sampleRadiusScaled = sampleRadius * maxSampleRadius;
            float sampleCoC = circleOfConfusionRadius(sampleCoord, sampleDepth, focusDepth);
            #ifdef APERTURE_CORROSION
                vec2 sampleOffset = sampleRadius * angle;
                vec2 scale = screenScale * (sampleCoord - 0.5);
                vec2 sampleOffsetScaled = sampleOffset / (LENS_DIAMETER_SCALE * strength);
                vec2 corrosionOffset = sampleOffsetScaled + scale * maxSampleRadius;
                float corrosionDistance = dot(corrosionOffset, corrosionOffset);
            #endif
            angle = goldenRotate * angle;
            radius += 1.0 / DOF_SAMPLES;
            if (centerCoCRadius >= sampleRadiusScaled && sampleDepth >= centerDepth) {
                #ifdef APERTURE_CORROSION
                    vec2 corrosionOffset = sampleOffsetScaled + scale * centerCoCRadius;
                    float corrosionDistance = dot(corrosionOffset, corrosionOffset);
                    if (pow2(centerCoCRadius) > corrosionDistance)
                #endif
                {
                    selfColor += sampleColor;
                    selfSamples += 1.0;
                }
            }
            else if (sampleCoC >= sampleRadiusScaled && sampleDepth <= centerDepth) {
                #ifdef APERTURE_CORROSION
                    vec2 corrosionOffset = sampleOffsetScaled + scale * sampleCoC;
                    float corrosionDistance = dot(corrosionOffset, corrosionOffset);
                    if (pow2(sampleCoC) > corrosionDistance)
                #endif
                {
                    float sampleWeight = pow2(max(1.0, centerCoCRadius / sampleCoC));
                    totalColor += sampleColor * sampleWeight;
                    totalSamples += sampleWeight;
                }
            }
            else
            #ifdef APERTURE_CORROSION
                if (pow2(maxSampleRadius) > corrosionDistance)
            #endif
            {
                selfWeight += centerWeight;
            }
        }

        totalColor += selfColor * (1.0 + selfWeight / selfSamples);
        totalColor /= totalSamples + selfSamples + selfWeight;
        centerData.rgb = totalColor;
    #endif

    texBuffer3 = vec4(clamp(pow(0.05 * centerData.rgb, vec3(1.0 / 2.2)), vec3(0.0), vec3(1.0)), 1.0);

    float closestDepth = getClosestDepth(texcoord);
    vec3 closest = vec3(texcoord, closestDepth);

    float materialID = round(unpack16Bit(texelFetch(colortex2, texel, 0).a).x * 255.0);
    vec3 velocity = calculateVelocity(closest, materialID);
    velocity = velocity * clamp(0.5 * inversesqrt(dot(velocity, velocity) + 1e-7), 0.0, 1.0);

    float blendWeight = 1.0;
    #ifdef TAA
        vec2 reprojectCoord = closest.st + velocity.xy;
        float depthDiffFactor = getDepthConfidenceFactor(closest, velocity);

        blendWeight *= 0.95 - min(0.7, 4.0 * pow(dot(velocity.xy, velocity.xy), 0.25)) * step(closest.z, 0.999999);
        blendWeight *= step(abs(floor(reprojectCoord.x)) + abs(floor(reprojectCoord.y)), 0.5);
        blendWeight *= depthDiffFactor;
    #endif

    texBuffer1 = vec4(velocity.st * 0.5 + 0.5, 0.0, blendWeight);
}

/* DRAWBUFFERS:134 */
