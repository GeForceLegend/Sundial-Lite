in vec4 mc_Entity;
in vec3 vaPosition;

out vec4 color;
out vec3 worldPos;
out vec3 worldNormal;
out vec2 texcoord;
out vec2 shadowOffset;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/PhysicsOcean.glsl"

const int shadowMapResolution = 2048; // [1024 2048 4096 8192 16384]
const float realShadowMapResolution = shadowMapResolution * MC_SHADOW_QUALITY;

void main() {
    #ifdef SHADOW_AND_SKY
        color = gl_Color;
        worldNormal = normalize(mat3(shadowModelViewInverse) * gl_NormalMatrix * gl_Normal);
        texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).st;
        vec4 viewPos = gl_ModelViewMatrix * gl_Vertex;
        worldPos = mat3(shadowModelViewInverse) * viewPos.xyz + shadowModelViewInverse[3].xyz;

        shadowOffset = vec2(0.0, 0.0);
        float isWater = float(mc_Entity.x == 264);
        shadowOffset.y = -isWater;

        gl_Position = gl_ProjectionMatrix * viewPos;
        float clipLengthInv = inversesqrt(dot(gl_Position.xy, gl_Position.xy));
        float shadowDistortion = log(distortionStrength / clipLengthInv + 1.0) / log(distortionStrength + 1.0) * 0.5;
        gl_Position.xy *= max(0.0, clipLengthInv * shadowDistortion);
        gl_Position.xy = gl_Position.xy + 0.5 + shadowOffset;
        gl_Position.z *= 0.2;
        gl_Position.z += 1e+6 * clamp(abs(texcoord.y - 0.5) - 2.0, 0.0, 1.0);

        shadowOffset *= 0.5 * realShadowMapResolution;
    #else
        color = vec4(1.0);
        worldNormal = vec3(0.0);
        texcoord = vec2(0.0);
        worldPos = vec3(0.0);
        shadowOffset = vec2(0.0);
        gl_Position = vec4(1.1, 1.1, 1.1, 1.0);
    #endif
}
