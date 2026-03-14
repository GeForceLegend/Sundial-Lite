const vec3 rayleighBeta = vec3(5.2e-6, 12.1e-6, 29.6e-6);
const float mieBeta = 2.1e-5;
const float rayLeighScaledHeight = 8500.0;
const float mieScaledHeight = 1200.0;
const vec2 scaledHeight = vec2(rayLeighScaledHeight, mieScaledHeight);
const float mieG = 0.76;
const float mieG2 = mieG * mieG;

const float earthRadius = 6371000.0;
const float atmosphereThickness = 100000.0;
const float atmosphereHeight = earthRadius + 100000.0;
const float sunRadius = 0.02;
const vec2 earthScaledHeight = 1.44269502 * earthRadius / scaledHeight;

vec4 planetIntersectionData(vec3 worldPos, vec3 worldDir) {
    worldPos.y += max(300.0 + earthRadius, cameraPosition.y + WORLD_BASIC_HEIGHT + earthRadius);
    float R2 = dot(worldPos, worldPos);
    float RdotP = dot(worldPos, worldDir);
    float RdotP2 = RdotP * RdotP - R2;
    float d = sqrt(RdotP2 + earthRadius * earthRadius);
    float rayHeight = sqrt(R2 + RdotP * abs(RdotP));
    float intersection = max(-1.0, -RdotP - d);
    float skyWeight = clamp(rayHeight / 300.0 - earthRadius / 300.0, 0.0, 1.0);
    return vec4(RdotP, RdotP2, intersection, skyWeight * skyWeight);
}

float rayleighPhase(float cosAngle) {
    const float rayleighFactor = (1.0 / (4.0 * PI)) * (8.0 / 10.0);
    return 7.0 / 5.0 * rayleighFactor + (0.5 * rayleighFactor * cosAngle);
}

float miePhase(float cosAngle, float g, float g2) {
    float x = inversesqrt(1.0 + g2 - 2.0 * g * cosAngle);
    return (3.0 / (8.0 * PI)) * ((1.0 - g2) * (1.0 + cosAngle * cosAngle)) / (2.0 + g2) * x * x * x;
}

vec3 atmosphereAbsorptionLUT(float height, float angle) {
    float lutHeight = sqrt(clamp((height - earthRadius) / atmosphereThickness, 0.0, 1.0)) * 255.0 + 0.5;
    float lutAngle = 128.0 + angle * 255.0 / 2.0;
    return texture(colortex7, vec2(lutHeight, lutAngle)).rgb;
}

void atmosphereAbsorptionDoubleSideLUT(float height, float angle, out vec3 sunAbsorption, out vec3 moonAbsorption) {
    float lutHeight = sqrt(clamp((height - earthRadius) / atmosphereThickness, 0.0, 1.0)) * 255.0 + 0.5;
    float sunLutAngle = 128.0 + angle * 255.0 / 2.0;
    float moonLutAngle = 128.0 - angle * 255.0 / 2.0;
    sunAbsorption = texture(colortex7, vec2(lutHeight, sunLutAngle)).rgb;
    moonAbsorption = texture(colortex7, vec2(lutHeight, moonLutAngle)).rgb;
}

vec3 singleAtmosphereScattering(
    vec3 skyLightColor, vec3 worldPos, vec3 worldDir, vec3 sunDir, vec4 intersectionData, vec3 skyColorUp, float sunLightStrength, out vec3 atmosphere
) {
    atmosphere = vec3(0.0);
    vec3 result = skyLightColor;

    if (intersectionData.y > -atmosphereHeight * atmosphereHeight) {
        vec3 originPos = worldPos;
        originPos.y += max(cameraPosition.y + WORLD_BASIC_HEIGHT + earthRadius, 300.0 + earthRadius);

        float b = intersectionData.x;
        float deltaAtmos = intersectionData.y + atmosphereHeight * atmosphereHeight;
        float d = deltaAtmos * inversesqrt(deltaAtmos);
        float atmosphereLength = -b + d;
        if (atmosphereLength > 0.0) {
            float groundLength = intersectionData.z;
            float hitSky = clamp(-1e+10 * groundLength, 0.0, 1.0);
            float originHeight2 = dot(originPos, originPos);
            groundLength = max(groundLength, uintBitsToFloat(floatBitsToUint(-sqrt(originHeight2 - earthRadius * earthRadius)) ^ (floatBitsToUint(groundLength) & 0x80000000u)));
            atmosphereLength = mix(groundLength, atmosphereLength, intersectionData.w);
            b += d;
            b = min(0.0, b);
            originPos -= worldDir * b;
            atmosphereLength += b;
            vec3 samplePosition = originPos;
            result *= intersectionData.w;

            originHeight2 = dot(samplePosition, samplePosition);
            float originHeightInv = inversesqrt(originHeight2);
            float originHeight = originHeight2 * originHeightInv;
            vec2 prevRelativeDensity = exp2(earthScaledHeight - originHeight / scaledHeight * 1.44269502);

            vec3 atmosphereAbsorption = atmosphereAbsorptionLUT(originHeight, dot(worldDir, samplePosition) * originHeightInv);
            result *= atmosphereAbsorption;

            float originRdotP = dot(sunDir, samplePosition) * originHeightInv;
            vec3 originSunInScattering, originMoonInScattering;
            atmosphereAbsorptionDoubleSideLUT(originHeight, originRdotP, originSunInScattering, originMoonInScattering);

            float sunCosAngle = dot(worldDir, sunDir);
            float sunRayleigh = rayleighPhase(sunCosAngle);
            float sunMie = miePhase(sunCosAngle, mieG, mieG2);
            float moonRayleigh = rayleighPhase(-sunCosAngle) * nightBrightness;
            float moonMie = miePhase(-sunCosAngle, mieG, mieG2) * nightBrightness;

            vec3 prevRayleighInScattering = originSunInScattering * prevRelativeDensity.x * sunRayleigh + originMoonInScattering * prevRelativeDensity.x * moonRayleigh;
            vec3 prevMieInScattering = originSunInScattering * prevRelativeDensity.y * sunMie + originMoonInScattering * prevRelativeDensity.y * moonMie;

            vec2 opticalDepth = vec2(0.0);
            vec3 totalRayleighInScattering = vec3(0.0);
            vec3 totalMieInScattering = vec3(0.0);

            const float viewSampleStepScale = 4.0;
            float stepUnit = atmosphereLength / ((ATMOSPHERE_VIEW_SAMPLE * 0.5 - 0.5 + viewSampleStepScale) * ATMOSPHERE_VIEW_SAMPLE);
            float stepLength = stepUnit * (viewSampleStepScale - 1.0);

            for (int i = 0; i < ATMOSPHERE_VIEW_SAMPLE; i++) {
                stepLength += stepUnit;
                samplePosition += worldDir * stepLength;
                float sampleHeight2 = dot(samplePosition, samplePosition);

                float sampleHeightInv = inversesqrt(sampleHeight2);
                float sampleRdotP = dot(sunDir, samplePosition) * sampleHeightInv;
                float sampleHeight = sampleHeight2 * sampleHeightInv;

                vec3 currSunInScattering;
                vec3 currMoonInScattering;
                atmosphereAbsorptionDoubleSideLUT(sampleHeight, sampleRdotP, currSunInScattering, currMoonInScattering);

                vec2 currRelativeDensity = exp2(earthScaledHeight - sampleHeight / scaledHeight * 1.44269502);

                opticalDepth += (0.5 * 1.44269502 * stepLength) * (prevRelativeDensity + currRelativeDensity);
                vec3 viewAbsorption = exp2(-opticalDepth.x * rayleighBeta - opticalDepth.y * rainyMieBeta);
                currSunInScattering *= viewAbsorption;
                currMoonInScattering *= viewAbsorption;
                prevRelativeDensity = currRelativeDensity;

                vec3 currRayleighInScattering = prevRelativeDensity.x * (currSunInScattering * sunRayleigh + currMoonInScattering * moonRayleigh);
                totalRayleighInScattering += stepLength * (prevRayleighInScattering + currRayleighInScattering);
                prevRayleighInScattering = currRayleighInScattering;
                vec3 currMieInScattering = prevRelativeDensity.y * (currSunInScattering * sunMie + currMoonInScattering * moonMie);
                totalMieInScattering += stepLength * (prevMieInScattering + currMieInScattering);
                prevMieInScattering = currMieInScattering;
            }

            vec3 totalInScattering = totalRayleighInScattering * rayleighBeta + totalMieInScattering * rainyMieBeta;
            totalInScattering *= 0.5;
            totalInScattering += (prevRayleighInScattering + prevMieInScattering) * 0.15 * abs(dot(sunDir, normalize(samplePosition)));

            atmosphere = totalInScattering * sunLightStrength * SUNLIGHT_BRIGHTNESS + skyColorUp * exp2(-opticalDepth.x * rayleighBeta - opticalDepth.y * rainyMieBeta) * 0.2;

            result += atmosphere;
        }
    }
    return result;
}

vec3 atmosphereScatteringUp(float lightHeight, float sunLightStrength) {
    float playerHeight = max(cameraPosition.y + WORLD_BASIC_HEIGHT + earthRadius, 300.0 + earthRadius);

    float atmosphereLength = atmosphereHeight - playerHeight;
    vec3 result = vec3(0.0);
    if (atmosphereLength > 0.0) {
        vec2 originRelativeDensity = exp2(earthScaledHeight - playerHeight / scaledHeight * 1.44269502);
        vec3 originSunInScattering, originMoonInScattering;
        atmosphereAbsorptionDoubleSideLUT(playerHeight, lightHeight, originSunInScattering, originMoonInScattering);

        vec3 prevSunRayleighInScattering = originSunInScattering * originRelativeDensity.x;
        vec3 prevSunMieInScattering = originSunInScattering * originRelativeDensity.y;
        vec3 prevMoonRayleighInScattering = originMoonInScattering * originRelativeDensity.x;
        vec3 prevMoonMieInScattering = originMoonInScattering * originRelativeDensity.y;
        originRelativeDensity *= 1.44269502 * scaledHeight;

        vec3 totalSunRayleighInScattering = vec3(0.0);
        vec3 totalSunMieInScattering = vec3(0.0);
        vec3 totalMoonRayleighInScattering = vec3(0.0);
        vec3 totalMoonMieInScattering = vec3(0.0);

        const float viewSampleStepScale = 4.0;
        float stepUnit = atmosphereLength / ((ATMOSPHERE_VIEW_SAMPLE * 0.5 - 0.5 + viewSampleStepScale) * ATMOSPHERE_VIEW_SAMPLE);
        float sampleHeight = playerHeight;
        float stepLength = stepUnit * (viewSampleStepScale - 1.0);

        for (int i = 0; i < ATMOSPHERE_VIEW_SAMPLE; i++) {
            stepLength += stepUnit;
            sampleHeight += stepLength;

            vec3 currSunInScattering;
            vec3 currMoonInScattering;
            atmosphereAbsorptionDoubleSideLUT(sampleHeight, lightHeight, currSunInScattering, currMoonInScattering);

            vec2 sampleRelativeDensity = exp2(earthScaledHeight - sampleHeight / scaledHeight * 1.44269502);

            vec2 viewOpticalDepth = originRelativeDensity - 1.44269502 * scaledHeight * sampleRelativeDensity;
            vec3 viewAbsorption = exp2(-viewOpticalDepth.x * rayleighBeta - viewOpticalDepth.y * rainyMieBeta);
            currSunInScattering *= viewAbsorption;
            currMoonInScattering *= viewAbsorption;

            vec3 currSunRayleighInScattering = currSunInScattering * sampleRelativeDensity.x;
            totalSunRayleighInScattering += stepLength * (prevSunRayleighInScattering + currSunRayleighInScattering);
            prevSunRayleighInScattering = currSunRayleighInScattering;
            vec3 currSunMieInScattering = currSunInScattering * sampleRelativeDensity.y;
            totalSunMieInScattering += stepLength * (prevSunMieInScattering + currSunMieInScattering);
            prevSunMieInScattering = currSunMieInScattering;

            vec3 currMoonRayleighInScattering = currMoonInScattering * sampleRelativeDensity.x;
            totalMoonRayleighInScattering += stepLength * (prevMoonRayleighInScattering + currMoonRayleighInScattering);
            prevMoonRayleighInScattering = currMoonRayleighInScattering;
            vec3 currMoonMieInScattering = currMoonInScattering * sampleRelativeDensity.y;
            totalMoonMieInScattering += stepLength * (prevMoonMieInScattering + currMoonMieInScattering);
            prevMoonMieInScattering = currMoonMieInScattering;
        }

        totalSunRayleighInScattering *= rayleighPhase(lightHeight);
        totalSunMieInScattering *= miePhase(lightHeight, mieG, mieG2);
        float nightBrightness = mix(NIGHT_BRIGHTNESS, NIGHT_VISION_BRIGHTNESS, nightVision);
        totalMoonRayleighInScattering *= rayleighPhase(-lightHeight) * nightBrightness;
        totalMoonMieInScattering *= miePhase(-lightHeight, mieG, mieG2) * nightBrightness;

        vec3 totalRayleighInScattering = totalSunRayleighInScattering + totalMoonRayleighInScattering;
        vec3 totalMieInScattering = totalSunMieInScattering + totalMoonMieInScattering;

        vec3 totalInScattering = totalRayleighInScattering * rayleighBeta + totalMieInScattering * rainyMieBeta;
        totalInScattering *= 0.5;

        result = totalInScattering * sunLightStrength * SUNLIGHT_BRIGHTNESS;
    }
    return result;
}

vec3 solidAtmosphereScattering(vec3 color, vec3 worldDir, vec3 skyColor, float worldDepth, float skyLight) {
    float playerHeight = max(cameraPosition.y + WORLD_BASIC_HEIGHT + earthRadius, 300.0 + earthRadius);
    vec3 sunLightColor;
    vec3 moonLightColor;
    atmosphereAbsorptionDoubleSideLUT(playerHeight, sunDirection.y, sunLightColor, moonLightColor);
    float LdotV = dot(worldDir, sunDirection);
    float depthFactor = 1.0 - exp2(-worldDepth * 0.001);
    float g = mieG * depthFactor;
    float g2 = g * g;
    sunLightColor *= rayleighPhase(LdotV) + miePhase(LdotV, g, g2);
    moonLightColor *= (rayleighPhase(-LdotV) + miePhase(-LdotV, g, g2)) * mix(NIGHT_BRIGHTNESS, NIGHT_VISION_BRIGHTNESS, nightVision);
    vec3 scatteringColor = mix((sunLightColor + moonLightColor) * 30.0, skyColor * 0.25, sqrt(weatherStrength) * 0.99) * skyLight * skyLight;

    vec2 originRelativeHeight = earthScaledHeight - playerHeight / scaledHeight * 1.44269502;
    vec2 originDensity = exp2(originRelativeHeight);
    vec2 opticalDepth = originDensity * worldDepth * 5.0 * (1.0 + RF_DENSITY * 5.0 * weatherStrength * weatherStrength);
    vec3 absorption = exp2(-opticalDepth.x * rayleighBeta - opticalDepth.y * rainyMieBeta);
    return mix(scatteringColor, color, absorption);
}

float blindnessFactor = max(darknessFactor * 0.5, blindness);
vec3 waterAbsorptionBeta = vec3(WATER_ABSORPTION_R, WATER_ABSORPTION_G, WATER_ABSORPTION_B) + blindnessFactor;
float lavaAbsorptionBeta = 1.0 * LAVA_FOG_DENSITY + blindnessFactor;
float snowAbsorptionBeta = 2.0 * SNOW_FOG_DENSITY + blindnessFactor;
float netherAbsorptionBeta = 0.01 * NETHER_FOG_DENSITY + blindnessFactor;
float endAbsorptionBeta = 0.01 * END_FOG_DENSITY + blindnessFactor;

float airAbsorption(float depth) {
    return exp(-blindnessFactor * depth);
}

vec3 waterFogAbsorption(float waterDepth) {
    return exp(-waterDepth * waterAbsorptionBeta);
}

vec3 waterFogScattering(vec3 worldDir, vec3 skyColor, float waterDepth, float skyLight) {
    float miePhase = miePhase(worldDir.y, 0.4, 0.16);
    vec3 scattering = skyLight * miePhase * skyColor * (1.0 - exp(-waterDepth * waterAbsorptionBeta)) * exp(-16.0 * (1.0 - skyLight * 0.8) * waterAbsorptionBeta);
    return scattering;
}

vec3 waterFogTotal(vec3 targetColor, vec3 worldDir, vec3 skyColor, float waterDepth, float skyLight) {
    targetColor *= waterFogAbsorption(waterDepth);
    targetColor += waterFogScattering(worldDir, skyColor, waterDepth, skyLight);
    return targetColor;
}

float lavaFogAbsorption(float lavaDepth) {
    return exp(-lavaDepth * lavaAbsorptionBeta);
}

vec3 lavaFogScattering(float lavaDepth) {
    return vec3(1.0, 0.05, 0.0) * LAVA_FOG_BRIGHTNESS * 10.0 * (1.0 - exp(-lavaDepth * lavaAbsorptionBeta));
}

vec3 lavaFogTotal(vec3 targetColor, float lavaDepth) {
    targetColor *= lavaFogAbsorption(lavaDepth);
    targetColor += lavaFogScattering(lavaDepth);
    return targetColor;
}

float snowFogAbsorption(float snowDepth) {
    return exp(-snowDepth * snowAbsorptionBeta);
}

vec3 snowFogScattering(vec3 skyColor, float snowDepth, float skyLight) {
    vec3 scattering = (skyLight * skyLight * skyLight) * skyColor * (1.0 - exp(-snowDepth * snowAbsorptionBeta));
    return scattering;
}

vec3 snowFogTotal(vec3 targetColor, vec3 skyColor, float snowDepth, float skyLight) {
    targetColor *= snowFogAbsorption(snowDepth);
    targetColor += snowFogScattering(skyColor, snowDepth, skyLight);
    return targetColor;
}

float netherFogAbsorption(float netherDepth) {
    return exp(-netherDepth * netherAbsorptionBeta);
}

vec3 netherFogScattering(float netherDepth) {
    return NETHER_FOG_BRIGHTNESS * 0.2 * (1.0 - exp(-netherDepth * netherAbsorptionBeta)) * pow(normalize(max(fogColor, vec3(1e-5))), vec3(2.2));
}

vec3 netherFogTotal(vec3 targetColor, float netherDepth) {
    targetColor *= netherFogAbsorption(netherDepth);
    targetColor += netherFogScattering(netherDepth);
    return targetColor;
}

float endFogAbsorption(float endDepth) {
    return exp(-endDepth * endAbsorptionBeta);
}

vec3 endFogScattering(float endDepth) {
    return END_FOG_BRIGHTNESS * 0.1 * (1.0 - exp(-endDepth * endAbsorptionBeta)) * vec3(0.5, 0.2, 0.8);
}

vec3 endFogTotal(vec3 targetColor, float endDepth) {
    targetColor *= endFogAbsorption(endDepth);
    targetColor += endFogScattering(endDepth);
    return targetColor;
}
