#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer3;

in vec2 texcoord;

#define REFRACTION_STRENGTH 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]

const int shadowMapResolution = 2048; // [1024 2048 4096 8192 16384]
const float realShadowMapResolution = shadowMapResolution * MC_SHADOW_QUALITY;
const float shadowDistance = 120.0; // [80.0 120.0 160.0 200.0 240.0 280.0 320.0 360.0 400.0 480.0 560.0 640.0]

#include "/settings/CloudSettings.glsl"
#include "/settings/GlobalSettings.glsl"
#include "/settings/VolumetricLightSettings.glsl"

#ifdef SHADOW_AND_SKY
    in vec3 skyColorUp;
    in mat4 shadowModelViewProjection;
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
    #ifdef DISTANT_HORIZONS
        if (solidDepth == 1.0) {
            solidDepth = textureLod(dhDepthTex1, texcoord, 0.0).r;
            viewPos = screenToViewPosDH(texcoord, solidDepth);
            solidDepth += 1.0;
        } else
    #endif
    {
        viewPos = screenToViewPos(texcoord, solidDepth);
    }
    vec3 waterViewPos;
    #ifdef DISTANT_HORIZONS
        if (waterDepth == 1.0) {
            waterDepth = textureLod(dhDepthTex0, texcoord, 0.0).r;
            waterViewPos = screenToViewPosDH(texcoord, waterDepth);
            waterDepth += 1.0;
        } else
    #endif
    {
        waterViewPos = screenToViewPos(texcoord, waterDepth);
    }
    vec3 worldPos = viewToWorldPos(viewPos);
    vec3 waterWorldDir = normalize(worldPos - gbufferModelViewInverse[3].xyz);

    float waterViewDepthNoLimit = length(waterViewPos);

    /********************************************************** Water Refraction **********************************************************/

    float n = 1.5;
    if (waterDepth < solidDepth) {
        vec3 worldDir = waterWorldDir;
        bool isTargetWater = gbufferData.materialID == MAT_WATER;
        bool isTargetNotParticle = gbufferData.materialID != MAT_PARTICLE;
        if (isTargetNotParticle) {
            float solidViewDepth = length(viewPos);
            float refractionStrength = (REFRACTION_STRENGTH * 2e-2 * clamp((solidViewDepth - waterViewDepthNoLimit) / (waterViewDepthNoLimit + 1.0), 0.0, 1.0));

            float roughness = 1.0 - gbufferData.smoothness;
            vec2 blueNoise = textureLod(noisetex, texcoord * screenSize / 64.0, 0.0).xy;
            vec2 randomOffset = vec2(cos(blueNoise.x * 2.0 * PI), sin(blueNoise.x * 2.0 * PI)) * blueNoise.y;
            vec2 refractionOffset = (gbufferData.normal.xy + roughness * randomOffset) * refractionStrength;

            vec2 refractionTarget = texcoord - refractionOffset;
            float targetSolidDepth = textureLod(depthtex1, refractionTarget, 0.0).r;
            #ifdef DISTANT_HORIZONS
                targetSolidDepth += float(targetSolidDepth == 1.0) * textureLod(dhDepthTex1, refractionTarget, 0.0).r;
            #endif
            if (waterDepth < targetSolidDepth) {
                solidDepth = targetSolidDepth;
                solidColor.rgb = textureLod(colortex3, refractionTarget, 0.0).rgb;
                vec3 viewPos;
                #ifdef DISTANT_HORIZONS
                    if (targetSolidDepth > 1.0) {
                        viewPos = screenToViewPosDH(refractionTarget, targetSolidDepth - 1.0);
                    } else
                #endif
                {
                    viewPos = screenToViewPos(refractionTarget, targetSolidDepth);
                }
                solidViewDepth = length(viewPos);
                worldPos = viewToWorldPos(viewPos);
                worldDir = normalize(worldPos - gbufferModelViewInverse[3].xyz);
            }
        }

        vec3 waterWorldPos = viewToWorldPos(waterViewPos);
        float waterDistance = distance(worldPos, waterWorldPos);
        vec3 stainedColor = vec3(0.0);
        vec3 rawSolidColor = solidColor.rgb;
        vec3 worldNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.normal);
        n -= 0.166666 * float(isTargetWater);
        n = mix(n, f0ToIor(gbufferData.metalness) , step(0.001, gbufferData.metalness));
        float LdotH = clamp(dot(worldNormal, -waterWorldDir), 0.0, 1.0);
        if (isTargetWater) {
            if (isEyeInWater == 1) {
                solidColor.rgb *= airAbsorption(waterDistance);
                #if defined ATMOSPHERE_SCATTERING_FOG && defined SHADOW_AND_SKY
                    solidColor.rgb = solidAtmosphereScattering(solidColor.rgb, worldDir, skyColorUp, waterDistance, gbufferData.lightmap.y);
                #endif
                n = 1.0 / n;
            }
            else {
                solidColor.rgb = waterFogTotal(solidColor.rgb, worldDir, skyColorUp, waterDistance, gbufferData.lightmap.y);
            }
            #if WATER_TYPE == 1
                stainedColor = sqrt(gbufferData.albedo.w * 1.5) * log2(gbufferData.albedo.rgb * (1.0 - 0.5 * gbufferData.albedo.w * gbufferData.albedo.w));
            #endif
            stainedColor += gbufferData.smoothness * gbufferData.smoothness * log2(1.0 - fresnel(LdotH, LdotH * LdotH, n));
        }
        else {
            if (isEyeInWater == 0) {
                #ifdef NETHER
                    solidColor.rgb = netherFogTotal(solidColor.rgb, waterDistance);
                #elif defined THE_END
                    solidColor.rgb = endFogTotal(solidColor.rgb, waterDistance);
                    if (solidDepth - float(solidDepth > 1.0) > 0.999999)
                        solidColor.rgb += endStars(worldDir);
                #else
                    solidColor.rgb *= airAbsorption(waterDistance);
                    #if defined ATMOSPHERE_SCATTERING_FOG && defined SHADOW_AND_SKY
                        solidColor.rgb = solidAtmosphereScattering(solidColor.rgb, worldDir, skyColorUp, waterDistance, gbufferData.lightmap.y);
                    #endif
                #endif
            }
            else if (isEyeInWater == 1) {
                solidColor.rgb = waterFogTotal(solidColor.rgb, waterWorldDir, skyColorUp, waterDistance, gbufferData.lightmap.y);
                n = n / 1.333333;
            }
            else if (isEyeInWater == 2) {
                solidColor.rgb = lavaFogTotal(solidColor.rgb, waterDistance);
            }
            else if (isEyeInWater == 3) {
                solidColor.rgb = snowFogTotal(solidColor.rgb, skyColorUp, waterDistance, gbufferData.lightmap.y);
            }
            stainedColor = sqrt(gbufferData.albedo.w * 1.5) * log2(gbufferData.albedo.rgb * (1.0 - 0.5 * gbufferData.albedo.w * gbufferData.albedo.w));
            if (isTargetNotParticle) {
                stainedColor += gbufferData.smoothness * gbufferData.smoothness * log2(1.0 - fresnel(LdotH, LdotH * LdotH, n));
            }
        }
        stainedColor = exp2(stainedColor);

        stainedColor = mix(vec3(1.0), stainedColor, vec3(solidColor.w));
        solidColor.rgb = mix(rawSolidColor, solidColor.rgb, vec3(solidColor.w)) * stainedColor;
        solidColor.rgb += gbufferData.albedo.rgb * gbufferData.emissive * BLOCK_LIGHT_BRIGHTNESS + texelFetch(colortex4, texel, 0).rgb * solidColor.w;
        #ifdef SHADOW_AND_SKY
            float NdotL = dot(worldNormal, shadowDirection);
            if (NdotL > 0.0) {
                float shadowLightFactor = 1.0;
                #ifdef LIGHT_LEAKING_FIX
                    shadowLightFactor = clamp(gbufferData.lightmap.y * 10.0, 0.0, 1.0);
                #endif
                vec3 shadow = singleSampleShadow(
                    gbufferData.albedo.rgb, waterWorldPos, mat3(gbufferModelViewInverse) * gbufferData.geoNormal, NdotL, shadowLightFactor,
                    gbufferData.smoothness, gbufferData.porosity, gbufferData.lightmap.y, 0.0
                );
                #ifdef CLOUD_SHADOW
                    shadow *= cloudShadow(waterWorldPos, shadowDirection);
                #endif
                shadow *= sunlightSpecular(
                    waterWorldDir, shadowDirection, worldNormal, gbufferData.albedo.rgb,
                    gbufferData.smoothness * 0.995, gbufferData.metalness, NdotL, LdotH, vec3(n), vec3(0.0)
                );
                shadow *= sunColor;
                solidColor.rgb += shadow;
            }
        #endif
    }

    vec3 intersectionData = planetIntersectionData(gbufferModelViewInverse[3].xyz, waterWorldDir);
    float waterViewDepthFar = mix(waterViewDepthNoLimit, 500.0 + 500.0 * float(intersectionData.z > 0.0), step(0.999999, waterDepth));
    if (isEyeInWater == 0) {
        #ifdef NETHER
            solidColor.rgb *= vec3(netherFogAbsorption(waterViewDepthFar));
            solidColor.rgb += netherFogScattering(waterViewDepthFar);
        #elif defined THE_END
            solidColor.rgb *= vec3(endFogAbsorption(waterViewDepthFar));
            solidColor.rgb += endFogScattering(waterViewDepthFar);
            if (waterDepth > 0.999999) {
                solidColor.rgb += endStars(waterWorldDir);
            }
        #else
            solidColor.rgb *= vec3(airAbsorption(waterViewDepthFar));
            #ifdef SHADOW_AND_SKY
                #ifdef ATMOSPHERE_SCATTERING_FOG
                    solidColor.rgb = solidAtmosphereScattering(solidColor.rgb, waterWorldDir, skyColorUp, waterViewDepthFar, eyeBrightnessSmooth.y / 240.0);
                #endif
            #endif
        #endif
    }
    else if (isEyeInWater == 1) {
        solidColor.rgb *= waterFogAbsorption(waterViewDepthNoLimit);
        solidColor.rgb += waterFogScattering(waterWorldDir, skyColorUp, waterViewDepthNoLimit, eyeBrightnessSmooth.y / 240.0);
    }
    else if (isEyeInWater == 2) {
        solidColor.rgb *= vec3(lavaFogAbsorption(waterViewDepthNoLimit));
        solidColor.rgb += lavaFogScattering(waterViewDepthNoLimit);
    }
    else if (isEyeInWater == 3) {
        solidColor.rgb *= vec3(snowFogAbsorption(waterViewDepthNoLimit));
        solidColor.rgb += snowFogScattering(skyColorUp, waterViewDepthNoLimit, eyeBrightnessSmooth.y / 240.0);
    }

    texBuffer3 = solidColor;
}

/* DRAWBUFFERS:3 */
