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
//  Post processing
//

layout(location = 0) out vec4 texBuffer0;

in vec2 texcoord;

#define RAIN_BLOOM_FOG_DENSITY 1.0 // [0.0 0.01 0.02 0.03 0.04 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.35 0.4 0.45 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0 22.0 24.0 26.0 28.0 30.0 32.0 34.0 36.0 38.0 40.0 42.0 44.0 46.0 48.0 50.0 55.0 60.0 65.0 70.0 75.0 80.0 85.0 90.0 95.0 100.0]

#define BLOOM_INTENSITY 1.2 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0]
#define DISTORTION_STRENGTH 0.0 // [-1.0 -0.95 -0.9 -0.85 -0.8 -0.75 -0.7 -0.65 -0.6 -0.55 -0.5 -0.45 -0.4 -0.35 -0.3 -0.25 -0.2 -0.15 -0.1 -0.05 0.0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]
// Vignette
    #define VIGNETTE_STRENGTH 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
// Tonemap
    #define TONEMAPPING uchimura // [uchimura ACES AgX GT7]
    #define GAMMA 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0]
    #define SATURATION 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0]
    #define COLOR_TEMPERATURE 6500.0 // [1000.0 1200.0 1400.0 1600.0 1800.0 2000.0 2200.0 2400.0 2600.0 2800.0 3000.0 3200.0 3400.0 3600.0 3800.0 4000.0 4250.0 4500.0 4750.0 5000.0 5250.0 5500.0 5750.0 6000.0 6250.0 6500.0 6750.0 7000.0 7250.0 7500.0 7750.0 8000.0 8500.0 9000.0 9500.0 10000.0 10500.0 11000.0 11500.0 12000.0 13000.0 14000.0 15000.0 16000.0 18000.0 20000.0 22000.0 24000.0 28000.0 32000.0 36000.0 40000.0]
    // Uchimura settings
        #define CONTRAST 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0]
        #define MINIMUM_BRIGHTNESS 0.00 // [0.00 0.01 0.02 0.03 0.04 0.05 0.06 0.07 0.08 0.09 0.10]
        #define BLACK_TIGHTNESS 1.0 // [0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0]
    // AgX settings
        #define AGX_LOOK 0 // [0 1 2]
        #define AGX_EV_MIN -7.5 // [-15.0 -14.5 -14.0 -13.5 -13.0 -12.5 -12.0 -11.5 -11.0 -10.5 -10.0 -9.5 -9.0 -8.5 -8.0 -7.5 -7.0 -6.5 -6.0 -5.5 -5.0 -4.5 -4.0 -3.5 -3.0 -2.5 -2.0 -1.5 -1.0 -0.5 0.0 0.5 1.0 1.5 2.0 2.5 3.0 3.5 4.0 4.5 5.0 5.5 6.0 6.5 7.0 7.5 8.0 8.5 9.0 9.5 10]
        #define AGX_EV_MAX 6.0 // [-15.0 -14.5 -14.0 -13.5 -13.0 -12.5 -12.0 -11.5 -11.0 -10.5 -10.0 -9.5 -9.0 -8.5 -8.0 -7.5 -7.0 -6.5 -6.0 -5.5 -5.0 -4.5 -4.0 -3.5 -3.0 -2.5 -2.0 -1.5 -1.0 -0.5 0.0 0.5 1.0 1.5 2.0 2.5 3.0 3.5 4.0 4.5 5.0 5.5 6.0 6.5 7.0 7.5 8.0 8.5 9.0 9.5 10]
    // GT7 settings
        #define GT7_MID_POINT 0.55 // [0.0 0.01 0.02 0.03 0.04 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]
        #define GT7_LINEAR_SECTION 0.45 // [0.0 0.01 0.02 0.03 0.04 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]
        #define GT7_TOE_STRENGTH 1.28 // [1.0 1.04 1.08 1.12 1.16 1.2 1.24 1.28 1.32 1.36 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0]
        #define GT7_FADE_START 0.95 // [0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0]
        #define GT7_FADE_END 1.5 // [0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0]
// Exposure
    #define EXPOSURE_VALUE 0.0 // [-10.0 -9.8 -9.6 -9.4 -9.2 -9.0 -8.8 -8.6 -8.4 -8.2 -8.0 -7.8 -7.6 -7.4 -7.2 -7.0 -6.8 -6.6 -6.4 -6.2 -6.0 -5.8 -5.6 -5.4 -5.2 -5.0 -4.8 -4.6 -4.4 -4.2 -4.0 -3.8 -3.6 -3.4 -3.2 -3.0 -2.8 -2.6 -2.4 -2.2 -2.0 -1.8 -1.6 -1.4 -1.2 -1.0 -0.8 -0.6 -0.4 -0.2 0.0 0.2 0.4 0.6 0.8 1.0 1.2 1.4 1.6 1.8 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.2 5.4 5.6 5.8 6.0 6.2 6.4 6.6 6.8 7.0 7.2 7.4 7.6 7.8 8.0 8.2 8.4 8.6 8.8 9.0 9.2 9.4 9.6 9.8 10.0]
    #define AVERAGE_EXPOSURE_STRENGTH 0.60 // [0.00 0.01 0.02 0.03 0.04 0.05 0.06 0.07 0.08 0.09 0.10 0.12 0.14 0.16 0.18 0.20 0.24 0.28 0.32 0.36 0.40 0.44 0.48 0.52 0.56 0.60 0.65 0.70 0.75 0.80 0.85 0.90 0.95 1.00]
// ChromaticDispersion
    #define CHROMATIC_DISPERSION_R 0.0 // [0.0 0.001 0.002 0.003 0.004 0.005 0.006 0.008 0.01 0.012 0.016 0.02 0.024 0.028 0.032 0.036 0.04 0.045 0.05 0.055 0.06 0.07 0.08 0.09 0.1 0.11 0.12 0.15 0.2 0.25 0.3]
    #define CHROMATIC_DISPERSION_G 0.0 // [0.0 0.001 0.002 0.003 0.004 0.005 0.006 0.008 0.01 0.012 0.016 0.02 0.024 0.028 0.032 0.036 0.04 0.045 0.05 0.055 0.06 0.07 0.08 0.09 0.1 0.11 0.12 0.15 0.2 0.25 0.3]
    #define CHROMATIC_DISPERSION_B 0.0 // [0.0 0.001 0.002 0.003 0.004 0.005 0.006 0.008 0.01 0.012 0.016 0.02 0.024 0.028 0.032 0.036 0.04 0.045 0.05 0.055 0.06 0.07 0.08 0.09 0.1 0.11 0.12 0.15 0.2 0.25 0.3]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"

vec2 bloomMipEdge(float level) {
    float expLevel = exp2(-level);
    return round(screenSize * (1.0 - expLevel));
}

vec3 sampleBloom(vec2 coord, float level, vec2 minRange, vec2 maxRange) {
    float expLevel = exp2(-level);
    float basicOffset = 1.0 - 2.0 * expLevel;
    vec2 centerCoord = coord * expLevel + vec2(basicOffset);

    vec2 maxTexel = maxRange * texelSize - 0.5 * texelSize;
    vec2 minTexel = minRange * texelSize + 0.5 * texelSize;

    centerCoord = clamp(centerCoord, minTexel, maxTexel);

    vec3 bloomColor = textureLod(colortex4, centerCoord, 0.0).rgb;
    return bloomColor;
}

vec3 calculateBloom(vec2 coord) {
    vec3 totalBloom = vec3(0.0);
    vec2 maxRange = bloomMipEdge(1.0);
    vec2 minRange = vec2(0.0);
    totalBloom += sampleBloom(coord, 1.0, minRange, maxRange) * 0.92;
    minRange = maxRange;
    maxRange = bloomMipEdge(2.0);
    totalBloom += sampleBloom(coord, 2.0, minRange, maxRange) * 0.8464;
    minRange = maxRange;
    maxRange = bloomMipEdge(3.0);
    totalBloom += sampleBloom(coord, 3.0, minRange, maxRange) * 0.778688;
    minRange = maxRange;
    maxRange = bloomMipEdge(4.0);
    totalBloom += sampleBloom(coord, 4.0, minRange, maxRange) * 0.716393;
    minRange = maxRange;
    maxRange = bloomMipEdge(5.0);
    totalBloom += sampleBloom(coord, 5.0, minRange, maxRange) * 0.659081;
    minRange = maxRange;
    maxRange = bloomMipEdge(6.0);
    totalBloom += sampleBloom(coord, 6.0, minRange, maxRange) * 0.606355;
    minRange = maxRange;
    maxRange = bloomMipEdge(7.0);
    totalBloom += sampleBloom(coord, 7.0, minRange, maxRange) * 0.557847;
    return pow(totalBloom * (1.0 / 5.084764), vec3(2.2));
}

// Shared from https://www.shadertoy.com/view/lsSXW1 by CC BY 3.0
vec3 colorTemperature() {
    const float temperature = float(COLOR_TEMPERATURE) / 100.0;
    vec3 color;
    if (COLOR_TEMPERATURE <= 6600.0) {
        color = vec3(
            1.0,
            pow(clamp(0.39008157876901960784 * log(temperature) - 0.63184144378862745098, 0.0, 1.0), 2.2),
            pow(clamp(0.54320678911019607843 * log(temperature - 10.0) - 1.19625408914, 0.0, 1.0), 2.2)
        );
    } else {
        const float t = temperature - 60.0;
        color = vec3(
            pow(clamp(1.29293618606274509804 * pow(t, -0.1332047592), 0.0, 1.0), 2.2),
            pow(clamp(1.12989086089529411765 * pow(t, -0.0755148492), 0.0, 1.0), 2.2),
            1.0
        );
    }
    return color;
}

vec3 vignette(vec2 coord, vec3 color) {
    vec2 dist = (coord - 0.5);
    return color * exp(-VIGNETTE_STRENGTH * dot(dist, dist));
}

vec3 averageExposure(vec3 color) {
    float averageBrightness = textureLod(colortex7, vec2(0.0), 0.0).w;
    return color * pow(averageBrightness + 1e-5, -AVERAGE_EXPOSURE_STRENGTH) * 0.2;
}

// Uchimura 2017, "HDR theory and practice"
// Math: https://www.desmos.com/calculator/gslcdxvipg
// Source: https://www.slideshare.net/nikuque/hdr-theory-and-practicce-jp
vec3 uchimura(vec3 x, float P, float a, float m, float l, float c, float b) {
    float l0 = ((P - m) * l) / a;
    float L0 = m - m / a;
    float L1 = m + (1.0 - m) / a;
    float S0 = m + l0;
    float S1 = m + a * l0;
    float C2 = (a * P) / (P - S1);
    float CP = -1.44269502 * C2 / P;
    vec3 w0 = vec3(1.0 - smoothstep(0.0, m, x));
    vec3 w2 = vec3(step(S0, x));
    vec3 w1 = vec3(1.0 - w0 - w2);
    vec3 T = vec3(pow(x, vec3(c)) / pow(m, c - 1.0) + b);
    vec3 S = vec3(P - (P - S1) / exp2(CP * S0) * exp2(CP * x));
    vec3 L = vec3(m - a * m + a * x);
    return T * w0 + L * w1 + S * w2;
}

vec3 uchimura(vec3 x) {
    const float P = 1.0;  // max display brightness
    const float a = CONTRAST;  // contrast
    const float m = 0.22; // linear section start
    const float l = 0.4;  // linear section length
    const float c = 1.33 * BLACK_TIGHTNESS;    // black tightness
    const float b = MINIMUM_BRIGHTNESS; // pedestal

    vec3 color = uchimura(x, P, a, m, l, c, b);

    return pow(color, vec3(1.0 / (2.2 * GAMMA)));
}

// AgX from https://www.shadertoy.com/view/cd3XWr
vec3 agxDefaultContrastApprox(vec3 x) {
    return (((((15.5 * x - 40.14) * x + 31.96) * x - 6.868) * x + 0.4298) * x + 0.1191) * x  - 0.00232;
}

vec3 AgX(vec3 val) {
    const mat3 agx_mat = mat3(
        0.842479062253094, 0.0423282422610123, 0.0423756549057051,
        0.0784335999999992,  0.878468636469772,  0.0784336,
        0.0792237451477643, 0.0791661274605434, 0.879142973793104
    );

    const float min_ev = AGX_EV_MIN;
    const float max_ev = AGX_EV_MAX;

    // Input transform
    val = agx_mat * val;

    // Log2 space encoding
    val = clamp(log2(val / 0.18) / (max_ev - min_ev) - min_ev / (max_ev - min_ev), 0.0, 1.0);

    // Apply sigmoid function approximation
    val = agxDefaultContrastApprox(val);

    const vec3 lw = vec3(0.2126, 0.7152, 0.0722);
    float luma = dot(val, lw);

    // Default
    vec3 offset = vec3(0.0);
    vec3 slope = vec3(1.0);
    vec3 power = vec3(1.0);
    float sat = 1.0;

    #if AGX_LOOK == 1
        // Golden
        slope = vec3(1.0, 0.9, 0.5);
        power = vec3(0.8);
        sat = 0.8;
    #elif AGX_LOOK == 2
        // Punchy
        slope = vec3(1.0);
        power = vec3(1.35, 1.35, 1.35);
        sat = 1.4;
    #endif

    // ASC CDL
    val = pow(val * slope + offset, power);
    val = luma + sat * (val - luma);

    const mat3 agx_mat_inv = mat3(
        1.19687900512017, -0.0528968517574562, -0.0529716355144438,
        -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
        -0.0990297440797205, -0.0989611768448433, 1.15107367264116
    );

    // Undo input transform
    val = agx_mat_inv * val;
    val = pow(val, vec3(1.0 / GAMMA));

    return val;
}

vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
}

vec3 ACES(vec3 color) {
    color *= 1.7;

    color *= mat3(0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777);
    color = RRTAndODTFit(color);
    color *= mat3(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);

    color = pow(color, vec3(1.0 / (2.2 * GAMMA)));
    return color;
}

// https://blog.selfshadow.com/publications/s2025-shading-course/pdi/supplemental/gt7_tone_mapping.cpp
//
// Sample implementation of the GT7 Tone Mapping operator.
//
// Version history:
// 1.0    (2025-08-10)    Initial release.
//
// -----
// MIT License
//
// Copyright (c) 2025 Polyphony Digital Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// -----------------------------------------------------------------------------
// EOTF / inverse-EOTF for ST-2084 (PQ).
// Note: Introduce exponentScaleFactor to allow scaling of the exponent in the EOTF for Jzazbz.
// -----------------------------------------------------------------------------
float eotfSt2084(float n) {
    n = clamp(n, 0.0, 1.0);

    // Base functions from SMPTE ST 2084:2014
    // Converts from normalized PQ (0-1) to absolute luminance in cd/m^2 (linear light)
    // Assumes float input; does not handle integer encoding (Annex)
    // Assumes full-range signal (0-1)
    const float m1  = 0.1593017578125;                // (2610 / 4096) / 4
    const float m2  = 78.84375;                       // (2523 / 4096) * 128
    const float c1  = 0.8359375;                      // 3424 / 4096
    const float c2  = 18.8515625;                     // (2413 / 4096) * 32
    const float c3  = 18.6875;                        // (2392 / 4096) * 32
    const float pqC = 10000.0;                        // Maximum luminance supported by PQ (cd/m^2)

    // Does not handle signal range from 2084 - assumes full range (0-1)
    float np = pow(n, 1.0 / m2);
    float l  = clamp(np - c1, 0.0, 1.0);

    l = l / (c2 - c3 * np);
    l = pow(l, 1.0 / m1);

    // Convert absolute luminance (cd/m^2) into the frame-buffer linear scale.
    return l * pqC;
}

float inverseEotfSt2084(float v)
{
    const float m1  = 0.1593017578125;
    const float m2  = 78.84375;
    const float c1  = 0.8359375;
    const float c2  = 18.8515625;
    const float c3  = 18.6875;
    const float pqC = 10000.0;

    // Convert the frame-buffer linear scale into absolute luminance (cd/m^2).
    float y = v / pqC; // Normalize for the ST-2084 curve

    float ym = pow(y, m1);
    return exp2(m2 * (log2(c1 + c2 * ym) - log2(1.0 + c3 * ym)));
}

// -----------------------------------------------------------------------------
// ICtCp conversion.
// Reference: ITU-T T.302 (https://www.itu.int/rec/T-REC-T.302/en)
// -----------------------------------------------------------------------------

// Input: linear Rec.2020
vec3 rgbToUcs(vec3 rgb) {
    float l = dot(rgb, vec3(1688.0, 2146.0, 262.0)) / 4096.0;
    float m = dot(rgb, vec3(683.0, 2951.0, 462.0)) / 4096.0;
    float s = dot(rgb, vec3(99.0, 309.0, 3688.0)) / 4096.0;

    float lPQ = inverseEotfSt2084(l);
    float mPQ = inverseEotfSt2084(m);
    float sPQ = inverseEotfSt2084(s);

    vec3 ictCp;
    ictCp.x = (2048.0 * lPQ + 2048.0 * mPQ) / 4096.0;
    ictCp.y = (6610.0 * lPQ - 13613.0 * mPQ + 7003.0 * sPQ) / 4096.0;
    ictCp.z = (17933.0 * lPQ - 17390.0 * mPQ - 543.0 * sPQ) / 4096.0;
    return ictCp;
}

// Output: linear Rec.2020
vec3 ucsToRgb(vec3 ictCp) {
    float l = dot(ictCp, vec3(1.0, 0.00860904, 0.11103));
    float m = dot(ictCp, vec3(1.0, -0.00860904, -0.11103));
    float s = dot(ictCp, vec3(1.0, 0.560031, -0.320627));

    float lLin = eotfSt2084(l);
    float mLin = eotfSt2084(m);
    float sLin = eotfSt2084(s);

    vec3 rgb;
    rgb.x = max(3.43661 * lLin - 2.50645 * mLin + 0.0698454 * sLin, 0.0);
    rgb.y = max(-0.79133 * lLin + 1.9836 * mLin - 0.192271 * sLin, 0.0);
    rgb.z = max(-0.0259499 * lLin - 0.0989137 * mLin + 1.12486 * sLin, 0.0);
    return rgb;
}

vec3 GT7(vec3 color) {
    const float alpha_ = 0.25;
    const float k = (GT7_LINEAR_SECTION - 1.0) / (alpha_ - 1.0);
    const float kA_ = GT7_LINEAR_SECTION + k;
    const float kB_ = -k * exp(GT7_LINEAR_SECTION / k);
    const float kC_ = -1.0 / k;

    const float blendRatio_ = 0.6;
    const float framebufferLuminanceTargetUcs = 0.15;

    // Colorspace transformation source: https://www.colour-science.org:8010/apps/rgb_colourspace_transformation_matrix
    const mat3 Rec2020_2_sRGB = mat3(
        1.6603034854, -0.1243755953, -0.0181122800,
        -0.5875701425,  1.1328344814, -0.1005836085,
        -0.0728900602, -0.0083597372,  1.1187703262
    );
    const mat3 sRGB_2_Rec2020 = mat3(
        0.6274413721, 0.0690276171, 0.0163642351,
        0.3292974595, 0.9195806669, 0.0880171625,
        0.0433514584, 0.0113614226, 0.8955649727
    );

    color = sRGB_2_Rec2020 * color;

    // Convert to UCS to separate luminance and chroma.
    vec3 ucs = rgbToUcs(color);

    // Per-channel tone mapping ("skewed" color).
    vec3 weightLinear = smoothstep(vec3(0.0), vec3(GT7_MID_POINT), color);
    vec3 weightToe = 1.0 - weightLinear;
    // Shoulder mapping for highlights.
    vec3 shoulder = kA_ + kB_ * exp(color * kC_);
    vec3 toeMapped = GT7_MID_POINT * pow(color / GT7_MID_POINT, vec3(GT7_TOE_STRENGTH));
    vec3 skewedRgb = mix(shoulder, weightToe * toeMapped + weightLinear * color, lessThan(color, vec3(GT7_LINEAR_SECTION)));

    vec3 skewedUcs = rgbToUcs(skewedRgb);

    float chromaScale = 1.0 - smoothstep(GT7_FADE_START, GT7_FADE_END, ucs.x / framebufferLuminanceTargetUcs);
    vec3 scaledUcs = vec3(
        skewedUcs.x,            // Luminance from skewed color
        ucs.y * chromaScale,    // Scaled chroma components
        ucs.z * chromaScale
    );

    // Convert back to RGB.
    vec3 scaledRgb = ucsToRgb(scaledUcs);
    
    vec3 blended = mix(skewedRgb, scaledRgb, blendRatio_);
    color = clamp(blended, 0.0, 1.0);

    color = Rec2020_2_sRGB * color;
    color = pow(color, vec3(1.0 / (2.2 * GAMMA)));
    return color;
}

void main() {
    vec2 sampleCoord = texcoord;

    if (DISTORTION_STRENGTH != 0.0) {
        vec2 offset = texcoord - vec2(0.5);
        float r = dot(offset, offset);
        float r2 = 1.0 + DISTORTION_STRENGTH * r;

        vec2 disortion_offset = r2 * vec2(offset);
        const float disortion_scale = 1.0 / max(1.0 + DISTORTION_STRENGTH * 0.25, 1.0 + DISTORTION_STRENGTH * 0.5);
        sampleCoord = vec2(0.5) + disortion_offset * disortion_scale;
    }

    vec3 finalColor = vec3(
        textureLod(colortex3, sampleCoord * (1.0 - CHROMATIC_DISPERSION_R) + vec2(0.5) * CHROMATIC_DISPERSION_R, 0.0).r,
        textureLod(colortex3, sampleCoord * (1.0 - CHROMATIC_DISPERSION_G) + vec2(0.5) * CHROMATIC_DISPERSION_G, 0.0).g,
        textureLod(colortex3, sampleCoord * (1.0 - CHROMATIC_DISPERSION_B) + vec2(0.5) * CHROMATIC_DISPERSION_B, 0.0).b
    );

    vec3 bloomColor = calculateBloom(sampleCoord);
    #if SR_ENABLE
        sampleCoord *= renderScale;
    #endif
    float screenDepth = textureLod(depthtex0, sampleCoord, 0.0).x;
    float viewDepth;
    #ifdef LOD
        if (screenDepth == 1.0) {
            float lodDepth = getLodDepthWater(sampleCoord);
            viewDepth = screenToViewDepthLod(lodDepth);
            screenDepth += lodDepth;
        } else
    #endif
    {
        viewDepth = screenToViewDepth(screenDepth);
        screenDepth += 1.0;
    }
    #ifdef SHADOW_AND_SKY
        float skyLight = clamp(unpack2x8Bit(texelFetch(colortex2, ivec2(sampleCoord * screenSize), 0).z).y + float(screenDepth > 1.0), 0.0, 1.0);
        skyLight = max(clamp(skyLight * (1.0 - exp2(-viewDepth * 0.01 * RAIN_BLOOM_FOG_DENSITY)) + float(screenDepth == 2.0), 0.0, 1.0), eyeBrightnessSmooth.y / 240.0);
        finalColor = mix(bloomColor, finalColor, exp2(-weatherStrength * weatherStrength * skyLight * RAIN_BLOOM_FOG_DENSITY * 0.03 * viewDepth * exp2(-cameraPosition.y / 2000.0 - WORLD_BASIC_HEIGHT / 2000.0)));
    #endif
    float weatherData = textureLod(colortex0, sampleCoord, 0.0).w * 2.5 - 1.5;
    float bloomAmount = 0.2 * BLOOM_INTENSITY + 1.0 * step(weatherData, -0.3) + 0.6 * step(0.5, float(isEyeInWater)) + step(1.5, float(isEyeInWater));
    finalColor = (finalColor + bloomColor * bloomAmount) / (1.0 + bloomAmount * 0.5);

    finalColor = averageExposure(finalColor);

    finalColor *= exp2(EXPOSURE_VALUE);

    float luminance = luminanceLiner(finalColor);
    finalColor = max(vec3(0.0), mix(finalColor, vec3(luminance), vec3(1.0 - SATURATION)));

    finalColor = colorTemperature() * finalColor;

    finalColor = TONEMAPPING(finalColor);

    finalColor = vignette(texcoord, finalColor);

    finalColor += (blueNoiseTemporal(texcoord.st) - 0.5) * (2.0 / 255.0);

    texBuffer0 = vec4(clamp(finalColor, vec3(0.0), vec3(1.0)), 1.0);
}

/* DRAWBUFFERS:0 */
