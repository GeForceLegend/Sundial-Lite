vec3 rainRippleNormal(vec3 position) {
    float offsetY = mod(floor(frameTimeCounter * 90.0 * RIPPLE_SPEED), 60.0);
    vec2 uv = fract(position.xz / RIPPLE_SCALE);
    uv.y -= offsetY + 59.0;
    uv.y *= 1.0 / 60.0;
    vec3 normal = textureLod(gaux2, uv, 0.0).xyz * 2.0 - 1.0;
    normal.xy *= rainStrength;
    normal.z /= RIPPLE_STRENGTH;
    return normal;
}

vec2 clampCoordRange(vec2 coord, vec4 coordRange) {
    return coordRange.xy + fract(coord) * coordRange.zw;
}

#ifdef MC_NORMAL_MAP
    vec4 heightGather(sampler2D normalSampler, vec2 coord, vec2 coord00, vec4 coordRange, vec2 quadTexelSize, vec2 normalTexSize) {
        ivec2 texel00 = ivec2(coord00);
        ivec2 texel11 = ivec2(clampCoordRange(coord + 0.499 * quadTexelSize, coordRange) * normalTexSize);
        vec4 sh = vec4(
            texelFetch(normalSampler, ivec2(texel00.x, texel11.y), 0).a,
            texelFetch(normalSampler, texel11, 0).a,
            texelFetch(normalSampler, ivec2(texel11.x, texel00.y), 0).a,
            texelFetch(normalSampler, texel00, 0).a
        );
        sh += clamp(1.0 - sh * 1e+10, vec4(0.0), vec4(1.0));
        return sh;
    }

    float bilinearHeightSample(sampler2D normalSampler, vec2 coord, vec4 coordRange, vec2 quadTexelSize, vec2 normalTexSize) {
        vec2 coord00 = clampCoordRange(coord - 0.499 * quadTexelSize, coordRange) * normalTexSize;
        vec4 sh = heightGather(normalSampler, coord, coord00, coordRange, quadTexelSize, normalTexSize);
        vec2 fpc = fract(coord00);
        vec2 x = mix(sh.wx, sh.zy, vec2(fpc.x));
        return mix(x.x, x.y, fpc.y);
    }

    vec3 heightBasedNormal(sampler2D normalSampler, vec2 coord, vec4 coordRange, vec2 quadTexelSize, vec2 normalTexSize, vec2 pixelScale) {
        vec2 tileCoord = (coord - coordRange.xy) / coordRange.zw;
        vec2 coord00 = clampCoordRange(tileCoord - 0.499 * quadTexelSize, coordRange) * normalTexSize;
        vec4 sh = heightGather(normalSampler, tileCoord, coord00, coordRange, quadTexelSize, normalTexSize);

        vec2 fpc = fract(coord00);
        sh.y = sh.x + sh.z - sh.w - sh.y;
        vec3 normal = vec3(
            sh.y * fpc.yx + (sh.w - sh.zx),
            (5.0 / PARALLAX_DEPTH)
        );
        normal.xy *= pixelScale;

        return normal;
    }

    vec4 bilinearNormalSample(sampler2D normalSampler, vec2 coord, vec4 coordRange, vec2 quadTexelSize, vec2 normalTexSize) {
        vec4[4] sh;
        vec2 tileCoord = (coord - coordRange.xy) / coordRange.zw;
        vec2 coord00 = clampCoordRange(tileCoord - 0.5 * quadTexelSize, coordRange);
        vec2 coord11 = clampCoordRange(tileCoord + 0.5 * quadTexelSize, coordRange);
        sh = vec4[4](
            textureLod(normalSampler, vec2(coord00.x, coord11.y), 0.0),
            textureLod(normalSampler, coord11, 0.0),
            textureLod(normalSampler, vec2(coord11.x, coord00.y), 0.0),
            textureLod(normalSampler, coord00, 0.0)
        );
        vec2 fpc = fract(coord * normalTexSize + 0.5);
        return mix(
            mix(sh[3], sh[2], vec4(fpc.x)),
            mix(sh[0], sh[1], vec4(fpc.x)),
            vec4(fpc.y)
        );
    }
#endif

vec4 anisotropicFilter(vec2 coord, vec2 albedoTexSize, vec2 atlasTexelSize, vec2 texGradX, vec2 texGradY, vec4 coordRange, vec2 quadSize) {
    //https://www.shadertoy.com/view/4lXfzn
    mat2 qd = inverse(mat2(texGradX * albedoTexSize, texGradY * albedoTexSize));
    qd = transpose(qd) * qd;

    float d = determinant(qd);
    float t = (qd[0][0] + qd[1][1]) * 0.5;

    float D = abs(t * t - d);
    D = D * inversesqrt(D);
    float V = t - D;
    float v = t + D;
    float l = -0.5 * log2(v);

    #if ANISOTROPIC_FILTERING_QUALITY > 1
        vec2 A = vec2(qd[0][1], qd[0][0] - V);
        A *= inversesqrt(V * dot(A, A)) / ANISOTROPIC_FILTERING_QUALITY;
        A = max(vec2(0.0), abs(A)) * atlasTexelSize * quadSize;

        vec2 sampleCoord = (coord - coordRange.xy) * quadSize + (0.5 - 0.5 * ANISOTROPIC_FILTERING_QUALITY) * A;
        vec4 albedo = vec4(0.0);
        float opaque = 0.0;
        for (int i = 0; i < ANISOTROPIC_FILTERING_QUALITY; i++) {
            sampleCoord += A;
            vec4 albedoSample = textureLod(gtexture, clampCoordRange(sampleCoord, coordRange), l);
            albedo.rgb += albedoSample.rgb * albedoSample.a;
            albedo.a += albedoSample.a;
            opaque = max(opaque, albedoSample.a);
        }
        albedo.rgb *= max(1.0 / albedo.a, 1e-5);
        albedo.a /= ANISOTROPIC_FILTERING_QUALITY;
        albedo.a = clamp(albedo.a + float(opaque > 0.999), 0.0, 1.0) * clamp(texture(gtexture, coord).a * 10.0, 0.0, 1.0);
    #else
        vec2 noise = blueNoiseTemporal(gl_FragCoord.st * texelSize).xy - 0.5;
        vec2 sampleCoord = coord + noise.x * texGradX + noise.y * texGradY;
        sampleCoord = clampCoordRange((sampleCoord - coordRange.xy) * quadSize, coordRange);
        vec4 albedo = textureLod(gtexture, sampleCoord, l);
    #endif

    return albedo;
}

#ifdef MC_NORMAL_MAP
    vec2 perPixelParallax(
        vec2 coord, vec3 viewVector, vec2 albedoTexSize, vec2 atlasTexelSize, vec4 coordRange,
        inout vec3 parallaxTexNormal, inout float parallaxOffset
    ) {
        vec2 parallaxCoord = coord;
        parallaxOffset = 0.0;
        float sampleHeight = textureLod(normals, coord, 0.0).a;
        sampleHeight += clamp(1.0 - sampleHeight * 1e+10, 0.0, 1.0);

        if (sampleHeight < 0.999) {
            vec3 stepDir = viewVector;
            stepDir.xy *= PARALLAX_DEPTH * albedoTexSize * 0.2;
            stepDir = normalize(stepDir);
            stepDir.z = -stepDir.z;

            coord *= albedoTexSize;
            ivec2 basicTexel = ivec2(round(coordRange.xy * albedoTexSize));
            ivec2 sampleTexel = ivec2(floor(coord));
            vec2 stepLength = abs(1.0 / stepDir.xy);
            ivec2 dirSigned = (floatBitsToInt(stepDir.xy) >> 31) * 2 + 1;
            vec2 nextLength = (dirSigned * (0.5 - coord + sampleTexel) + 0.5) * stepLength;
            ivec2 tileSize = ivec2(round(coordRange.zw * albedoTexSize));
            sampleHeight = 1.0 - sampleHeight;
            sampleTexel -= basicTexel;

            for (int i = 0; i < PARALLAX_QUALITY; i++) {
                float rayLength = min(nextLength.x, nextLength.y);
                float rayHeight = rayLength * stepDir.z;
                if (rayHeight > sampleHeight) {
                    parallaxOffset = sampleHeight;
                    break;
                }
                ivec2 nextPixel = (floatBitsToInt(vec2(rayLength) - nextLength) >> 31) + 1;
                nextLength += nextPixel * stepLength;
                sampleTexel += nextPixel * dirSigned;
                sampleTexel = sampleTexel % tileSize;
                sampleHeight = texelFetch(normals, sampleTexel + basicTexel, 0).a;
                sampleHeight += clamp(1.0 - sampleHeight * 1e+10, 0.0, 1.0);
                sampleHeight = 1.0 - sampleHeight;
                if (rayHeight > sampleHeight) {
                    parallaxOffset = rayHeight;
                    parallaxTexNormal = vec3(-nextPixel * dirSigned, 0.0);
                    break;
                }
            }
            parallaxCoord = (sampleTexel + basicTexel + vec2(0.5)) * atlasTexelSize;
        }
        return parallaxCoord;
    }

    vec2 calculateParallax(
        vec2 coord, vec3 viewVector, vec4 coordRange, vec2 quadSize, vec2 albedoTexSize, vec2 albedoTexelSize, inout float parallaxOffset
    ) {
        vec2 quadTexelSize = albedoTexelSize * quadSize;

        vec3 parallaxCoord = vec3(coord, 1.0);

        vec2 firstCoord = (coord - coordRange.xy) * quadSize;
        #ifdef SMOOTH_PARALLAX
            float startHeight = bilinearHeightSample(normals, firstCoord, coordRange, quadTexelSize, albedoTexSize);
        #else
            float startHeight = textureLod(normals, parallaxCoord.st, 0.0).a;
            startHeight += clamp(1.0 - startHeight * 1e+10, 0.0, 1.0);
        #endif

        if (startHeight < 1.0) {
            parallaxCoord.st = firstCoord;
            vec3 stepSize = viewVector / (PARALLAX_QUALITY * abs(viewVector.z));
            stepSize.xy *= PARALLAX_DEPTH * 0.2 * quadSize;
            float stepScale = 2.0 / PARALLAX_QUALITY;

            for (int i = 0; i < PARALLAX_QUALITY; i++) {
                parallaxCoord += stepSize * stepScale;
                #ifdef SMOOTH_PARALLAX
                    float sampleHeight = bilinearHeightSample(normals, parallaxCoord.st, coordRange, quadTexelSize, albedoTexSize);
                #else
                    float sampleHeight = textureLod(normals, clampCoordRange(parallaxCoord.st, coordRange), 0.0).a;
                    sampleHeight += clamp(1.0 - sampleHeight * 1e+10, 0.0, 1.0);
                #endif
                if (sampleHeight > parallaxCoord.z) {
                    break;
                }
                stepScale += 2.0 / PARALLAX_QUALITY;
            }
            parallaxCoord -= stepSize * stepScale;
            stepSize *= 0.5;
            for (int i = 0; i < PARALLAX_MAX_REFINEMENTS; i++) {
                parallaxCoord += stepSize * stepScale;
                #ifdef SMOOTH_PARALLAX
                    float sampleHeight = bilinearHeightSample(normals, parallaxCoord.st, coordRange, quadTexelSize, albedoTexSize);
                #else
                    float sampleHeight = textureLod(normals, clampCoordRange(parallaxCoord.st, coordRange), 0.0).a;
                    sampleHeight += clamp(1.0 - sampleHeight * 1e+10, 0.0, 1.0);
                #endif
                if (sampleHeight > parallaxCoord.z) {
                    parallaxCoord -= stepSize * stepScale;
                    stepSize *= 0.5;
                }
            }
            parallaxCoord += 2.0 * stepSize * stepScale;
            parallaxCoord.st = clampCoordRange(parallaxCoord.st, coordRange);
        }
        parallaxOffset = 1.0 - parallaxCoord.z;
        return parallaxCoord.st;
    }
#endif
