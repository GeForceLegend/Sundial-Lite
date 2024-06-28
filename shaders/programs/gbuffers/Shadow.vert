#if MC_VERSION >= 11700
in vec4 mc_Entity;
in vec4 mc_midTexCoord;
in vec4 at_tangent;
in vec3 vaPosition;
#elif MC_VERSION >= 11500
layout(location = 11) in vec4 mc_Entity;
layout(location = 12) in vec4 mc_midTexCoord;
layout(location = 13) in vec4 at_tangent;
#else
layout(location = 10) in vec4 mc_Entity;
layout(location = 11) in vec4 mc_midTexCoord;
layout(location = 12) in vec4 at_tangent;
#endif

out vec4 vColor;
out vec3 vWorldPos;
out vec3 vWorldNormal;
out vec2 vTexcoord;
out vec2 vMidTexCoord;
out vec2 vShadowOffset;

uniform vec3 camearPositionFract;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/PhysicsOcean.glsl"

const int shadowMapResolution = 4096; // [4096 8192 16384]
const float realShadowMapResolution = shadowMapResolution * MC_SHADOW_QUALITY;

void main() {
    vColor = gl_Color;
    vWorldNormal = normalize(mat3(shadowModelViewInverse) * gl_NormalMatrix * gl_Normal);
    vTexcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).st;
    vMidTexCoord = mc_midTexCoord.st;
    #ifdef PHYSICS_OCEAN
        float physics_localWaviness = texelFetch(physics_waviness, ivec2(gl_Vertex.xz) - physics_textureOffset, 0).r;
        vec3 physics_localPosition = gl_Vertex.xyz + vec3(0.0, physics_waveHeight(gl_Vertex.xz, PHYSICS_ITERATIONS_OFFSET, physics_localWaviness, physics_gameTime), 0.0);

        vec4 viewPos = gl_ModelViewMatrix * vec4(physics_localPosition, 1.0);
    #else
        vec4 viewPos = gl_ModelViewMatrix * gl_Vertex;
    #endif
    vWorldPos = mat3(shadowModelViewInverse) * viewPos.xyz + shadowModelViewInverse[3].xyz;

    #ifdef SHADOW_AND_SKY
        float isWater = float(mc_Entity.x == 264);
        float isTrasnparent = step(abs(textureLod(gtexture, mc_midTexCoord.st + 1e-6, 0.0).w - 0.5) + 1e-4, 0.499 - 0.499 * isWater);
        vShadowOffset = vec2(-isTrasnparent, -isWater);

        gl_Position = gl_ProjectionMatrix * viewPos;
        float shadowBias = 1.0 - SHADOW_BIAS + length(gl_Position.xy) * SHADOW_BIAS;
        gl_Position.xy /= shadowBias;
        gl_Position.xy = gl_Position.xy * (2048 / realShadowMapResolution) + (realShadowMapResolution - 2048) / realShadowMapResolution + vShadowOffset;
        gl_Position.z *= 0.2;

        vShadowOffset *= 0.5 * realShadowMapResolution;
    #else
        gl_Position = vec4(1.1, 1.1, 1.1, 1.0);
    #endif
}
