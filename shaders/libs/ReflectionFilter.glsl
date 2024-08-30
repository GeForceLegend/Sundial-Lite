vec4 reflectionFilter(float offset, bool useNoise) {
    ivec2 centerTexel = ivec2(texcoord * screenSize);

    vec4 originData = texelFetch(colortex4, centerTexel, 0);
    float originReflectionDepth = originData.w;
    float originSmoothness = unpack16Bit(texelFetch(colortex2, centerTexel, 0).g).x;
    if (originSmoothness < 0.9975 && originReflectionDepth > 1e-5) {
        float routhness = pow2(1.0 - originSmoothness);
        float roughnessInv = 100.0 / max(routhness, 1e-5);
        vec2 coordOffset = vec2(4.0 * offset * clamp(routhness * 20.0, 0.0, 1.0) * (1.0 - exp(-sqrt(originReflectionDepth) * 50.0)));
        if (useNoise) {
            coordOffset *= blueNoiseTemporal(texcoord).x + 0.5;
        }

        vec3 originNormal = getNormalTexel(centerTexel);

        vec4 accumulation = originData;
        float weightAccumulation = 1.0;
        vec2 centerTexelCoord = centerTexel + 0.5;

        for (int i = -REFLECTION_FILTER; i < REFLECTION_FILTER + 1; i++) {
            for (int j = -REFLECTION_FILTER; j < REFLECTION_FILTER + 1; j++) {
                ivec2 sampleTexel = ivec2(centerTexelCoord + vec2(i, j) * coordOffset);
                vec2 normalData = texelFetch(colortex1, sampleTexel, 0).xy;
                vec4 sampleData = texelFetch(colortex4, sampleTexel, 0);
                float sampleReflectionDepth = sampleData.w;
                vec3 sampleNormal = decodeNormal(normalData);
                float sampleSmoothness = unpack16Bit(texelFetch(colortex2, sampleTexel, 0).g).x;

                float weight =
                    pow(max(dot(originNormal, sampleNormal), 1e-6), roughnessInv) *
                    pow(1.0 - abs(originSmoothness - sampleSmoothness), 100.0) *
                    exp(-abs(originReflectionDepth - sampleReflectionDepth) * originSmoothness) *
                    step(sampleSmoothness, 0.9975);
                weight = clamp(weight, 0.0, 1.0);
                if (abs(i) + abs(j) > 0.5 && max(abs(sampleTexel.x * texelSize.x - 0.5), abs(sampleTexel.y * texelSize.y - 0.5)) < 0.5) {
                    accumulation += sampleData * weight;
                    weightAccumulation += weight;
                }
            }
        }
        originData = accumulation / weightAccumulation;
    }
    return originData;
}
