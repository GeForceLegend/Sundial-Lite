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

#define WATER_WAVE_SCALE 1.0 // [0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
#define WATER_WAVE_HEIGHT 0.4 // [0.0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Common.glsl"
#include "/libs/PhysicsOcean.glsl"

#ifdef PHYSICS_OCEAN
    in vec3 physics_localPosition;
    in float physics_localWaviness;
#endif

float sampleWaterHeight(vec2 coord) {
    coord = coord;

    vec2 whole = floor(coord);
    vec2 part = coord - whole;

    part *= part * (3.0 / 64.0 - 2.0 / 64.0 * part);
    coord = whole / 64.0 + part - 1.0 / 128.0;

    return textureLod(noisetex, coord, 0.0).x;
}

float waterWaveHeight(vec2 coord) {
    float totalHeight = 0.0;

    const mat2 rotation1 = mat2(cos(-0.2), sin(-0.2), -sin(-0.2), cos(-0.2));
    const vec2 scale1 = vec2(0.8, 0.4) * 64.0;
    vec2 speed = vec2(0.03, 0.01) * frameTimeCounter * WATER_WAVE_SPEED;
    totalHeight += sampleWaterHeight(rotation1 * (coord + speed) * scale1);

    const mat2 rotation2 = mat2(cos(0.2), sin(0.2), -sin(0.2), cos(0.2));
    const vec2 scale2 = vec2(1.2, 0.6) * 64.0;
    speed = -0.75 * vec2(0.03, -0.01) * frameTimeCounter * WATER_WAVE_SPEED;
    totalHeight += sampleWaterHeight(rotation2 * (coord + speed) * scale2) * 0.4;

    const vec2 scale3 = vec2(1.5, 2.0) * 64.0;
    speed = 0.3 * vec2(0.01, -0.05) * frameTimeCounter * WATER_WAVE_SPEED;
    totalHeight += sampleWaterHeight((coord + speed) * scale3) * 0.2;

    totalHeight /= 1.0 + 0.4 + 0.2;

    return totalHeight;
}

vec2 sampleWaterNormal(vec2 coord, vec2 scale) {
    vec4 sh = textureGather(noisetex, coord - 1.0 / 128.0, 0);
    coord = coord * 64.0 + 65535.0;

    vec2 fpc = fract(coord);
    vec2 weight = fpc * fpc * (3.0 - 2.0 * fpc);

    sh.y = sh.w + sh.y - sh.x - sh.z;
    vec2 normal = (sh.yy * weight.yx + (sh.zx - sh.ww)) * fpc * (6.0 * fpc - 6.0) * scale;
    return normal;
}

vec2 waterWaveNormal(vec2 coord) {
    vec2 totalNormal = vec2(0.0);

    const mat2 rotation1 = mat2(cos(-0.2), sin(-0.2), -sin(-0.2), cos(-0.2));
    const vec2 scale1 = vec2(0.8, 0.4);
    vec2 speed = vec2(0.03, 0.01) * frameTimeCounter * WATER_WAVE_SPEED;
    totalNormal += sampleWaterNormal(rotation1 * (coord + speed) * scale1, rotation1 * scale1);

    const mat2 rotation2 = mat2(cos(0.2), sin(0.2), -sin(0.2), cos(0.2));
    const vec2 scale2 = vec2(1.2, 0.6);
    speed = -0.75 * vec2(0.03, -0.01) * frameTimeCounter * WATER_WAVE_SPEED;
    totalNormal += sampleWaterNormal(rotation2 * (coord + speed) * scale2, rotation2 * scale2) * 0.4;

    const vec2 scale3 = vec2(1.5, 2.0);
    speed = 0.3 * vec2(0.01, -0.05) * frameTimeCounter * WATER_WAVE_SPEED;
    totalNormal += sampleWaterNormal((coord + speed) * scale3, scale3) * 0.2;

    totalNormal /= 1.0 + 0.4 + 0.2;

    return totalNormal.xy;
}

vec3 waterWave(vec3 position, vec3 tangentDir) {
    position /= (WATER_WAVE_SCALE);
    vec2 coord = position.xz + vec2(position.y);

    const vec3 stepScale = vec3(vec2(0.2 * WATER_WAVE_HEIGHT / (WATER_WAVE_SCALE * 32.0)), 1.0);
    vec3 stepSize = tangentDir * stepScale;
    stepSize *= 0.02 / abs(stepSize.z);

    vec3 samplePos = vec3(coord, 0.6);
    float originHeight = waterWaveHeight(samplePos.xy);
    float sampleDir = samplePos.z - originHeight;
    for (int i = 1; i < 30; i++) {
        samplePos += signMul(stepSize, vec3(sampleDir));
        float sampleHeight = waterWaveHeight(samplePos.xy);
        float prevSampleDir = sampleDir;
        sampleDir = samplePos.z - sampleHeight;
        if (sampleDir * prevSampleDir < 0.0) {
            break;
        }
    }
    vec2 sampleNormal = waterWaveNormal(samplePos.xy);

    return normalize(vec3(sampleNormal * 64.0, 1.0) * stepScale);
}

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

    float outdoor = clamp(15.0 * rawData.lightmap.y - 14.0, 0.0, 1.0);
    #if RAIN_WET == 1
        float rainWetness = clamp(worldNormal.y * 10.0 + 0.5, 0.0, 1.0) * outdoor * rainyStrength;
        rawData.smoothness += (1.0 - rawData.metalness) * (1.0 - rawData.smoothness) * clamp(rainWetness, 0.0, 1.0);
    #elif RAIN_WET == 2
        rawData.smoothness = groundWetSmoothness(mcPos, worldNormal.y, rawData.smoothness, rawData.metalness, 0.0, outdoor);
    #endif

    packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
}

/* DRAWBUFFERS:012 */
