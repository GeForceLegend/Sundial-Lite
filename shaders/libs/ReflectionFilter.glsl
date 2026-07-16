vec4 reflectionFilter(vec4 originData, ivec2 centerTexel, float offset, bool useNoise) {
    float originReflectionDepth = originData.w;
    vec4 originGbufferData = texelFetch(colortex1, centerTexel, 0);
    float originSmoothness = unpack2x8Bit(originGbufferData.z).x;
    float roughness = pow2(1.0 - originSmoothness);
    float roughnessInv = 100.0 / max(roughness, 1e-5);
    vec2 coordOffset = vec2(4.0 * offset * clamp(roughness * 20.0, 0.0, 1.0) * (1.0 - exp(-originReflectionDepth * 1000.0)));
    if (useNoise) {
        coordOffset *= blueNoiseTemporal(texcoord).x + 0.5;
    }

    vec3 originNormal = decodeNormal(originGbufferData.xy);

    vec3 accumulation = originData.rgb;
    float weightAccumulation = 1.0;
    vec2 centerTexelCoord = centerTexel + 0.5;

    for (int i = -REFLECTION_FILTER; i < REFLECTION_FILTER + 1; i++) {
        for (int j = -REFLECTION_FILTER; j < REFLECTION_FILTER + 1; j++) {
            vec2 sampleTexelCoord = centerTexelCoord + vec2(i, j) * coordOffset;
            ivec2 sampleTexel = ivec2(sampleTexelCoord);
            vec4 sampleData = texelFetch(colortex4, sampleTexel, 0);
            float sampleReflectionDepth = sampleData.w;
            vec4 sampleGbufferData = texelFetch(colortex1, sampleTexel, 0);
            vec3 sampleNormal = decodeNormal(sampleGbufferData.xy);
            float sampleSmoothness = unpack2x8Bit(sampleGbufferData.z).x;

            float weight =
                exp2(
                    roughnessInv * log2(max(dot(originNormal, sampleNormal), 1e-6)) +
                    100.0 * log2(1.0 - abs(roughness - pow2(1.0 - sampleSmoothness))) -
                    1.44269502 * abs(originReflectionDepth - sampleReflectionDepth) / (max(originReflectionDepth, sampleReflectionDepth) + 0.2) * originSmoothness
                ) *
                step(0.0025, sampleSmoothness);
            weight = clamp(weight, 0.0, 1.0);
            if (abs(i) != -abs(j) && all(lessThan(floatBitsToUint(sampleTexelCoord * texelSize), floatBitsToUint(screenEdge)))) {
                accumulation += sampleData.rgb * weight;
                weightAccumulation += weight;
            }
        }
    }
    originData.rgb = accumulation / weightAccumulation;
    return originData;
}
