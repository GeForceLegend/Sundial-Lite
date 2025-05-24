#extension GL_ARB_gpu_shader5 : enable
#extension GL_ARB_shading_language_packing: enable

layout(location = 0) out vec4 texBuffer0;
layout(location = 1) out vec4 texBuffer3;

#ifdef SHADOW_AND_SKY
    in vec3 skyColorUp;
    in mat4 shadowModelViewProjection;
#else
    const vec3 skyColorUp = vec3(0.0);
#endif

in vec2 texcoord;

uniform vec4 projShadowDirection;

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
        vec3 worldPos, vec3 worldGeoNormal, float NdotL, float lightFactor, float smoothness, float porosity, float skyLight, vec2 noise
    ) {
        vec3 result = vec3(0.0);
        if (weatherStrength < 0.999) {
            vec3 sssShadowCoord = worldPosToShadowCoordNoBias(worldPos);
            float normalOffsetLen = (dot(worldPos, worldPos) * 4e-5 + 2e-2) * (1.0 + sqrt(1.0 - NdotL));
            vec3 normalOffset = mat3(shadowModelViewProjection) * (worldGeoNormal * normalOffsetLen * 4096.0 / realShadowMapResolution);
            normalOffset.z *= 0.1;

            vec3 basicShadowCoordNoBias = sssShadowCoord + normalOffset;
            float distortFactor = 1.0 - SHADOW_DISTORTION_STRENGTH + length(basicShadowCoordNoBias.xy) * SHADOW_DISTORTION_STRENGTH;
            vec3 basicShadowCoord = basicShadowCoordNoBias;
            basicShadowCoord.st = basicShadowCoord.st * 0.25 / distortFactor + 0.75;

            float normalFactor = clamp(pow(NdotL, pow2(1.0 - smoothness * 0.3)), 0.0, 1.0);
            float basicSunlight = 8.0 * SUNLIGHT_BRIGHTNESS - 8.0 * SUNLIGHT_BRIGHTNESS * sqrt(weatherStrength);
            NdotL = abs(dot(worldGeoNormal, shadowDirection));
            NdotL = NdotL + (1.0 - NdotL) * clamp(porosity * 255.0 / 191.0 - 64.0 / 191.0, 0.0, 1.0);
            result = vec3(basicSunlight * smoothstep(0.8, 0.9, skyLight) * (normalFactor + (1.0 - normalFactor) * NdotL * step(64.5 / 255.0, porosity)));
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
                        vec3 sampleCoord = distortShadowCoord(basicShadowCoordNoBias + depthSampleRadius * (offsetX * offsetDirection1 + offsetY * offsetDirection2));
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
                        vec3 sampleShadowCoord = distortShadowCoord(basicShadowCoordNoBias + sampleOffset);
                        if (normalFactor > 1e-5) {
                            float sampleSolidShadow = textureLod(shadowtex0, sampleShadowCoord, 0.0);
                            solidShadow += sampleSolidShadow;
                        }

                        if (needSubsurfaceScattering) {
                            vec3 sssSampleCoord = distortShadowCoord(sssShadowCoord + vec3(sampleOffset.st * sssRadius, 0.0));
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
                    solidShadow *= normalFactor / PCSS_SAMPLES;
                    float subsurfaceScattering = float(0.0);
                    if (needSubsurfaceScattering && SUBSERFACE_SCATTERING_STRENTGH > 0.0) {
                        const float absorptionScale = SUBSERFACE_SCATTERING_STRENTGH / (191.0);
                        float absorptionBeta = -4e+3 * 0.5 * 1.44269502 / max(porosity * absorptionScale * 255.0 - absorptionScale * 64.0, 1e-5) * opticalDepth / PCSS_SAMPLES;
                        subsurfaceScattering = exp2(absorptionBeta) * (1.0 - solidShadow) * NdotL;
                    }
                    result *= solidShadow + subsurfaceScattering;

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

    float screenSpaceShadow(vec3 viewPos, float NdotL, float viewLength, float porosity, vec2 noise, float materialID) {
        vec4 originProjPos = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * viewPos + gbufferProjection[3].xyz, -viewPos.z);
        vec4 originCoord = vec4(originProjPos.xyz / abs(originProjPos.w) * 0.5 + 0.5, 0.0);
        #ifdef TAA
            originCoord.st += taaOffset * 0.5;
        #endif

        vec4 projDirection = projShadowDirection;
        vec2 screenEdgeAA = projIntersection(originProjPos, projDirection, vec2(1.0));
        vec2 screenEdgeBB = projIntersection(originProjPos, projDirection, vec2(-1.0));
        float traceLength = min(min(screenEdgeAA.x, screenEdgeAA.y), min(screenEdgeBB.x, screenEdgeBB.y));
        vec4 targetProjPos = originProjPos + projDirection * traceLength;
        vec4 targetCoord = vec4(targetProjPos.xyz / targetProjPos.w * 0.5 + 0.5, 0.0);

        #ifdef DISTANT_HORIZONS
            projDirection.z *= dhProjection[2].z / gbufferProjection[2].z;
            float originProjDepthDH = viewPos.z * dhProjection[2].z + dhProjection[3].z;
            originCoord.w = originProjDepthDH / -viewPos.z * 0.5 + 0.5;
            targetCoord.w = (originProjDepthDH + projDirection.z * traceLength) / (projDirection.w * traceLength - viewPos.z) * 0.5 + 0.5;
        #endif

        vec4 stepSize = targetCoord - originCoord;
        stepSize *= inversesqrt(dot(stepSize.xy, stepSize.xy));
        originCoord += stepSize * max(texelSize.x, texelSize.y) * 1.5;

        float shadow = 1.0;
        float stepScale = 1.0;
        float porosityScale = (1.0 - clamp(porosity - 0.25, 0.0, 1.0));
        const float absorptionScale = SUBSERFACE_SCATTERING_STRENTGH / (191.0);
        float absorptionBeta = -0.5 / max(porosity * absorptionScale * 255.0 - absorptionScale * 64.0, 1e-5);
        stepSize *= porosityScale * 0.003;

        targetCoord = originCoord + stepSize * 12.0;
        vec3 targetViewPos = projectionToViewPos(targetCoord.xyz);
        float sampleLength = length(targetViewPos - viewPos);
        float absorption = exp2(absorptionBeta * porosityScale * sampleLength * 0.01) * step(0.25, porosity) * (1.0 - clamp(NdotL * 10.0, 0.0, 1.0) * porosityScale);
        float shadowWeight = clamp(-NdotL * 10.0, 0.0, 1.0) * clamp(1.0 - 1.0 / viewLength / shadowDistance, 0.0, 1.0);

        vec4 sampleCoord = originCoord + noise.x * stepSize;

        float maximumThickness = 0.0005 * viewLength + 0.03 * float(materialID == MAT_HAND);
        float maximumThicknessDH = 0.05 * viewLength;
        float depthMultiplicator = mix(1.0, 1.0 / MC_HAND_DEPTH, float(materialID == MAT_HAND));
        sampleCoord.zw -= vec2(maximumThickness, maximumThicknessDH);

        for (int i = 0; i < 12; i++) {
            if (any(greaterThan(abs(sampleCoord.xy - 0.5), vec2(0.5))) || shadow < 0.01) {
                break;
            }
            float sampleDepth = textureLod(depthtex1, sampleCoord.st, 0.0).r;
            bool hit;
            #ifdef DISTANT_HORIZONS
                if (sampleDepth == 1.0) {
                    float sampleDepthDH = textureLod(dhDepthTex0, sampleCoord.st, 0.0).r;
                    hit = abs(sampleCoord.w - sampleDepthDH) < maximumThicknessDH && sampleDepthDH < 1.0;
                }
                else
            #endif
            {
                float sampleParallaxOffset = textureLod(colortex3, sampleCoord.st, 0.0).w / 512.0 - 0.5 * depthMultiplicator + 0.5;
                sampleDepth = sampleDepth * depthMultiplicator + sampleParallaxOffset;
                hit = abs(sampleCoord.z - sampleDepth) < maximumThickness && sampleDepth < 1.0;
                if (hit) {
                    vec2 sampleTexelCoord = sampleCoord.xy * screenSize + 0.5;
                    vec2 sampleTexel = floor(sampleTexelCoord);
                    vec4 sh = textureGather(depthtex1, sampleTexel * texelSize, 0);
                    vec2 fpc = sampleTexelCoord - sampleTexel;
                    vec2 x = mix(sh.wx, sh.zy, vec2(fpc.x));
                    float sampleDepth = mix(x.x, x.y, fpc.y);
                    sampleDepth = sampleDepth * depthMultiplicator + sampleParallaxOffset;
                    hit = abs(sampleCoord.z - sampleDepth) < maximumThickness;
                }
            }
            shadow *= mix(1.0, absorption, float(hit));
            sampleCoord += stepSize;
        }

        shadow = clamp(mix(shadow, 1.0, shadowWeight), 0.0, 1.0);

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
    vec3 viewPosNoPOM;
    #ifdef DISTANT_HORIZONS
        if (gbufferData.depth == 1.0) {
            gbufferData.depth = textureLod(dhDepthTex0, texcoord, 0.0).r;
            viewPos = screenToViewPosDH(texcoord, gbufferData.depth);
            viewPosNoPOM = viewPos;
            gbufferData.depth = -gbufferData.depth;
        } else
    #endif
    {
        if (gbufferData.materialID == MAT_HAND) {
            gbufferData.depth = gbufferData.depth / MC_HAND_DEPTH - 0.5 / MC_HAND_DEPTH + 0.5;
        }
        viewPosNoPOM = screenToViewPos(texcoord, gbufferData.depth);
        float parallaxData = texelFetch(colortex3, texel, 0).w;
        gbufferData.depth += abs(parallaxData) / 512.0;
        viewPos = screenToViewPos(texcoord, gbufferData.depth);
    }
    vec3 worldPosNoPOM = viewToWorldPos(viewPosNoPOM);
    vec3 worldDir = normalize(worldPosNoPOM - gbufferModelViewInverse[3].xyz);

    vec4 finalColor = vec4(0.0);
    texBuffer0 = vec4(texelFetch(colortex0, texel, 0).rgb, texelFetch(colortex4, texel, 0).w);

    if (abs(gbufferData.depth) < 1.0) {
        float viewLength = inversesqrt(dot(viewPos, viewPos));
        vec3 viewDir = viewPos * viewLength;
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
        float NdotV = clamp(dot(viewDir, -gbufferData.normal), 0.0, 1.0);
        vec3 diffuseAbsorption = (1.0 - gbufferData.metalness) * diffuseAbsorptionWeight(NdotV, gbufferData.smoothness, gbufferData.metalness, n, k);
        finalColor.rgb *= diffuseAbsorption + diffuseWeight / PI;
        finalColor.rgb += gbufferData.emissive *  BLOCK_LIGHT_BRIGHTNESS;
        finalColor.rgb *= gbufferData.albedo.rgb;

        #ifdef SHADOW_AND_SKY
            vec3 shadow = sunColor;
            float NdotL = clamp(dot(worldNormal, shadowDirection), 0.0, 1.0);
            shadow *=
                gbufferData.albedo.rgb * diffuseAbsorption +
                sunlightSpecular(
                    worldDir, shadowDirection, worldNormal, gbufferData.albedo.rgb, gbufferData.smoothness * 0.995,
                    gbufferData.metalness, NdotL, NdotV, n, k
                );
            vec2 noise = blueNoiseTemporal(texcoord).xy;
            #ifdef SCREEN_SPACE_SHADOW
                shadow *= screenSpaceShadow(viewPos, dot(worldNormal, shadowDirection), viewLength, gbufferData.porosity, noise, gbufferData.materialID);
            #endif
            #ifdef CLOUD_SHADOW
                shadow *= cloudShadow(worldPos, shadowDirection);
            #endif
            float shadowLightFactor = 1.0;
            #ifdef LIGHT_LEAKING_FIX
                shadowLightFactor = clamp(gbufferData.lightmap.y * 10.0 + isEyeInWater, 0.0, 1.0);
            #endif
            #ifdef PCSS
                shadow *= percentageCloserSoftShadow(
                    worldPosNoPOM, worldGeoNormal, NdotL, shadowLightFactor,
                    gbufferData.smoothness, gbufferData.porosity, gbufferData.lightmap.y, noise
                );
            #else
                shadow *= singleSampleShadow(
                    worldPosNoPOM, worldGeoNormal, NdotL, shadowLightFactor,
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
