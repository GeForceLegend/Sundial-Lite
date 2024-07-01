layout(location = 0) out vec4 texBuffer3;
layout(location = 1) out vec4 texBuffer4;
layout(location = 2) out vec4 texBuffer7;

in vec2 texcoord;
in float smoothCenterDepth;

#define MOTION_BLUR_STRENGTH 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
#define MOTION_BLUR_QUALITY 5 // [2 3 4 5 6 7 8 9 10]
#define AVERAGE_EXPOSURE_CENTER_WEIGHT 4.0 // [1.0 1.2 1.4 1.6 1.8 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.2 5.4 5.6 5.8 6.0 6.2 6.4 6.6 6.8 7.0 7.2 7.4 7.6 7.8 8.0]
#define AVERAGE_EXPOSURE_TENDENCY 1.0 // [0.01 0.02 0.04 0.07 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 18.0 20.0 25.0 30.0 35.0 40.0 50.0]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"

const bool colortex3MipmapEnabled = true;

vec3 calculateBloomBase(vec2 coord) {
    vec2 level = -floor(log2(1.0 - coord));
    vec3 result = vec3(0.0);
    if (level.x == level.y && level.x < 7.5) {
        float lod = level.x;
        float expLevel = exp2(lod);
        vec2 levelOffset = vec2(1.0 - 2.0 / expLevel);
        vec2 bloomTexel = texelSize * expLevel * 0.5;
        vec2 centerCoord = (coord - levelOffset) * expLevel;
        lod -= 1.0;

        vec3 bloomColor = textureLod(colortex3, centerCoord, lod).rgb * 4.0;
        bloomColor += textureLod(colortex3, centerCoord + vec2(-1.0, 1.0) * bloomTexel, lod).rgb;
        bloomColor += textureLod(colortex3, centerCoord + vec2(-1.0,-1.0) * bloomTexel, lod).rgb;
        bloomColor += textureLod(colortex3, centerCoord + vec2( 1.0, 1.0) * bloomTexel, lod).rgb;
        bloomColor += textureLod(colortex3, centerCoord + vec2( 1.0,-1.0) * bloomTexel, lod).rgb;
        result = bloomColor * 0.125;
    }
    return result;
}

float getAvgBrightness() {
    const float mipmapLevel = 6.0;
    const float texelScale = exp2(mipmapLevel);
    vec3 totalColor = vec3(0.0);
    float totalWeight = 0.0;
    vec2 avgExposureTexel = texelSize * texelScale;
    ivec2 avgExposureSteps = ivec2(screenSize / texelScale);
    for (int i = 0; i < avgExposureSteps.x; i++) {
        for (int j = 0; j < avgExposureSteps.y; j++) {
            float sampleWeight = exp2(-length((vec2(i, j) - avgExposureSteps * 0.5) * avgExposureTexel) * exp2(AVERAGE_EXPOSURE_CENTER_WEIGHT));
            totalColor += pow(texelFetch(colortex3, ivec2(i, j), int(mipmapLevel)).rgb, vec3(1.0 / AVERAGE_EXPOSURE_TENDENCY)) * sampleWeight;
            totalWeight += sampleWeight;
        }
    }
    totalColor = pow(totalColor / totalWeight, vec3(AVERAGE_EXPOSURE_TENDENCY));
    float currBrightness = dot(totalColor, vec3(60.0 / 3.0));
    float prevBrightness = texelFetch(colortex3, ivec2(0), 0).w;

    float averageBrightness = mix(prevBrightness, currBrightness, min(frameTime * (step(currBrightness, prevBrightness) * 2.0 + 2.0), 1.0));

    return averageBrightness;
}

vec3 motionBlur(vec2 currCoord, vec2 velocity) {
    vec2 motionBlurVel = velocity *  MOTION_BLUR_STRENGTH * 0.25;
    vec2 stepSize = motionBlurVel / MOTION_BLUR_QUALITY;
    float noise = blueNoiseTemporal(texcoord).x;

    vec3 totalColor = vec3(0.0);
    vec2 sampleCoord = currCoord - motionBlurVel * 0.5 + stepSize * noise;
    float totalWeight = 0.0;

    for (int i = 0; i < MOTION_BLUR_QUALITY; i++) {
        totalColor += textureLod(colortex3, sampleCoord, 0.0).rgb;
        sampleCoord += stepSize;
    }
    return totalColor / MOTION_BLUR_QUALITY;
}

void main() {
    vec3 currColor = textureLod(colortex3, texcoord, 0.0).rgb;

    texBuffer4 = vec4(calculateBloomBase(texcoord) * 60.0, 1.0);
    texBuffer3 = vec4(currColor, 1.0);
    #ifdef MOTION_BLUR
        vec2 velocity = textureLod(colortex1, texcoord, 0.0).xy * 2.0 - 1.0;
        vec3 motionBlurColor = motionBlur(texcoord, velocity);
        texBuffer3.rgb = mix(currColor, motionBlurColor, vec3(clamp(length(velocity * screenSize) * 0.3, 0.0, 1.0)));
    #endif
    texBuffer3.rgb *= 60.0;

    texBuffer7 = vec4(pow(currColor, vec3(1.0 / 2.2)), textureLod(depthtex0, texcoord, 0.0).r);
    if (dot(texcoord, screenSize) < 1.1) {
        texBuffer7.w = getAvgBrightness();
    }
    if (dot(1.0 - texcoord, screenSize) < 1.1) {
        texBuffer7.w = smoothCenterDepth;
    }
}

/* DRAWBUFFERS:347 */
