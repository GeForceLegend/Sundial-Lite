#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

in vec4 color;
in vec4 viewPos;
in vec4 texlmcoord;
in vec3 mcPos;
in vec3 worldNormal;
in mat3 tbnMatrix;

flat in float isEmissive;
flat in float materialID;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Common.glsl"
#include "/libs/Water.glsl"
#include "/libs/PhysicsOcean.glsl"

#ifdef PHYSICS_OCEAN
    in vec3 physics_localPosition;
    in float physics_localWaviness;
#endif

void main() {
    #ifdef PHYSICS_OCEAN
        WavePixelData physics_waveData = physics_wavePixel(physics_localPosition.xz, physics_localWaviness, physics_iterationsNormal, physics_gameTime);
    #endif
    GbufferData rawData;
    vec2 texcoord = texlmcoord.st;

    vec4 albedoData = texture(gtexture, texcoord);
    if (albedoData.w < 0.001) discard;

    rawData.albedo = albedoData * color;
    rawData.lightmap = texlmcoord.pq;
    rawData.geoNormal = tbnMatrix[2];
    rawData.smoothness = 0.0;
    rawData.metalness = 0.0;
    rawData.porosity = 0.0;
    rawData.emissive = 0.0;
    rawData.materialID = materialID;
    rawData.parallaxOffset = 0.0;
    rawData.depth = 0.0;

    #ifdef PHYSICS_OCEAN
        rawData.normal = mat3(gbufferModelView) * (physics_waveData.normal * vec3(0.5, 1.0, 0.5));
        rawData.normal = -signI(dot(rawData.normal, viewPos.xyz)) * rawData.normal;
        rawData.geoNormal = rawData.normal;
        #if WATER_TYPE == 0
            rawData.albedo.rgb = color.rgb;
        #else
            rawData.albedo = albedoData;
        #endif
    #else
        #ifdef MC_NORMAL_MAP
            vec4 normalData = texture(normals, texcoord);
        #else
            vec4 normalData = vec4(0.5, 0.5, 1.0, 1.0);
        #endif
        #if WATER_TYPE == 0
            if (normalData.z > 0.999 && rawData.materialID == MAT_WATER) {
                rawData.albedo.rgb = color.rgb;
                vec3 tangentDir = normalize(transpose(tbnMatrix) * viewPos.xyz);
                rawData.normal = normalize(tbnMatrix * waterWave(mcPos / 32.0, tangentDir));
            }
            else
        #endif
        {
            #if WATER_TYPE == 1
                if (rawData.materialID == MAT_WATER) {
                    rawData.albedo = albedoData;
                }
            #endif
            #ifdef MC_NORMAL_MAP
                rawData.normal = NORMAL_FORMAT(normalData.xyz);
                rawData.normal.xy *= NORMAL_STRENGTH;
            #else
                rawData.normal = vec3(0.0, 0.0, 1.0);
            #endif
            rawData.normal = normalize(tbnMatrix * rawData.normal);
        }

        vec3 viewDir = -normalize(viewPos.xyz);
        float NdotV = dot(rawData.normal, viewDir);
        if (NdotV < 1e-6) {
            vec3 edgeNormal = rawData.normal - viewDir * NdotV;
            float weight = 1.0 - NdotV;
            weight = sin(min(weight, PI / 2.0));
            weight = clamp(min(max(NdotV, dot(viewDir, rawData.geoNormal)), 1.0 - weight), 0.0, 1.0);
            rawData.normal = viewDir * weight + edgeNormal * inversesqrt(dot(edgeNormal, edgeNormal) / (1.0 - weight * weight));
        }
        rawData.normal = mix(rawData.geoNormal, rawData.normal, exp2(-0.0002 * length(viewPos.xyz) / max(1e-6, dot(rawData.geoNormal, viewDir))));
    #endif

    #ifdef MC_SPECULAR_MAP
        vec4 specularData = textureLod(specular, texcoord, 0.0);
        SPECULAR_FORMAT(rawData, specularData);
    #endif

    rawData.smoothness += step(rawData.smoothness, 1e-3) * (1.0 - isEmissive);

    #ifndef SPECULAR_EMISSIVE
        rawData.emissive = 0.0;
    #endif

    #ifdef HARDCODED_EMISSIVE
        rawData.emissive += step(rawData.emissive, 1e-3) * isEmissive;
    #endif

    #ifdef MOD_LIGHT_DETECTION
        if (texlmcoord.p > 0.99999) {
            rawData.emissive += step(rawData.emissive, 1e-3) * step(rawData.materialID, -0.5);
        }
    #endif
    rawData.materialID = mix(rawData.materialID, MAT_STAINED_GLASS, float(rawData.materialID < 0.0));

    #ifndef LABPBR_POROSITY
        rawData.porosity = 0.0;
    #endif

    if (rainyStrength > 0.0) {
        float outdoor = clamp(15.0 * rawData.lightmap.y - 14.0, 0.0, 1.0);
        #if RAIN_WET == 1
            float rainWetness = clamp(worldNormal.y * 10.0 + 0.5, 0.0, 1.0) * outdoor * rainyStrength;
            rawData.smoothness += (1.0 - rawData.metalness) * (1.0 - rawData.smoothness) * clamp(rainWetness, 0.0, 1.0);
        #elif RAIN_WET == 2
            rawData.smoothness = groundWetSmoothness(mcPos, worldNormal.y, rawData.smoothness, rawData.metalness, 0.0, outdoor);
        #endif
    }

    packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
}

/* DRAWBUFFERS:012 */
