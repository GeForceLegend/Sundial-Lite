#extension GL_ARB_shading_language_packing : enable

layout(triangles) in;
layout(triangle_strip, max_vertices = 3) out;

in vec4 vTexlmCoord[];
in vec3 vColor[];
in vec3 vWorldPos[];

in uint vMaterial[];

out vec4 texlmcoord;
out vec3 color;

flat out uvec3 blockData;
flat out vec3 viewNormal;

#define SKYLIGHT_FIX

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"

void main() {
    vec3 posDiff0 = vWorldPos[0] - vWorldPos[1];
    vec3 posDiff1 = vWorldPos[1] - vWorldPos[2];
    vec3 worldNormal = normalize(cross(posDiff0, posDiff1));

    vec3 dPosPerpX = cross(worldNormal, posDiff0);
    vec3 dPosPerpY = cross(posDiff1, worldNormal);
    dPosPerpX /= dot(posDiff1, dPosPerpX);
    dPosPerpY /= dot(posDiff0, dPosPerpY);

    vec3 tangent = dPosPerpY * (vTexlmCoord[0].x - vTexlmCoord[1].x) + dPosPerpX * (vTexlmCoord[1].x - vTexlmCoord[2].x);
    vec3 bitangent = dPosPerpY * (vTexlmCoord[0].y - vTexlmCoord[1].y) + dPosPerpX * (vTexlmCoord[1].y - vTexlmCoord[2].y);

    vec3 normal = mat3(gbufferModelView) * worldNormal;
    float bitangentLenInv = inversesqrt(dot(bitangent, bitangent));
    bitangentLenInv = signMul(bitangentLenInv, dot(cross(worldNormal, tangent), bitangent));
    tangent = mat3(gbufferModelView) * tangent;
    vec4 tangentData = vec4(tangent, bitangentLenInv);
    uvec3 data = uvec3(vMaterial[0], packHalf2x16(tangentData.xy), packHalf2x16(tangentData.zw));

    #ifdef SKYLIGHT_FIX
        #ifdef SHADOW_AND_SKY
            float fixDirection = signI(vTexlmCoord[0].w + vTexlmCoord[1].w + vTexlmCoord[2].w - 1.5);
            vec3 skyLightDir = fixDirection * (dPosPerpY * (vTexlmCoord[0].w - vTexlmCoord[1].w) + dPosPerpX * (vTexlmCoord[1].w - vTexlmCoord[2].w));

            vec3 skyLightDirSigned = uintBitsToFloat((floatBitsToUint(skyLightDir) & 0x80000000u) | 0x3F800000u);
            vec3 skyLightFixStrengthRaw = skyLightDir * step(vec3(1.8 / 15.0), abs(skyLightDir));

            vec3 skyLightFixStrengthAbs = abs(skyLightFixStrengthRaw);
            float maximumFixStrength = max(skyLightFixStrengthAbs.x, max(skyLightFixStrengthAbs.y, skyLightFixStrengthAbs.z)) - 1e-5;
            vec3 skyLightFixStrength = skyLightFixStrengthRaw * step(vec3(maximumFixStrength), skyLightFixStrengthAbs);
            vec3 skyLightFixStrengthAlt = skyLightFixStrengthRaw - skyLightFixStrength;

            vec3 maximumLightVertex = max(vWorldPos[0] * skyLightDirSigned, max(vWorldPos[1] * skyLightDirSigned, vWorldPos[2] * skyLightDirSigned));
            vec3 maximumLightPos = skyLightDirSigned * ceil(maximumLightVertex - vec3(1e-3));
            float maximumLight = dot(maximumLightPos, skyLightFixStrength);

            vec4 minimumLightVertex = vec4(vWorldPos[0], vTexlmCoord[0].w * fixDirection);
            skyLightFixStrength += skyLightFixStrengthAlt;
            float minimumLight1 = vTexlmCoord[1].w * fixDirection;
            if (minimumLightVertex.w > minimumLight1) {
                minimumLightVertex = vec4(vWorldPos[1], minimumLight1);
            }
            if (minimumLightVertex.w > vTexlmCoord[2].w * fixDirection) {
                minimumLightVertex.xyz = vWorldPos[2];
            }
            maximumLight += dot(minimumLightVertex.xyz, skyLightFixStrengthAlt);
            maximumLight *= fixDirection;
            skyLightFixStrength *= fixDirection;
        #endif
    #endif

    for (int i = 0; i < 3; i++) {
        gl_Position = gl_in[i].gl_Position;

        color = vColor[i];
        texlmcoord = vTexlmCoord[i];

        blockData = data;
        viewNormal = normal;

        #if defined SKYLIGHT_FIX && defined SHADOW_AND_SKY
            texlmcoord.w = clamp(texlmcoord.w + maximumLight - dot(vWorldPos[i], skyLightFixStrength), 0.0, 1.0);
        #endif

        EmitVertex();
    }
    EndPrimitive();
}
