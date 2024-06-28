layout(location = 0) out vec4 texBuffer3;

in vec2 texcoord;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

// TAA from https://github.com/playdeadgames/temporal

// https://software.intel.com/en-us/node/503873
vec3 RGB_YCoCg(vec3 c) {
    return vec3(
         c.x/4.0 + c.y/2.0 + c.z/4.0,
         c.x/2.0 - c.z/2.0,
        -c.x/4.0 + c.y/2.0 - c.z/4.0
    );
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

void resolverAABB(in vec2 coord, out vec3 avgColor, out vec3 variance, float varianceScale, vec3 centerColor) {
    ivec2 texel = ivec2(gl_FragCoord.st);

    vec3 m1 = vec3(0.0);
    vec3 m2 = vec3(0.0);

    for (int i = -1; i < 2; i++) {
        for (int j = -1; j < 2; j++) {
            vec3 sampleColor = RGB_YCoCg(texelFetch(colortex3, texel + ivec2(i, j), 0).rgb);

            m1 += sampleColor;
            m2 += sampleColor * sampleColor;
        }
    }

    m1 /= 9.0;
    m2 /= 9.0;

    vec3 sampleVariance = sqrt(m2 - m1 * m1) * varianceScale;

    vec3 minColor = m1 - sampleVariance;
    vec3 maxColor = m1 + sampleVariance;

    minColor = min(minColor, centerColor) * 0.5;
    maxColor = max(maxColor, centerColor) * 0.5;

    avgColor = minColor + maxColor;
    variance = maxColor - minColor;
}

vec3 getCurrColorNeighborhood(vec3 currColor) {
    ivec2 texel = ivec2(gl_FragCoord.st);
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

vec3 temporalAntiAliasing(vec2 coord, vec2 velocity, vec3 currentColor, float blendWeight) {
    vec3 antiAliasing;
    if (blendWeight > 0.01) {
        vec2 reprojectCoord = coord + velocity;
        vec3 previousColor = RGB_YCoCg(catmullRomFilter(reprojectCoord));
        currentColor = RGB_YCoCg(currentColor);

        vec3 avgColor;
        vec3 variance;
        resolverAABB(coord.st, avgColor, variance, 2.0, currentColor);

        previousColor = clipToEllipse(avgColor, variance, previousColor);

        antiAliasing = mix(currentColor, previousColor, vec3(blendWeight));
        antiAliasing = YCoCg_RGB(antiAliasing);
    }
    else {
        antiAliasing = getCurrColorNeighborhood(currentColor);
    }

    return antiAliasing;
}

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    vec4 velocity = texelFetch(colortex1, texel, 0);
    vec3 solidColor = texelFetch(colortex3, texel, 0).rgb;

    #ifdef TAA
        solidColor = temporalAntiAliasing(texcoord, velocity.st * 2.0 - 1.0, solidColor, velocity.w);
    #endif
    texBuffer3 = vec4(pow(clamp(solidColor, 0.0, 1.0), vec3(2.2)), 1.0);
    if (dot(texcoord, screenSize) < 1.1) {
        texBuffer3.w = texelFetch(colortex4, ivec2(0), 0).w;
    }
}

/* DRAWBUFFERS:3 */
