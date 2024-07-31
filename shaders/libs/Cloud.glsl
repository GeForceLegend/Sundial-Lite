const float cloudNoiseScale = 0.005 / CLOUD_SCALE;
const float cloudThicknessScale = CLOUD_BLOCKY_THICKNESS * cloudNoiseScale;
const float CLOUD_BLOCKY_TOP_HEIGHT = CLOUD_BLOCKY_HEIGHT + CLOUD_BLOCKY_THICKNESS;

const float CLOUD_REALISTIC_CENTER_THICKNESS = CLOUD_REALISTIC_THICKNESS * CLOUD_REALISTIC_CENTER;
const float CLOUD_REALISTIC_SHADOW_LIGHT_STEP_SIZE = CLOUD_REALISTIC_THICKNESS * CLOUD_REALISTIC_SHADOWLIGHT_STEPSCALE;
const float CLOUD_REALISTIC_SHADOW_LIGHT_SAMPLE_LENGTH = CLOUD_REALISTIC_SHADOWLIGHT_SAMPLES * CLOUD_REALISTIC_SHADOW_LIGHT_STEP_SIZE + 0.5 * CLOUD_REALISTIC_SHADOW_LIGHT_STEP_SIZE;
const float CLOUD_REALISTIC_SKY_LIGHT_STEP_SIZE = CLOUD_REALISTIC_THICKNESS * CLOUD_REALISTIC_SKYLIGHT_STEPSCALE;
const float CLOUD_REALISTIC_SAMPLE_DENSITY = 0.001 * CLOUD_REALISTIC_DENSITY;
const float CLOUD_REALISTIC_SKY_DENSITY = CLOUD_REALISTIC_SKY_LIGHT_STEP_SIZE * CLOUD_REALISTIC_SAMPLE_DENSITY;

const float cloudBottomHeight = earthRadius + CLOUD_REALISTIC_HEIGHT + 500.0;
const float cloudTopHeight = earthRadius + CLOUD_REALISTIC_HEIGHT + CLOUD_REALISTIC_THICKNESS + 500.0;
const float cloudCenterHeight = earthRadius + CLOUD_REALISTIC_HEIGHT + CLOUD_REALISTIC_CENTER_THICKNESS + 500.0;

float blockyCloudDensity(ivec2 cloudTexel) {
    return step(1.0 - CLOUD_BLOCKY_AMOUNT, texelFetch(noisetex, cloudTexel, 0).z);
}

vec4 blockyCloud(vec3 baseColor, vec3 atmosphere, vec3 worldPos, vec3 worldDir, vec3 shadowDir, vec3 skyColorUp, float backDepth, out float cloudDepth) {
    cloudDepth = -1.0;

    float worldHeight = worldPos.y + cameraPosition.y;
    float topIntersection = (CLOUD_BLOCKY_TOP_HEIGHT - worldHeight) / worldDir.y;
    float bottomIntersection = (CLOUD_BLOCKY_HEIGHT - worldHeight) / worldDir.y;

    float intersection = topIntersection * bottomIntersection > 0.0 ? min(topIntersection, bottomIntersection) : 0.0;
    vec4 result = vec4(baseColor, 0.0);
    backDepth -= intersection * step(1e-5, backDepth);
    if (intersection > 0.0 && 0.0 <= backDepth) {
        vec2 wind = frameTimeCounter * CLOUD_SPEED * vec2(4.0, 2.0);
        vec2 cloudOffset = worldPos.xz + intersection * worldDir.xz;
        vec3 cloudPos = vec3(
            (cameraPosition.x + cloudOffset.x + wind.x) * cloudNoiseScale,
            clamp(worldHeight / CLOUD_BLOCKY_THICKNESS - CLOUD_BLOCKY_HEIGHT / CLOUD_BLOCKY_THICKNESS, 0.0, 0.9999),
            (cameraPosition.z + cloudOffset.y + wind.y) * cloudNoiseScale
        );

        vec3 stepDir = worldDir;
        stepDir.y /= cloudThicknessScale;
        vec3 stepLength = 1.0 / (abs(stepDir) + 1e-5);
        ivec3 dirSigned = (floatBitsToInt(stepDir) >> 31) * 2 + 1;
        vec3 nextLength = (dirSigned * (0.5 - fract(cloudPos)) + 0.5) * stepLength;
        ivec3 nextVoxel = ivec3(0);

        ivec2 cloudTexel = ivec2(floor(cloudPos.xz)) & 63;
        vec3 cloudNormal = vec3(0.0, -dirSigned.y, 0.0);
        float cloudOpticalDepth = 0.0;
        float totalRayLength = 0.0;
        float hitLength = 0.0;
        ivec2 sampleCloudTexel = cloudTexel;
        for (int i = 0; i < CLOUD_BLOCKY_MAX_SAMPLES; i++) {
            float rayLength = min(nextLength.x, min(nextLength.y, nextLength.z));
            float sampleCloudDensity = blockyCloudDensity(sampleCloudTexel);
            if (sampleCloudDensity > 0.5 && cloudOpticalDepth == 0.0) {
                cloudPos += stepDir * totalRayLength;
                cloudNormal = nextVoxel * -dirSigned;
                cloudTexel = sampleCloudTexel;
                hitLength = totalRayLength / cloudNoiseScale;
            }
            cloudOpticalDepth += rayLength * step(0.5, sampleCloudDensity);
            nextVoxel = (floatBitsToInt(vec3(rayLength) - nextLength) >> 31) + 1;
            if (nextVoxel.y > 0.5) {
                break;
            }
            totalRayLength += rayLength;
            nextLength += nextVoxel * stepLength - rayLength;
            sampleCloudTexel = (sampleCloudTexel + nextVoxel.xz * dirSigned.xz) & 63;
        }

        if (backDepth > 1e-5) {
            float maximumOpticalDepth = backDepth * cloudNoiseScale;
            cloudOpticalDepth = min(maximumOpticalDepth, cloudOpticalDepth);
        }

        if (cloudOpticalDepth > 1e-5) {
            cloudDepth = intersection + hitLength;
            cloudPos -= cloudNormal * 1e-4;

            stepDir = shadowDir;
            stepDir.y /= cloudThicknessScale;
            stepLength = 1.0 / (abs(stepDir) + 1e-5);
            dirSigned = (floatBitsToInt(stepDir) >> 31) * 2 + 1;
            nextLength = (dirSigned * (0.5 - fract(cloudPos)) + 0.5) * stepLength;
            nextVoxel = ivec3(0);

            float shadowOpticalDepth = 0.0;
            for (int i = 0; i < CLOUD_BLOCKY_LIGHT_SAMPLES; i++) {
                float rayLength = min(nextLength.x, min(nextLength.y, nextLength.z));
                float sampleCloudDensity = blockyCloudDensity(cloudTexel);
                shadowOpticalDepth += rayLength * step(0.5, sampleCloudDensity);
                nextVoxel = (floatBitsToInt(vec3(rayLength) - nextLength) >> 31) + 1;
                if (nextVoxel.y > 0.5) {
                    break;
                }
                nextLength += nextVoxel * stepLength - rayLength;
                cloudTexel = (cloudTexel + nextVoxel.xz * dirSigned.xz) & 63;
            }

            vec3 cloudColor = sunColor * 8.0 * (1.1 - sqrt(weatherStrength)) * exp(-sqrt(shadowOpticalDepth) * 3.0);
            cloudColor += mix(skyColorUp, atmosphere, vec3(pow2(clamp(worldDir.y, 0.0, 1.0)))) * exp(-0.5 * (1.0 - cloudPos.y) * (1.0 - cloudNormal.y));

            float cloudDistance = length(cloudOffset);
            float cloudFade = mix(0.0, 1.0 - exp(-cloudOpticalDepth * cloudOpticalDepth * 500.0), exp(-0.001 * CLOUD_BLOCKY_FADE_SPEED * max(cloudDistance - CLOUD_BLOCKY_FADE_DISTANCE, 0.0) - max(0.0, cameraPosition.y - 1000.0) / 1200.0));
            float cloudAbsorptionFade = exp(-0.001 * CLOUD_BLOCKY_FADE_SPEED * max(cloudDistance - CLOUD_BLOCKY_FADE_DISTANCE * 2.0, 0.0));

            cloudColor = mix(atmosphere, cloudColor, cloudFade);
            cloudColor = mix(baseColor, cloudColor, cloudAbsorptionFade);
            result = vec4(cloudColor, cloudFade);
        }
    }
    return result;
}

vec2 raySphereIntersection(float RdotP, float RdotP2, float R2) {
    float d = sqrt(RdotP2 - R2);
    vec2 result = max(vec2(-1.0), vec2(-RdotP - d, -RdotP + d));
    return result;
}

float baseCloudNoise(vec2 coord) {
    coord = coord * 64.0;

    vec2 whole = floor(coord);
    vec2 part = coord - whole;

    part = part * part * (3.0 / 64.0 - 2.0 / 64.0 * part) + 1.0 / 128.0;

    coord = whole / 64.0 + part;

    return textureLod(noisetex, coord, 0.0).w;
}

float realisticCloudDensity(vec3 cloudPos, vec3 wind, float cloudDistance, int octaves, float weights) {
    #ifdef LQ_REALISTIC_CLOUD
        octaves = (octaves + 1) / 2;
    #endif

    cloudPos += frameTimeCounter * CLOUD_SPEED * vec3(10.0, 0.0, 5.0);
    float density = baseCloudNoise(cloudPos.xz * 0.00001 * CLOUD_SCALE);
    float weight = 1.0;
    for (int i = 0; i < octaves; i++) {
        cloudPos = cloudPos * CLOUD_REALISTIC_OCTAVE_SCALE + wind;
        weight *= CLOUD_REALISTIC_OCTAVE_FADE;
        density += smooth3DNoise(cloudPos * 0.000015 * CLOUD_SCALE) * weight;
    }

    float heightClamp = pow2(
        clamp(1.0 + (earthRadius + CLOUD_REALISTIC_HEIGHT + 500.0) / CLOUD_REALISTIC_CENTER_THICKNESS - cloudDistance / CLOUD_REALISTIC_CENTER_THICKNESS, 0.0, 1.0) +
        clamp(
            cloudDistance / (CLOUD_REALISTIC_THICKNESS - CLOUD_REALISTIC_CENTER_THICKNESS) -
            (CLOUD_REALISTIC_CENTER_THICKNESS + earthRadius + CLOUD_REALISTIC_HEIGHT + 500.0) / (CLOUD_REALISTIC_THICKNESS - CLOUD_REALISTIC_CENTER_THICKNESS)
        , 0.0, 1.0)
    );

    density = clamp(density / weights + (CLOUD_REALISTIC_AMOUNT - 1.0 - CLOUD_REALISTIC_AMOUNT * heightClamp) * (1.0 - weatherStrength * CLOUD_REALISTIC_RAIN_INCREAMENT) * CLOUD_REALISTIC_HARDNESS * 10.0, 0.0, 1.0);

    return density;
}

float atmosphereAbsorption(float RdotP, float cloudDistance) {
    float rayHeight = cloudDistance * sqrt(max(0.0, 1.0 + RdotP)) - earthRadius - 500.0;
    float absorption = pow2(clamp(rayHeight / (CLOUD_REALISTIC_HEIGHT * 4.0), 0.0, 1.0));

    return absorption;
}

#ifdef LQ_REALISTIC_CLOUD
    const float cloudDensityWeights = (1.0 - pow(CLOUD_REALISTIC_OCTAVE_FADE, (CLOUD_REALISTIC_OCTAVES + 1) / 2 + 1.0)) / ((1.0 - CLOUD_REALISTIC_OCTAVE_FADE) * CLOUD_REALISTIC_HARDNESS * 10.0);
    const float cloudSkyDensityWeights = (1.0 - pow(CLOUD_REALISTIC_OCTAVE_FADE, (CLOUD_REALISTIC_SKYLIGHT_OCTAVES + 1) / 2 + 1.0)) / ((1.0 - CLOUD_REALISTIC_OCTAVE_FADE) * CLOUD_REALISTIC_HARDNESS * 10.0);
    const float cloudShadowDensityWeights = (1.0 - pow(CLOUD_REALISTIC_OCTAVE_FADE, (CLOUD_REALISTIC_SKYLIGHT_OCTAVES + 1) / 2 + 1.0)) / ((1.0 - CLOUD_REALISTIC_OCTAVE_FADE) * CLOUD_REALISTIC_HARDNESS * 10.0);
#else
    const float cloudDensityWeights = (1.0 - pow(CLOUD_REALISTIC_OCTAVE_FADE, CLOUD_REALISTIC_OCTAVES + 1.0)) / ((1.0 - CLOUD_REALISTIC_OCTAVE_FADE) * CLOUD_REALISTIC_HARDNESS * 10.0);
    const float cloudSkyDensityWeights = (1.0 - pow(CLOUD_REALISTIC_OCTAVE_FADE, CLOUD_REALISTIC_SKYLIGHT_OCTAVES + 1.0)) / ((1.0 - CLOUD_REALISTIC_OCTAVE_FADE) * CLOUD_REALISTIC_HARDNESS * 10.0);
    const float cloudShadowDensityWeights = (1.0 - pow(CLOUD_REALISTIC_OCTAVE_FADE, CLOUD_REALISTIC_SKYLIGHT_OCTAVES + 1.0)) / ((1.0 - CLOUD_REALISTIC_OCTAVE_FADE) * CLOUD_REALISTIC_HARDNESS * 10.0);
#endif

vec4 sampleRealisticCloud(vec3 cloudPos, vec3 sunDir, vec3 atmosphere) {
    vec3 relativeCloudPos = cloudPos - vec3(cameraPosition.x, 0.0, cameraPosition.z);
    float cloudDistance2 = dot(relativeCloudPos, relativeCloudPos);
    float cloudDistance = inversesqrt(dot(relativeCloudPos, relativeCloudPos));
    vec3 wind = CLOUD_REALISTIC_OCTAVE_SCALE * frameTimeCounter * CLOUD_SPEED * vec3(10.0, 0.0, 5.0);
    vec4 result = vec4(0.0);
    result.w = realisticCloudDensity(cloudPos, wind, cloudDistance2 * cloudDistance, CLOUD_REALISTIC_OCTAVES, cloudDensityWeights);
    if (result.w > 1e-5) {
        float RdotP = 2.0 * dot(sunDir, relativeCloudPos);
        float sunlightOpticalDepth = 0.0;
        float moonlightOpticalDepth = 0.0;
        float stepSize = CLOUD_REALISTIC_SHADOW_LIGHT_STEP_SIZE;
        float stepLength = 0.0;
        for (int i = 0; i < CLOUD_REALISTIC_SHADOWLIGHT_SAMPLES; i++) {
            stepLength += stepSize;
            vec3 sunlightSamplePos = cloudPos + sunDir * stepLength;
            sunlightOpticalDepth += realisticCloudDensity(
                sunlightSamplePos, wind, sqrt(cloudDistance2 + stepLength * (RdotP + stepLength)),
                CLOUD_REALISTIC_SHADOWLIGHT_OCTAVES, cloudShadowDensityWeights
            ) * stepSize;
            vec3 moonlightSamplePos = cloudPos - sunDir * stepLength;
            moonlightOpticalDepth += realisticCloudDensity(
                moonlightSamplePos, wind, sqrt(cloudDistance2 + stepLength * (-RdotP + stepLength)),
                CLOUD_REALISTIC_SHADOWLIGHT_OCTAVES, cloudShadowDensityWeights
            ) * stepSize;
            stepSize += CLOUD_REALISTIC_SHADOW_LIGHT_STEP_SIZE;
        }
        RdotP *= cloudDistance * 0.5;
        vec2 c = inversesqrt(cloudDistance) * inversesqrt(scaledHeight);
        cloudDistance = cloudDistance2 * cloudDistance;
        vec2 cExpH = c * exp2(earthScaledHeight - cloudDistance / scaledHeight * 1.44269502);
        vec3 sunlightStrength, moonlightStrength;
        sampleInScatteringDoubleSide(cloudDistance * 1.44269502, c, cExpH, RdotP, sunlightStrength, moonlightStrength);
        RdotP *= abs(RdotP);
        sunlightStrength *= atmosphereAbsorption(RdotP, cloudDistance);
        moonlightStrength *= atmosphereAbsorption(-RdotP, cloudDistance);

        sunlightStrength *= CLOUD_REALISTIC_BASIC_SHADOWLIGHT + exp2(-sqrt(sunlightOpticalDepth * CLOUD_REALISTIC_SAMPLE_DENSITY * 1.44269502 * 1.44269502));
        moonlightStrength *= CLOUD_REALISTIC_BASIC_SHADOWLIGHT + exp2(-sqrt(moonlightOpticalDepth * CLOUD_REALISTIC_SAMPLE_DENSITY * 1.44269502 * 1.44269502));
        result.rgb += 8.0 * (sunlightStrength + moonlightStrength * nightBrightness);

        float skylightOpticalDepth = 0.0;
        vec3 skylightSamplePos = cloudPos;
        for (int i = 0; i < CLOUD_REALISTIC_SKYLIGHT_SAMPLES; i++) {
            skylightSamplePos.y += CLOUD_REALISTIC_SKY_LIGHT_STEP_SIZE;
            skylightOpticalDepth += realisticCloudDensity(
                skylightSamplePos, wind, sqrt(cloudDistance2 + (skylightSamplePos.y - cloudPos.y) * (skylightSamplePos.y + cloudPos.y)),
                CLOUD_REALISTIC_SKYLIGHT_OCTAVES, cloudSkyDensityWeights
            );
        }
        float skylightAbsorption = CLOUD_REALISTIC_BASIC_SKYLIGHT + exp2(-sqrt(skylightOpticalDepth * CLOUD_REALISTIC_SKY_DENSITY * 1.44269502 * 1.44269502));
        result.rgb += atmosphere * skylightAbsorption;
    }
    return result;
}

vec4 realisticCloud(
    vec3 baseColor, vec3 atmosphere, vec3 worldPos, vec3 worldDir, vec3 sunDir, vec3 skyColorUp, vec3 intersectionData, float backDepth, out float cloudDepth
) {
    vec3 cloudPos = worldPos;
    cloudPos.y += max(300.0 + earthRadius, cameraPosition.y + WORLD_BASIC_HEIGHT + earthRadius);
    float planetIntersection = intersectionData.z;
    vec2 cloudBottomIntersection = raySphereIntersection(intersectionData.x, intersectionData.y, -pow2(cloudBottomHeight));
    vec2 cloudTopIntersection = raySphereIntersection(intersectionData.x, intersectionData.y, -pow2(cloudTopHeight));

    float startIntersection, endIntersection;
    bool hit = true;
    if (cloudPos.y < cloudBottomHeight) {
        hit = planetIntersection < 0.0;
        startIntersection = cloudBottomIntersection.y;
        endIntersection = cloudTopIntersection.y;
    }
    else {
        endIntersection = mix(cloudTopIntersection.y, cloudBottomIntersection.x, float(cloudBottomIntersection.x > 0.0));
        float overCloud = clamp((cloudPos.y - cloudTopHeight) * 1e+10, 0.0, 1.0);
        startIntersection = cloudTopIntersection.x * overCloud;
        hit = cloudPos.y < cloudTopHeight || cloudTopIntersection.y > 0.0;
    }

    if (backDepth > 1e-5) {
        hit = hit && startIntersection < backDepth;
        endIntersection = min(backDepth, endIntersection);
    }
    endIntersection = min(endIntersection, startIntersection + 50000.0);

    vec4 result = vec4(baseColor, 0.0);
    cloudDepth = -1.0;
    if (hit) {
        float cloudTransmittance = 1.0;
        #ifdef LQ_REALISTIC_CLOUD
            float stepSize = (endIntersection - startIntersection) / (CLOUD_REALISTIC_LQ_SAMPLES + 1.0);
            float startNoise = stepSize * 0.5;
        #else
            float stepSize = (endIntersection - startIntersection) / (CLOUD_REALISTIC_HQ_SAMPLES + 1.0);
            float startNoise = stepSize * bayer64Temporal(gl_FragCoord.xy);
        #endif
        float stepTransmittance = -stepSize * CLOUD_REALISTIC_SAMPLE_DENSITY * 1.44269502;
        cloudPos += worldDir * (startIntersection + startNoise);
        cloudPos.xz += cameraPosition.xz;
        worldDir *= stepSize;

        float unHitted = 1.0;
        vec3 cloudColor = vec3(0.0);
        atmosphere = (skyColorUp + atmosphere) * vec3(0.5) / PI;
        cloudDepth = startIntersection + startNoise;
        #ifdef LQ_REALISTIC_CLOUD
            for (int i = 0; i < CLOUD_REALISTIC_LQ_SAMPLES; i++)
        #else
            for (int i = 0; i < CLOUD_REALISTIC_HQ_SAMPLES; i++)
        #endif
        {
            vec4 sampleCloud = sampleRealisticCloud(cloudPos, sunDir, atmosphere);
            float sampleTransmittance = exp2(sampleCloud.w * stepTransmittance) * cloudTransmittance;
            cloudColor += (cloudTransmittance - sampleTransmittance) * sampleCloud.rgb;
            cloudTransmittance = sampleTransmittance;
            if (cloudTransmittance < 0.0001) break;
            unHitted *= float(sampleTransmittance > 0.99999);
            cloudDepth += stepSize * unHitted;
            cloudPos += worldDir;
        }
        if (cloudTransmittance < 0.9999) {
            float cloudDensity = 1.0 - cloudTransmittance;

            float cloudFinalDensity = cloudDensity * exp(-startIntersection / CLOUD_REALISTIC_FADE_DISTANCE);
            cloudColor = mix(atmosphere, cloudColor, cloudFinalDensity);
            cloudColor = mix(baseColor, cloudColor, cloudDensity * exp(-max(startIntersection * 1.44269502 / CLOUD_REALISTIC_FADE_DISTANCE - 1.44269502, 0.0)));
            result = vec4(cloudColor, cloudFinalDensity);
        } else {
            cloudDepth = -1.0;
        }
    }
    return result;
}

vec4 sampleClouds(
    vec3 baseColor, vec3 atmosphere, vec3 worldPos, vec3 worldDir, vec3 shadowDir,
    vec3 sunDir, vec3 skyColorUp, vec3 intersectionData, float backDepth, out float cloudDepth
) {
    #if CLOUD_TYPE == 1
        return blockyCloud(baseColor, atmosphere, worldPos, worldDir, shadowDir, skyColorUp, backDepth, cloudDepth);
    #elif CLOUD_TYPE == 2
        return realisticCloud(baseColor, atmosphere, worldPos, worldDir, sunDir, skyColorUp, intersectionData, backDepth, cloudDepth);
    #else
        cloudDepth = -1.0;
        return vec4(baseColor, 0.0);
    #endif
}

float cloudShadowBlocky(vec3 worldPos, vec3 shadowDir) {
    float worldHeight = worldPos.y + cameraPosition.y;
    float topIntersection = (CLOUD_BLOCKY_TOP_HEIGHT - worldHeight) / shadowDir.y;
    float bottomIntersection = (CLOUD_BLOCKY_HEIGHT - worldHeight) / shadowDir.y;

    float intersection = topIntersection * bottomIntersection > 0.0 ? min(topIntersection, bottomIntersection) : 0.0;
    float result = 1.0;
    if (intersection > 0.0) {
        vec2 wind = frameTimeCounter * CLOUD_SPEED * vec2(4.0, 2.0);
        vec2 cloudOffset = worldPos.xz + intersection * shadowDir.xz;
        vec3 cloudPos = vec3(
            (cameraPosition.x + cloudOffset.x + wind.x) * cloudNoiseScale,
            clamp(worldHeight / CLOUD_BLOCKY_THICKNESS - CLOUD_BLOCKY_HEIGHT / CLOUD_BLOCKY_THICKNESS, 0.0, 0.9999),
            (cameraPosition.z + cloudOffset.y + wind.y) * cloudNoiseScale
        );
        ivec2 cloudTexel = ivec2(floor(cloudPos.xz)) & 63;

        vec3 stepDir = shadowDir;
        stepDir.y /= cloudThicknessScale;
        vec3 stepLength = abs(1.0 / (stepDir + 1e-5));
        ivec3 dirSigned = (floatBitsToInt(stepDir) >> 31) * 2 + 1;
        vec3 nextLength = (dirSigned * (0.5 - fract(cloudPos)) + 0.5) * stepLength;
        ivec3 nextVoxel = ivec3(0);

        float opticalDepth = 0.0;
        for (int i = 0; i < CLOUD_BLOCKY_MAX_SAMPLES; i++) {
            float rayLength = min(nextLength.x, min(nextLength.y, nextLength.z));
            float sampleCloudDensity = blockyCloudDensity(cloudTexel);
            opticalDepth += rayLength * step(0.5, sampleCloudDensity);
            nextVoxel = (floatBitsToInt(vec3(rayLength) - nextLength) >> 31) + 1;
            if (nextVoxel.y > 0.5) {
                break;
            }
            nextLength += nextVoxel * stepLength - rayLength;
            cloudTexel = (cloudTexel + nextVoxel.xz * dirSigned.xz) & 63;
        }

        float cloudShadowAbsorption = clamp(exp(-opticalDepth * opticalDepth * 20.0) * 1.01 - 0.01, 0.0, 1.0);
        float cloudAbsorptionFade = exp(-0.001 * CLOUD_BLOCKY_FADE_SPEED * max(length(cloudOffset) - CLOUD_BLOCKY_FADE_DISTANCE * 2.0, 0.0));

        result = mix(1.0, cloudShadowAbsorption, cloudAbsorptionFade);
    }
    return result;
}

float baseCloudShadowNoise(vec2 coord) {
    coord *= 64.0;
    vec2 whole = floor(coord);
    vec2 part = coord - whole;
    part *= part * (3.0 - 2.0 * part);

    vec4 samples = textureGather(noisetex, whole / 64.0 + 1.0 / 64.0, 3);
    samples.zy -= samples.wx;
    samples.wx += part.x * samples.zy;

    return mix(samples.w, samples.x, part.y);
}

float cloudShadowNoise(vec3 position) {
    position *= 64.0;

    vec3 whole = floor(position);
    vec3 part = position - whole;

    part *= part * (3.0 - 2.0 * part);
    vec2 coord = whole.xy / 64.0 + 1.0 / 64.0 + 17.0 / 64.0 * whole.z;

    vec4 samplesY = textureGather(noisetex, coord, 1);
    vec4 samplesZ = textureGather(noisetex, coord, 2);

    vec4 samples = mix(samplesY, samplesZ, part.z);
    samples.zy -= samples.wx;
    samples.wx += part.x * samples.zy;

    return mix(samples.w, samples.x, part.y);
}

float cloudShadowRealistic(vec3 worldPos, vec3 shadowDir) {
    worldPos.y += max(300.0 + earthRadius, cameraPosition.y + WORLD_BASIC_HEIGHT + earthRadius);
    float R2 = dot(worldPos, worldPos);
    float RdotP = dot(worldPos, shadowDir);
    float RdotP2 = RdotP * RdotP - R2;

    vec2 cloudIntersection = raySphereIntersection(RdotP, RdotP2, -pow2(cloudCenterHeight));
    float startIntersection = cloudIntersection.x;
    bool hit = cloudIntersection.y >= 0.0;
    if (worldPos.y < cloudCenterHeight) {
        float planetIntersection = raySphereIntersection(RdotP, RdotP2, -pow2(earthRadius)).x;
        hit = planetIntersection <= 0.0;
        startIntersection = cloudIntersection.y;
    }

    float result = 1.0;
    if (hit) {
        vec3 wind = CLOUD_REALISTIC_OCTAVE_SCALE * frameTimeCounter * CLOUD_SPEED * vec3(10.0, 0.0, 5.0);

        vec3 cloudPos = worldPos + vec3(cameraPosition.x, 0.0, cameraPosition.z) + shadowDir * startIntersection;
        cloudPos += frameTimeCounter * CLOUD_SPEED * vec3(10.0, 0.0, 5.0);
        float density = baseCloudShadowNoise(cloudPos.xz * 0.00001 * CLOUD_SCALE);
        float weight = 1.0;
        for (int i = 0; i < CLOUD_REALISTIC_SHADOWLIGHT_OCTAVES; i++) {
            cloudPos = cloudPos * CLOUD_REALISTIC_OCTAVE_SCALE + wind;
            weight *= CLOUD_REALISTIC_OCTAVE_FADE;
            density += cloudShadowNoise(cloudPos * 0.000015 * CLOUD_SCALE) * weight;
        }
        const float weights = (1.0 - pow(CLOUD_REALISTIC_OCTAVE_FADE, CLOUD_REALISTIC_SHADOWLIGHT_OCTAVES + 1.0)) / ((1.0 - CLOUD_REALISTIC_OCTAVE_FADE) * CLOUD_REALISTIC_HARDNESS * 10.0);
        density = clamp(density / weights + (CLOUD_REALISTIC_AMOUNT - 1.0) * (1.0 - weatherStrength * CLOUD_REALISTIC_RAIN_INCREAMENT) * CLOUD_REALISTIC_HARDNESS * 10.0, 0.0, 1.0);

        float cloudTransmittance = pow2(clamp(1.0 - density * 1.4, 0.0, 1.0));

        const float fadeFactor = -1.44269502 * 5.0;
        cloudTransmittance = mix(1.0, cloudTransmittance, exp2(min(0.0, startIntersection * fadeFactor / CLOUD_REALISTIC_FADE_DISTANCE - 0.5 * fadeFactor)));
        result = cloudTransmittance;
    }
    return result;
}

float cloudShadow(vec3 worldPos, vec3 shadowDir) {
    #if CLOUD_TYPE == 1
        return cloudShadowBlocky(worldPos, shadowDir);
    #elif CLOUD_TYPE == 2
        return cloudShadowRealistic(worldPos, shadowDir);
    #else
        return 1.0;
    #endif
}

const float planeCloudHeight = PLANE_CLOUD_HEIGHT + earthRadius + 500.0;

vec4 planeClouds(vec3 worldPos, vec3 worldDir, vec3 sunDirection, vec3 skyColorUp, vec3 intersectionData) {
    worldPos.y += max(300.0 + earthRadius, cameraPosition.y + WORLD_BASIC_HEIGHT + earthRadius);

    float planetIntersection = intersectionData.z;
    vec2 cloudIntersection = raySphereIntersection(intersectionData.x, intersectionData.y, -pow2(planeCloudHeight));

    float intersection = mix(cloudIntersection.y, cloudIntersection.x, float(worldPos.y > planeCloudHeight));
    bool hit = intersection > 0.0 && (worldPos.y > planeCloudHeight || planetIntersection < 0.0);

    vec4 result = vec4(0.0);
    if (hit) {
        vec2 wind = frameTimeCounter * PLANE_CLOUD_SPEED * vec2(20.0, 10.0);
        vec2 cloudPos = worldPos.xz + worldDir.xz * intersection + cameraPosition.xz + wind;
        wind *= PLANE_CLOUD_OCTAVE_SCALE;

        float cloudDensity = 0.0;
        float weight = 1.0;
        float weights = 0.0;
        for (int i = 0; i < PLANE_CLOUD_OCTAVES; i++) {
            cloudDensity += weight * smooth2DNoise(cloudPos * 0.0001 * PLANE_CLOUD_SCALE);
            cloudPos = cloudPos * PLANE_CLOUD_OCTAVE_SCALE + wind;
            weights += weight;
            weight *= PLANE_CLOUD_OCTAVE_FADE;
        }
        cloudDensity /= weights;
        cloudDensity = clamp(cloudDensity + PLANE_CLOUD_AMOUNT - 1.0, 0.0, 1.0);
        if (cloudDensity > 0.0) {
            cloudDensity *= exp2(-intersection / PLANE_CLOUD_FADE_DISTANCE);
            cloudDensity = 1.0 - exp2(-PLANE_CLOUD_DENSITY * cloudDensity);

            vec3 relativeCloudPos = worldPos + worldDir * intersection;
            float cloudHeight2 = dot(relativeCloudPos, relativeCloudPos);
            float cloudHeightInv = inversesqrt(cloudHeight2);
            float LdotP = dot(sunDirection, relativeCloudPos) * cloudHeightInv;
            float cloudHeight = cloudHeight2 * cloudHeightInv * 1.44269502;
            vec2 c = inversesqrt(cloudHeightInv) * inversesqrt(scaledHeight);
            vec2 currRelativeDensity = exp2(earthScaledHeight - cloudHeight / scaledHeight);
            vec2 cExpH = c * currRelativeDensity;
            vec3 sunlightStrength, moonlightStrength;
            sampleInScatteringDoubleSide(cloudHeight, c, cExpH, LdotP, sunlightStrength, moonlightStrength);
            LdotP *= abs(LdotP);
            cloudHeight /= 1.44269502;

            vec3 cloudColor = 8.0 * (sunlightStrength + moonlightStrength * nightBrightness) * cloudDensity;
            result = vec4(cloudColor, cloudDensity);
        }
    }

    return result;
}
