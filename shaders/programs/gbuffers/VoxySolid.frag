layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

const float PI = 3.1415926535897;

vec2 taaOffset = vec2(0.0);

uniform sampler2D colortex0;
uniform sampler2D colortex1;
uniform sampler2D colortex2;

#include "/settings/GlobalSettings.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Common.glsl"
#include "/libs/Water.glsl"
#include "/libs/Parallax.glsl"

void voxy_emitFragment(VoxyFragmentParameters parameters) {
    GbufferData rawData;
    rawData.albedo = parameters.sampledColour * parameters.tinting;

    vec3 worldNormal = vec3(
        float((parameters.face >> 2) & 1u),
        0.0,
        float((parameters.face >> 1) & 1u)
    );
    worldNormal.y = 1.0 - worldNormal.x - worldNormal.z;
    worldNormal *= uintBitsToFloat((parameters.face << 31) ^ 0xBF800000u);
    vec3 viewNormal = mat3(gbufferModelView) * worldNormal;
    rawData.normal = viewNormal;
    rawData.geoNormal = viewNormal;

    rawData.lightmap = clamp(parameters.lightMap * 16.0 / 15.0 - 0.5 / 15.0, 0.0, 1.0);
    rawData.smoothness = 0.0;
    rawData.metalness = 0.0;
    rawData.porosity = 0.0;
    rawData.emissive = 0.0;
    rawData.materialID = MAT_OPAQUE;
    rawData.parallaxOffset = 0.0;
    rawData.depth = 0.0;

    float blockId = parameters.customId;
    float emissive = float(511.5 < blockId && blockId < 2048.5 && rawData.emissive < 1e-3);
    if (abs(blockId - 188.5) < 1.0 || blockId == 265 || abs(blockId - 225.5) < 31 || abs(blockId - 736.5) < 31) {
        rawData.materialID = MAT_GRASS;
        rawData.porosity = 0.5;
    }
    else if (blockId == 2) {
        rawData.materialID = MAT_LEAVES;
        rawData.porosity = 0.7;
    }
    else if (blockId == 119) {
        rawData.materialID = MAT_CAULDRON;
        if (abs(parameters.tinting.r - parameters.tinting.b) > 1e-5) {
            rawData.materialID = MAT_WATER;
            parameters.tinting.rgb *= 0.5;
            rawData.smoothness = 1.0;
        }
    }
    else if (blockId == 513 || abs(blockId - 669) < 5.5) {
        rawData.materialID = MAT_TORCH;
        emissive *= 0.57 * length(rawData.albedo.rgb);
    }
    else if (blockId == 514) {
        rawData.materialID = MAT_LAVA;
    }
    else if (blockId == 630) {
        emissive = float(rawData.albedo.r - rawData.albedo.b > 0.3);
        rawData.materialID = MAT_LAVA_CAULDRON;
    }
    else if (abs(blockId - 681.5) < 1.0) {
        emissive = 0.0;
        rawData.materialID = MAT_BREWING_STAND;
    }
    else if (abs(blockId - 702.5) < 3.5) {
        rawData.materialID = MAT_GLOWING_BERRIES;
        emissive *= clamp(2.0 * rawData.albedo.r - 1.5 * rawData.albedo.g, 0.0, 1.0);
    }
    #ifndef HARDCODED_EMISSIVE
        emissive = 0.0;
    #endif
    #ifdef MOD_LIGHT_DETECTION
        emissive += float(rawData.lightmap.x > 0.99999 && rawData.emissive < 1e-3 && blockId < -0.5);
    #endif
    rawData.emissive = emissive;

    vec3 tangent = mat3(gbufferModelView) * vec3(abs(worldNormal.y) + worldNormal.z, 0.0, -worldNormal.x);
    vec3 bitangent = mat3(gbufferModelView) * vec3(0.0, abs(worldNormal.y) - 1.0, worldNormal.y);
    mat3 tbnMatrix = mat3(tangent, bitangent, viewNormal);

    vec3 viewPos = screenToViewPosLod(gl_FragCoord.st * texelSize - 0.5 * taaOffsetVX, gl_FragCoord.z);
    vec3 mcPos = viewToWorldPos(viewPos) + cameraPosition;

    float wetStrength = 0.0;
    vec3 rippleNormal = vec3(0.0, 0.0, 1.0);
    float viewDepthInv = inversesqrt(dot(viewPos, viewPos));
    vec3 viewDir = viewPos * (-viewDepthInv);
    if (rainyStrength > 0.0 && rawData.materialID != MAT_LAVA) {
        float outdoor = clamp(15.0 * rawData.lightmap.y - 14.0, 0.0, 1.0);

        vec3 worldNormal = mat3(gbufferModelViewInverse) * rawData.geoNormal;
        #if RAIN_PUDDLE == 1
            wetStrength = (1.0 - rawData.metalness) * clamp(worldNormal.y * 10.0 - 0.1, 0.0, 1.0) * outdoor * rainyStrength;
        #elif RAIN_PUDDLE == 2
            wetStrength = groundWetStrength(mcPos, worldNormal.y, rawData.metalness, 1.0, outdoor);
        #endif
        rawData.smoothness += (1.0 - rawData.smoothness) * wetStrength;

        #ifdef RAIN_RIPPLES
            rippleNormal = rainRippleNormal(mcPos);
            rippleNormal.xy *= viewDepthInv / (viewDepthInv + 0.1 * RIPPLE_FADE_SPEED);
        #endif
    }
    rawData.normal = mix(vec3(0.0, 0.0, 1.0), rippleNormal, wetStrength);
    rawData.normal = normalize(tbnMatrix * rawData.normal);

    float NdotV = dot(rawData.normal, viewDir);
    vec3 edgeNormal = rawData.normal - viewDir * NdotV;
    float curveStart = dot(viewDir, tbnMatrix[2]);
    float weight = clamp(curveStart - curveStart * exp(NdotV / curveStart - 1.0), 0.0, 1.0);
    weight = max(NdotV, curveStart) - weight;
    rawData.normal = viewDir * weight + edgeNormal * inversesqrt(dot(edgeNormal, edgeNormal) / (1.0 - weight * weight));

    packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
}
