//     _________      __        __     ___       __     __________      ________        ______        __           
//    /  _____  \    |  |      |  |   |   \     |  |   |   _____  \    |__    __|      /  __  \      |  |          
//   /  /     \__\   |  |      |  |   |    \    |  |   |  |     \  \      |  |        /  /  \  \     |  |          
//  |  |             |  |      |  |   |  |  \   |  |   |  |      |  |     |  |       /  /    \  \    |  |          
//   \  \______      |  |      |  |   |  |\  \  |  |   |  |      |  |     |  |      |  |______|  |   |  |          
//    \______  \     |  |      |  |   |  | \  \ |  |   |  |      |  |     |  |      |   ______   |   |  |          
//           \  \    |  |      |  |   |  |  \  \|  |   |  |      |  |     |  |      |  |      |  |   |  |          
//  ___       |  |   |  |      |  |   |  |   \  |  |   |  |      |  |     |  |      |  |      |  |   |  |          
//  \  \_____/  /     \  \____/  /    |  |    \    |   |  |_____/  /    __|  |__    |  |      |  |   |  |_________ 
//   \_________/       \________/     |__|     \___|   |__________/    |________|   |__|      |__|   |____________|
//
//  General Public License v3.0. © 2021-Now GeForceLegend.
//  https://github.com/GeForceLegend/Sundial-Lite
//  https://www.gnu.org/licenses/gpl-3.0.en.html
//
//  Shadow
//

#if MC_VERSION >= 11700
in vec4 mc_Entity;
in vec3 vaPosition;
in vec2 mc_midTexCoord;
#elif MC_VERSION >= 11500
layout(location = 11) in vec4 mc_Entity;
layout(location = 12) in vec4 mc_midTexCoord;
#else
layout(location = 10) in vec4 mc_Entity;
layout(location = 11) in vec4 mc_midTexCoord;
#endif

out vec4 color;
out vec3 worldPos;
out vec3 worldNormal;
out vec2 texcoord;
out vec2 shadowOffset;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/PhysicsOcean.glsl"

const int shadowMapResolution = 2048; // [1024 2048 4096 8192 16384]
const float realShadowMapResolution = shadowMapResolution * MC_SHADOW_QUALITY;

void main() {
    #ifdef SHADOW_AND_SKY
        color = gl_Color;
        worldNormal = normalize(mat3(shadowModelViewInverse) * gl_NormalMatrix * gl_Normal);
        texcoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).st;
        #ifdef PHYSICS_OCEAN
            float physics_localWaviness = texelFetch(physics_waviness, ivec2(gl_Vertex.xz) - physics_textureOffset, 0).r;
            vec3 physics_localPosition = gl_Vertex.xyz + vec3(0.0, physics_waveHeight(gl_Vertex.xz, PHYSICS_ITERATIONS_OFFSET, physics_localWaviness, physics_gameTime), 0.0);

            vec4 viewPos = gl_ModelViewMatrix * vec4(physics_localPosition, 1.0);
        #else
            vec4 viewPos = gl_ModelViewMatrix * gl_Vertex;
        #endif
        worldPos = mat3(shadowModelViewInverse) * viewPos.xyz + shadowModelViewInverse[3].xyz;

        #ifdef PLANT_WAVE
            int material = int(mc_Entity.x);
            if (material == 8198) {
                material = 16896;
            }
            if (abs(mc_Entity.x - 8206.5) < 1.0) {
                material = int(abs(max(abs(gl_Normal.x), abs(gl_Normal.z)) - 0.5) < 0.4) * (18432 + (material - 8206) * 1024);
            }
            if (material == 8209) {
                material = 16896;
                if (abs(max(abs(gl_Normal.x), abs(gl_Normal.z)) - 0.5) < 0.4) {
                    material = 18944 + 1024 * int(mc_midTexCoord.t < gl_MultiTexCoord0.t);
                }
            }

            vec3 mcPos = worldPos + cameraPosition;
            int commonWave = max(0, material) & 0x4E00;
            if (commonWave > 16384) {
                int waveType = commonWave & 0x0600;
                vec2 waveNoise = vec2(
                    smooth3DNoise((mcPos / vec3(6.0, 4.0, 12.0) + vec3(1.0,-0.2, 0.5) * frameTimeCounter * PLANT_WAVE_SPEED) / 64.0) - 0.4,
                    smooth3DNoise((mcPos / vec3(2.0, 1.0, 1.0 ) + vec3(1.0, 0.4,-2.0) * frameTimeCounter * PLANT_WAVE_SPEED) / 64.0) - 0.5
                ) * (PLANT_WAVE_STRENGTH + weatherStrength * PLANT_WAVE_RAIN_EXTRA_STRENGTH);
                if ((commonWave & 0x0200) == 0) {
                    float height = float(((commonWave & 0x0400) >> 10) + int(mc_midTexCoord.t > gl_MultiTexCoord0.t));
                    worldPos.xz -= (waveNoise.x * vec2(0.1, 0.05) + waveNoise.y * vec2(0.02, 0.02)) * height;
                }
                else if ((commonWave & 0x0600) == 0x0200) {
                    worldPos -= waveNoise.x * vec3(0.1 , 0.04, 0.07) + waveNoise.y * vec3(0.02, 0.01, 0.02); 
                }
            }
            viewPos.xyz = mat3(shadowModelView) * worldPos + shadowModelView[3].xyz;
        #endif

        shadowOffset = vec2(0.0, 0.0);
        float isWater = float(mc_Entity.x == 8192);
        shadowOffset.y = -isWater;
        float isTransparent = float(abs(textureLod(gtexture, mc_midTexCoord.st + 1e-6, 0.0).w - 0.5) + 1e-4 < 0.49) * (1.0 - isWater);
        shadowOffset.x = -isTransparent;

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
