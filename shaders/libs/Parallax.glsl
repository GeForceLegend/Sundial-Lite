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

ivec2 calculateOffsetTexel(ivec2 texel, ivec2 baseCoord, int tileBits) {
    return baseCoord + (texel & tileBits);
}

vec2 calculateOffsetCoord(vec2 coord, vec2 baseCoord, vec2 tileCoordSize, vec2 atlasTiles) {
    return baseCoord + min(coord - tileCoordSize * floor(coord * atlasTiles), tileCoordSize - 1e-6);
}

#ifdef MC_NORMAL_MAP
    vec4 heightGather(sampler2D normalSampler, ivec2 texel, ivec2 baseCoord, int tileBits, bool clampCoord) {
        ivec2 texel00 = texel;
        ivec2 texel11 = texel00 + 1;
        if (clampCoord) {
            texel00 = calculateOffsetTexel(texel00, baseCoord, tileBits);
            texel11 = calculateOffsetTexel(texel11, baseCoord, tileBits);
        }
        vec4 sh = vec4(
            texelFetch(normalSampler, ivec2(texel00.x, texel11.y), 0).a,
            texelFetch(normalSampler, texel11, 0).a,
            texelFetch(normalSampler, ivec2(texel11.x, texel00.y), 0).a,
            texelFetch(normalSampler, texel00, 0).a
        );
        sh += clamp(1.0 - sh * 1e+10, vec4(0.0), vec4(1.0));
        return sh;
    }

    float bilinearHeightSample(sampler2D normalSampler, vec2 coord, ivec2 baseCoord, int tileBits, bool clampCoord) {
        ivec2 texel = ivec2(floor(coord));
        vec4 sh = heightGather(normalSampler, texel, baseCoord, tileBits, clampCoord);
        vec2 fpc = fract(coord);
        vec2 x = mix(sh.wx, sh.zy, vec2(fpc.x));
        return mix(x.x, x.y, fpc.y);
    }

    vec3 heightBasedNormal(sampler2D normalSampler, vec2 coord, vec2 baseCoord, vec2 normalTexSize, vec2 textureTexel, float textureResolution, bool clampCoord) {
        coord = coord * normalTexSize - 0.5;
        ivec2 texel = ivec2(floor(coord - 0.5));
        vec4 sh = heightGather(normalSampler, texel, ivec2(baseCoord * normalTexSize), int(textureResolution) - 1, clampCoord);

        vec2 fpc = fract(coord);
        sh.y = sh.x + sh.z - sh.w - sh.y;
        vec3 normal = vec3(
            sh.y * fpc.yx + (sh.w - sh.zx),
            (8.0 / PARALLAX_DEPTH) / textureResolution
        );

        return normal;
    }

    vec4 bilinearNormalSample(sampler2D normalSampler, vec2 coord, vec2 baseCoord, vec2 tileCoordSize, vec2 atlasTiles, vec2 normalTexSize, vec2 textureTexel, bool clampCoord) {
        vec4[4] sh;
        vec2 coord00 = coord + vec2(-textureTexel.x, -textureTexel.y);
        vec2 coord11 = coord + vec2( textureTexel.x,  textureTexel.y);
        if (clampCoord) {
            coord00 = calculateOffsetCoord(coord00, baseCoord, tileCoordSize, atlasTiles);
            coord11 = calculateOffsetCoord(coord11, baseCoord, tileCoordSize, atlasTiles);
        }
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

vec4 anisotropicFilter(vec2 coord, vec2 albedoTexSize, vec2 atlasTexelSize, vec2 texGradX, vec2 texGradY, vec2 baseCoord, vec2 tileCoordSize, vec2 atlasTiles, bool clampCoord) {
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
        A = max(vec2(0.0), abs(A)) * atlasTexelSize;

        vec2 sampleCoord = coord + (0.5 - 0.5 * ANISOTROPIC_FILTERING_QUALITY) * A;
        vec4 albedo = vec4(0.0);
        float opaque = 0.0;
        for (int i = 0; i < ANISOTROPIC_FILTERING_QUALITY; i++) {
            sampleCoord += A;
            vec2 sampleCoordClamped = sampleCoord;
            if (clampCoord) {
                sampleCoordClamped = calculateOffsetCoord(sampleCoordClamped, baseCoord, tileCoordSize, atlasTiles);
            }
            vec4 albedoSample = textureLod(gtexture, sampleCoordClamped, l);
            albedo.rgb += albedoSample.rgb * albedoSample.a;
            albedo.a += albedoSample.a;
            opaque = max(opaque, albedoSample.a);
        }
        albedo.rgb *= clamp(1.0 / albedo.a, 0.0, 1.0);
        albedo.a /= ANISOTROPIC_FILTERING_QUALITY;
        albedo.a = clamp(albedo.a + float(opaque > 0.999), 0.0, 1.0) * clamp(texture(gtexture, coord).a * 10.0, 0.0, 1.0);
    #else
        vec2 noise = blueNoiseTemporal(gl_FragCoord.st * texelSize).xy - 0.5;
        vec2 sampleCoord = coord + noise.x * texGradX + noise.y * texGradY;
        if (clampCoord) {
            sampleCoord = calculateOffsetCoord(sampleCoord, baseCoord, tileCoordSize, atlasTiles);
        }
        vec4 albedo = textureLod(gtexture, sampleCoord, l);
    #endif

    return albedo;
}

#ifdef MC_NORMAL_MAP
    vec2 perPixelParallax(
        vec2 coord, vec3 viewVector, vec2 albedoTexSize, ivec2 baseTexelCoord, int tileResolution, bool clampCoord,
        inout vec3 parallaxTexNormal, inout float parallaxOffset
    ) {
        vec2 parallaxCoord = coord;
        parallaxOffset = 0.0;
        float sampleHeight = textureLod(normals, coord, 0.0).a;

        if (sampleHeight < 0.999) {
            vec2 atlasTexelSize = 1.0 / albedoTexSize;
            vec3 stepDir = viewVector;
            stepDir.xy *= PARALLAX_DEPTH * tileResolution * 0.2;
            stepDir = normalize(stepDir);
            stepDir.z = -stepDir.z;

            coord *= albedoTexSize;
            ivec2 sampleTexel = ivec2(floor(coord));
            ivec2 basicTexel = baseTexelCoord;
            vec2 stepLength = abs(1.0 / stepDir.xy);
            ivec2 dirSigned = (floatBitsToInt(stepDir.xy) >> 31) * 2 + 1;
            vec2 nextLength = (dirSigned * (0.5 - coord + sampleTexel) + 0.5) * stepLength;
            int tileBits = tileResolution - 1;
            sampleHeight = 1.0 - sampleHeight;

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
                if (clampCoord) {
                    sampleTexel = basicTexel + (sampleTexel & tileBits);
                }
                sampleHeight = texelFetch(normals, sampleTexel, 0).a;
                sampleHeight = 1.0 - sampleHeight;
                if (rayHeight > sampleHeight) {
                    parallaxOffset = rayHeight;
                    parallaxTexNormal = vec3(-nextPixel * dirSigned, 0.0);
                    break;
                }
            }
            parallaxCoord = (sampleTexel + vec2(0.5)) * atlasTexelSize;
        }
        return parallaxCoord;
    }

    vec2 calculateParallax(
        vec2 coord, vec3 viewVector, vec2 albedoTexSize, vec2 albedoTexelSize, ivec2 baseCoord, int textureResolution, bool clampCoord, inout float parallaxOffset
    ) {
        vec3 parallaxCoord = vec3(coord * albedoTexSize, 1.0);
        int tileBits = textureResolution - 1;

        #ifdef SMOOTH_PARALLAX
            float startHeight = bilinearHeightSample(normals, parallaxCoord.st - 0.5, baseCoord, tileBits, clampCoord);
        #else
            float startHeight = texelFetch(normals, ivec2(parallaxCoord.st), 0).a;
            startHeight += clamp(1.0 - startHeight * 1e+10, 0.0, 1.0);
        #endif

        if (startHeight < 1.0) {
            vec3 stepSize = viewVector / PARALLAX_QUALITY;
            stepSize.xy *= textureResolution * PARALLAX_DEPTH * 0.2;
            float stepScale = 2.0 / PARALLAX_QUALITY;

            #ifdef SMOOTH_PARALLAX
                parallaxCoord.st -= 0.5;
            #endif
            for (int i = 0; i < PARALLAX_QUALITY; i++) {
                parallaxCoord += stepSize * stepScale;
                #ifdef SMOOTH_PARALLAX
                    float sampleHeight = bilinearHeightSample(normals, parallaxCoord.st, baseCoord, tileBits, clampCoord);
                #else
                    float sampleHeight = texelFetch(normals, baseCoord + (ivec2(floor(parallaxCoord.st)) & tileBits), 0).a;
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
                    float sampleHeight = bilinearHeightSample(normals, parallaxCoord.st, baseCoord, tileBits, clampCoord);
                #else
                    float sampleHeight = texelFetch(normals, baseCoord + (ivec2(floor(parallaxCoord.st)) & tileBits), 0).a;
                    sampleHeight += clamp(1.0 - sampleHeight * 1e+10, 0.0, 1.0);
                #endif
                if (sampleHeight > parallaxCoord.z) {
                    parallaxCoord -= stepSize * stepScale;
                    stepSize *= 0.5;
                }
            }
            parallaxCoord += 2.0 * stepSize * stepScale;
            #ifdef SMOOTH_PARALLAX
                parallaxCoord.st += 0.5;
            #endif
            if (clampCoord) {
                parallaxCoord.st = vec2(baseCoord) + min(parallaxCoord.st - textureResolution * floor(parallaxCoord.st / textureResolution), textureResolution - 1e-3);
            }
        }
        parallaxOffset = 1.0 - parallaxCoord.z;
        return parallaxCoord.st * albedoTexelSize;
    }
#endif
