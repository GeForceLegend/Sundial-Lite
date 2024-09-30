layout(location = 0) out vec4 texBuffer3;
layout(location = 1) out vec4 texBuffer4;

in vec2 texcoord;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"

vec3 sampleBloomX(vec2 coord) {
    vec2 offset = uintBitsToFloat(floatBitsToUint(1.0 - coord) & 0x7F800000u);
    vec3 result = vec3(0.0);
    if (offset.x == offset.y) {
        ivec2 texel = ivec2(coord * screenSize);
        int maxTexelX = int(floor(screenSize.x * (1.0 - offset.x)));
        int minTexelX = int(ceil(screenSize.x * (1.0 - 2.0 * offset.x)));

        const float weights[5] = float[5](0.27343750, 0.21875000, 0.10937500, 0.03125000, 0.00390625);
        vec3 totalColor = texelFetch(colortex4, texel, 0).rgb * weights[0];
        ivec2 sampleTexel0 = texel;
        ivec2 sampleTexel1 = texel;

        for (int i = 1; i < 5; i++) {
            sampleTexel0.x = min(maxTexelX, sampleTexel0.x + 1);
            sampleTexel1.x = max(minTexelX, sampleTexel1.x - 1);
            totalColor += (texelFetch(colortex4, sampleTexel0, 0).rgb + texelFetch(colortex4, sampleTexel1, 0).rgb) * weights[i];
         }
        result = totalColor;
    }
    return result;
}

vec3 smoothMotionBlur(vec2 coord) {
    vec3 totalColor = textureLod(colortex3, coord, 0.0).rgb;
    #ifdef MOTION_BLUR
        vec2 velocity = textureLod(colortex1, coord, 0.0).xy * 2.0 - 1.0;
        vec2 screenVelocity = velocity * screenSize;
        if (dot(screenVelocity, screenVelocity) > 1.0) {
            float screenScale = max(screenSize.x, screenSize.y);
            vec2 stepSize = 0.3 * velocity * clamp(3.0 * inversesqrt(dot(velocity, velocity)) * screenScale, 0.0, 1.0) / screenScale;
            float stepScale = 1.0;
            for (int i = 1; i < 3; i++) {
                stepScale += 1.0;
                totalColor += textureLod(colortex3, coord + stepScale * stepSize, 0.0).rgb;
                totalColor += textureLod(colortex3, coord - stepScale * stepSize, 0.0).rgb;
            }
            totalColor *= 0.2;
        }
    #endif
    return totalColor;
}

void main() {
    texBuffer3 = vec4(smoothMotionBlur(texcoord), 1.0);
    texBuffer4 = vec4(sampleBloomX(texcoord), 1.0);
}

/* DRAWBUFFERS:34 */
