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
//  DoF stage 2: sample
//

#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer3;

in vec2 texcoord;

// #define APERTURE_CORROSION
#define LENS_DIAMETER_SCALE 1.0 // [1.0 1.05 1.1 1.15 1.2 1.25 1.3 1.35 1.4 1.45 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0]
#define APERTURE_CORROSION_OFFSET 1.5 // [0.0 0.01 0.02 0.03 0.04 0.05 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.33 0.36 0.4 0.43 0.46 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0]
#define DOF_SAMPLES 10 // [2 3 4 5 6 7 8 9 10 12 14 16 18 20 22 25 30 35 40 45 50 60 70 80 90 100]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);

    vec4 centerData = texelFetch(colortex3, texel, 0);
    float centerDepth = centerData.w;
    float centerCoCRadius = clamp(abs(centerData.w), 0.0, 1.0);

    const mat2 goldenRotate = mat2(cos(2.39996323), sin(2.39996323), -sin(2.39996323), cos(2.39996323));
    const float strength = 15.0 * MAX_BLUR_RADIUS;
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
        float sampleCoC = clamp(abs(sampleData.w), 0.0, 1.0);
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

    texBuffer3 = vec4(clamp(pow(0.005 * centerData.rgb, vec3(1.0 / 2.2)), vec3(0.0), vec3(1.0)) * 10.0, 1.0);
}

/* DRAWBUFFERS:3 */
