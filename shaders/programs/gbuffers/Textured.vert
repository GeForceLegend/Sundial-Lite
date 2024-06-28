#if MC_VERSION >= 11700
in vec4 mc_midTexCoord;
#elif MC_VERSION >= 11500
layout(location = 12) in vec4 mc_midTexCoord;
#else
layout(location = 11) in vec4 mc_midTexCoord;
#endif

#if MC_VERSION < 11300
    layout(location = 12) in vec4 at_tangent;

    out vec3 viewNormal;
    out mat3 tbnMatrix;
#endif

// #define GLOWING_OVERLAY

out vec4 color;
out vec4 viewPos;
out vec4 texlmcoord;
out vec3 mcPos;

flat out vec2 midCoord;
flat out float materialID;

#ifdef ENTITIES
    uniform vec4 entityColor;
#endif

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Materials.glsl"

void main() {
    viewPos = gl_ModelViewMatrix * gl_Vertex;
    mcPos = (gbufferModelViewInverse * viewPos).xyz + cameraPosition;

    gl_Position = ftransform();
    color = gl_Color;
    texlmcoord.st = vec2(gl_TextureMatrix[0] * gl_MultiTexCoord0);
    texlmcoord.pq = gl_MultiTexCoord1.st / 240.0;
    midCoord = mc_midTexCoord.st;
    materialID = MAT_OPAQUE;

    #ifdef ENTITIES
        color.rgb = mix(color.rgb, entityColor.rgb, vec3(entityColor.a));
    #endif

    #ifdef GLOWING
        #ifdef GLOWING_OVERLAY
            gl_Position.z = (gl_Position.z * 0.5 + 0.5) * 0.02 - 0.01;
        #endif
    #endif

    #ifdef OVERLAY
        gl_Position.z -= 1e-5;
    #endif

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif

    #ifdef HAND
        materialID = MAT_HAND;
    #endif

    #ifdef PARTICLE
        materialID = MAT_PARTICLE;
    #endif

    #if MC_VERSION < 11300
        viewNormal = normalize(gl_NormalMatrix * gl_Normal);
        vec3 tangent = normalize(gl_NormalMatrix * at_tangent.xyz);
        vec3 bitangent = normalize(cross(tangent, viewNormal) * at_tangent.w);
        tbnMatrix = mat3(tangent, bitangent, viewNormal);
    #endif
}
