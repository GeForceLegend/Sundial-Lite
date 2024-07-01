#ifdef SHADOW_AND_SKY
    vec3 worldPosToShadowCoordNoBias(vec3 worldPos) {
        vec3 shadowCoord = mat3(shadowModelViewProjection) * worldPos + shadowModelViewProjection[3].xyz;
        shadowCoord.z = shadowCoord.z * 0.1 + 0.5;
        return shadowCoord.xyz;
    }

    vec3 biaShadowCoord(vec3 shadowCoord) {
        float shadowBias = 4.0 * (1.0 - SHADOW_BIAS) + length(shadowCoord.xy) * SHADOW_BIAS * 4.0;
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
                float waterDepth = max(0.0, (waterHeight - mcPos.y) * waterShadowHeightInv);

                float causticStrength = textureLod(shadowcolor0, waterShadowCoord.st, lod).r;
                causticStrength = mix(causticStrength * 4.0, 1.0, exp(-0.3 * waterDepth));
                caustic = causticStrength * waterFogAbsorption(waterDepth);
                caustic = mix(caustic, vec3(1.0), vec3(waterShadow));
            }
        #endif

        return caustic;
    }

    float basicSunlight = (1.0 - sqrt(weatherStrength)) * 8.0 * SUNLIGHT_BRIGHTNESS;
#endif
