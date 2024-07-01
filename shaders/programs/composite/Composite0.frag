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

vec3 reflectionWeight(vec3 viewDir, vec3 lightDir, float metalness, vec3 n, vec3 k) {
    float LdotH2 = clamp(dot(-viewDir, lightDir) * 0.5 + 0.5, 0.0, 1.0);
    vec3 F = fresnelFull(sqrt(LdotH2), LdotH2, n, k, metalness);
    return F;
}

// https://ggx-research.github.io/publication/2023/06/09/publication-ggx.html
vec3 SampleVNDFGGX(
    vec3 viewerDirection, // Direction pointing towards the viewer, oriented such that +Z corresponds to the surface normal
    float roughness, // Roughness parameter
    vec2 xy // Pair of uniformly distributed numbers in [0, 1)
) {
    // Transform viewer direction to the hemisphere configuration
    viewerDirection = normalize(vec3(roughness * viewerDirection.xy, viewerDirection.z));

    // Sample a reflection direction off the hemisphere
    const float tau = 6.2831853; // 2 * pi
    float phi = tau * xy.x;
    float cosTheta = 1.0 - xy.y - xy.y * viewerDirection.z;
    float sinTheta = sqrt(clamp(1.0 - cosTheta * cosTheta, 0.0, 1.0));
    vec3 reflected = vec3(vec2(cos(phi), sin(phi)) * sinTheta, cosTheta);

    // Evaluate halfway direction
    // This gives the normal on the hemisphere
    vec3 halfway = reflected + viewerDirection;

    // Transform the halfway direction back to hemiellispoid configuation
    // This gives the final sampled normal
    return normalize(vec3(roughness * halfway.xy, halfway.z));
}

vec3 directionDistributionFull(vec2 noise, vec3 viewDir, float roughness, mat3 tbnMatrix) {
    mat3 tbnMatrixInv = transpose(tbnMatrix);
    vec3 tangentDir = tbnMatrixInv * viewDir;
    vec3 tangentNormal = SampleVNDFGGX(-tangentDir, roughness, noise);
    vec3 reflectionNormal = tbnMatrix * tangentNormal;
    return reflect(viewDir, reflectionNormal);
}

vec3 directionDistributionFast(vec2 noise, vec3 normal, vec3 viewDir, float roughness, float NdotV) {
    vec3 rayDir = reflect(viewDir, normal);
    float distributionAngle = 2 * PI * noise.x;
    vec3 distributionDir1 = normalize(cross(rayDir, viewDir));
    vec3 distributionDir2 = sin(distributionAngle) * cross(rayDir, distributionDir1);
    vec3 distributionDir = cos(distributionAngle) * distributionDir1 + distributionDir2 * NdotV;
    float distributionStrength = noise.y * roughness;
    vec3 direction = normalize(distributionDir * distributionStrength + rayDir);
    return direction;
}

vec2 projIntersection(vec4 origin, vec4 direction, vec2 targetCoord) {
    vec2 intersection = (targetCoord * origin.ww - origin.xy) / (direction.xy - targetCoord * direction.ww);
    intersection = mix(intersection, vec2(far + 32.0), step(intersection, vec2(0.0)));
    return intersection;
}

vec4 reflection(GbufferData gbufferData, vec3 gbufferN, vec3 gbufferK, float firstWeight) {
    vec3 viewPos = screenToViewPos(texcoord, gbufferData.depth);
    vec3 viewDir = normalize(viewPos);
    float NdotV = max(dot(viewPos, -gbufferData.geoNormal), 1e-6);
    gbufferData.parallaxOffset *= PARALLAX_DEPTH;
    viewPos += gbufferData.parallaxOffset * viewPos * 0.2 / NdotV;

    NoiseGenerator noiseGenerator = initNoiseGenerator(uvec2(gl_FragCoord.st), uint(frameCounter));

    float basicRoughness = pow2(1.0 - gbufferData.smoothness);
    vec2 noise = nextVec2(noiseGenerator);
    float gbufferNdotV = clamp(dot(-viewDir, gbufferData.normal), 0.0, 1.0);
    #ifdef FULL_REFLECTION
        vec3 distributionDir1 = normalize(cross(gbufferData.normal, vec3(1.0)));
        vec3 distributionDir2 = cross(gbufferData.normal, distributionDir1);
        mat3 basicTbnMatrix = mat3(distributionDir1, distributionDir2, gbufferData.normal);
        vec3 rayDir = directionDistributionFull(noise, viewDir, basicRoughness, basicTbnMatrix);
    #else
        vec3 rayDir = directionDistributionFast(noise, gbufferData.normal, viewDir, basicRoughness, gbufferNdotV);
    #endif
    if (dot(rayDir, gbufferData.geoNormal) < 1e-5) {
        rayDir = reflect(rayDir, gbufferData.geoNormal);
    }

    vec3 brdfWeight = reflectionWeight(viewDir, rayDir, gbufferData.metalness, gbufferN, gbufferK);
    vec3 metalWeight = metalColor(gbufferData.albedo.rgb, gbufferNdotV, gbufferData.metalness, gbufferData.smoothness) * firstWeight;

    vec3 totalWeight = brdfWeight * metalWeight.rgb;
    vec4 reflectionColor = vec4(0.0);
    if (dot(totalWeight, totalWeight) > 1e-6) {
        vec4 projDirection = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * rayDir, -rayDir.z);
        vec4 originProjPos = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * viewPos + gbufferProjection[3].xyz, -viewPos.z);
        vec2 screenEdgeAA = projIntersection(originProjPos, projDirection, vec2(1.0));
        vec2 screenEdgeBB = projIntersection(originProjPos, projDirection, vec2(-1.0));

        float traceLength = min(min(screenEdgeAA.x, screenEdgeAA.y), min(screenEdgeBB.x, screenEdgeBB.y));
        vec4 targetProjPos = originProjPos + projDirection * traceLength;
        vec3 targetCoord = targetProjPos.xyz / targetProjPos.w * 0.5 + 0.5;

        vec3 sampleCoord = vec3(texcoord, gbufferData.depth);
        vec3 stepSize = (targetCoord - sampleCoord) / (SCREEN_SPACE_REFLECTION_STEP - 1.0);
        sampleCoord += (blueNoiseTemporal(texcoord).x + 0.1) * stepSize;

        bool hitSky = true;
        for (int i = 0; i < SCREEN_SPACE_REFLECTION_STEP; i++) {
            float sampleDepth = textureLod(
                depthtex1, sampleCoord.st
                #ifdef TAA
                + taaOffset * 0.5
                #endif
            , 0.0).x;
            if (sampleCoord.z > sampleDepth) {
                float stepScale = 0.5;
                vec3 refinementCoord = sampleCoord;
                for (int j = 0; j < SCREEN_SPACE_REFLECTION_REFINEMENTS; j++) {
                    refinementCoord += signMul(stepScale, sampleDepth - refinementCoord.z) * stepSize;
                    sampleDepth = textureLod(
                        depthtex2, refinementCoord.st
                        #ifdef TAA
                        + taaOffset * 0.5
                        #endif
                    , 0.0).x;
                    stepScale *= 0.5;
                }

                if (abs(refinementCoord.z - sampleDepth) < 4e-4 && clamp(refinementCoord.st, 0.0, 1.0) == refinementCoord.st && sampleDepth < 1.0) {
                    sampleCoord = refinementCoord;
                    hitSky = false;
                    break;
                }
            }
            if (clamp(sampleCoord, 0.0, 1.0) != sampleCoord) break;
            sampleCoord += stepSize;
        }
        rayDir = mat3(gbufferModelViewInverse) * rayDir;
        if (!hitSky) {
            vec3 sampleProjPos = sampleCoord * 2.0 - 1.0;
            sampleProjPos.xy /= vec2(gbufferProjection[0].x, gbufferProjection[1].y);
            float projectionScale = gbufferProjection[3].z / (sampleProjPos.z + gbufferProjection[2].z);
            vec3 sampleViewPos = vec3(sampleProjPos.xy * projectionScale, -projectionScale);
            float rayLength = distance(viewPos, sampleViewPos);
            vec3 sampleLight = textureLod(
                colortex3, sampleCoord.xy
                #ifdef TAA
                + taaOffset * 0.5
                #endif
            , 0.0).rgb;
            reflectionColor = vec4(sampleLight, rayLength);
        }
        else {
            float rayLength = far;
            reflectionColor = vec4(vec3(0.0), rayLength);
            #ifdef SHADOW_AND_SKY
                vec3 skylightColor = vec3(0.0);
                vec3 atmosphere;
                skylightColor = singleAtmosphereScattering(vec3(0.0), rayDir, sunDirection, 30.0, atmosphere);
                #ifdef CLOUD_IN_REFLECTION
                    float cloudDepth;
                    vec3 worldPos = viewToWorldPos(viewPos);
                    skylightColor = sampleClouds(skylightColor, atmosphere, worldPos, rayDir, shadowDirection, sunDirection, skyColorUp, 0.0, cloudDepth).rgb;
                #endif
                #ifdef LIGHT_LEAKING_FIX
                    skylightColor *= clamp(eyeBrightnessSmooth.y / 16.0, 0.0, 1.0);
                #endif
                reflectionColor.rgb = skylightColor;
            #endif
        }
        if (isEyeInWater == 0) {
            #ifdef THE_END
                reflectionColor.rgb = endFogTotal(reflectionColor.rgb, reflectionColor.w);
                if (hitSky) {
                    reflectionColor.rgb += endStars(tracedRay.direction);
                }
            #elif defined NETHER
                reflectionColor.rgb = netherFogTotal(reflectionColor.rgb, reflectionColor.w);
            #else
                reflectionColor.rgb *= airAbsorption(reflectionColor.w);
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
        reflectionColor.rgb *= brdfWeight;
        reflectionColor.w /= far;
    }
    return reflectionColor;
}

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    float waterDepth = textureLod(depthtex0, texcoord, 0.0).r;
    float solidDepth = textureLod(depthtex1, texcoord, 0.0).r;
    texBuffer0 = vec4(vec3(0.0), texelFetch(colortex4, texel, 0).w);

    vec4 reflectionColor = vec4(0.0);
    #ifdef REFLECTION
        if (waterDepth < 1.0) {
            GbufferData gbufferData = getGbufferData(texel, texcoord);
            vec3 n = vec3(1.5);
            vec3 k = vec3(0.0);
            float reflectionStrength = 1.0;
            if (waterDepth < solidDepth) {
                bool isTargetWater = gbufferData.materialID == MAT_WATER;
                if (isTargetWater) {
                    n -= 0.166666;
                    n = mix(n, 1.0 / n, float(isEyeInWater == 1));
                } else {
                    n /= 1.0 + 0.333333 * float(isEyeInWater == 1);
                }
            } else {
                float diffuseWeight = pow(1.0 - gbufferData.smoothness, 5.0);
                #ifndef FULL_REFLECTION
                    diffuseWeight = 1.0 - (1.0 - diffuseWeight) * sqrt(clamp(gbufferData.smoothness - (1.0 - gbufferData.smoothness) * (1.0 - 0.6666 * gbufferData.metalness), 0.0, 1.0));
                #endif
                reflectionStrength = 1.0 - diffuseWeight;
            }
            #ifdef LABPBR_F0
                n = mix(n, vec3(f0ToIor(gbufferData.metalness)), vec3(clamp(gbufferData.metalness * 1e+10, 0.0, 1.0)));
                hardcodedMetal(gbufferData.metalness, n, k);
                gbufferData.metalness = step(229.5 / 255.0, gbufferData.metalness);
            #endif
            gbufferData.depth = waterDepth;

            if (reflectionStrength > 1e-5) {
                reflectionColor = reflection(gbufferData, n, k, reflectionStrength);
            }
        }
    #endif

    texBuffer4 = reflectionColor;
}

/* DRAWBUFFERS:04 */
