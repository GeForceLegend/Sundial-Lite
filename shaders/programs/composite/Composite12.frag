layout(location = 0) out vec4 texBuffer3;
layout(location = 1) out vec4 texBuffer4;

in vec2 texcoord;

#define CHROMATIC_DISPERSION_R 0.0 // [0.0 0.001 0.002 0.003 0.004 0.005 0.006 0.008 0.01 0.012 0.016 0.02 0.024 0.028 0.032 0.036 0.04 0.045 0.05 0.055 0.06 0.07 0.08 0.09 0.1 0.11 0.12 0.15 0.2 0.25 0.3]
#define CHROMATIC_DISPERSION_G 0.0 // [0.0 0.001 0.002 0.003 0.004 0.005 0.006 0.008 0.01 0.012 0.016 0.02 0.024 0.028 0.032 0.036 0.04 0.045 0.05 0.055 0.06 0.07 0.08 0.09 0.1 0.11 0.12 0.15 0.2 0.25 0.3]
#define CHROMATIC_DISPERSION_B 0.0 // [0.0 0.001 0.002 0.003 0.004 0.005 0.006 0.008 0.01 0.012 0.016 0.02 0.024 0.028 0.032 0.036 0.04 0.045 0.05 0.055 0.06 0.07 0.08 0.09 0.1 0.11 0.12 0.15 0.2 0.25 0.3]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"

vec3 sampleBloomY(vec2 coord) {
    vec2 offset = uintBitsToFloat(floatBitsToUint(1.0 - coord) & 0x7F800000u);
    vec3 result = vec3(0.0);
    if (offset.x == offset.y) {
        ivec2 texel = ivec2(coord * screenSize);
        int maxTexelY = int(floor(screenSize.y * (1.0 - offset.y)));
        int minTexelY = int(ceil(screenSize.y * (1.0 - 2.0 * offset.y)));

        const float weights[5] = float[5](0.27343750, 0.21875000, 0.10937500, 0.03125000, 0.00390625);
        vec3 totalColor = texelFetch(colortex4, texel, 0).rgb * weights[0];
        ivec2 sampleTexel0 = texel;
        ivec2 sampleTexel1 = texel;

        for (int i = 1; i < 5; i++) {
            sampleTexel0.y = min(maxTexelY, sampleTexel0.y + 1);
            sampleTexel1.y = max(minTexelY, sampleTexel1.y - 1);
            totalColor += (texelFetch(colortex4, sampleTexel0, 0).rgb + texelFetch(colortex4, sampleTexel1, 0).rgb) * weights[i];
        }
        result = totalColor;
    }
    return result;
}

void main() {
    texBuffer3 = vec4(
        textureLod(colortex3, texcoord * (1.0 - CHROMATIC_DISPERSION_R) + vec2(0.5) * CHROMATIC_DISPERSION_R, 0.0).r,
        textureLod(colortex3, texcoord * (1.0 - CHROMATIC_DISPERSION_G) + vec2(0.5) * CHROMATIC_DISPERSION_G, 0.0).g,
        textureLod(colortex3, texcoord * (1.0 - CHROMATIC_DISPERSION_B) + vec2(0.5) * CHROMATIC_DISPERSION_B, 0.0).b,
        1.0
    );

    vec3 bloomColor = sampleBloomY(texcoord);
    texBuffer4 = vec4(pow(bloomColor, vec3(1.0 / 2.2)), 1.0);
}

/* DRAWBUFFERS:34 */
