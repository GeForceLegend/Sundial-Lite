layout(location = 0) out vec4 texBuffer3;
layout(location = 1) out vec4 texBuffer4;

in float smoothCenterDepth;
in vec2 texcoord;

#define COC_SPREAD_SAMPLES 10 // [2 3 4 5 6 7 8 9 10 12 14 16 18 20 22 25 30 35 40 45 50 60 70 80 90 100]

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
    float centerDepth = textureLod(DOF_DEPTH_TEXTURE, texcoord, 0.0).x;
    float centerViewDepth = screenToViewDepth(centerDepth);
    float centerCoC = circleOfConfusionRadius(texcoord, centerViewDepth, focusDepth);

    const mat2 goldenRotate = mat2(cos(2.39996323), sin(2.39996323), -sin(2.39996323), cos(2.39996323));
    float strength = 15.0 * APERTURE_DIAMETER_SCALE;
    vec2 noise = blueNoiseTemporal(texcoord).xy;
    float radius2 = centerCoC * centerCoC;
    float stepSize = (1.0 - radius2) / COC_SPREAD_SAMPLES;
    radius2 += stepSize * noise.y;
    float noiseAngle = noise.x * PI * 2.0;
    float cosNoise = cos(noiseAngle);
    float sinNoise = sin(noiseAngle);
    vec2 angle = vec2(cosNoise, sinNoise) * strength;

    float sampleRadius = max(1e-5, centerCoC);

    for (int i = 0; i < COC_SPREAD_SAMPLES; i++) {
        float radius = radius2 * inversesqrt(radius2);
        vec2 sampleCoord = texcoord + texelSize * radius * angle;
        float sampleDepth = textureLod(DOF_DEPTH_TEXTURE, sampleCoord, 0.0).x;
        angle = goldenRotate * angle;
        radius2 += stepSize;
        float sampleCoC = circleOfConfusionRadius(sampleCoord, screenToViewDepth(sampleDepth), focusDepth);
        if (sampleCoC >= radius && sampleDepth <= centerDepth) {
            sampleRadius = max(sampleRadius, sampleCoC);
        }
    }

    texBuffer4 = vec4(vec3(0.0), sampleRadius);
    texBuffer3 = vec4(centerData.rgb, centerViewDepth);
}

/* DRAWBUFFERS:34 */
