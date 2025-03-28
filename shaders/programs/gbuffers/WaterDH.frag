#extension GL_ARB_gpu_shader5 : enable
#extension GL_ARB_shading_language_packing : enable

layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

in vec4 color;
in vec3 viewPos;
in vec2 blockLight;
in mat3 tbnMatrix;
flat in float materialID;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Common.glsl"
#include "/libs/Water.glsl"
#include "/libs/Parallax.glsl"

void main() {
    vec3 worldPos = viewToWorldPos(viewPos);
    if (max(dot(worldPos.xz, worldPos.xz), worldPos.y * worldPos.y) < (far - 16.0) * (far - 16.0) || texture2D(depthtex1, gl_FragCoord.st * texelSize).r < 1.0) {
        discard;
    }

    GbufferData rawData;

    rawData.albedo = color;
    rawData.lightmap = blockLight;
    rawData.geoNormal = tbnMatrix[2];
    rawData.smoothness = 1.0 - float(materialID == MAT_TORCH);
    rawData.metalness = 0.0;
    rawData.porosity = 0.0;
    rawData.emissive = float(materialID == MAT_TORCH);
    rawData.materialID = materialID;
    rawData.parallaxOffset = 0.0;
    rawData.depth = 0.0;

    vec3 mcPos = worldPos + cameraPosition;
    float wetStrength = 0.0;
    if (rainyStrength > 0.0) {
        float outdoor = clamp(15.0 * rawData.lightmap.y - 14.0, 0.0, 1.0);
        vec3 worldNormal = mat3(gbufferModelViewInverse) * rawData.geoNormal;
        if (rawData.materialID == MAT_WATER) {
            wetStrength = outdoor * clamp(abs(worldNormal.y) * 10.0 - 0.1, 0.0, 1.0);
        }
        else {
            #if RAIN_PUDDLE == 1
                wetStrength = (1.0 - rawData.metalness) * clamp(worldNormal.y * 10.0 - 0.1, 0.0, 1.0) * outdoor * rainyStrength;
            #elif RAIN_PUDDLE == 2
                wetStrength = groundWetStrength(mcPos, worldNormal.y, rawData.metalness, 0.0, outdoor);
            #endif
        }
        rawData.smoothness += (1.0 - rawData.smoothness) * wetStrength;
    }

    vec3 normal = tbnMatrix[2];
    float viewDepthInv = inversesqrt(dot(viewPos.xyz, viewPos.xyz));
    vec3 rippleNormal = vec3(0.0, 0.0, 1.0);
    #ifdef RAIN_RIPPLES
        rippleNormal = rainRippleNormal(mcPos);
        rippleNormal.xy *= viewDepthInv / (viewDepthInv + 0.1 * RIPPLE_FADE_SPEED);
    #endif
    #if WATER_TYPE == 0
        if (materialID == MAT_WATER) {
            vec3 tangentDir = transpose(tbnMatrix) * viewPos.xyz;
            normal = waterWave(mcPos / 32.0, tangentDir);
            normal.xy += rippleNormal.xy * wetStrength;
            normal = normalize(tbnMatrix * normal);

            vec3 viewDir = viewPos.xyz * (-viewDepthInv);
            float NdotV = dot(normal, viewDir);
            if (NdotV < 1e-6) {
                vec3 edgeNormal = normal - viewDir * NdotV;
                float weight = 1.0 - NdotV;
                weight = sin(min(weight, PI / 2.0));
                weight = clamp(min(max(NdotV, dot(viewDir, rawData.geoNormal)), 1.0 - weight), 0.0, 1.0);
                normal = viewDir * weight + edgeNormal * inversesqrt(dot(edgeNormal, edgeNormal) / (1.0 - weight * weight));
            }
            normal = mix(tbnMatrix[2], normal, exp2(-0.0002 / max(1e-6, dot(tbnMatrix[2], viewDir) * viewDepthInv)));
        } else
    #endif
    {
        normal = mix(normal, tbnMatrix * rippleNormal, wetStrength);
    }
    rawData.normal = normal;

    packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
}

/* DRAWBUFFERS:012 */
