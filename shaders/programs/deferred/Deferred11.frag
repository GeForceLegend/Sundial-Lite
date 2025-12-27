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
//  Lighting that need to be calculated in visibility bitmask
//

#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer3;

#ifdef SHADOW_AND_SKY
    in vec3 skyColorUp;
#else
    const vec3 skyColorUp = vec3(0.0);
#endif

in vec2 texcoord;

uniform vec3 viewShadowDirection;

#define PCSS
#define PCSS_SAMPLES 9 // [2 3 4 5 6 7 8 9 10 12 14 16 18 20 25 30 36]
#define SCREEN_SPACE_SHADOW_SAMPLES 12 // [4 5 6 7 8 9 10 12 14 16 18 20 25 30 35 40 45 50]
#define SCREEN_SPACE_SHADOW

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
        vec3 offset = mat3(shadowModelViewProj0, shadowModelViewProj1, shadowModelViewProj2) * worldOffsetDir;
        offset *= inversesqrt(max(dot(offset.xy, offset.xy), dot(offset, offset) * 0.09)) * 400.0 / shadowDistance / realShadowMapResolution;
        offset.z *= 0.1;
        return offset;
    }

    vec3 percentageCloserSoftShadow(
        vec3 worldPos, vec3 worldGeoNormal, float NdotL, float viewLength, float lightFactor, float smoothness, float porosity, float skyLight, vec2 noise
    ) {
        vec3 result = vec3(0.0);
        if (weatherStrength < 0.999) {
            vec3 sssShadowCoord = worldPosToShadowCoordNoDistort(worldPos);
            float normalOffsetLen = (viewLength * 2e-3 + 2e-2) * (1.0 + sqrt(1.0 - NdotL));
            vec3 normalOffset = mat3(shadowModelViewProj0, shadowModelViewProj1, shadowModelViewProj2) * (worldGeoNormal * normalOffsetLen * 4096.0 / realShadowMapResolution);
            normalOffset.z *= 0.1;

            vec3 basicShadowCoordNoDistort = sssShadowCoord + normalOffset;
            sssShadowCoord -= normalOffset;
            float clipLengthInv = inversesqrt(dot(basicShadowCoordNoDistort.xy, basicShadowCoordNoDistort.xy));
            float distortFactor = clipLengthInv * log(distortionStrength / clipLengthInv + 1.0) / log(distortionStrength + 1.0);
            vec3 basicShadowCoord = basicShadowCoordNoDistort;
            basicShadowCoord.st = basicShadowCoord.st * 0.25 * distortFactor + 0.75;

            float normalFactor = clamp(pow(NdotL, pow2(1.0 - smoothness * 0.3)), 0.0, 1.0);
            NdotL = abs(dot(worldGeoNormal, shadowDirection));
            NdotL = NdotL + (1.0 - NdotL) * clamp(porosity * 255.0 / 191.0 - 64.0 / 191.0, 0.0, 1.0);
            result = vec3(basicSunlight * smoothstep(0.8, 0.9, skyLight) * (normalFactor + (1.0 - normalFactor) * NdotL * step(64.5 / 255.0, porosity)));
            if (all(lessThan(abs(basicShadowCoord - vec3(vec2(0.75), 0.5)), vec3(vec2(0.249), 0.5)))) {
                vec3 offsetDirection1 = cross(worldGeoNormal, shadowDirection);
                vec3 offsetDirection2 = cross(worldGeoNormal, offsetDirection1);
                offsetDirection1 = shadowSpaceSurfaceOffset(offsetDirection1);
                offsetDirection2 = shadowSpaceSurfaceOffset(offsetDirection2);
                basicShadowCoordNoDistort.z -= 2e-5;

                float avgOcclusionDepth = 0.0;
                float depthSum = 0.0;
                float depthSampleRadius = (0.5 + noise.y) * 2.0;
                float offsetX = -depthSampleRadius;
                for (int i = -1; i <= 1; i++) {
                    float offsetY = -depthSampleRadius;
                    for (int j = -1; j <= 1; j++) {
                        vec3 sampleCoord = distortShadowCoord(basicShadowCoordNoDistort + offsetX * offsetDirection1 + offsetY * offsetDirection2);
                        float sampleDepth = textureLod(shadowtex1, sampleCoord.st, 1.0).r;
                        depthSum += sampleDepth;
                        avgOcclusionDepth += clamp(sampleCoord.z - sampleDepth, 0.0, 1.0);
                        offsetY += depthSampleRadius;
                    }
                    offsetX += depthSampleRadius;
                }
                if (depthSum < 8.9999) {
                    float filterRadius = min(avgOcclusionDepth * 80.0 / 9.0, 4.0) + 0.02 * shadowDistance / distortFactor;

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
                        vec3 sampleShadowCoord = distortShadowCoord(basicShadowCoordNoDistort + sampleOffset);
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
        vec4 originProjPos = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * viewPos, -viewPos.z);
        originProjPos.z += gbufferProjection[3].z;
        originProjPos.xy += gbufferProjection[2].xy * viewPos.z;
        #ifdef TAA
            originProjPos.xy += taaOffset * originProjPos.w;
        #endif
        float projScale = 0.5 / originProjPos.w;
        vec4 originCoord = vec4(originProjPos.xyz * projScale + 0.5, 0.0);

        vec4 projDirection = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * viewShadowDirection, -viewShadowDirection.z);
        projDirection.xy += gbufferProjection[2].xy * viewShadowDirection.z;
        float traceLength = projIntersectionScreenEdge(originProjPos, projDirection);
        vec4 targetProjPos = originProjPos + projDirection * traceLength;
        float targetProjScale = 0.5 / targetProjPos.w;
        vec4 targetCoord = vec4(targetProjPos.xyz * targetProjScale + 0.5, 0.0);

        #ifdef LOD
            projDirection.z = projDirection.z / gbufferProjection[2].z * projLod()[2].z;
            float originProjDepthLod = viewPos.z * projLod()[2].z + projLod()[3].z;
            originCoord.w = originProjDepthLod * projScale + 0.5;
            targetCoord.w = (originProjDepthLod + projDirection.z * traceLength) * targetProjScale + 0.5;
        #endif

        vec4 stepSize = targetCoord - originCoord;
        stepSize *= inversesqrt(dot(stepSize.xy, stepSize.xy));
        originCoord += stepSize * max(texelSize.x, texelSize.y) * 1.5;

        float shadow = 1.0;
        float stepScale = 1.0;
        float porosityScale = (1.0 - clamp(porosity - 0.25, 0.0, 1.0));
        stepSize *= 0.003 * 12.0 / SCREEN_SPACE_SHADOW_SAMPLES;

        targetCoord = originCoord + stepSize * SCREEN_SPACE_SHADOW_SAMPLES;
        vec3 targetViewPos = screenToViewPos(targetCoord.xy, targetCoord.z);
        #ifdef LOD
            if (targetCoord.z >= 1.0) {
                targetViewPos = screenToViewPosLod(targetCoord.xy, targetCoord.w);
            }
        #endif
        const float absorptionScale = SUBSERFACE_SCATTERING_STRENTGH / (191.0);
        vec3 viewPosDiff = targetViewPos - viewPos;
        float absorptionBeta = -0.5 / (max(porosity * absorptionScale * 255.0 - absorptionScale * 64.0, 1e-5) * inversesqrt(dot(viewPosDiff, viewPosDiff)));
        float absorption = exp2(absorptionBeta * porosityScale * 0.5) * step(0.25, porosity) * (1.0 - clamp(NdotL * 10.0, 0.0, 1.0) * porosityScale) + 1.0;
        float shadowWeight = clamp(1.0 - abs(NdotL) * 10.0, 0.0, 1.0) * clamp(1.0 - 1.1 / viewLength / shadowDistance, 0.0, 1.0);

        vec4 sampleCoord = originCoord + noise.x * stepSize;
        sampleCoord.zw -= 2e-7;

        float maximumThickness = 0.0005 * viewLength + 0.03 * float(materialID == MAT_HAND);
        float maximumThicknessLod = 0.5 * viewLength;
        float depthMultiplicator = mix(1.0, 1.0 / MC_HAND_DEPTH, float(materialID == MAT_HAND));
        float baseDepthOffset = 0.5 - 0.5 * depthMultiplicator;
        sampleCoord.zw -= vec2(maximumThickness, maximumThicknessLod);

        for (int i = 0; i < SCREEN_SPACE_SHADOW_SAMPLES; i++) {
            if (any(greaterThan(abs(sampleCoord.xy - 0.5), vec2(0.5))) || shadow < 0.01) {
                break;
            }
            float sampleDepth = textureLod(depthtex1, sampleCoord.st, 0.0).r;
            bool hit;
            #ifdef LOD
                if (sampleDepth == 1.0) {
                    float sampleDepthLod = getLodDepthSolidDeferred(sampleCoord.st);
                    hit = abs(sampleCoord.w - sampleDepthLod) < maximumThicknessLod && sampleDepthLod < 1.0;
                }
                else
            #endif
            {
                float sampleParallaxOffset = textureLod(colortex3, sampleCoord.st, 0.0).w / 512.0 + baseDepthOffset;
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
            shadow *= clamp(absorption - float(hit), 0.0, 1.0);
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
    float parallaxData = texelFetch(colortex3, texel, 0).w;
    vec3 viewPos;
    vec3 viewPosNoPOM;
    #ifdef LOD
        if (gbufferData.depth == 1.0) {
            gbufferData.depth = getLodDepthSolidDeferred(texcoord);
            viewPos = screenToViewPosLod(texcoord, gbufferData.depth - 1e-7);
            viewPosNoPOM = viewPos;
            gbufferData.depth = -gbufferData.depth;
        } else
    #endif
    {
        float depthWithHand = gbufferData.depth;
        if (gbufferData.materialID == MAT_HAND) {
            depthWithHand = gbufferData.depth / MC_HAND_DEPTH - 0.5 / MC_HAND_DEPTH + 0.5;
        }
        viewPosNoPOM = screenToViewPos(texcoord, depthWithHand - 1e-7);
        depthWithHand += parallaxData / 512.0;
        viewPos = screenToViewPos(texcoord, depthWithHand - 1e-7);
    }
    vec3 worldPos = viewToWorldPos(viewPosNoPOM);
    vec3 worldDir = normalize(worldPos - gbufferModelViewInverse[3].xyz);

    vec4 finalColor = vec4(vec3(0.0), parallaxData);

    if (abs(gbufferData.depth) < 1.0) {
        float viewLength = inversesqrt(dot(viewPos, viewPos));
        vec3 viewDir = viewPos * viewLength;
        vec3 worldNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.normal);
        vec3 worldGeoNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.geoNormal);
        finalColor.w += 512.0 * float(gbufferData.materialID == MAT_HAND);

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

        #ifdef SHADOW_AND_SKY
            float ambientOcclusion = 1.0 - texelFetch(colortex5, texel, 0).w;
            vec3 plantSkyNormal = worldNormal;
            plantSkyNormal.y = mix(worldNormal.y, 1.0, sqrt(clamp(gbufferData.porosity * 1.33333 - 0.25 * 1.33333, 0.0, 1.0)));
            finalColor.rgb +=
                pow(gbufferData.lightmap.y, 2.2) * (skyColorUp + sunColor) * (0.9 - 0.5 * weatherStrength) * ambientOcclusion *
                (plantSkyNormal.y * 0.3 + 0.6 + mix(dot(plantSkyNormal, sunDirection), dot(plantSkyNormal, shadowDirection), clamp(-sunDirection.y * 10.0, 0.0, 1.0)) * 0.2);
        #endif
        float NdotV = clamp(dot(viewDir, -gbufferData.normal), 0.0, 1.0);
        vec3 diffuseAbsorption = (1.0 - gbufferData.metalness) * diffuseAbsorptionWeight(NdotV, gbufferData.smoothness, gbufferData.metalness, n, k);
        finalColor.rgb *= diffuseAbsorption + diffuseWeight / PI;
        finalColor.rgb += gbufferData.emissive * PBR_BRIGHTNESS * PI;
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
                shadow *= screenSpaceShadow(viewPos, dot(worldGeoNormal, shadowDirection), viewLength, gbufferData.porosity, noise, gbufferData.materialID);
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
                    worldPos, worldGeoNormal, NdotL, 1.0 / viewLength, shadowLightFactor,
                    gbufferData.smoothness, gbufferData.porosity, gbufferData.lightmap.y, noise
                );
            #else
                shadow *= singleSampleShadow(
                    worldPos, worldGeoNormal, NdotL, shadowLightFactor,
                    gbufferData.smoothness, gbufferData.porosity, gbufferData.lightmap.y, 0.0
                );
            #endif
            finalColor.rgb += shadow;
        }
        else {
            finalColor.rgb = renderSun(worldDir, sunDirection, vec3(300.0)) + gbufferData.albedo.rgb * 2.0;
    #endif
    }

    texBuffer3 = finalColor;
}

/* DRAWBUFFERS:3 */
