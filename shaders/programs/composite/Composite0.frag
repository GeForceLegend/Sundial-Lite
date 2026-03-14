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
//  Reflection
//

#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer0;
layout(location = 1) out vec4 texBuffer4;

in vec2 texcoord;

#define CLOUD_IN_REFLECTION
#define SCREEN_SPACE_REFLECTION_STEP 16 // [2 3 4 5 6 7 8 10 12 14 16 20 24 28 32]
#define SCREEN_SPACE_REFLECTION_REFINEMENTS 5 // [1 2 3 4 5 6 8 10]

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

vec3 reflectionWeight(vec3 viewDir, vec3 lightDir, vec3 f0, vec3 f82) {
    float LdotH2 = clamp(dot(-viewDir, lightDir) * 0.5 + 0.5, 0.0, 1.0);
    if (f0.x < 0.0) {
        f0 = vec3(0.02);
        LdotH2 = clamp(1.777777 * LdotH2 - 0.777777, 0.0, 1.0);
    }
    vec3 F = F_AdobeF82(f0, f82, sqrt(LdotH2));
    return F;
}

// https://www.shadertoy.com/view/MX3XDf MIT Licence
// Did some trick to prevent NaN when normal is vec3(0.0, 0.0, -1.0)
vec3 IsotropicGGX(vec2 u, vec3 wi, float alpha, vec3 n, float NdotV, out float pdfRatio)
{
    //preliminary variables
    float a2 = alpha * alpha;
    float z2 = NdotV * NdotV;
    // warp to the hemisphere configuration
    vec3 wiStd = mix(wi, NdotV * n, vec3(1.0 + alpha));
    float t = inversesqrt((1.0 - z2) * a2 + z2);
    wiStd *= t;
    NdotV *= t;
    //compute lower bound for scaling
    float s = 1. + sqrt(1.0 - z2);
    float s2 = s * s;
    float k = (s2 - a2 * s2) / (s2 + a2 * z2);
    //calculate ratio of bounded and unbounded vndf
    pdfRatio = (k * NdotV + 1.0) / (NdotV + 1.0);
    //construct spherical cap
    vec3 cStd;
    float b = k * dot(wiStd, n); //z axis
    float inversed = signI(n.z);
    cStd.z = (1.0 - u.y - u.y * b) * inversed;
    const float tau = 6.2831853; // 2 * pi
    float phi = tau * u.x;
    cStd.x = cos(phi);
    cStd.y = sin(phi);
    cStd.xy *= sqrt(clamp(1. - cStd.z * cStd.z, 0.0, 1.0));
    //reflect sample to align with normal
    vec3 wr = vec3(n.xy, n.z + inversed);
    vec3 c = (dot(wr, cStd) / abs(wr.z)) * wr - cStd;
    // compute halfway direction as standard normal
    vec3 wmStd = c + wiStd;
    vec3 wmStd_z = n * dot(n, wmStd);
    vec3 wmStd_xy = wmStd_z - wmStd;
    // warp back to the ellipsoid configuration
    return normalize(wmStd_z + alpha * wmStd_xy);
}

vec3 directionDistribution(vec2 noise, vec3 normal, vec3 viewDir, float roughness, float NdotV, out float pdfRatio) {
    vec3 direction;
    #ifdef FULL_REFLECTION
        vec3 distributedNormal = IsotropicGGX(noise, -viewDir, roughness, normal, NdotV, pdfRatio);
        direction = reflect(viewDir, distributedNormal);
    #else
        vec3 rayDir = reflect(viewDir, normal);
        float distributionAngle = 2 * PI * noise.x;
        vec3 distributionDir1 = normalize(cross(rayDir, viewDir));
        vec3 distributionDir2 = sin(distributionAngle) * cross(rayDir, distributionDir1);
        vec3 distributionDir = cos(distributionAngle) * distributionDir1 + distributionDir2 * NdotV;
        float distributionStrength = noise.y * roughness;
        direction = normalize(distributionDir * distributionStrength + rayDir);
        pdfRatio = 1.0;
    #endif
    return direction;
}

vec4 reflection(ivec2 texel, float smoothness, float depth, vec3 f0, vec3 f82, float firstWeight) {
    vec3 viewPos;
    #ifdef LOD
        if (depth > 1.0) {
            viewPos = screenToViewPosLod(texcoord, depth - 1.0);
        } else
    #endif
    {
        viewPos = screenToViewPos(texcoord, depth);
    }
    vec3 normal;
    vec3 geoNormal;
    decodeNormals(texelFetch(colortex1, texel, 0), normal, geoNormal);
    vec3 viewDir = normalize(viewPos);
    viewPos += geoNormal * 3e-3;

    NoiseGenerator noiseGenerator = initNoiseGenerator(uvec2(gl_FragCoord.st), uint(frameCounter));

    float basicRoughness = pow2(1.0 - smoothness);
    vec2 noise = nextVec2(noiseGenerator);
    float NdotV = clamp(dot(-viewDir, normal), 0.0, 1.0);
    float pdfRatio;
    vec3 rayDir = directionDistribution(noise, normal, viewDir, basicRoughness, NdotV, pdfRatio);
    rayDir += geoNormal * 2.0 * clamp(-dot(rayDir, geoNormal), 0.0, 1.0);

    vec3 brdfWeight = reflectionWeight(viewDir, rayDir, f0, f82) * pdfRatio;
    vec3 totalWeight = brdfWeight * firstWeight;
    vec4 reflectionColor = vec4(0.0);
    if (dot(totalWeight, totalWeight) > 1e-6) {
        vec4 projDirection = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * rayDir, -rayDir.z);
        vec4 originProjPos = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * viewPos, -viewPos.z);
        projDirection.xy += gbufferProjection[2].xy * rayDir.z;
        originProjPos.z += gbufferProjection[3].z;
        originProjPos.xy += gbufferProjection[2].xy * viewPos.z;
        #ifdef TAA
            originProjPos.xy += taaOffset * originProjPos.w;
        #endif
        float traceLength = projIntersectionScreenEdge(originProjPos, projDirection);

        float originProjScale = 0.5 / originProjPos.w;
        vec4 sampleCoord = vec4(originProjPos.xyz * originProjScale + 0.5, 0.0);
        vec4 targetProjPos = originProjPos + projDirection * traceLength;
        float targetProjScale = 0.5 / targetProjPos.w;
        vec4 targetCoord = vec4(targetProjPos.xyz * targetProjScale + 0.5, 0.0);

        #ifdef LOD
            projDirection.z = rayDir.z * projLod()[2].z;
            float originProjDepthLod = viewPos.z * projLod()[2].z + projLod()[3].z;
            sampleCoord.w = originProjDepthLod * originProjScale + 0.5;
            targetCoord.w = (originProjDepthLod + projDirection.z * traceLength) * targetProjScale + 0.5;
        #endif

        float noise = blueNoiseTemporal(texcoord).x + 0.1;
        vec4 stepSize = (targetCoord - sampleCoord) / (SCREEN_SPACE_REFLECTION_STEP - 1.0);
        sampleCoord += noise * stepSize;
        sampleCoord.zw -= 2e-7;

        bool hitSky = true;
        float minimumThichness = max(0.001 * originProjScale, abs(stepSize.z));
        float minimumThichnessLod = max(0.01 * originProjScale, abs(stepSize.w));
        for (int i = 0; i < SCREEN_SPACE_REFLECTION_STEP; i++) {
            float sampleDepth = uintBitsToFloat(textureLod(colortex6, sampleCoord.st, 0.0).x);
            sampleDepth -= float(sampleDepth > 1.0);
            bool hitCheck = sampleCoord.z > sampleDepth && sampleDepth < 1.0;
            #ifdef LOD
                hitCheck = hitCheck || (sampleDepth < 0.0 && sampleCoord.w > -sampleDepth);
            #endif
            if (hitCheck) {
                float stepScale = 0.5;
                vec4 refinementCoord = sampleCoord;
                for (int j = 0; j < SCREEN_SPACE_REFLECTION_REFINEMENTS; j++) {
                    float stepDirection = sampleDepth - refinementCoord.z;
                    #ifdef LOD
                        float stepDirectionLod = -sampleDepth - refinementCoord.w;
                        stepDirection = mix(stepDirection, stepDirectionLod, float(sampleDepth < 0.0));
                    #endif
                    refinementCoord += signMul(stepScale, stepDirection) * stepSize;
                    sampleDepth = uintBitsToFloat(textureLod(colortex6, refinementCoord.st, 0.0).x);
                    sampleDepth -= float(sampleDepth > 1.0);
                    stepScale *= 0.5;
                }

                bool hitTerrain = abs(refinementCoord.z - sampleDepth) < minimumThichness && sampleDepth < 1.0;
                #ifdef LOD
                    hitTerrain = hitTerrain || (abs(sampleDepth + 0.5) < 0.5 && abs(refinementCoord.w + sampleDepth) < minimumThichnessLod);
                #endif
                if (hitTerrain && clamp(refinementCoord.st, 0.0, 1.0) == refinementCoord.st) {
                    sampleCoord = refinementCoord;
                    hitSky = false;
                    break;
                }
            }
            if (clamp(sampleCoord.st, 0.0, 1.0) != sampleCoord.st || sampleCoord.z < 0.0) break;
            sampleCoord += stepSize;
        }
        rayDir = mat3(gbufferModelViewInverse) * rayDir;
        vec3 worldPos = viewToWorldPos(viewPos);
        vec4 intersectionData = planetIntersectionData(worldPos, rayDir);
        if (!hitSky) {
            vec3 sampleViewPos;
            #ifdef LOD
                if (sampleCoord.z >= 1.0) {
                    vec3 sampleProjPos = sampleCoord.xyw * 2.0 - 1.0;
                    #ifdef TAA
                        sampleProjPos.st -= taaOffset;
                    #endif
                    sampleProjPos.xy *= vec2(projInvLod()[0].x, projInvLod()[1].y);
                    sampleProjPos.xy += projInvLod()[3].xy;
                    float projectionScale = projLod()[3].z / (sampleProjPos.z + projLod()[2].z);
                    sampleViewPos = vec3(sampleProjPos.xy * projectionScale, -projectionScale);
                } else
            #endif
            {
                vec3 sampleProjPos = sampleCoord.xyz * 2.0 - 1.0;
                #ifdef TAA
                    sampleProjPos.st -= taaOffset;
                #endif
                sampleProjPos.xy *= vec2(gbufferProjectionInverse[0].x, gbufferProjectionInverse[1].y);
                sampleProjPos.xy += gbufferProjectionInverse[3].xy;
                float projectionScale = gbufferProjection[3].z / (sampleProjPos.z + gbufferProjection[2].z);
                sampleViewPos = vec3(sampleProjPos.xy * projectionScale, -projectionScale);
            }
            float rayLength = distance(viewPos, sampleViewPos);
            vec3 sampleLight = texelFetch(colortex3, ivec2(sampleCoord.xy * screenSize), 0).rgb;
            reflectionColor = vec4(sampleLight, rayLength);
        }
        else {
            reflectionColor.rgb = vec3(0.0);
            #ifdef SHADOW_AND_SKY
                vec3 atmosphere;
                reflectionColor.rgb = singleAtmosphereScattering(vec3(0.0), worldPos, rayDir, sunDirection, intersectionData, skyColorUp, 30.0, atmosphere);
                vec4 planeCloud = vec4(0.0);
                #ifdef PLANE_CLOUD
                    planeCloud = planeClouds(worldPos, rayDir, sunDirection, skyColorUp, intersectionData.xyz);
                    reflectionColor.rgb = mix(reflectionColor.rgb, planeCloud.rgb, planeCloud.a * float(worldPos.y + cameraPosition.y < PLANE_CLOUD_HEIGHT));
                    planeCloud.a *= float(worldPos.y + cameraPosition.y >= PLANE_CLOUD_HEIGHT);
                #endif
                #ifdef CLOUD_IN_REFLECTION
                    float cloudDepth;
                    reflectionColor.rgb = sampleClouds(reflectionColor.rgb, atmosphere, worldPos, rayDir, shadowDirection, sunDirection, skyColorUp, intersectionData.xyz, 0.0, cloudDepth).rgb;
                #endif
                reflectionColor.rgb = mix(reflectionColor.rgb, planeCloud.rgb, planeCloud.a);
                #ifdef LIGHT_LEAKING_FIX
                    reflectionColor.rgb *= clamp(eyeBrightnessSmooth.y / 16.0, 0.0, 1.0);
                #endif
            #endif
            reflectionColor.w = 114514.0;
        }
        if (isEyeInWater == 0) {
            #ifdef THE_END
                reflectionColor.rgb = endFogTotal(reflectionColor.rgb, reflectionColor.w);
                if (hitSky) {
                    reflectionColor.rgb += endStars(rayDir) * exp2(50.0 * (smoothness - 1.0));
                }
            #elif defined NETHER
                reflectionColor.rgb = netherFogTotal(reflectionColor.rgb, reflectionColor.w);
            #else
                reflectionColor.rgb *= airAbsorption(reflectionColor.w);
                #if defined ATMOSPHERE_SCATTERING_FOG && defined SHADOW_AND_SKY
                    float atmosphereLength = mix(reflectionColor.w * (1.0 + RF_GROUND_EXTRA_DENSITY * 3.0 * weatherStrength), 1600.0, float(hitSky));
                    reflectionColor.rgb = solidAtmosphereScattering(reflectionColor.rgb, rayDir, skyColorUp, atmosphereLength, eyeBrightnessSmooth.y / 240.0);
                #endif
            #endif
        }
        else if (isEyeInWater == 1) {
            reflectionColor.rgb = waterFogTotal(reflectionColor.rgb, rayDir, skyColorUp, reflectionColor.w, eyeBrightnessSmooth.y / 240.0);
        }
        else if (isEyeInWater == 2) {
            reflectionColor.rgb = lavaFogTotal(reflectionColor.rgb, reflectionColor.w);
        }
        else if (isEyeInWater == 3) {
            reflectionColor.rgb = snowFogTotal(reflectionColor.rgb, skyColorUp, reflectionColor.w, eyeBrightnessSmooth.y / 240.0);
        }
        reflectionColor.rgb = max(vec3(0.0), reflectionColor.rgb * brdfWeight);
        reflectionColor.w = min(2.0, reflectionColor.w * step(smoothness, 0.9975) / far);
    }
    return reflectionColor;
}

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    float waterDepth = textureLod(depthtex0, texcoord, 0.0).r;
    float solidDepth = textureLod(depthtex1, texcoord, 0.0).r;
    #ifdef LOD
        waterDepth += float(waterDepth == 1.0) * getLodDepthWater(texcoord);
        solidDepth += float(solidDepth == 1.0) * getLodDepthSolid(texcoord);
    #endif
    texBuffer0 = vec4(vec3(0.0), texelFetch(colortex4, texel, 0).w);

    vec4 reflectionColor = vec4(0.0);
    #ifdef REFLECTION
        if (waterDepth - float(waterDepth > 1.0) < 1.0) {
            vec4 gbufferData = texelFetch(colortex2, texel, 0);
            vec2 smoothMetalness = unpack2x8Bit(gbufferData.y);
            vec2 materialParallax = unpackM3P13(gbufferData.w);
            materialParallax.x = round(materialParallax.x * 7.0);
            if (materialParallax.x == MAT_HAND) {
                waterDepth = waterDepth / MC_HAND_DEPTH - 0.5 / MC_HAND_DEPTH + 0.5;
            }

            vec3 f0 = vec3(0.04);
            vec3 f82 = vec3(1.0);
            #ifdef LABPBR_F0
                f0 = mix(f0, vec3(smoothMetalness.y), vec3(clamp(smoothMetalness.y * 1e+10, 0.0, 1.0)));
                f82 = hardcodedMetal(smoothMetalness.y);
                smoothMetalness.y = step(229.5 / 255.0, smoothMetalness.y);
            #endif
            float reflectionStrength = 1.0;
            if (waterDepth < solidDepth) {
                // Negative F0 marks ray shoot from water to air
                if (materialParallax.x == MAT_WATER) {
                    f0 = vec3(0.02 - 0.04 * float(isEyeInWater == 1));
                }
                reflectionStrength = clamp(smoothMetalness.x * 100.0, 0.0, 1.0);
            } else {
                float diffuseWeight = pow(1.0 - smoothMetalness.x, 5.0);
                #ifndef FULL_REFLECTION
                    diffuseWeight = 1.0 - (1.0 - diffuseWeight) * sqrt(clamp(smoothMetalness.x - (1.0 - smoothMetalness.x) * (1.0 - 0.6666 * smoothMetalness.y), 0.0, 1.0));
                #endif
                reflectionStrength = 1.0 - diffuseWeight;
                waterDepth = uintBitsToFloat(texelFetch(colortex6, texel, 0).x);
                waterDepth -= float(waterDepth > 1.0);
                if (waterDepth < 0.0) {
                    waterDepth = 1.0 - waterDepth;
                }
            }

            if (reflectionStrength > 1e-5) {
                f0 = signI(f0) * mix(abs(f0), pow(texelFetch(colortex0, texel, 0).rgb, vec3(2.2)), smoothMetalness.y);
                float skyLightLevel = unpack2x8Bit(gbufferData.x).y;
                reflectionColor = reflection(texel, smoothMetalness.x, waterDepth, f0, f82, reflectionStrength);
            }
        }
    #endif

    texBuffer4 = reflectionColor;
}

/* DRAWBUFFERS:04 */
