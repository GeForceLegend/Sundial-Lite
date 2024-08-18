#if MC_VERSION >= 11700
in vec4 mc_Entity;
in vec4 at_tangent;
#elif MC_VERSION >= 11500
layout(location = 11) in vec4 mc_Entity;
layout(location = 13) in vec4 at_tangent;
#else
layout(location = 10) in vec4 mc_Entity;
layout(location = 12) in vec4 at_tangent;
#endif

out vec4 color;
out vec4 viewPos;
out vec4 texlmcoord;
out vec3 mcPos;
out vec3 worldNormal;
out mat3 tbnMatrix;

flat out float isEmissive;
flat out float materialID;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Materials.glsl"
#include "/libs/PhysicsOcean.glsl"

#ifdef PHYSICS_OCEAN
    out vec3 physics_localPosition;
    out float physics_localWaviness;
#endif

void main() {
    #ifdef PHYSICS_OCEAN
        physics_localWaviness = texelFetch(physics_waviness, ivec2(gl_Vertex.xz) - physics_textureOffset, 0).r;
        physics_localPosition = gl_Vertex.xyz + vec3(0.0, physics_waveHeight(gl_Vertex.xz, PHYSICS_ITERATIONS_OFFSET, physics_localWaviness, physics_gameTime), 0.0);

        viewPos = gl_ModelViewMatrix * vec4(physics_localPosition, 1.0);
    #else
        viewPos = gl_ModelViewMatrix * gl_Vertex;
    #endif
    mcPos = (gbufferModelViewInverse * viewPos).xyz + cameraPosition;

    gl_Position = gl_ProjectionMatrix * viewPos;

    color = gl_Color;
    texlmcoord.st = gl_MultiTexCoord0.st;
    texlmcoord.pq = gl_MultiTexCoord1.st / 240.0;

    isEmissive = floor(mc_Entity.x / 512.0);
    materialID = MAT_STAINED_GLASS;

    if (mc_Entity.x < -0.5) {
        // Used for MOD_LIGHT_DETECTION
        materialID = -1.0;
    }
    if (mc_Entity.x == 264) {
        materialID = MAT_WATER;
    }

    #ifdef MOD_WATER_DETECTION
        if (dot(gl_Color.rgb, vec3(1.0)) < 2.999 && mc_Entity.x < -0.5) {
            materialID = MAT_WATER;
        }
    #endif

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif

    worldNormal = gl_Normal;
    vec3 normal = normalize(gl_NormalMatrix * gl_Normal);
    vec3 tangent = normalize(gl_NormalMatrix * at_tangent.xyz);
    vec3 bitangent = normalize(cross(tangent, normal) * at_tangent.w);
    tbnMatrix = mat3(tangent, bitangent, normal);
}
