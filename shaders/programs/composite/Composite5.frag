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
#extension GL_ARB_shading_language_packing: enable

layout(location = 0) out vec4 texBuffer3;

in vec2 texcoord;

#define REFRACTION_STRENGTH 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
#define REFRACTION_EDGE_FADE 0.5 // [0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]

#include "/settings/CloudSettings.glsl"
#include "/settings/GlobalSettings.glsl"
#include "/settings/VolumetricLightSettings.glsl"

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
    vec3 reflectionColor = texelFetch(colortex4, texel, 0).rgb;
    if (waterDepth < solidDepth) {
        reflectionColor *= solidColor.w;
        vec3 worldDir = waterWorldDir;
        vec3 waterWorldPos = waterWorldDir * waterViewDepthNoLimit + gbufferModelViewInverse[3].xyz;
        bool isTargetWater = gbufferData.materialID == MAT_WATER;
        bool isTargetNotParticle = gbufferData.materialID != MAT_PARTICLE;
        vec3 worldNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.normal);
        vec3 worldGeoNormal = mat3(gbufferModelViewInverse) * gbufferData.geoNormal;
        float LdotH = clamp(dot(-worldNormal, waterWorldDir), 0.0, 1.0);
        vec3 stainedColor = vec3(0.0);
        if (isTargetNotParticle) {
            stainedColor += gbufferData.smoothness * gbufferData.smoothness;
            float refractionStrength = REFRACTION_STRENGTH * 4e-2 * clamp((1.0 - waterViewDepthNoLimit * worldDistanceInv) / (waterViewDepthNoLimit * worldDistanceInv + worldDistanceInv), 0.0, 1.0);

            float roughness = 1.0 - gbufferData.smoothness;
            vec2 blueNoise = textureLod(noisetex, texcoord * screenSize / 64.0, 0.0).xy;
            vec2 randomOffset = vec2(cos(blueNoise.x * 2.0 * PI), sin(blueNoise.x * 2.0 * PI)) * blueNoise.y;
            float k = sqrt(n * n - (1.0 - LdotH * LdotH));
            vec3 refractDirection = normalize(
                viewPos * worldDistanceInv - (LdotH + k) * gbufferData.normal +
                (dot(-worldGeoNormal, waterWorldDir) + k) * gbufferData.geoNormal * float(isTargetWater) // Get this idea from zombye/spectrum, MIT Licence
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
                worldDir = normalize(worldPos);
            }
        }

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
                float atmosphereDepth = mix(waterDistance * (1.0 + RF_GROUND_EXTRA_DENSITY * 3.0 * weatherStrength), 500.0 + 500.0 * float(intersectionData.z > 0.0), step(0.999999, solidDepth));
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
        vec3 vanillaLight = pow2(gbufferData.lightmap.y) * (skyColorUp + sunColor * SUNLIGHT_BRIGHTNESS) * (1.0 - gbufferData.metalness) * isTargetParticle;
        solidColor.rgb += gbufferData.albedo.rgb * gbufferData.albedo.w * (gbufferData.emissive * PBR_BRIGHTNESS * PI + vanillaLight);
        #ifdef SHADOW_AND_SKY
            float NdotL = clamp(dot(worldNormal, shadowDirection) + isTargetParticle, 0.0, 1.0);
            if (NdotL > 0.0) {
                float shadowLightFactor = 1.0;
                #ifdef LIGHT_LEAKING_FIX
                    shadowLightFactor = clamp(gbufferData.lightmap.y * 10.0, 0.0, 1.0);
                #endif
                vec3 shadow = singleSampleShadow(
                    waterWorldPos, mat3(gbufferModelViewInverse) * gbufferData.geoNormal, NdotL, shadowLightFactor,
                    gbufferData.smoothness, gbufferData.porosity, gbufferData.lightmap.y, 0.0
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
    solidColor.rgb += reflectionColor;

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
                    float atmosphereDepth = mix(waterViewDepthNoLimit * (1.0 + RF_GROUND_EXTRA_DENSITY * 3.0 * weatherStrength), 500.0 + 500.0 * float(intersectionData.z > 0.0), step(0.999999, waterDepth));
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

    solidColor.w = float(gbufferData.materialID == MAT_HAND);
    texBuffer3 = solidColor;
}

/* DRAWBUFFERS:3 */
