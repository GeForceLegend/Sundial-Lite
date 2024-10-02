#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer0;
layout(location = 1) out vec4 texBuffer3;

#ifdef SHADOW_AND_SKY
    in vec3 skyColorUp;
    in mat4 shadowModelViewProjection;
#else
    const vec3 skyColorUp = vec3(0.0);
#endif

in vec2 texcoord;

uniform vec3 viewShadowDirection;

#define PCSS
#define PCSS_SAMPLES 9 // [2 3 4 5 6 7 8 9 10 12 14 16 18 20 25 30 36]
#define SCREEN_SPACE_SHADOW

const int shadowMapResolution = 2048; // [1024 2048 4096 8192 16384]
const float realShadowMapResolution = shadowMapResolution * MC_SHADOW_QUALITY;
const float shadowDistance = 120.0; // [80.0 120.0 160.0 200.0 240.0 280.0 320.0 360.0 400.0 480.0 560.0 640.0]

#include "/settings/CloudSettings.glsl"
#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/Atmosphere.glsl"
#include "/libs/Cloud.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Shadow.glsl"

#ifdef SHADOW_AND_SKY
    vec3 shadowSpaceSurfaceOffset(vec3 worldOffsetDir) {
        vec3 offset = mat3(shadowModelViewProjection) * worldOffsetDir;
        offset *= inversesqrt(max(1e-5, dot(offset.xy, offset.xy)));
        offset *= clamp(inversesqrt(dot(offset, offset)) * 3.333333, 0.0, 1.0) * 400.0 / shadowDistance / realShadowMapResolution;
        offset.z *= 0.25;
        return offset;
    }

    vec3 percentageCloserSoftShadow(
        vec3 albedo, vec3 worldPos, vec3 worldGeoNormal, float NdotL, float lightFactor, float smoothness, float porosity, float skyLight, vec2 noise
    ) {
        vec3 result = vec3(0.0);
        if (weatherStrength < 0.999) {
            vec3 sssShadowCoord = worldPosToShadowCoordNoBias(worldPos);
            float normalOffsetLen = (dot(worldPos, worldPos) * 4e-5 + 2e-2) * (1.0 + sqrt(1.0 - NdotL));
            vec3 normalOffset = mat3(shadowModelViewProjection) * (worldGeoNormal * normalOffsetLen * 4096.0 / realShadowMapResolution);
            normalOffset.z *= 0.1;

            vec3 basicShadowCoordNoBias = sssShadowCoord + normalOffset;
            float distortFactor = 1.0 - SHADOW_BIAS + length(basicShadowCoordNoBias.xy) * SHADOW_BIAS;
            vec3 basicShadowCoord = basicShadowCoordNoBias;
            basicShadowCoord.st = basicShadowCoord.st * 0.25 / distortFactor + 0.75;

            float normalFactor = clamp(pow(NdotL, pow2(1.0 - smoothness * 0.3)), 0.0, 1.0);
            float basicSunlight = 8.0 * SUNLIGHT_BRIGHTNESS - 8.0 * SUNLIGHT_BRIGHTNESS * sqrt(weatherStrength);
            NdotL = clamp(NdotL * 5.0, 0.0, 1.0);
            result = vec3(basicSunlight * smoothstep(0.8, 0.9, skyLight) * mix(normalFactor, 1.0 - NdotL + NdotL * normalFactor, step(64.5 / 255.0, porosity)));
            if (all(lessThan(abs(basicShadowCoord - vec3(vec2(0.75), 0.5)), vec3(vec2(0.249), 0.5)))) {
                vec3 offsetDirection1 = cross(worldGeoNormal, shadowDirection);
                vec3 offsetDirection2 = cross(worldGeoNormal, offsetDirection1);
                offsetDirection1 = shadowSpaceSurfaceOffset(offsetDirection1);
                offsetDirection2 = shadowSpaceSurfaceOffset(offsetDirection2);
                basicShadowCoordNoBias.z -= 2e-5;

                float avgOcclusionDepth = 0.0;
                float depthSum = 0.0;
                float depthSampleRadius = 0.5 + noise.y;
                float offsetX = -1.0;
                for (int i = -1; i <= 1; i++) {
                    float offsetY = -1.0;
                    for (int j = -1; j <= 1; j++) {
                        vec3 sampleCoord = biaShadowCoord(basicShadowCoordNoBias + depthSampleRadius * (offsetX * offsetDirection1 + offsetY * offsetDirection2));
                        float sampleDepth = textureLod(shadowtex1, sampleCoord.st, 1.0).r;
                        depthSum += sampleDepth;
                        avgOcclusionDepth += clamp(sampleCoord.z - sampleDepth, 0.0, 1.0);
                        offsetY += 1.0;
                    }
                    offsetX += 1.0;
                }
                if (depthSum < 8.9999) {
                    float filterRadius = min(avgOcclusionDepth * 40.0 / 9.0, 2.0) + distortFactor * 2.4 * shadowDistance / 120.0;

                    vec3 waterShadowCoord = basicShadowCoord - vec3(0.0, 0.5, 0.0);
                    vec3 caustic = waterCaustic(waterShadowCoord, worldPos, shadowDirection, 1.0);
                    result = caustic * (lightFactor * basicSunlight);

                    const mat2 rotation = mat2(cos(2.39996323), sin(2.39996323), -sin(2.39996323), cos(2.39996323));
                    noise.x *= PI * 2.0;
                    vec2 sampleAngle = vec2(cos(noise.x), sin(noise.x)) * filterRadius;
                    float sampleRadius = noise.y * 1.0 / PCSS_SAMPLES + 1e-6;
                    bool needSubsurfaceScattering = porosity > 64.5 / 255.0;

                    float sssRadius = 1.0 + 1.0 / filterRadius;
                    float transparentShadow = 1e-6;
                    vec4 transparentShadowColor = vec4(0.0, 0.0, 0.0, 1e-6);
                    float opticalDepth = 0.0;
                    float solidShadow = 0.0;
                    for (int i = 0; i < PCSS_SAMPLES; i++) {
                        vec2 sampleRotation = sampleRadius * inversesqrt(sampleRadius) * sampleAngle;
                        vec3 sampleOffset = sampleRotation.x * offsetDirection1 + sampleRotation.y * offsetDirection2;
                        vec3 sampleShadowCoord = biaShadowCoord(basicShadowCoordNoBias + sampleOffset);
                        if (normalFactor > 1e-5) {
                            float sampleSolidShadow = textureLod(shadowtex0, sampleShadowCoord, 0.0);
                            solidShadow += sampleSolidShadow;
                        }

                        if (needSubsurfaceScattering) {
                            vec3 sssSampleCoord = biaShadowCoord(sssShadowCoord + vec3(sampleOffset.st * sssRadius, 0.0));
                            float shadowDepth = textureLod(shadowtex1, sssSampleCoord.st, 1.0).r;
                            opticalDepth += clamp(sssSampleCoord.z - shadowDepth + 1e-4, 0.0, 1.0);
                        }

                        sampleAngle = rotation * sampleAngle;
                        sampleRadius += 1.0 / PCSS_SAMPLES;
                        #ifdef TRANSPARENT_SHADOW
                            sampleShadowCoord.x -= 0.5;
                            float sampleTransparentShadow = textureLod(shadowtex0, sampleShadowCoord, 0.0);
                            if (sampleTransparentShadow < 1.0) {
                                sampleTransparentShadow = 1.0 - sampleTransparentShadow;
                                vec4 sampleTransparentColor = textureLod(shadowcolor0, sampleShadowCoord.st, 1.0);
                                transparentShadow += sampleTransparentShadow;
                                transparentShadowColor += sampleTransparentColor * sampleTransparentShadow;
                            }
                        #endif
                    }
                    solidShadow /= PCSS_SAMPLES;
                    float subsurfaceScattering = float(0.0);
                    if (needSubsurfaceScattering && SUBSERFACE_SCATTERING_STRENTGH > 0.0) {
                        const float absorptionScale = SUBSERFACE_SCATTERING_STRENTGH / (191.0);
                        float absorptionBeta = -4e+3 * 0.5 * 1.44269502 / max(porosity * absorptionScale * 255.0 - absorptionScale * 64.0, 1e-5) * opticalDepth / PCSS_SAMPLES;
                        subsurfaceScattering = exp2(absorptionBeta);
                    }
                    result *= solidShadow * normalFactor + subsurfaceScattering * (1.0 - solidShadow * NdotL);

                    #ifdef TRANSPARENT_SHADOW
                        transparentShadowColor /= transparentShadow;
                        transparentShadow /= PCSS_SAMPLES;
                        transparentShadowColor.rgb = pow(
                            transparentShadowColor.rgb * (1.0 - 0.5 * pow2(transparentShadowColor.w)),
                            vec3(sqrt(transparentShadowColor.w * 2.2 * 2.2 * 1.5))
                        );
                        result *= mix(vec3(1.0), transparentShadowColor.rgb, vec3(transparentShadow));
                    #endif
                }
            }
        }
        return result;
    }

    // Simplified from NVIDIA's compiler implementation
    // Consider value as always positive
    float atanSimple(float x) {
        float a = max(1.0, x);
        float b = min(1.0, x);
        if (a >= 16.0) {
            a *= 0.0625;
            b *= 0.0625;
        }
        a = b / a;
        b = a * a;
        float c = b + 11.3353882;
        float d = b * -0.823362947 + -5.67486715;
        c = b * c + 28.8424683;
        d = d * b - 6.5655551;
        c = b * c + 19.6966705;
        b *= d;
        b *= a;
        d = 1.0 / c;
        b = b * d + a;
        if (x > 1.0) {
            b = 1.57079637 - b;
        }
        return b;
    }

    float screenSpaceShadow(vec3 viewPos, vec3 viewDir, vec3 viewNormal, vec3 viewGeoNormal, vec3 lightDir, float porosity, vec2 noise, float depth) {
        float fov = 2.0 * atanSimple(1.0 / gbufferProjection[1][1]) * 180.0 / 3.14159265;
        float viewLength = length(viewPos);
        float screenScale = max(texelSize.x, texelSize.y);

        vec3 rayPos = viewPos;
        float stepLength = (2e-5 * viewLength + 5e-5) * fov;
        vec3 rayDir = stepLength * lightDir;
        vec3 originOffset = 
            (4e2 * screenScale / max(dot(viewGeoNormal, -viewDir), 0.1) + noise.x * 3.0) * rayDir +
            (0.1 * viewLength * screenScale / max(pow2(dot(viewGeoNormal, lightDir)), 0.01)) * viewGeoNormal;
        #ifdef DISTANT_HORIZONS
            originOffset *= 0.1 + 0.9 * float(depth > 0.0);
        #endif
        rayPos += originOffset;
        vec3 finalPos = rayPos + rayDir * 25.2;

        vec4 projRayPos = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * rayPos, -rayPos.z);
        vec4 finalProjPos = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * finalPos, -finalPos.z);
        vec4 projRayDir = (finalProjPos - projRayPos) / 25.2;
        projRayPos.xyz += gbufferProjection[3].xyz;

        float shadow = 1.0;
        float stepScale = 1.0;
        float NdotL = dot(viewNormal, lightDir);
        float porosityScale = (1.0 - clamp(porosity - 0.25, 0.0, 1.0));
        const float absorptionScale = SUBSERFACE_SCATTERING_STRENTGH / (191.0);
        float absorptionBeta = -0.5 / max(porosity * absorptionScale * 255.0 - absorptionScale * 64.0, 1e-5);
        rayDir *= porosityScale;
        float absorption = exp2(absorptionBeta * porosityScale * stepLength * 20.0) * step(0.25, porosity) * (1.0 - clamp(NdotL * 10.0, 0.0, 1.0) * porosityScale);

        float maximumThickness = 0.025 + 0.0125 * viewLength;
        float shadowWeight = clamp(-NdotL * 10.0, 0.0, 1.0) * clamp(1.0 - viewLength / shadowDistance, 0.0, 1.0);

        vec2 offset = vec2(0.5);
        #ifdef TAA
            offset += taaOffset * 0.5;
        #endif
        projRayPos.xyz *= 0.5;
        projRayDir.xyz *= 0.5;
        for (int i = 0; i < 12; i++) {
            projRayPos += projRayDir * stepScale;
            vec3 sampleCoord = projRayPos.xyz / projRayPos.w;

            if (any(greaterThan(abs(sampleCoord.xy), vec2(0.5))) || shadow < 0.01) {
                break;
            }

            stepScale += 0.2;
            sampleCoord.st += offset;
            float sampleDepth = textureLod(depthtex1, sampleCoord.st, 0.0).r;
            float sampleparallaxOffset = textureLod(colortex3, sampleCoord.st, 0.0).w;
            float sampleViewDepth;
            #ifdef DISTANT_HORIZONS
                if (sampleDepth == 1.0) {
                    sampleDepth = textureLod(dhDepthTex0, sampleCoord.st, 0.0).r;
                    sampleViewDepth = screenToViewDepthDH(sampleDepth);
                } else
            #endif
            {
                sampleViewDepth = screenToViewDepth(sampleDepth);
            }
            float depthDiff = projRayPos.w - sampleViewDepth - sampleparallaxOffset;

            if (abs(depthDiff - maximumThickness) < maximumThickness) {
                shadow *= absorption;
            }
        }

        shadow = mix(shadow, 1.0, shadowWeight);

        return shadow;
    }

    vec3 renderSun(vec3 rayDir, vec3 lightDir, vec3 sunLight) {
        //http://www.physics.hmc.edu/faculty/esin/a101/limbdarkening.pdf
        float cosAngle = clamp(dot(rayDir, lightDir), 0.0, 1.0);
        const vec3 u = vec3(1.0, 1.0, 1.0);
        const vec3 a = vec3(0.397, 0.503, 0.652);
        float theta = acos(cosAngle);
        float centerToEdge = (theta / sunRadius);

        vec3 sun = vec3(0.0);
        if (theta < sunRadius) {
            vec3 light = sunLight;
            float mu = 1.0 - centerToEdge * centerToEdge;
            vec3 factor = vec3(1.0) - u * (vec3(1.0) - pow(vec3(mu), a * 0.5));

            sun = light * factor;
        }
        return sun;
    }
#endif

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    GbufferData gbufferData = getGbufferData(texel, texcoord);
    vec3 viewPos;
    #ifdef DISTANT_HORIZONS
        if (gbufferData.depth == 1.0) {
            gbufferData.depth = textureLod(dhDepthTex0, texcoord, 0.0).r;
            viewPos = screenToViewPosDH(texcoord, gbufferData.depth);
            gbufferData.depth = -gbufferData.depth;
        } else
    #endif
    {
        viewPos = screenToViewPos(texcoord, gbufferData.depth);
    }
    vec3 worldPosNoPOM = viewToWorldPos(viewPos);
    vec3 worldDir = normalize(worldPosNoPOM - gbufferModelViewInverse[3].xyz);

    vec4 finalColor = vec4(0.0);
    texBuffer0 = vec4(texelFetch(colortex0, texel, 0).rgb, texelFetch(colortex4, texel, 0).w);

    if (abs(gbufferData.depth) < 1.0) {
        vec3 viewDir = normalize(viewPos);
        viewPos += PARALLAX_DEPTH * gbufferData.parallaxOffset * viewPos / max(dot(viewPos, -gbufferData.geoNormal), 1e-5) * 0.2;
        vec3 worldPos = viewToWorldPos(viewPos);
        vec3 worldNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.normal);
        vec3 worldGeoNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.geoNormal);

        float diffuseWeight = pow(1.0 - gbufferData.smoothness, 5.0);
        vec3 n = vec3(1.5);
        vec3 k = vec3(0.0);
        #ifdef LABPBR_F0
            n = mix(n, vec3(f0ToIor(gbufferData.metalness)), step(0.001, gbufferData.metalness));
            hardcodedMetal(gbufferData.metalness, n, k);
            gbufferData.metalness = step(229.5 / 255.0, gbufferData.metalness);
        #endif
        #ifndef FULL_REFLECTION
            diffuseWeight = 1.0 - (1.0 - diffuseWeight) * sqrt(clamp(gbufferData.smoothness - (1.0 - gbufferData.smoothness) * (1.0 - 0.6666 * gbufferData.metalness), 0.0, 1.0));
        #endif
        finalColor.rgb = vec3(BASIC_LIGHT + NIGHT_VISION_BRIGHTNESS * nightVision);
        finalColor.rgb += pow(gbufferData.lightmap.x, 4.4) * lightColor;
        #ifdef SHADOW_AND_SKY
            finalColor.rgb += pow(gbufferData.lightmap.y, 2.2) * (skyColorUp + sunColor) * (worldNormal.y * 0.4 + 0.6);
        #endif
        float NdotV = clamp(dot(viewDir, -gbufferData.geoNormal), 0.0, 1.0);
        vec3 diffuseAbsorption = (1.0 - gbufferData.metalness) * diffuseAbsorptionWeight(NdotV, gbufferData.smoothness, gbufferData.metalness, n, k);
        finalColor.rgb *= diffuseAbsorption + diffuseWeight / PI;
        finalColor.rgb += gbufferData.emissive *  BLOCK_LIGHT_BRIGHTNESS;
        finalColor.rgb *= gbufferData.albedo.rgb;

        #ifdef SHADOW_AND_SKY
            vec3 shadow = sunColor;
            float shadowLightFactor = 1.0;
            float NdotL = clamp(dot(worldNormal, shadowDirection), 0.0, 1.0);
            #ifdef LIGHT_LEAKING_FIX
                shadowLightFactor = clamp(gbufferData.lightmap.y * 10.0 + float(isEyeInWater != 0), 0.0, 1.0);
            #endif
            shadow *=
                gbufferData.albedo.rgb * diffuseAbsorption +
                sunlightSpecular(
                    worldDir, shadowDirection, worldNormal, gbufferData.albedo.rgb, gbufferData.smoothness * 0.995,
                    gbufferData.metalness, NdotL, NdotV, n, k
                );
            vec2 noise = blueNoiseTemporal(texcoord).xy;
            #ifdef SCREEN_SPACE_SHADOW
                shadow *= screenSpaceShadow(viewPos, viewDir, gbufferData.normal, gbufferData.geoNormal, viewShadowDirection, gbufferData.porosity, noise, gbufferData.depth);
            #endif
            #ifdef CLOUD_SHADOW
                shadow *= cloudShadow(worldPos, shadowDirection);
            #endif
            #ifdef PCSS
                shadow *= percentageCloserSoftShadow(
                    gbufferData.albedo.rgb, worldPosNoPOM, worldGeoNormal, NdotL, shadowLightFactor,
                    gbufferData.smoothness, gbufferData.porosity, gbufferData.lightmap.y, noise
                );
            #else
                shadow *= singleSampleShadow(
                    gbufferData.albedo.rgb, worldPosNoPOM, worldGeoNormal, NdotL, shadowLightFactor,
                    gbufferData.smoothness, gbufferData.porosity, gbufferData.lightmap.y, 0.0
                );
            #endif
            finalColor.rgb += shadow;
        #endif
    }
    #ifdef SHADOW_AND_SKY
        else {
            finalColor.rgb = renderSun(worldDir, sunDirection, vec3(300.0)) + gbufferData.albedo.rgb * 2.0;
        }
    #endif

    texBuffer3 = finalColor;
}

/* DRAWBUFFERS:03 */
