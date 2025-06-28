#if MC_VERSION >= 11700
in vec4 mc_Entity;
in vec3 vaPosition;
#elif MC_VERSION >= 11500
layout(location = 11) in vec4 mc_Entity;
#else
layout(location = 10) in vec4 mc_Entity;
#endif

out vec4 vColor;
out vec3 vWorldPos;
out vec3 vWorldNormal;
out vec2 vTexcoord;
out vec2 vShadowOffset;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/PhysicsOcean.glsl"

const int shadowMapResolution = 2048; // [1024 2048 4096 8192 16384]
const float realShadowMapResolution = shadowMapResolution * MC_SHADOW_QUALITY;

void main() {
    #ifdef SHADOW_AND_SKY
        vColor = gl_Color;
        vWorldNormal = normalize(mat3(shadowModelViewInverse) * gl_NormalMatrix * gl_Normal);
        vTexcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).st;
        #ifdef PHYSICS_OCEAN
            float physics_localWaviness = texelFetch(physics_waviness, ivec2(gl_Vertex.xz) - physics_textureOffset, 0).r;
            vec3 physics_localPosition = gl_Vertex.xyz + vec3(0.0, physics_waveHeight(gl_Vertex.xz, PHYSICS_ITERATIONS_OFFSET, physics_localWaviness, physics_gameTime), 0.0);

            vec4 viewPos = gl_ModelViewMatrix * vec4(physics_localPosition, 1.0);
        #else
            vec4 viewPos = gl_ModelViewMatrix * gl_Vertex;
        #endif
        vWorldPos = mat3(shadowModelViewInverse) * viewPos.xyz + shadowModelViewInverse[3].xyz;

        vShadowOffset = vec2(0.0, 0.0);
        #ifdef TRANSPARENT
            float isWater = float(mc_Entity.x == 264);
            vShadowOffset.y = -isWater;
        #endif

        gl_Position = gl_ProjectionMatrix * viewPos;
        float clipLengthInv = inversesqrt(dot(gl_Position.xy, gl_Position.xy));
        float shadowDistortion = log(distortionStrength / clipLengthInv + 1.0) / log(distortionStrength + 1.0) * 0.5;
        gl_Position.xy *= max(0.0, clipLengthInv * shadowDistortion);
        gl_Position.xy = gl_Position.xy + 0.5 + vShadowOffset;
        gl_Position.z *= 0.2;

        vShadowOffset *= 0.5 * realShadowMapResolution;
    #else
        vColor = vec4(1.0);
        vWorldNormal = vec3(0.0);
        vTexcoord = vec2(0.0);
        vWorldPos = vec3(0.0);
        vShadowOffset = vec2(0.0);
        gl_Position = vec4(1.1, 1.1, 1.1, 1.0);
    #endif
}
