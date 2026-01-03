//     _________      __        __     ___       __     __________      ________        ______        __           
//    /  _____  \    |  |      |  |   |   \     |  |   |   _____  \    |__    __|      /  __  \      |  |          
//   /  /     \__\   |  |      |  |   |    \    |  |   |  |     \  \      |  |        /  /  \  \     |  |          
//  |  |             |  |      |  |   |  |  \   |  |   |  |      |  |     |  |       /  /    \  \    |  |          
//   \  \______      |  |      |  |   |  |\  \  |  |   |  |      |  |     |  |      |  |______|  |   |  |          
//    \______  \     |  |      |  |   |  | \  \ |  |   |  |      |  |     |  |      |   ______   |   |  |          
//           \  \    |  |      |  |   |  |  \  \|  |   |  |      |  |     |  |      |  |      |  |   |  |          
//  ___       |  |   |  |      |  |   |  |   \  |  |   |  |      |  |     |  |      |  |      |  |   |  |          
//  \  \_____/  /     \  \____/  /    |  |    \    |   |  |_____/  /    __|  |__    |  |      |  |   |  |_________ 
//   \_________/       \________/     |__|     \___|   |__________/    |________|   |__|      |__|   |____________|
//
//  General Public License v3.0. © 2021-Now GeForceLegend.
//  https://github.com/GeForceLegend/Sundial-Lite
//  https://www.gnu.org/licenses/gpl-3.0.en.html
//
//  Transparent blending and common fog
//

#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer3;

in vec2 texcoord;

#define REFRACTION_STRENGTH 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
#define REFRACTION_EDGE_FADE 0.5 // [0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]

// Volumetric Light
    #define VOLUMETRIC_LIGHT

    #define VL_STRENGTH 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0]
    #define VL_SAMPLES 8 // [2 3 4 5 6 7 8 10 12 14 16 20 24 28 32]
    #define MORNING_VL_STRENGTH 3.0 // [0.0 0.5 1.0 1.5 2.0 2.5 3.0 3.5 4.0 4.5 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.0 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
    #define NOON_VL_STRENGTH 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0]
    #define WATER_VL_STRENGTH 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0]

// Volumetric Fog
    #define VOLUMETRIC_FOG

    #define VOLUMETRIC_FOG_SPEED 1.0 // [0.0 0.01 0.02 0.03 0.04 0.05 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.33 0.36 0.4 0.43 0.46 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
    #define VOLUMETRIC_FOG_AMOUNT 0.80 // [0.0 0.05 0.10 0.15 0.20 0.25 0.30 0.35 0.40 0.45 0.50 0.55 0.60 0.65 0.70 0.75 0.80 0.85 0.90 0.95 1.00 1.05 1.10 1.15 1.20 1.25 1.30 1.35 1.40 1.45 1.50 1.55 1.60 1.65 1.70 1.75 1.80 1.85 1.90 1.95 2.0]
    #define VOLUMETRIC_FOG_DENSITY 1.0 // [0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
    #define VOLUMETRIC_FOG_CENTER_HEIGHT 80 // [-60 -50 -40 -30 -20 -10 0 10 20 30 40 50 60 70 80 90 100 110 120 130 140 150 160 170 180 190 200 210 220 230 240 250 260 270 280 290 300 310 320]
    #define VOLUMETRIC_FOG_THICKNESS 128 // [2 4 6 8 12 16 20 24 28 32 40 48 56 64 80 96 112 128 144 160 176 192 218 224 240 256]

    #define VOLUMETRIC_FOG_MORNING_DENSITY 2.0 // [0.0 0.01 0.02 0.03 0.04 0.05 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.33 0.36 0.4 0.43 0.46 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
    #define VOLUMETRIC_FOG_NOON_DENSITY 0.1  // [0.0 0.01 0.02 0.03 0.04 0.05 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.33 0.36 0.4 0.43 0.46 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]

    #define VOLUMETRIC_FOG_SCALE 5.0 // [0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
    #define VOLUMETRIC_FOG_OCTAVES 4 // [1 2 3 4 5 6 7 8 9 10]
    #define VOLUMETRIC_FOG_OCTAVE_SCALE 2.8 // [2.0 2.1 2.2 2.3 2.4 2.5 2.55 2.6 2.65 2.7 2.75 2.8 2.85 2.9 2.95 3.0 3.1 3.2 3.3 3.4 3.5 3.6 3.7 3.8 3.9 4.0]
    #define VOLUMETRIC_FOG_OCTAVE_FADE 0.45 // [0.0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]

#include "/settings/CloudSettings.glsl"
#include "/settings/GlobalSettings.glsl"

#ifdef SHADOW_AND_SKY
    in vec3 skyColorUp;
#else
    const vec3 skyColorUp = vec3(0.0);
#endif

#ifdef THE_END
    #include "/libs/Galaxy.glsl"
#endif

#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/Atmosphere.glsl"
#include "/libs/Cloud.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Shadow.glsl"

float volumetricFogDensity(vec3 position) {
    position += cameraPosition;
    float heightClamp = pow2(2.0 / VOLUMETRIC_FOG_THICKNESS * position.y - 2.0 * VOLUMETRIC_FOG_CENTER_HEIGHT / VOLUMETRIC_FOG_THICKNESS);
    float density = 0.0;
    if (heightClamp < 1.0) {
        vec3 wind = vec3(2.0, 0.0, 1.0) * frameTimeCounter / VOLUMETRIC_FOG_SCALE * 0.001 * VOLUMETRIC_FOG_SPEED ;
        vec3 fogPosition = position / VOLUMETRIC_FOG_SCALE * 0.001 + wind;

        const float weights = (1.0 - pow(VOLUMETRIC_FOG_OCTAVE_FADE, VOLUMETRIC_FOG_OCTAVES)) / (1.0 - VOLUMETRIC_FOG_OCTAVE_FADE);
        float weight = 1.0 / weights;
        for (int i = 0; i < VOLUMETRIC_FOG_OCTAVES; i++) {
            density += smooth3DNoise(fogPosition) * weight;
            fogPosition = fogPosition * VOLUMETRIC_FOG_OCTAVE_SCALE + wind;
            weight *= VOLUMETRIC_FOG_OCTAVE_FADE;
        }
        density = clamp(pow2(density) + VOLUMETRIC_FOG_AMOUNT - 1.0 - VOLUMETRIC_FOG_AMOUNT * heightClamp, 0.0, 1.0);
    }
    return density;
}

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    GbufferData gbufferData = getGbufferData(texel, texcoord);
    float waterDepth = textureLod(depthtex0, texcoord, 0.0).r;
    float solidDepth = gbufferData.depth;
    vec4 solidColor = texelFetch(colortex3, texel, 0);
    vec3 viewPos;
    #ifdef LOD
        if (solidDepth == 1.0) {
            solidDepth = getLodDepthSolid(texcoord);
            viewPos = screenToViewPosLod(texcoord, solidDepth);
            solidDepth += 1.0;
        } else
    #endif
    {
        viewPos = screenToViewPos(texcoord, solidDepth);
    }
    vec3 waterViewPos;
    #ifdef LOD
        if (waterDepth == 1.0) {
            waterDepth = getLodDepthWater(texcoord);
            waterViewPos = screenToViewPosLod(texcoord, waterDepth);
            waterDepth += 1.0;
        } else
    #endif
    {
        waterViewPos = screenToViewPos(texcoord, waterDepth);
    }
    vec3 worldPos = mat3(gbufferModelViewInverse) * viewPos;
    float worldDistanceInv = inversesqrt(dot(worldPos, worldPos));
    vec3 waterWorldDir = worldPos * worldDistanceInv;

    float waterViewDepthNoLimit = length(waterViewPos);

    /********************************************************** Water Refraction **********************************************************/

    float n = 1.5;
    float reflectionWeight = 1.0;
    if (waterDepth < solidDepth) {
        reflectionWeight = solidColor.w;
        bool isTargetWater = gbufferData.materialID == MAT_WATER;
        bool isTargetNotParticle = gbufferData.materialID != MAT_PARTICLE;
        vec3 worldNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.normal);
        float LdotH = clamp(dot(-worldNormal, waterWorldDir), 0.0, 1.0);
        vec3 stainedColor = vec3(0.0);
        if (isTargetNotParticle) {
            stainedColor += gbufferData.smoothness * gbufferData.smoothness;
            float refractionStrength = REFRACTION_STRENGTH * 4e-2 * clamp((1.0 - waterViewDepthNoLimit * worldDistanceInv) / (waterViewDepthNoLimit * worldDistanceInv + worldDistanceInv), 0.0, 1.0);

            float roughness = 1.0 - gbufferData.smoothness;
            vec2 blueNoise = textureLod(noisetex, texcoord * screenSize / 64.0, 0.0).xy;
            vec2 randomOffset = vec2(cos(blueNoise.x * 2.0 * PI), sin(blueNoise.x * 2.0 * PI)) * blueNoise.y;
            float k = sqrt(n * n - (1.0 - LdotH * LdotH));
            vec3 viewDir = viewPos * worldDistanceInv;
            vec3 refractDirection = normalize(
                viewDir - (LdotH + k) * gbufferData.normal +
                (dot(-gbufferData.geoNormal, viewDir) + k) * gbufferData.geoNormal * float(isTargetWater) // Get this idea from zombye/spectrum, MIT Licence
            );
            vec2 refractionOffset = (refractDirection.xy - viewPos.xy / viewPos.z * refractDirection.z + roughness * randomOffset) * refractionStrength;
            vec2 screenEdgeIntersection = mix(texcoord, 1.0 - texcoord, clamp(refractionOffset * 1e+20, 0.0, 1.0)) / abs(refractionOffset);
            float screenEdgeLength = min(screenEdgeIntersection.x, screenEdgeIntersection.y);
            if (screenEdgeLength < 1.0 / (1.0 - REFRACTION_EDGE_FADE)) {
                refractionOffset *= screenEdgeLength + pow2(REFRACTION_EDGE_FADE * screenEdgeLength) / (-1.0 + (1.0 - 2.0 * REFRACTION_EDGE_FADE) * screenEdgeLength);
            }

            vec2 refractionTarget = texcoord + refractionOffset;
            float targetSolidDepth = textureLod(depthtex1, refractionTarget, 0.0).r;
            #ifdef LOD
                targetSolidDepth += float(targetSolidDepth == 1.0) * getLodDepthSolid(refractionTarget);
            #endif
            if (waterDepth < targetSolidDepth) {
                solidDepth = targetSolidDepth;
                solidColor.rgb = textureLod(colortex3, refractionTarget, 0.0).rgb;
                vec3 viewPos;
                #ifdef LOD
                    if (solidDepth > 1.0) {
                        viewPos = screenToViewPosLod(refractionTarget, solidDepth - 1.0);
                    } else
                #endif
                {
                    viewPos = screenToViewPos(refractionTarget, solidDepth);
                }
                worldPos = mat3(gbufferModelViewInverse) * viewPos;
            }
        }

        vec3 worldDir = normalize(worldPos);
        worldPos += gbufferModelViewInverse[3].xyz;
        vec3 waterWorldPos = waterWorldDir * waterViewDepthNoLimit + gbufferModelViewInverse[3].xyz;
        float waterDistance = distance(worldPos, waterWorldPos);
        vec3 rawSolidColor = solidColor.rgb;
        n -= 0.166666 * float(isTargetWater);
        #ifdef LABPBR_F0
            n = mix(n, f0ToIor(gbufferData.metalness) , step(0.001, gbufferData.metalness));
            gbufferData.metalness = step(229.5 / 255.0, gbufferData.metalness);
        #endif
        #ifdef LOD
            solidDepth -= float(solidDepth > 1.0);
        #endif
        waterDistance = mix(waterDistance, 114514.0, step(0.999999, solidDepth));
        if (isEyeInWater == 1 ^^ isTargetWater) {
            solidColor.rgb = waterFogTotal(solidColor.rgb, worldDir, skyColorUp, waterDistance, gbufferData.lightmap.y);
            n *= 1.0 - 0.25 * float(isEyeInWater);
        }
        else if (isEyeInWater == 2) {
            solidColor.rgb = lavaFogTotal(solidColor.rgb, waterDistance);
        }
        else if (isEyeInWater == 3) {
            solidColor.rgb = snowFogTotal(solidColor.rgb, skyColorUp, waterDistance, gbufferData.lightmap.y);
        }
        else {
            #ifdef NETHER
                solidColor.rgb = netherFogTotal(solidColor.rgb, waterDistance);
            #elif defined THE_END
                solidColor.rgb = endFogTotal(solidColor.rgb, waterDistance);
                if (solidDepth> 0.999999)
                    solidColor.rgb += endStars(worldDir);
            #else
                vec4 intersectionData = planetIntersectionData(gbufferModelViewInverse[3].xyz, worldDir);
                float atmosphereDepth = mix(waterDistance * (1.0 + RF_GROUND_EXTRA_DENSITY * 3.0 * weatherStrength), 1000.0 - intersectionData.w * 500.0, step(0.999999, solidDepth));
                #if defined ATMOSPHERE_SCATTERING_FOG && defined SHADOW_AND_SKY
                    solidColor.rgb = solidAtmosphereScattering(solidColor.rgb, worldDir, skyColorUp, atmosphereDepth, gbufferData.lightmap.y);
                #endif
                solidColor.rgb *= airAbsorption(waterDistance);
            #endif
            n = mix(n, 1.0 / n, float(isTargetWater));
        }
        float waterStain = 1.0;
        #if WATER_TYPE == 0
            waterStain = float(!isTargetWater);
        #endif
        stainedColor *= log2(1.0 - fresnel(LdotH, LdotH * LdotH, n));
        stainedColor += sqrt(gbufferData.albedo.w * 1.5) * log2(gbufferData.albedo.rgb * (1.0 - 0.5 * gbufferData.albedo.w * gbufferData.albedo.w)) * waterStain;
        stainedColor = exp2(stainedColor);

        stainedColor = mix(vec3(1.0), stainedColor, vec3(solidColor.w));
        solidColor.rgb = mix(rawSolidColor, solidColor.rgb, vec3(solidColor.w)) * stainedColor;

        float isTargetParticle = 1.0 - float(isTargetNotParticle);
        vec3 vanillaLight = pow2(gbufferData.lightmap.y) * (skyColorUp + sunColor * SUNLIGHT_BRIGHTNESS) * (1.0 - gbufferData.metalness);
        #ifdef IS_IRIS
            float eyeRelatedDistance = length(waterWorldPos + relativeEyePosition);
            gbufferData.lightmap.x = max(gbufferData.lightmap.x, heldBlockLightValue / 15.0 * clamp(1.0 - eyeRelatedDistance / 15.0, 0.0, 1.0));
        #endif
        const float fadeFactor = VANILLA_BLOCK_LIGHT_FADE;
        vec3 blockLight = pow2(1.0 / (fadeFactor - fadeFactor * fadeFactor / (1.0 + fadeFactor) * gbufferData.lightmap.x) - 1.0 / fadeFactor) * commonLightColor;
        vanillaLight += blockLight;
        solidColor.rgb += gbufferData.albedo.rgb * gbufferData.albedo.w * (gbufferData.emissive * PBR_BRIGHTNESS * PI + vanillaLight * isTargetParticle);
        #ifdef SHADOW_AND_SKY
            float NdotL = clamp(dot(worldNormal, shadowDirection) + isTargetParticle, 0.0, 1.0);
            if (NdotL > 0.0) {
                float shadowLightFactor = 1.0;
                #ifdef LIGHT_LEAKING_FIX
                    shadowLightFactor = clamp(gbufferData.lightmap.y * 10.0, 0.0, 1.0);
                #endif
                vec3 shadow = singleSampleShadow(
                    waterWorldPos, mat3(gbufferModelViewInverse) * gbufferData.geoNormal, NdotL, shadowLightFactor,
                    gbufferData.smoothness, gbufferData.porosity, gbufferData.lightmap.y
                );
                shadow *= (1.0 - gbufferData.metalness) * gbufferData.albedo.rgb * gbufferData.albedo.w * isTargetParticle + sunlightSpecular(
                    waterWorldDir, shadowDirection, worldNormal, gbufferData.albedo.rgb,
                    gbufferData.smoothness * 0.995, gbufferData.metalness, NdotL, LdotH, vec3(n), vec3(0.0)
                );
                #ifdef CLOUD_SHADOW
                    shadow *= cloudShadow(waterWorldPos, shadowDirection);
                #endif
                shadow *= sunColor;
                solidColor.rgb += shadow;
            }
        #endif
    }
    vec4 reflectionData = texelFetch(colortex4, texel, 0);
    solidColor.rgb += reflectionData.rgb * reflectionWeight;

    waterDepth -= float(waterDepth > 1.0);
    float waterViewDepth = mix(waterViewDepthNoLimit, 114514.0, step(0.999999, waterDepth));
    if (isEyeInWater == 0) {
        #ifdef NETHER
            solidColor.rgb *= vec3(netherFogAbsorption(waterViewDepth));
            solidColor.rgb += netherFogScattering(waterViewDepth);
        #elif defined THE_END
            solidColor.rgb *= vec3(endFogAbsorption(waterViewDepth));
            solidColor.rgb += endFogScattering(waterViewDepth);
            if (waterDepth > 0.999999) {
                solidColor.rgb += endStars(waterWorldDir);
            }
        #else
            #ifdef SHADOW_AND_SKY
                #ifdef ATMOSPHERE_SCATTERING_FOG
                    vec4 intersectionData = planetIntersectionData(gbufferModelViewInverse[3].xyz, waterWorldDir);
                    float atmosphereDepth = mix(waterViewDepthNoLimit * (1.0 + RF_GROUND_EXTRA_DENSITY * 3.0 * weatherStrength), 1000.0 - intersectionData.w * 500.0, step(0.999999, waterDepth));
                    solidColor.rgb = solidAtmosphereScattering(solidColor.rgb, waterWorldDir, skyColorUp, atmosphereDepth, eyeBrightnessSmooth.y / 240.0);
                #endif
            #endif
            solidColor.rgb *= vec3(airAbsorption(waterViewDepth));
        #endif
    }
    else if (isEyeInWater == 1) {
        solidColor.rgb *= waterFogAbsorption(waterViewDepth);
        solidColor.rgb += waterFogScattering(waterWorldDir, skyColorUp, waterViewDepth, eyeBrightnessSmooth.y / 240.0);
    }
    else if (isEyeInWater == 2) {
        solidColor.rgb *= vec3(lavaFogAbsorption(waterViewDepth));
        solidColor.rgb += lavaFogScattering(waterViewDepth);
    }
    else if (isEyeInWater == 3) {
        solidColor.rgb *= vec3(snowFogAbsorption(waterViewDepth));
        solidColor.rgb += snowFogScattering(skyColorUp, waterViewDepth, eyeBrightnessSmooth.y / 240.0);
    }

    #ifdef SHADOW_AND_SKY
        vec3 volumetricLight = vec3(0.0);
        #ifdef VOLUMETRIC_LIGHT
            if (isEyeInWater < 2) {
                float waterDepth = textureLod(depthtex0, texcoord, 0.0).r;
                vec3 waterViewPos;
                #ifdef LOD
                    if (waterDepth == 1.0) {
                        waterDepth = getLodDepthWater(texcoord);
                        waterViewPos = screenToViewPosLod(texcoord, waterDepth);
                    } else
                #endif
                {
                    waterViewPos = screenToViewPos(texcoord, waterDepth);
                }
                float waterViewDepth = length(waterViewPos);
                vec3 waterWorldPos = mat3(gbufferModelViewInverse) * waterViewPos;
                float waterWorldDistanceInv = inversesqrt(dot(waterViewPos, waterViewPos));
                vec3 waterWorldDir = waterWorldDistanceInv * waterWorldPos;

                float basicWeight = 1.0;
                vec3 absorptionBeta = vec3(blindnessFactor + 0.003);
                float LdotV = dot(waterWorldDir, shadowDirection);
                float volumetricFogScattering = 0.0;
                float airScattering = VL_STRENGTH;
                if (isEyeInWater == 1) {
                    absorptionBeta = waterAbsorptionBeta + 0.003;
                    basicWeight *= 10.0 * WATER_VL_STRENGTH;
                    airScattering *= rayleighPhase(LdotV);
                }
                else {
                    float timeStrength = pow(clamp(1.0 - shadowDirection.y, 0.0, 1.0), 5.0);
                    float timeVLStrength = (timeStrength * (MORNING_VL_STRENGTH - NOON_VL_STRENGTH) + NOON_VL_STRENGTH);
                    float heightDensity = clamp(exp(-(cameraPosition.y + WORLD_BASIC_HEIGHT) / 1200.0), 0.0, 1.0);
                    basicWeight *= timeVLStrength * heightDensity;
                    airScattering *= miePhase(LdotV, 0.6, 0.36);

                    volumetricFogScattering = heightDensity * VOLUMETRIC_FOG_DENSITY * (timeStrength * (VOLUMETRIC_FOG_MORNING_DENSITY - VOLUMETRIC_FOG_NOON_DENSITY) + VOLUMETRIC_FOG_NOON_DENSITY);
                }

                float noise = bayer64Temporal(gl_FragCoord.xy);
                float maxAllowedDistance = far;
                #ifdef LOD
                    maxAllowedDistance = lodRenderDistance() * 1.01;
                #endif
                maxAllowedDistance = (maxAllowedDistance + 32.0) * inversesqrt(max(waterWorldDir.y * waterWorldDir.y, 0.5));
                maxAllowedDistance = min(maxAllowedDistance, 5000.0 * exp(-6.0 * length(absorptionBeta)));

                vec3 target = waterWorldPos * clamp(maxAllowedDistance * waterWorldDistanceInv, 0.0, 1.0);
                vec3 stepSize = target / VL_SAMPLES;
                vec3 samplePos = gbufferModelViewInverse[3].xyz + stepSize * noise;
                float stepLength = length(stepSize);

                basicWeight *= stepLength;
                absorptionBeta *= stepLength * 1.44269502;
                vec3 rayAbsorption = exp2(-absorptionBeta * noise) * basicWeight * 0.02;
                #ifdef LIGHT_LEAKING_FIX
                    rayAbsorption *= pow(eyeBrightnessSmooth.y / 240.0 + 1e-4, exp(-0.5 * stepLength));
                #endif
                vec3 stepAbsorption = exp2(-absorptionBeta);
                vec3 skyScattering = (sunColor * SUNLIGHT_BRIGHTNESS * 2.0 + skyColorUp) * eyeBrightnessSmooth.y / 1000.0;
                stepLength *= -0.01 * 1.44269502 / max(1e-5, basicWeight);

                for (int i = 0; i < VL_SAMPLES; i++) {
                    vec3 singleLight = vec3(1.0);
                    #ifdef CLOUD_SHADOW
                        singleLight *= cloudShadow(samplePos, shadowDirection);
                    #endif
                    vec3 sampleShadowCoord = worldPosToShadowCoord(samplePos);
                    if (all(lessThan(
                        abs(sampleShadowCoord - vec3(vec2(0.75), 0.5)),
                        vec3(vec2(0.25), 0.5))
                    )) {
                        float solidShadowStrength = textureLod(shadowtex0, sampleShadowCoord, 0.0);
                        singleLight *= vec3(solidShadowStrength);
                        sampleShadowCoord.y -= 0.5;
                        vec3 caustic = waterCaustic(sampleShadowCoord, samplePos, shadowDirection);
                        singleLight *= caustic;
                        #ifdef TRANSPARENT_SHADOW
                            sampleShadowCoord.xy += vec2(-0.5, 0.5);
                            float transparentShadowStrength = textureLod(shadowtex0, sampleShadowCoord, 0.0);
                            if (transparentShadowStrength < 1.0) {
                                vec4 transparentShadowColor = textureLod(shadowcolor0, sampleShadowCoord.st, 0.0);
                                transparentShadowColor.rgb = pow(
                                    transparentShadowColor.rgb * (1.0 - 0.5 * pow2(transparentShadowColor.w)),
                                    vec3(sqrt(transparentShadowColor.w * 2.2 * 2.2 * 1.5))
                                );
                                singleLight *= mix(transparentShadowColor.rgb, vec3(1.0), vec3(transparentShadowStrength));
                            }
                        #endif
                    }
                    singleLight *= sunColor * SUNLIGHT_BRIGHTNESS;
                    #ifdef VOLUMETRIC_FOG
                        float sampleVolumetricFogDensity = volumetricFogDensity(samplePos) * volumetricFogScattering;
                        singleLight *= sampleVolumetricFogDensity * 5.0 + airScattering;
                        singleLight += sampleVolumetricFogDensity * skyScattering;
                    #else
                        singleLight *= airScattering;
                    #endif
                    singleLight *= rayAbsorption;
                    #ifdef VOLUMETRIC_FOG
                        float volumetricFogAbsorption = exp2(stepLength * sampleVolumetricFogDensity);
                        rayAbsorption *= volumetricFogAbsorption;
                        solidColor.rgb *= volumetricFogAbsorption;
                    #endif
                    rayAbsorption *= stepAbsorption;
                    volumetricLight += singleLight;
                    samplePos += stepSize;
                }
            }
        #endif

        float weatherData = reflectionData.w;
        solidColor.rgb += volumetricLight;

        weatherData = weatherData * 2.5 - 1.5;
        float weatherLightData = abs(weatherData);
        if (weatherLightData > 0.3) {
            float sunlightStrength = 2.0 * weatherLightData - 1.0;
            float basicSunlight = (1.0 - sqrt(weatherStrength)) * 8.0 * SUNLIGHT_BRIGHTNESS;
            vec3 weatherLight = sunlightStrength * basicSunlight * sunColor + skyColorUp * 1.5;
            float weatherBlendWeight = clamp(weatherData * 1e+10, 0.0, 1.0) * 0.8 + 0.2;
            solidColor.rgb = mix(solidColor.rgb, weatherLight, weatherBlendWeight);
        }
    #endif

    texBuffer3 = solidColor;
}

/* DRAWBUFFERS:3 */
