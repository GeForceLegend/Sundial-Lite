#ifdef SHADOW_AND_SKY
    vec3 worldPosToShadowCoordNoBias(vec3 worldPos) {
        vec3 shadowCoord = mat3(shadowModelViewProjection) * worldPos + shadowModelViewProjection[3].xyz;
        shadowCoord.z = shadowCoord.z * 0.1 + 0.5;
        return shadowCoord.xyz;
    }

    vec3 distortShadowCoord(vec3 shadowCoord) {
        float shadowBias = 4.0 * (1.0 - SHADOW_DISTORTION_STRENGTH) + length(shadowCoord.xy) * SHADOW_DISTORTION_STRENGTH * 4.0;
        shadowCoord.xy = shadowCoord.xy / shadowBias + 0.75;
        return shadowCoord;
    }

    float waterShadowHeight(vec2 waterShadowCoord, float lod) {
        vec2 depthData = textureLod(shadowcolor1, waterShadowCoord, lod).zw;
        float waterHeight = (1.0 - depthData.y) * 510.0 - 128.0 + depthData.x * 2.0;
        return waterHeight;
    }

    vec3 waterCaustic(vec3 waterShadowCoord, vec3 worldPos, vec3 lightDir, float lod) {
        vec3 caustic = vec3(1.0);

        #ifdef WATER_CAUSTIC
            float waterShadow = textureLod(shadowtex0, waterShadowCoord, lod);
            if (waterShadow < 1.0) {
                float waterHeight = waterShadowHeight(waterShadowCoord.st, lod);

                float waterShadowHeightInv = inversesqrt(0.4375 + 0.5625 * lightDir.y * lightDir.y);
                vec3 mcPos = worldPos + cameraPosition;
                float waterDepth = (waterHeight - mcPos.y) * waterShadowHeightInv;

                float causticStrength = textureLod(shadowcolor0, waterShadowCoord.st, lod).r;
                causticStrength = mix(causticStrength * 4.0, 1.0, clamp(exp(-0.3 * waterDepth), 0.0, 1.0));
                caustic = causticStrength * clamp(waterFogAbsorption(waterDepth), 0.0, 1.0);
                caustic = mix(caustic, vec3(1.0), vec3(waterShadow));
            }
        #endif

        return caustic;
    }

    vec3 worldPosToShadowCoord(vec3 worldPos) {
        vec3 shadowCoord = mat3(shadowModelViewProjection) * worldPos + shadowModelViewProjection[3].xyz;
        float shadowBias = 1.0 - SHADOW_DISTORTION_STRENGTH + length(shadowCoord.xy) * SHADOW_DISTORTION_STRENGTH;
        shadowCoord.xy /= shadowBias;
        shadowCoord.z = shadowCoord.z * 0.1 + 0.5;
        shadowCoord.xy = shadowCoord.xy * 0.25 + 0.75;
        return shadowCoord.xyz;
    }

    float basicSunlight = (1.0 - sqrt(weatherStrength)) * 8.0 * SUNLIGHT_BRIGHTNESS;

    vec3 singleSampleShadow(
        vec3 worldPos, vec3 geoNormal, float NdotL, float lightFactor,
        float smoothness, float porosity, float skyLight, float detail
    ) {
        vec3 result = vec3(0.0);
        if (weatherStrength < 0.999) {
            vec3 sssShadowCoord = worldPosToShadowCoordNoBias(worldPos);
            float normalFactor = clamp(pow(NdotL, pow2(1.0 - min(0.3, smoothness))), 0.0, 1.0);
            worldPos += geoNormal * ((dot(worldPos, worldPos) * 4e-5 + 2e-2) * (1.0 + sqrt(1.0 - NdotL))) * 4096.0 / realShadowMapResolution;
            vec3 shadowCoord = worldPosToShadowCoord(worldPos);
            NdotL = abs(dot(geoNormal, shadowDirection));
            NdotL = NdotL + (1.0 - NdotL) * clamp(porosity * 255.0 / 191.0 - 64.0 / 191.0, 0.0, 1.0);
            if (any(greaterThan(abs(shadowCoord - vec3(vec2(0.75), 0.5)), vec3(vec2(0.25), 0.5)))) {
                result = vec3(basicSunlight * smoothstep(0.8, 0.9, skyLight) * (normalFactor + (1.0 - normalFactor) * NdotL * step(64.5 / 255.0, porosity)));
            } else {
                shadowCoord.z -= 4e-5;
                float sssOffsetZ = sssShadowCoord.z - shadowCoord.z;
                float rawShadow = textureLod(shadowtex0, shadowCoord, detail) * normalFactor;
                float subsurfaceScatteringWeight = (1.0 - rawShadow) * NdotL;
                vec3 shadow = vec3(rawShadow);

                if (porosity > 64.5 / 255.0) {
                    float shadowDepth = textureLod(shadowtex1, shadowCoord.st, 1.0).r;
                    float opticalDepth = clamp(shadowCoord.z - shadowDepth + sssOffsetZ, 0.0, 1.0);
                    const float absorptionScale = SUBSERFACE_SCATTERING_STRENTGH / (191.0);
                    float absorptionBeta = -4e+3 * 0.5 * 1.44269502 / max(porosity * absorptionScale * 255.0 - absorptionScale * 64.0, 1e-5) * opticalDepth;

                    float subsurfaceScattering = exp2(absorptionBeta);
                    shadow += subsurfaceScattering * subsurfaceScatteringWeight;
                }

                #ifdef TRANSPARENT_SHADOW
                    vec3 transparentShadowCoord = shadowCoord - vec3(0.5, 0.0, 0.0);
                    vec4 transparentShadowColor = textureLod(shadowcolor0, transparentShadowCoord.st, detail);
                    transparentShadowColor.rgb = pow(
                        transparentShadowColor.rgb * (1.0 - 0.5 * pow2(transparentShadowColor.w)),
                        vec3(sqrt(transparentShadowColor.w * 2.2 * 2.2 * 1.5))
                    );
                    float transparentShadowStrength = textureLod(shadowtex0, transparentShadowCoord, detail);
                    shadow *= mix(transparentShadowColor.rgb, vec3(1.0), vec3(transparentShadowStrength));
                #endif

                vec3 waterShadowCoord = shadowCoord - vec3(0.0, 0.5, 0.0);
                vec3 caustic = waterCaustic(waterShadowCoord, worldPos, shadowDirection, 1.0 + detail * 2.0);
                shadow *= caustic;

                shadow *= lightFactor * basicSunlight;

                result = shadow;
            }
        }
        return result;
    }
#endif
