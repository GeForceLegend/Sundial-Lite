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
//  General Public License v3.0. Copyright (C) 2026 GeForceLegend.
//  https://github.com/GeForceLegend/Sundial-Lite
//  https://www.gnu.org/licenses/gpl-3.0.en.html
//
//  Sky and cloud
//

#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer3;

in vec2 texcoord;

#define REFRACTION_STRENGTH 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
#define REFRACTION_EDGE_FADE 0.5 // [0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]

#include "/settings/CloudSettings.glsl"
#include "/settings/GlobalSettings.glsl"

#ifdef SHADOW_AND_SKY
    in vec3 skyColorUp;
#elif defined END_FLASH
    const vec3 skyColorUp = END_FOG_BRIGHTNESS * 0.1 * vec3(0.5, 0.2, 0.8);
#else
    const vec3 skyColorUp = vec3(0.0);
#endif

#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/Atmosphere.glsl"
#include "/libs/Cloud.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Shadow.glsl"

#ifdef THE_END
    #include "/libs/Galaxy.glsl"
#endif

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);

    float solidDepth = texelFetch(depthtex1, texel, 0).r;
    vec3 viewPos;
    #ifdef LOD
        if (depth == 1.0) {
            depth = getLodDepthSolid(texcoord);
            viewPos = screenToViewPosLod(texcoord, depth);
            solidDepth = -solidDepth;
        } else
    #endif
    {
        viewPos = screenToViewPos(texcoord, solidDepth);
    }
    vec3 worldPos = mat3(gbufferModelViewInverse) * viewPos;
    float worldDepth = inversesqrt(dot(worldPos, worldPos));
    vec3 worldDir = worldPos * worldDepth;
    vec4 intersectionData = planetIntersectionData(gbufferModelViewInverse[3].xyz, worldDir);

    vec4 solidColor = vec4(texelFetch(colortex3, texel, 0).rgb, 1.0);

    #ifdef SHADOW_AND_SKY
        float backDepth;
        vec3 backColor;
        vec4 planeCloud = vec4(0.0);
        if (abs(solidDepth) < 0.999999) {
            backDepth = 1.0 / worldDepth;
            backColor = solidColor.rgb;
        }
        else {
            backDepth = 0.0;
            solidColor.rgb = singleAtmosphereScattering(solidColor.rgb, gbufferModelViewInverse[3].xyz, worldDir, sunDirection, intersectionData, skyColorUp, (30.0), backColor);
            #ifdef PLANE_CLOUD
                planeCloud = planeClouds(gbufferModelViewInverse[3].xyz, worldDir, sunDirection, skyColorUp, intersectionData.xyz);
            #endif
            if (gbufferModelViewInverse[3].y + cameraPosition.y + WORLD_BASIC_HEIGHT - 500.0 < PLANE_CLOUD_HEIGHT) {
                solidColor.rgb = mix(solidColor.rgb, planeCloud.rgb, planeCloud.a);
                planeCloud.a = 0.0;
            }
        }
        float cloudDepth;
        solidColor.rgb = sampleClouds(
            solidColor.rgb, backColor, gbufferModelViewInverse[3].xyz, worldDir, shadowDirection, sunDirection, skyColorUp, intersectionData.xyz, backDepth, cloudDepth
        );

        solidColor.rgb = mix(solidColor.rgb, planeCloud.rgb, planeCloud.a);
    #endif

    GbufferData gbufferData = getGbufferData(texel, texcoord);
    float waterDepth = textureLod(depthtex0, texcoord, 0.0).r;
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

    float worldDistanceInv = inversesqrt(dot(worldPos, worldPos));
    vec3 waterWorldDir = worldPos * worldDistanceInv;

    float waterViewDepthNoLimit = length(waterViewPos);
    if (waterViewPos.z > viewPos.z) {
        solidDepth = float(solidDepth < 0.0) * (1.0 - 2.0 * solidDepth);
        #ifdef SHADOW_AND_SKY
            if (cloudDepth > -0.5) {
                float waterViewDepth = length(waterViewPos);
                float depthDiff = waterViewDepth - cloudDepth;
                if (depthDiff > 0.0) {
                    #if CLOUD_TYPE == 1
                        float minimumDensity = exp(-depthDiff * depthDiff * cloudNoiseScale * cloudNoiseScale * 500.0);
                    #elif CLOUD_TYPE == 2
                        float minimumDensity = exp(-depthDiff * CLOUD_REALISTIC_SAMPLE_DENSITY);
                    #else
                        float minimumDensity = 1.0;
                    #endif
                    solidColor.w = max(1.0 - solidColor.w, minimumDensity);
                }
            }
        #endif

        bool isTargetWater = gbufferData.materialID == MAT_WATER;
        bool isTargetNotParticle = gbufferData.materialID != MAT_PARTICLE;
        vec3 worldNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.normal);
        float LdotH = clamp(dot(-worldNormal, waterWorldDir), 0.0, 1.0);
        vec3 stainedColor = vec3(0.0);
        if (isTargetNotParticle) {
            stainedColor += gbufferData.smoothness * gbufferData.smoothness;
            float refractionStrength = REFRACTION_STRENGTH * 4e-2 * (1.0 - waterViewDepthNoLimit * worldDistanceInv) * (1.0 + float(isTargetWater));

            float roughness = 1.0 - gbufferData.smoothness;
            vec2 blueNoise = textureLod(noisetex, texcoord * screenSize / 64.0, 0.0).xy;
            vec2 randomOffset = vec2(cos(blueNoise.x * 2.0 * PI), sin(blueNoise.x * 2.0 * PI)) * blueNoise.y;
            float k = sqrt(1.5 * 1.5 - (1.0 - LdotH * LdotH));
            vec3 viewDir = viewPos * worldDistanceInv;
            vec3 refractDirection = normalize(
                viewDir - (LdotH + k) * gbufferData.normal +
                (dot(-gbufferData.geoNormal, viewDir) + k) * gbufferData.geoNormal * float(isTargetWater) // Get this idea from zombye/spectrum, MIT Licence
            );
            vec2 refractionOffset = (refractDirection.xy - viewPos.xy / viewPos.z * refractDirection.z + roughness * randomOffset) * refractionStrength * screenEdge;
            refractionOffset.x *= screenSize.y * texelSize.x;
            vec2 screenEdgeIntersection = mix(texcoord, screenEdge - texcoord, clamp(refractionOffset * 1e+20, 0.0, 1.0)) / abs(refractionOffset);
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
                solidColor.rgb = texelFetch(colortex3, ivec2(refractionTarget * screenSize), 0).rgb;
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
        vec3 f0 = vec3(0.04 - 0.02 * float(isTargetWater));
        #ifdef LABPBR_F0
            f0 = mix(f0, vec3(gbufferData.metalness) , step(0.001, gbufferData.metalness));
            gbufferData.metalness = step(229.5 / 255.0, gbufferData.metalness);
        #endif
        f0 = mix(f0, gbufferData.albedo.rgb, gbufferData.metalness);
        #ifdef LOD
            solidDepth -= float(solidDepth > 1.0);
        #endif
        waterDistance = mix(waterDistance, 114514.0, step(0.999999, solidDepth));
        if (isEyeInWater == 1 ^^ isTargetWater) {
            solidColor.rgb = waterFogTotal(solidColor.rgb, worldDir, skyColorUp, waterDistance, gbufferData.lightmap.y);
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
                if (solidDepth > 0.999999) {
                    solidColor.rgb += endStars(worldDir);
                    #ifdef END_FLASH
                        solidColor.rgb += endFlashDisc(worldDir, shadowDirection, vec3(300.0));
                    #endif
                }
            #else
                #if defined ATMOSPHERE_SCATTERING_FOG && defined SHADOW_AND_SKY
                    float isSky = step(0.999999, solidDepth);
                    float skyLight = clamp(gbufferData.lightmap.y + isSky, 0.0, 1.0);
                    float atmosphereDepth = mix(waterDistance * (1.0 + RF_GROUND_EXTRA_DENSITY * 3.0 * weatherStrength), 1600.0, isSky);
                    solidColor.rgb = solidAtmosphereScattering(solidColor.rgb, worldDir, skyColorUp, atmosphereDepth, skyLight);
                #endif
                solidColor.rgb *= airAbsorption(waterDistance);
            #endif
            f0 -= 0.04 * float(isTargetWater);
        }
        float waterStain = 1.0;
        #if WATER_TYPE == 0
            waterStain = float(!isTargetWater);
        #endif
        stainedColor *= log2(1.0 - fresnel(LdotH, f0));
        stainedColor += sqrt(gbufferData.albedo.w * 1.5) * log2(clamp(gbufferData.albedo.rgb + 1e-5, 0.0, 1.0) * (1.0 - 0.5 * gbufferData.albedo.w * gbufferData.albedo.w)) * waterStain;
        stainedColor = exp2(stainedColor);

        stainedColor = mix(vec3(1.0), stainedColor, vec3(solidColor.w));
        solidColor.rgb = mix(rawSolidColor, solidColor.rgb, vec3(solidColor.w)) * stainedColor;

        float isTargetParticle = 1.0 - float(isTargetNotParticle);
        vec3 vanillaLight = vec3(0.0);
        #ifdef SHADOW_AND_SKY
            vanillaLight +=
                pow2(1.0 / (0.75 - 0.75 * 0.75 / (1.0 + 0.75) * gbufferData.lightmap.y) - 1.0 / 0.75) *
                (skyColorUp * 0.8 + sunColor * 2.0 * SUNLIGHT_BRIGHTNESS * (1.0 - (0.75 + 0.25 * float(CLOUD_TYPE != 2)) * weatherStrength)) *
                (1.0 - gbufferData.metalness) * (1.0 - 0.75 * (1.0 - exp2(-RF_DENSITY * 4.0)) * weatherStrength);
        #endif
        #ifdef IS_IRIS
            float eyeRelatedDistance = length(waterWorldPos + relativeEyePosition);
            gbufferData.lightmap.x = max(gbufferData.lightmap.x, heldBlockLightValue / 15.0 * clamp(1.0 - eyeRelatedDistance / 15.0, 0.0, 1.0));
        #endif
        const float fadeFactor = VANILLA_BLOCK_LIGHT_FADE;
        vec3 blockLight = pow2(1.0 / (fadeFactor - fadeFactor * fadeFactor / (1.0 + fadeFactor) * gbufferData.lightmap.x) - 1.0 / fadeFactor) * commonLightColor;
        vanillaLight += blockLight + BASIC_LIGHT;
        #ifdef MOD_NIGHT_VISION_COMPAT
            vanillaLight += pow(texelFetch(colortex5, ivec2(0), 0).rgb, vec3(2.2)) * NIGHT_VISION_BRIGHTNESS;
        #else
            vanillaLight += nightVision * NIGHT_VISION_BRIGHTNESS;
        #endif
        solidColor.rgb += gbufferData.albedo.rgb * gbufferData.albedo.w * (gbufferData.emissive * PBR_BRIGHTNESS * PI + vanillaLight * isTargetParticle);
        #if defined SHADOW_AND_SKY || defined END_FLASH
            float NdotL = clamp(dot(worldNormal, shadowDirection) + isTargetParticle, 0.0, 1.0);
            if (NdotL > 0.0) {
                vec3 shadow = vec3(1.0);
                vec3 subsurfaceScattering = vec3(float(gbufferData.porosity > 64.5 / 255.0));
                singleSampleShadow(
                    waterWorldPos, mat3(gbufferModelViewInverse) * gbufferData.geoNormal, NdotL, gbufferData.smoothness,
                    gbufferData.porosity, gbufferData.lightmap.y, shadow, subsurfaceScattering
                );
                shadow *= (1.0 - gbufferData.metalness) * gbufferData.albedo.rgb * gbufferData.albedo.w * isTargetParticle + sunlightSpecular(
                    waterWorldDir, shadowDirection, worldNormal, gbufferData.smoothness * 0.995, NdotL, LdotH, f0, vec3(1.0)
                ) * airAbsorption(11.4 * gbufferData.smoothness) * clamp(19.0 - gbufferData.smoothness * 20.0, 0.0, 1.0);
                shadow += subsurfaceScattering * (1.0 - gbufferData.metalness) * gbufferData.albedo.rgb * gbufferData.albedo.w * isTargetParticle;
                #ifdef SHADOW_AND_SKY
                    #ifdef CLOUD_SHADOW
                        shadow *= cloudShadow(waterWorldPos, shadowDirection);
                    #endif
                    shadow *= sunColor;
                #elif defined END_FLASH
                    shadow *= endFlashIntensity * vec3(0.5, 0.2, 0.8);
                #else
                    shadow = vec3(0.0);
                #endif
                solidColor.rgb += shadow * basicSunlight;
            }
        #endif
    }

    texBuffer3 = solidColor;
}

/* DRAWBUFFERS:3 */
