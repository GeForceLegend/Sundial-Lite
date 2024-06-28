#include "/libs/Materials.glsl"

struct GbufferData {
    vec4 albedo;
    vec3 normal;
    vec3 geoNormal;
    vec2 lightmap;
    float smoothness;
    float metalness;
    float porosity;
    float emissive;
    float materialID;
    float parallaxOffset;
    float depth;
};

vec2 encodeNormal(vec3 normal) {
    normal.xy /= dot(vec3(1.0), abs(normal));
    float useInv = clamp(normal.z * -1e+10, 0.0, 1.0);
    vec2 normalInv = uintBitsToFloat(floatBitsToUint(vec2(1.0) - abs(normal.yx)) ^ (floatBitsToUint(normal.xy) & 0x80000000u));
    normal.xy = mix(normal.xy, normalInv, vec2(useInv));
    return normal.xy * 0.5 + 0.5;
}

vec3 decodeNormal(vec2 data) {
    data = data * 2.0 - 1.0;
    vec3 normal = vec3(data, 1.0 - abs(data.x) - abs(data.y));
    float useInv = clamp(normal.z * -1e+10, 0.0, 1.0);
    vec2 normalInv = uintBitsToFloat(floatBitsToUint(vec2(1.0) - abs(normal.yx)) ^ (floatBitsToUint(normal.xy) & 0x80000000u));
    normal.xy = mix(normal.xy, normalInv, vec2(useInv));
    return normalize(normal);
}

void decodeNormals(vec4 rawData, inout vec3 normal, inout vec3 geoNormal) {
    rawData = rawData * 2.0 - 1.0;
    vec2 normalZ = vec2(1.0) - abs(rawData.xz) - abs(rawData.yw);
    vec2 useInv = clamp(normalZ * -1e+10, vec2(0.0), vec2(1.0));
    vec4 normalInv = uintBitsToFloat(floatBitsToUint(vec4(1.0) - abs(rawData.yxwz)) ^ (floatBitsToUint(rawData) & 0x80000000u));
    rawData = mix(rawData, normalInv, vec4(vec2(useInv.x), vec2(useInv.y)));
    normal = normalize(vec3(rawData.xy, normalZ.x));
    geoNormal = normalize(vec3(rawData.zw, normalZ.y));
}

float packUp2x8Bits(float rawData0, float rawData1) {
    float data;
    vec2 dataSet = vec2(rawData0, rawData1);
    dataSet = floor(dataSet * 255.0);

    data = dataSet.x * 256.0 + dataSet.y;
    data /= 65535.0;

    return data;
}

vec2 unpack16Bit(float rawData) {
    rawData *= 65535.0;

    vec2 data;
    data.x = floor(rawData / 256.0);
    data.y = rawData - data.x * 256.0;

    data = clamp(data / 255.0, vec2(0.0), vec2(1.0));

    return data;
}

void LabPBR(inout GbufferData dataSet, vec4 specularData) {
    dataSet.smoothness = specularData.r;
    dataSet.metalness = specularData.g;
    dataSet.porosity = specularData.b;
    dataSet.emissive = specularData.a * step(specularData.a, 0.999);
}

void ClassicPBR(inout GbufferData dataSet, vec4 specularData) {
    dataSet.smoothness = specularData.r;
    dataSet.metalness = specularData.g;
    dataSet.porosity = 0.0;
    dataSet.emissive = specularData.b;
}

void BedrockRTX(inout GbufferData dataSet, vec4 specularData) {
    dataSet.smoothness = 1.0 - specularData.b;
    dataSet.metalness = specularData.r;
    dataSet.porosity = 0.0;
    dataSet.emissive = specularData.g;
}

vec3 LabPBR(vec3 rawNormal) {
    vec3 normal = rawNormal * 2.0 - 1.0;
    normal.z = sqrt(1.0 - clamp(dot(normal.xy, normal.xy), 0.0, 1.0));
    normal.xy = uintBitsToFloat(floatBitsToUint(clamp(abs(normal.xy) - 1.0 / 255.0, 0.0, 1.0)) ^ (floatBitsToUint(normal.xy) & 0x80000000u));
    return normal;
}

vec3 ClassicPBR(vec3 rawNormal) {
    vec3 normal = rawNormal * 2.0 - 1.0;
    normal.xy = uintBitsToFloat(floatBitsToUint(clamp(abs(normal.xy) - 1.0 / 255.0, 0.0, 1.0)) ^ (floatBitsToUint(normal.xy) & 0x80000000u));
    return normal;
}

vec3 getNormalTexel(ivec2 texel) {
    vec2 rawData = texelFetch(colortex1, texel, 0).xy;
    return decodeNormal(rawData);
}

void getBothNormalsTexel(ivec2 texel, out vec3 normal, out vec3 geoNormal) {
    vec4 rawData = texelFetch(colortex1, texel, 0);
    normal = decodeNormal(rawData.xy);
    geoNormal = decodeNormal(rawData.zw);
}

float getSolidDepth(vec2 coord) {
    return textureLod(depthtex1, coord, 0.0).x;
}

float getWaterDepth(vec2 coord) {
    return textureLod(depthtex0, coord, 0.0).x;
}

void packUpGbufferDataSolid(in GbufferData rawData, out vec4 data0, out vec4 data1, out vec4 data2) {
    // colortex0 RGBA8
    data0 = rawData.albedo;

    // colortex1 RGBA16
    data1 = vec4(encodeNormal(rawData.normal), encodeNormal(rawData.geoNormal));

    // colortex2 RGBA16
    data2 = vec4(
        packUp2x8Bits(rawData.lightmap.x, rawData.lightmap.y),
        packUp2x8Bits(rawData.smoothness, rawData.metalness),
        packUp2x8Bits(rawData.porosity, rawData.emissive),
        packUp2x8Bits(rawData.materialID / 255.0, rawData.parallaxOffset)
    );
}

GbufferData getGbufferData(ivec2 texel, vec2 coord) {
    vec4 tex0 = texelFetch(colortex0, texel, 0);
    vec4 tex1 = texelFetch(colortex1, texel, 0);
    vec4 tex2 = texelFetch(colortex2, texel, 0);

    vec2 unpacked2g = unpack16Bit(tex2.g);
    vec2 unpacked2b = unpack16Bit(tex2.b);
    vec2 unpacked2a = unpack16Bit(tex2.a);

    GbufferData data;

    data.albedo = pow(tex0, vec4(vec3(2.2), 1.0));
    decodeNormals(tex1, data.normal, data.geoNormal);
    data.lightmap = unpack16Bit(tex2.r);

    data.smoothness = unpacked2g.x;
    data.metalness = unpacked2g.y;
    data.porosity = unpacked2b.x;
    data.emissive = unpacked2b.y;

    data.materialID = round(unpacked2a.x * 255.0);
    data.parallaxOffset = unpacked2a.y;

    data.depth = textureLod(depthtex1, coord, 0.0).x;

    return data;
}

vec3 screenToViewPos(vec2 coord, float depth) {
    vec3 projPos = vec3(coord.xy, depth) * 2.0 - 1.0;
    #ifdef TAA
        projPos.xy -= taaOffset;
    #endif
    vec4 viewPos = vec4(gbufferProjectionInverse[0].x, gbufferProjectionInverse[1].y, gbufferProjectionInverse[2].zw) * projPos.xyzz + gbufferProjectionInverse[3];
    return viewPos.xyz / viewPos.w;
}

vec3 projectionToViewPos(vec3 projPos) {
    vec4 viewPos = vec4(gbufferProjectionInverse[0].x, gbufferProjectionInverse[1].y, gbufferProjectionInverse[2].zw) * projPos.xyzz + gbufferProjectionInverse[3];
    return viewPos.xyz / viewPos.w;
}

vec3 viewToProjectionPos(vec3 viewPos) {
    return -(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * viewPos + gbufferProjection[3].xyz) / viewPos.z;
}

vec3 viewToWorldPos(vec3 viewPos) {
    return mat3(gbufferModelViewInverse) * viewPos + gbufferModelViewInverse[3].xyz;
}

vec3 worldToViewPos(vec3 worldPos) {
    return mat3(gbufferModelView) * worldPos + gbufferModelView[3].xyz;
}

vec3 prevProjectionToViewPos(vec3 projPos) {
    projPos.x /= gbufferPreviousProjection[0].x;
    projPos.y /= gbufferPreviousProjection[1].y;
    projPos.z = gbufferPreviousProjection[3].z / (projPos.z + gbufferPreviousProjection[2].z);
    return vec3(projPos.xy * projPos.z, -projPos.z);
}

vec3 prevViewToProjectionPos(vec3 viewPos) {
    return -(vec3(gbufferPreviousProjection[0].x, gbufferPreviousProjection[1].y, gbufferPreviousProjection[2].z) * viewPos + gbufferPreviousProjection[3].xyz) / viewPos.z;
}

vec3 prevViewToWorldPos(vec3 viewPos) {
    return (viewPos - gbufferPreviousModelView[3].xyz) * mat3(gbufferPreviousModelView);
}

vec3 prevWorldToViewPos(vec3 worldPos) {
    return mat3(gbufferPreviousModelView) * worldPos + gbufferPreviousModelView[3].xyz;
}

float screenToViewDepth(float depth) {
    depth = depth * 2.0 - 1.0;
    return 1.0 / (depth * gbufferProjectionInverse[2].w + gbufferProjectionInverse[3].w);
}

float viewToScreenDepth(float depth) {
    depth = (1.0 / depth - gbufferProjectionInverse[3].w) / gbufferProjectionInverse[2].w;
    return depth * 0.5 + 0.5;
}