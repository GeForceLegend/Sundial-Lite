#include "/libs/Materials.glsl"

#ifdef LOD
    mat4 projLod() {
        #ifdef DISTANT_HORIZONS
            return dhProjection;
        #endif
        #ifdef VOXY
            return vxProj;
        #endif
        return gbufferProjection;
    }

    mat4 projInvLod() {
        #ifdef DISTANT_HORIZONS
            return dhProjectionInverse;
        #endif
        #ifdef VOXY
            return vxProjInv;
        #endif
        return gbufferProjectionInverse;
    }

    mat4 projPrevLod() {
        #ifdef DISTANT_HORIZONS
            return dhPreviousProjection;
        #endif
        #ifdef VOXY
            return vxProjPrev;
        #endif
        return gbufferPreviousProjection;
    }

    float lodRenderDistance() {
        #ifdef DISTANT_HORIZONS
            return float(dhRenderDistance);
        #endif
        #ifdef VOXY
            return vxRenderDistance * 16.0;
        #endif
        return far;
    }

    float getLodDepthSolid(vec2 coord) {
        #ifdef DISTANT_HORIZONS
            return textureLod(dhDepthTex1, coord, 0.0).x;
        #endif
        #ifdef VOXY
            return textureLod(vxDepthTexOpaque, coord, 0.0).x;
        #endif
        return textureLod(depthtex1, coord, 0.0).x;
    }

    float getLodDepthSolidDeferred(vec2 coord) {
        #ifdef DISTANT_HORIZONS
            return textureLod(dhDepthTex0, coord, 0.0).x;
        #endif
        #ifdef VOXY
            return textureLod(vxDepthTexOpaque, coord, 0.0).x;
        #endif
        return textureLod(depthtex0, coord, 0.0).x;
    }

    float getLodDepthWater(vec2 coord) {
        #ifdef DISTANT_HORIZONS
            return textureLod(dhDepthTex0, coord, 0.0).x;
        #endif
        #ifdef VOXY
            return textureLod(vxDepthTexTrans, coord, 0.0).x;
        #endif
        return textureLod(depthtex0, coord, 0.0).x;
    }

    vec3 screenToViewPosLod(vec2 coord, float depth) {
        vec3 projPos = vec3(coord.xy, depth) * 2.0 - 1.0;
        #ifdef TAA
            projPos.xy -= taaOffset;
        #endif
        vec3 viewDirection = vec3(vec2(projInvLod()[0].x, projInvLod()[1].y) * projPos.xy, projInvLod()[3].z);
        viewDirection.xy += vec2(projInvLod()[3].xy);
        float viewDepth = projInvLod()[2].w * projPos.z + projInvLod()[3].w;
        return viewDirection / viewDepth;
    }

    vec3 projectionToViewPosLod(vec3 projPos) {
        vec3 viewDirection = vec3(vec2(projInvLod()[0].x, projInvLod()[1].y) * projPos.xy, projInvLod()[3].z);
        viewDirection.xy += vec2(projInvLod()[3].xy);
        float viewDepth = projInvLod()[2].w * projPos.z + projInvLod()[3].w;
        return viewDirection / viewDepth;
    }

    vec3 viewToProjectionPosLod(vec3 viewPos) {
        return -(vec3(projLod()[0].x, projLod()[1].y, projLod()[2].z) * viewPos + projLod()[3].xyz) / viewPos.z;
    }

    vec3 prevProjectionToViewPosLod(vec3 projPos) {
        projPos.xy += projPrevLod()[2].xy;
        projPos.x /= projPrevLod()[0].x;
        projPos.y /= projPrevLod()[1].y;
        projPos.z = projPrevLod()[3].z / (projPos.z + projPrevLod()[2].z);
        return vec3(projPos.xy * projPos.z, -projPos.z);
    }

    vec3 prevViewToProjectionPosLod(vec3 viewPos) {
        vec3 projPos = vec3(projPrevLod()[0].x, projPrevLod()[1].y, projPrevLod()[2].z) * viewPos;
        projPos.xy += projPrevLod()[2].xy * viewPos.z;
        projPos.z += projPrevLod()[3].z;
        return -projPos / viewPos.z;
    }

    float screenToViewDepthLod(float depth) {
        depth = depth * 2.0 - 1.0;
        return 1.0 / (depth * projInvLod()[2].w + projInvLod()[3].w);
    }

    float viewToScreenDepthLod(float depth) {
        depth = (1.0 / depth - projInvLod()[3].w) / projInvLod()[2].w;
        return depth * 0.5 + 0.5;
    }
#endif

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

float pack2x8Bit(vec2 x) {
    x = clamp(x, 0.0, 1.0);
    x = x * vec2(255.0 / 256.0) + vec2(256.5 / 256.0);
    uvec2 u = floatBitsToUint(x);
    uint p = (u.x & 0xFFFF8000u) + ((u.y & 0x007F8000u) >> 8) + 0x00000020u;
    return clamp(uintBitsToFloat(p) * 65536.0 / 65535.0 - 65536.0 / 65535.0, 0.0, 1.0);
}

vec2 unpack2x8Bit(float x) {
    uint u = floatBitsToUint(x * 65535.0 / 65536.0 + 65536.5 / 65536.0);
    uvec2 p = (uvec2(u, u << 8) & 0x007F8000u) | 0x3F800000u;
    return uintBitsToFloat(p) * 256.0 / 255.0 - 256.0 / 255.0;
}

float packM3P13(vec2 x) {
    x = clamp(x, 0.0, 1.0);
    x = x * vec2(7.0 / 8.0, 8191.0 / 8192.0) + vec2(8.5 / 8.0, 8192.5 / 8192.0);
    uvec2 u = floatBitsToUint(x);
    uint p = (u.x & 0xFFF00000u) + ((u.y & 0x007FFC00u) >> 3) + 0x00000020u;
    return clamp(uintBitsToFloat(p) * 65536.0 / 65535.0 - 65536.0 / 65535.0, 0.0, 1.0);
}

vec2 unpackM3P13(float x) {
    uint u = floatBitsToUint(x * 65535.0 / 65536.0 + 65536.5 / 65536.0);
    uvec2 p = (uvec2(u, u << 3) & uvec2(0x00700000u, 0x007FFC00u)) | 0x3F800000u;
    return uintBitsToFloat(p) * vec2(8.0 / 7.0, 8192.0 / 8191.0) - vec2(8.0 / 7.0, 8192.0 / 8191.0);
}

uint pack2x16Bit(vec2 x) {
    x = clamp(x, 0.0, 1.0);
    x = x * vec2(65535.0 / 65536.0) + vec2(65536.5 / 65536.0);
    uvec2 u = floatBitsToUint(x);
    uvec2 p = u & 0x007FFF80u;
    return (p.x >> 7) | (p.y << 9);
}

vec2 unpack2x16Bit(uint x) {
    uvec2 p = (uvec2(x << 7, x >> 9) & 0x007FFF80u) | 0x3F800000u;
    return uintBitsToFloat(p) * 65536.0 / 65535.0 - 65536.0 / 65535.0;
}

uint packF8D24(float frames, float depth) {
    frames = clamp(frames / 256.0, 0.0, 1.0);
    uint uFrames = (floatBitsToUint(frames + 1.0) << 9) & 0xFF000000u;
    uint uDepth = floatBitsToUint(abs(depth) + 1.0) & 0x007FFFFEu;
    uDepth += floatBitsToUint(depth) >> 31;
    return uFrames + uDepth;
}

vec2 unpackF8D24(uint x) {
    float frames = uintBitsToFloat(((x & 0xFF000000u) >> 9) | 0x3F800000u) * 256.0 - 256.0;
    uint signDepth = (x << 31) | 0x3F800000u;
    float depth = uintBitsToFloat((x & 0x007FFFFEu) | signDepth) - uintBitsToFloat(signDepth);
    return vec2(frames, depth);
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
    normal.z = sqrt(clamp(1.0 - dot(normal.xy, normal.xy), 0.0, 1.0));
    normal.xy = uintBitsToFloat(floatBitsToUint(clamp(abs(normal.xy) - 1.0 / 255.0, 0.0, 1.0)) | (floatBitsToUint(normal.xy) & 0x80000000u));
    return normal;
}

vec3 ClassicPBR(vec3 rawNormal) {
    vec3 normal = rawNormal * 2.0 - 1.0;
    normal.xy = uintBitsToFloat(floatBitsToUint(clamp(abs(normal.xy) - 1.0 / 255.0, 0.0, 1.0)) | (floatBitsToUint(normal.xy) & 0x80000000u));
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
        pack2x8Bit(vec2(rawData.lightmap.x, rawData.lightmap.y)),
        pack2x8Bit(vec2(rawData.smoothness, rawData.metalness)),
        pack2x8Bit(vec2(rawData.porosity, rawData.emissive)),
        packM3P13(vec2(rawData.materialID / 7.0, rawData.parallaxOffset))
    );
}

GbufferData getGbufferData(ivec2 texel, vec2 coord) {
    vec4 tex0 = texelFetch(colortex0, texel, 0);
    vec4 tex1 = texelFetch(colortex1, texel, 0);
    vec4 tex2 = texelFetch(colortex2, texel, 0);

    vec2 unpacked2g = unpack2x8Bit(tex2.g);
    vec2 unpacked2b = unpack2x8Bit(tex2.b);
    vec2 unpacked2a = unpackM3P13(tex2.a);

    GbufferData data;

    data.albedo = tex0;
    data.albedo.rgb = pow(data.albedo.rgb, vec3(2.2));
    decodeNormals(tex1, data.normal, data.geoNormal);
    data.lightmap = unpack2x8Bit(tex2.r);

    data.smoothness = unpacked2g.x;
    data.metalness = unpacked2g.y;
    data.porosity = unpacked2b.x;
    data.emissive = unpacked2b.y;

    data.materialID = round(unpacked2a.x * 7.0);
    data.parallaxOffset = unpacked2a.y;

    data.depth = textureLod(depthtex1, coord, 0.0).x;

    return data;
}

vec3 screenToViewPos(vec2 coord, float depth) {
    vec3 projPos = vec3(coord.xy, depth) * 2.0 - 1.0;
    #ifdef TAA
        projPos.xy -= taaOffset;
    #endif
    vec3 viewDirection = vec3(vec2(gbufferProjectionInverse[0].x, gbufferProjectionInverse[1].y) * projPos.xy, gbufferProjectionInverse[3].z);
    viewDirection.xy += gbufferProjectionInverse[3].xy;
    float viewDepth = gbufferProjectionInverse[2].w * projPos.z + gbufferProjectionInverse[3].w;
    return viewDirection / viewDepth;
}

vec3 projectionToViewPos(vec3 projPos) {
    vec3 viewDirection = vec3(vec2(gbufferProjectionInverse[0].x, gbufferProjectionInverse[1].y) * projPos.xy, gbufferProjectionInverse[3].z);
    viewDirection.xy += gbufferProjectionInverse[3].xy;
    float viewDepth = gbufferProjectionInverse[2].w * projPos.z + gbufferProjectionInverse[3].w;
    return viewDirection / viewDepth;
}

vec3 viewToProjectionPos(vec3 viewPos) {
    vec3 projPos = vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * viewPos;
    projPos.z += gbufferProjection[3].z;
    projPos.xy += gbufferProjection[2].xy * viewPos.z;
    return -projPos / viewPos.z;
}

vec3 viewToWorldPos(vec3 viewPos) {
    return mat3(gbufferModelViewInverse) * viewPos + gbufferModelViewInverse[3].xyz;
}

vec3 worldToViewPos(vec3 worldPos) {
    return mat3(gbufferModelView) * worldPos + gbufferModelView[3].xyz;
}

vec3 prevProjectionToViewPos(vec3 projPos) {
    projPos.xy += gbufferPreviousProjection[2].xy;
    projPos.x /= gbufferPreviousProjection[0].x;
    projPos.y /= gbufferPreviousProjection[1].y;
    projPos.z = gbufferPreviousProjection[3].z / (projPos.z + gbufferPreviousProjection[2].z);
    return vec3(projPos.xy * projPos.z, -projPos.z);
}

vec3 prevViewToProjectionPos(vec3 viewPos) {
    vec3 projPos = vec3(gbufferPreviousProjection[0].x, gbufferPreviousProjection[1].y, gbufferPreviousProjection[2].z) * viewPos;
    projPos.xy += gbufferPreviousProjection[2].xy * viewPos.z;
    projPos.z += gbufferPreviousProjection[3].z;
    return -projPos / viewPos.z;
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

uvec2 projIntersection(vec4 origin, vec4 direction, vec2 targetCoord) {
    return floatBitsToUint((targetCoord * origin.ww - origin.xy) / (direction.xy - targetCoord * direction.ww));
}

float projIntersectionScreenEdge(vec4 origin, vec4 direction) {
    uvec2 intersectionAA = projIntersection(origin, direction, vec2(1.0));
    uvec2 intersectionBB = projIntersection(origin, direction, vec2(-1.0));
    uint intersection = min(min(intersectionAA.x, intersectionAA.y), min(intersectionBB.x, intersectionBB.y));
    float depthLimit = far;
    #ifdef LOD
        depthLimit = lodRenderDistance() * 1.01;
    #endif
    intersection = min(intersection, floatBitsToUint(depthLimit + 32.0));
    return uintBitsToFloat(intersection);
}
