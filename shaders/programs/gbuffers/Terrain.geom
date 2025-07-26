#extension GL_ARB_shading_language_packing : enable

layout(triangles) in;
layout(triangle_strip, max_vertices = 3) out;

in vec4 vTexlmCoord[];
in vec3 vColor[];

in uint vMaterial[];

out vec4 texlmcoord;
out vec3 color;

flat out uint material;
flat out uvec2 blockData;
flat out vec3 viewNormal;
flat out vec4 skyLightFix;
flat out vec4 coordRange;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"

vec3 clipToWorldPosition(vec4 clipPos) {
    #ifdef TAA
        clipPos.xy -= taaOffset * clipPos.w;
    #endif
    vec3 viewPos = (gbufferProjectionInverse * clipPos).xyz;
    vec3 worldPos = mat3(gbufferModelViewInverse) * viewPos + gbufferModelViewInverse[3].xyz;
    return worldPos.xyz;
}

void main() {
    vec3 worldPos0 = clipToWorldPosition(gl_in[0].gl_Position);
    vec3 worldPos1 = clipToWorldPosition(gl_in[1].gl_Position);
    vec3 worldPos2 = clipToWorldPosition(gl_in[2].gl_Position);

    vec3 posDiff0 = worldPos0 - worldPos1;
    vec3 posDiff1 = worldPos1 - worldPos2;
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
    uvec2 data = uvec2(packHalf2x16(tangentData.xy), packHalf2x16(tangentData.zw));

    float fixDirection = signI(vTexlmCoord[0].w + vTexlmCoord[1].w + vTexlmCoord[2].w - 1.5);
    vec3 skyLightDir = fixDirection * (dPosPerpY * (vTexlmCoord[0].w - vTexlmCoord[1].w) + dPosPerpX * (vTexlmCoord[1].w - vTexlmCoord[2].w));

    vec3 skyLightDirSigned = signI(skyLightDir);
    vec3 skyLightFixStrengthRaw = skyLightDir * step(vec3(1.8 / 15.0), abs(skyLightDir));

    vec3 skyLightFixStrengthAbs = abs(skyLightFixStrengthRaw);
    float maximumFixStrength = max(skyLightFixStrengthAbs.x, max(skyLightFixStrengthAbs.y, skyLightFixStrengthAbs.z)) - 1e-5;
    vec3 skyLightFixStrength = skyLightFixStrengthRaw * step(vec3(maximumFixStrength), skyLightFixStrengthAbs);
    vec3 skyLightFixStrengthAlt = skyLightFixStrengthRaw - skyLightFixStrength;

    vec3 maximumLightVertex = max(worldPos0 * skyLightDirSigned, max(worldPos1 * skyLightDirSigned, worldPos2 * skyLightDirSigned)) + cameraPosition * skyLightDirSigned;
    vec3 maximumLightPos = skyLightDirSigned * ceil(maximumLightVertex - vec3(1e-3));
    float maximumLight = dot(maximumLightPos, skyLightFixStrength);

    vec4 minimumLightVertex = vec4(worldPos0, vTexlmCoord[0].w * fixDirection);
    float minimumLight1 = vTexlmCoord[1].w * fixDirection;
    if (minimumLightVertex.w > minimumLight1) {
        minimumLightVertex = vec4(worldPos1, minimumLight1);
    }
    if (minimumLightVertex.w > vTexlmCoord[2].w * fixDirection) {
        minimumLightVertex.xyz = worldPos2;
    }
    maximumLight += dot(minimumLightVertex.xyz + cameraPosition, skyLightFixStrengthAlt);
    maximumLight *= fixDirection;
    skyLightFixStrengthRaw *= fixDirection;

    vec2 minCoord = min(vTexlmCoord[0].st, min(vTexlmCoord[1].st, vTexlmCoord[2].st));
    vec2 maxCoord = max(vTexlmCoord[0].st, max(vTexlmCoord[1].st, vTexlmCoord[2].st));

    blockData = data;
    viewNormal = normal;
    skyLightFix = vec4(skyLightFixStrengthRaw, maximumLight);
    vec2 albedoTexSize = textureSize(gtexture, 0);
    coordRange = round(vec4(minCoord, (maxCoord - minCoord)) * vec4(albedoTexSize, albedoTexSize)) / vec4(albedoTexSize, albedoTexSize);

    for (int i = 0; i < 3; i++) {
        gl_Position = gl_in[i].gl_Position;

        texlmcoord = vTexlmCoord[i];
        color = vColor[i];

        material = vMaterial[i];

        EmitVertex();
    }
    EndPrimitive();
}
