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
//  Gbuffer for transparent terrain
//

#if MC_VERSION >= 11700
in vec4 mc_Entity;
#elif MC_VERSION >= 11500
layout(location = 11) in vec4 mc_Entity;
#else
layout(location = 10) in vec4 mc_Entity;
#endif

out vec4 color;
out vec4 texlmcoord;
out vec3 viewPos;

flat out int materialID;

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

        viewPos = (gl_ModelViewMatrix * vec4(physics_localPosition, 1.0)).xyz;
    #else
        viewPos = (gl_ModelViewMatrix * gl_Vertex).xyz;
    #endif

    gl_Position = gl_ProjectionMatrix * vec4(viewPos, 1.0);

    color = gl_Color;
    texlmcoord.st = gl_MultiTexCoord0.st;
    texlmcoord.pq = gl_MultiTexCoord1.st / 240.0;
    #ifdef IS_IRIS
        texlmcoord.pq = clamp(gl_MultiTexCoord1.st / 232.0 - 8.0 / 232.0, 0.0, 1.0);
    #endif

    materialID = int(mc_Entity.x);
    #ifdef MOD_WATER_DETECTION
        if (dot(gl_Color.rgb, vec3(1.0)) < 2.999 && mc_Entity.x < -0.5) {
            materialID = 8192;
        }
    #endif

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif
}
