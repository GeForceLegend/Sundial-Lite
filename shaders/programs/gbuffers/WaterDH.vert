#ifndef DISTANT_HORIZONS
    #define DISTANT_HORIZONS

    in int dhMaterialId;
#endif

out vec4 color;
out vec3 viewPos;
out vec2 blockLight;
out mat3 tbnMatrix;
flat out float materialID;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    viewPos = (gl_ModelViewMatrix * gl_Vertex).xyz;
    gl_Position = dhProjection * vec4(viewPos, 1.0);

    color = gl_Color;
    blockLight = (gl_TextureMatrix[1] * gl_MultiTexCoord1).st * 16.0 / 15.0 - 0.5 / 15.0;

    materialID = MAT_STAINED_GLASS;
    if (dhMaterialId == DH_BLOCK_WATER) {
        materialID = MAT_WATER;
    }
    if (dhMaterialId == DH_BLOCK_ILLUMINATED) {
        materialID = MAT_TORCH;
    }

    vec3 normal = normalize(gl_NormalMatrix * gl_Normal);
    vec3 tangent = normalize(gl_NormalMatrix * vec3(gl_Normal.z + abs(gl_Normal.y), 0.0, gl_Normal.x));
    vec3 bitangent = normalize(gl_NormalMatrix * vec3(0.0, abs(gl_Normal.y) - 1.0, abs(gl_Normal.y)));
    tbnMatrix = mat3(tangent, bitangent, normal);

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif
}
