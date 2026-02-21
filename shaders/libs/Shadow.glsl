const int shadowMapResolution = 2048; // [1024 2048 4096 8192 16384]
const float realShadowMapResolution = shadowMapResolution * MC_SHADOW_QUALITY;

#ifdef SHADOW_AND_SKY
    vec3 worldPosToShadowCoordNoDistort(vec3 worldPos) {
        vec3 shadowCoord = mat3(shadowModelViewProj0, shadowModelViewProj1, shadowModelViewProj2) * worldPos + shadowModelViewProj3;
        shadowCoord.z = shadowCoord.z * 0.1 + 0.5;
        return shadowCoord.xyz;
    }

    vec3 distortShadowCoord(vec3 shadowCoord) {
        float clipLengthInv = inversesqrt(dot(shadowCoord.xy, shadowCoord.xy));
        float shadowDistortion = log(distortionStrength / clipLengthInv + 1.0) / log(distortionStrength + 1.0) * 0.25;
        shadowCoord.xy *= clipLengthInv * shadowDistortion;
        shadowCoord.xy = shadowCoord.xy + 0.75;
        return shadowCoord;
    }

    vec3 worldPosToShadowCoord(vec3 worldPos) {
        vec3 shadowCoord = worldPosToShadowCoordNoDistort(worldPos);
        shadowCoord = distortShadowCoord(shadowCoord);
        return shadowCoord;
    }

    vec3 waterCaustic(vec3 waterShadowCoord, vec3 worldPos, vec3 lightDir) {
        vec3 caustic = vec3(1.0);

        #ifdef WATER_CAUSTIC
            float waterShadow = textureLod(shadowtex0, waterShadowCoord, 0.0);
            if (waterShadow < 1.0) {
                vec3 casuticData = textureLod(shadowcolor0, waterShadowCoord.st, 0.0).xyz;
                float waterHeight = (1.0 - casuticData.z) * 510.0 - 128.0 + casuticData.y * 2.0;

                float waterShadowHeightInv = inversesqrt(0.4375 + 0.5625 * lightDir.y * lightDir.y);
                vec3 mcPos = worldPos + cameraPosition;
                float waterDepth = (waterHeight - mcPos.y) * waterShadowHeightInv;

                float causticStrength = casuticData.r;
                causticStrength = mix(causticStrength * 4.0, 1.0, clamp(exp(-0.3 * waterDepth), 0.0, 1.0));
                caustic = causticStrength * clamp(waterFogAbsorption(waterDepth), 0.0, 1.0);
                caustic = mix(caustic, vec3(1.0), vec3(waterShadow));
            }
        #endif

        return caustic;
    }

    float basicSunlight = (1.0 - sqrt(weatherStrength)) * 9.5 * SUNLIGHT_BRIGHTNESS;

    void singleSampleShadow(
        vec3 worldPos, vec3 geoNormal, float NdotL, float lightFactor, float smoothness,
        float porosity, float skyLight, inout vec3 shadow, inout vec3 subsurfaceScattering
    ) {
        if (weatherStrength < 0.999) {
            vec3 sssShadowCoord = worldPosToShadowCoordNoDistort(worldPos);
            float normalFactor = clamp(pow(NdotL, pow2(1.0 - min(0.3, smoothness))), 0.0, 1.0);
            worldPos += geoNormal * ((length(worldPos) * 2e-3 + 2e-2) * (1.0 + sqrt(1.0 - NdotL))) * 4096.0 / realShadowMapResolution;
            vec3 shadowCoord = worldPosToShadowCoord(worldPos);
            NdotL = abs(dot(geoNormal, shadowDirection));
            NdotL = NdotL + (1.0 - NdotL) * clamp(porosity * 255.0 / 191.0 - 64.0 / 191.0, 0.0, 1.0);
            shadow *= basicSunlight;
            subsurfaceScattering *= basicSunlight;
            if (any(greaterThan(abs(shadowCoord - vec3(vec2(0.75), 0.5)), vec3(vec2(0.25), 0.5)))) {
                skyLight = smoothstep(0.8, 0.9, skyLight);
                shadow *= smoothstep(0.8, 0.9, skyLight) * normalFactor;
                subsurfaceScattering *= smoothstep(0.8, 0.9, skyLight) * (1.0 - normalFactor) * NdotL * step(64.5 / 255.0, porosity);
            } else {
                shadowCoord.z -= 4e-5;
                float sssOffsetZ = sssShadowCoord.z - shadowCoord.z;
                float rawShadow = textureLod(shadowtex0, shadowCoord, 0.0) * normalFactor;
                float subsurfaceScatteringWeight = (1.0 - rawShadow) * NdotL;
                shadow *= vec3(rawShadow);

                if (porosity > 64.5 / 255.0) {
                    float shadowDepth = textureLod(shadowtex1, shadowCoord.st, 0.0).r;
                    float opticalDepth = clamp(shadowCoord.z - shadowDepth + sssOffsetZ, 0.0, 1.0);
                    const float absorptionScale = SUBSERFACE_SCATTERING_STRENTGH / (191.0);
                    float absorptionBeta = -4e+3 * 0.5 * 1.44269502 / max(porosity * absorptionScale * 255.0 - absorptionScale * 64.0, 1e-5) * opticalDepth;

                    subsurfaceScattering *= exp2(absorptionBeta) * subsurfaceScatteringWeight;
                }

                #ifdef TRANSPARENT_SHADOW
                    vec3 transparentShadowCoord = shadowCoord - vec3(0.5, 0.0, 0.0);
                    vec4 transparentShadowColor = textureLod(shadowcolor0, transparentShadowCoord.st, 0.0);
                    transparentShadowColor.rgb = pow(
                        transparentShadowColor.rgb * (1.0 - 0.5 * pow2(transparentShadowColor.w)),
                        vec3(sqrt(transparentShadowColor.w * 2.2 * 2.2 * 1.5))
                    );
                    float transparentShadowStrength = textureLod(shadowtex0, transparentShadowCoord, 0.0);
                    transparentShadowColor.rgb = mix(transparentShadowColor.rgb, vec3(1.0), vec3(transparentShadowStrength));
                    shadow *= transparentShadowColor.rgb;
                    subsurfaceScattering *= transparentShadowColor.rgb;
                #endif

                vec3 waterShadowCoord = shadowCoord - vec3(0.0, 0.5, 0.0);
                vec3 caustic = waterCaustic(waterShadowCoord, worldPos, shadowDirection);
                shadow *= caustic;
                subsurfaceScattering *= caustic;

                shadow *= lightFactor;
            }
        }
    }
#endif
