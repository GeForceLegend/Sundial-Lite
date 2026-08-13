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
//  TAA stage 2: sample and blend; Moving previous exposure and smooth center depth to let colortex7 flipped without info lost
//

layout(location = 0) out vec4 texBuffer3;
layout(location = 1) out uint texBuffer6;

in vec2 texcoord;
in float prevExposure;
in float smoothCenterDepth;

#define TAA_HISTORY_CLIP_VARIANCE 1.0 // [0.0 0.01 0.02 0.03 0.04 0.05 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.33 0.36 0.4 0.43 0.46 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

// TAA from https://github.com/playdeadgames/temporal

// https://software.intel.com/en-us/node/503873
vec3 RGB_YCoCg(vec3 c) {
    c.y *= 0.5;
    c.xz = vec2(c.x + c.z, c.x - c.z);
    return vec3(c.x * 0.25 + c.y, c.z * 0.5, c.y + c.x * (-0.25));
}

// https://software.intel.com/en-us/node/503873
vec3 YCoCg_RGB(vec3 c) {
    // R = Y + Co - Cg
    // G = Y + Cg
    // B = Y - Co - Cg
    return clamp(vec3(
        c.x + c.y - c.z,
        c.x + c.z,
        c.x - c.y - c.z
    ), vec3(0.0), vec3(1.0));
}

const float FLT_EPS = 0.0001f;

vec3 clipToEllipse(vec3 avgColor, vec3 variance, vec3 prevColor) {
    vec3 colorDiff = prevColor - avgColor;
    variance = colorDiff / (variance + FLT_EPS);
    colorDiff *= clamp(inversesqrt(dot(variance, variance)), 0.0, 1.0);
    return avgColor + colorDiff;
}

void resolverAABB(ivec2 texel, out vec3 avgColor, out vec3 variance, float varianceScale, vec3 centerColor) {
    vec3 m1 = vec3(0.0);
    vec3 m2 = vec3(0.0);

    for (int i = -1; i < 2; i++) {
        for (int j = -1; j < 2; j++) {
            vec3 sampleColor = RGB_YCoCg(texelFetch(colortex3, texel + ivec2(i, j), 0).rgb * 0.1);

            m1 += sampleColor;
            m2 += sampleColor * sampleColor;
        }
    }

    m1 /= 9.0;
    m2 /= 9.0;

    vec3 sampleVariance = sqrt(m2 - m1 * m1) * varianceScale * TAA_HISTORY_CLIP_VARIANCE;

    vec3 minColor = m1 - sampleVariance;
    vec3 maxColor = m1 + sampleVariance;

    minColor = min(minColor, centerColor) * 0.5;
    maxColor = max(maxColor, centerColor) * 0.5;

    avgColor = minColor + maxColor;
    variance = maxColor - minColor;
}

vec3 getCurrColorNeighborhood(ivec2 texel, vec3 currColor) {
    vec3 colorAccum = currColor;
    for (int i = -1; i < 2; i += 2) {
        for (int j = -1; j < 2; j += 2) {
            colorAccum += texelFetch(colortex3, texel + ivec2(i, j), 0).rgb;
        }
    }
    colorAccum *= 0.2;
    return currColor;
}

vec3 catmullRomFilter(vec2 prevCoord) {
    vec2 prevST = prevCoord * screenSize;
    vec2 prevUV = floor(prevST - vec2(0.5)) + vec2(0.5);

    vec2 t = prevST - prevUV;
    vec2 t2 = t * t;
    vec2 t3 = t2 * t;
    const float s = 0.5;
    vec2 w0 = -s * t3 + 2.0 * s * t2 - s * t;
    vec2 w1 = (2.0 - s) * t3 + (s - 3.0) * t2 + 1.0;
    vec2 w2 = (s - 2.0) * t3 + (3.0 - 2.0 * s) * t2 + s * t;
    vec2 w3 = s * t3 - s * t2;
    vec2 s0 = w1 + w2;
    vec2 f0 = w2 / s0;
    vec2 m0 = (prevUV + f0) * texelSize;
    vec2 tc0 = (prevUV - 1.0) * texelSize;
    vec2 tc3 = (prevUV + 2.0) * texelSize;

    vec4 prevColor =
        vec4(textureLod(colortex4, vec2(m0.x, tc0.y), 0.0).rgb, 1.0) * s0.x * w0.y +
        vec4(textureLod(colortex4, vec2(tc0.x, m0.y), 0.0).rgb, 1.0) * w0.x * s0.y +
        vec4(textureLod(colortex4, m0, 0.0).rgb               , 1.0) * s0.x * s0.y +
        vec4(textureLod(colortex4, vec2(tc3.x, m0.y), 0.0).rgb, 1.0) * w3.x * s0.y +
        vec4(textureLod(colortex4, vec2(m0.x, tc3.y), 0.0).rgb, 1.0) * s0.x * w3.y;
    return prevColor.rgb / prevColor.w;
}

vec3 temporalAntiAliasing(vec2 coord, ivec2 texel, vec2 velocity, vec3 currentColor, float blendWeight) {
    vec3 antiAliasing;
    if (blendWeight > 0.01) {
        vec2 reprojectCoord = coord + velocity;
        vec3 previousColor = RGB_YCoCg(catmullRomFilter(reprojectCoord) * 0.1);
        currentColor = RGB_YCoCg(currentColor * 0.1);

        vec3 avgColor;
        vec3 variance;
        resolverAABB(texel, avgColor, variance, 2.0, currentColor);

        previousColor = clipToEllipse(avgColor, variance, previousColor);

        antiAliasing = mix(currentColor, previousColor, vec3(blendWeight));
        antiAliasing = YCoCg_RGB(antiAliasing) * 10.0;
    }
    else {
        antiAliasing = getCurrColorNeighborhood(texel, currentColor);
    }

    return antiAliasing;
}

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    vec4 velocity = texelFetch(colortex5, texel, 0);
    vec3 solidColor = texelFetch(colortex3, texel, 0).rgb;

    #if SR_ENABLE
        velocity.st *= renderScale;
    #endif
    #if defined TAA && !(SR_ENABLE && SR_ALGO_SUPPORTS_JITTER)
        solidColor = temporalAntiAliasing(texcoord, texel, velocity.st, solidColor, velocity.w);
    #endif
    #if SR_ENABLE
        if (any(lessThan(vec2(renderScale), texcoord))) {
            solidColor = vec3(0.0);
        }
    #endif
    texBuffer3 = vec4(pow(clamp(solidColor * 0.1, 0.0, 1.0), vec3(2.2)) * 100.0, 1.0);

    float depth = textureLod(depthtex0, texcoord, 0.0).x;
    #ifdef LOD
        depth += getLodDepthWater(texcoord) * float(depth == 1.0);
    #endif
    if (dot(texcoord, screenSize) < 1.1) {
        depth = prevExposure;
    }
    if (dot(1.0 - texcoord, screenSize) < 1.1) {
        depth = smoothCenterDepth;
    }
    texBuffer6 = floatBitsToUint(depth);
}

/* DRAWBUFFERS:36 */
