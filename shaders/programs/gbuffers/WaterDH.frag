#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

in vec4 color;
in vec3 viewPos;
in vec2 blockLight;
in mat3 tbnMatrix;
flat in float materialID;

#define WATER_WAVE_SCALE 1.0 // [0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
#define WATER_WAVE_HEIGHT 0.4 // [0.0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Common.glsl"
#include "/libs/Water.glsl"

void main() {
    vec3 worldPos = viewToWorldPos(viewPos);
    if (max(dot(worldPos.xz, worldPos.xz), worldPos.y * worldPos.y) < (far - 16.0) * (far - 16.0) || texture2D(depthtex1, gl_FragCoord.st * texelSize).r < 1.0) {
        discard;
    }

    GbufferData rawData;

    vec3 normal = tbnMatrix[2];
    vec3 mcPos = worldPos + cameraPosition;
    #if WATER_TYPE == 0
        if (materialID == MAT_WATER) {
            vec3 tangentDir = normalize(transpose(tbnMatrix) * viewPos.xyz);
            normal = normalize(tbnMatrix * waterWave(mcPos / 32.0, tangentDir));

            vec3 viewDir = -normalize(viewPos.xyz);
            float NdotV = dot(normal, viewDir);
            if (NdotV < 1e-6) {
                vec3 edgeNormal = normal - viewDir * NdotV;
                float weight = 1.0 - NdotV;
                weight = sin(min(weight, PI / 2.0));
                weight = clamp(min(max(NdotV, dot(viewDir, rawData.geoNormal)), 1.0 - weight), 0.0, 1.0);
                normal = viewDir * weight + edgeNormal * inversesqrt(dot(edgeNormal, edgeNormal) / (1.0 - weight * weight));
            }
            normal = mix(tbnMatrix[2], normal, exp2(-0.0002 * length(viewPos) / max(1e-6, dot(tbnMatrix[2], viewDir))));
        }
    #endif

    rawData.albedo = color;
    rawData.lightmap = blockLight;
    rawData.normal = normal;
    rawData.geoNormal = tbnMatrix[2];
    rawData.smoothness = 1.0 - float(materialID == MAT_TORCH);
    rawData.metalness = 0.0;
    rawData.porosity = 0.0;
    rawData.emissive = float(materialID == MAT_TORCH);
    rawData.materialID = materialID;
    rawData.parallaxOffset = 0.0;
    rawData.depth = 0.0;

    if (rainyStrength > 0.0) {
        float outdoor = clamp(15.0 * rawData.lightmap.y - 14.0, 0.0, 1.0);
        vec3 worldNormal = mat3(gbufferModelViewInverse) * rawData.geoNormal;
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
