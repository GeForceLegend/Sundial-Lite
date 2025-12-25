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
//  Gbuffer for solid terrain
//

#extension GL_ARB_shading_language_packing : enable

#if MC_VERSION >= 11700
in vec3 vaPosition;
in vec4 mc_Entity;
in vec4 mc_midTexCoord;
#elif MC_VERSION >= 11500
layout(location = 11) in vec4 mc_Entity;
layout(location = 12) in vec4 mc_midTexCoord;
#else
layout(location = 10) in vec4 mc_Entity;
layout(location = 11) in vec4 mc_midTexCoord;
#endif

out vec4 texlmcoord;
out vec3 color;
out vec3 viewPos;

flat out int material;
flat out vec4 coordRange;

// #define MOD_PLANT_DETECTION

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

uniform vec3 cameraPositionFract;

void main() {
    viewPos = (gl_ModelViewMatrix * gl_Vertex).xyz;

    gl_Position = gl_ProjectionMatrix * vec4(viewPos, 1.0);
    color = gl_Color.rgb;
    texlmcoord.st = gl_MultiTexCoord0.st;
    texlmcoord.pq = gl_MultiTexCoord1.st / 240.0;
    #ifdef IS_IRIS
        texlmcoord.pq = clamp(gl_MultiTexCoord1.st / 232.0 - 8.0 / 232.0, 0.0, 1.0);
    #endif

    vec2 minCoord = vec2(0.0);
    vec2 coordSize = vec2(1.0);
    vec2 vertexCoord = gl_MultiTexCoord0.st;
    if (min(abs(mc_midTexCoord.s - gl_MultiTexCoord0.s), abs(mc_midTexCoord.t - gl_MultiTexCoord0.t)) < 1e-6) {
        vertexCoord = gl_MultiTexCoord0.st + (mc_midTexCoord.st - gl_MultiTexCoord0.st).ts;
    }
    vec2 coordToCenter = abs(vertexCoord - mc_midTexCoord.st);
    minCoord = mc_midTexCoord.st - coordToCenter;
    coordSize = coordToCenter * 2.0;
    coordRange = vec4(minCoord, coordSize);
    material = int(mc_Entity.x);

    if (mc_Entity.x < -0.5) {
        // Used for MOD_LIGHT_DETECTION
        #ifdef MOD_PLANT_DETECTION
            if (abs(max(abs(gl_Normal.x), abs(gl_Normal.z)) - 0.5) < 0.4) {
                material = 19968;
            }
        #endif
    }
    // Early break for common blocks
    else if (mc_Entity.x > 1) {
        #ifdef IS_IRIS
            vec3 blockPos = fract(gl_Vertex.xyz + cameraPositionFract);
        #else
            #if MC_VERSION >= 11700
                vec3 blockPos = fract(vaPosition);
            #else
                vec3 blockPos = fract(gl_Vertex.xyz);
            #endif
        #endif

        if (mc_Entity.x == 8194) {
            if (abs(gl_Color.r - gl_Color.b) > 1e-5) {
                material = 8192;
                color *= 0.5;
            }
        }
        else if (mc_Entity.x == 8196) {
            if (gl_Normal.y > 0.5 && abs(blockPos.y - 0.9375) < 0.01) {
                material = 8195;
            }
        }
        else if (mc_Entity.x == 8197 || mc_Entity.x == 8201) {
            if (mc_Entity.x == 8201) {
                material = 20480;
            }
            if (abs(dot(gl_Normal * vec3(16.0, 16.0 / 7.0, 16.0), blockPos - vec3(0.5, 0.4375, 0.5)) - 1.0) > 0.1) {
                material = 0;
            }
        }
        else if (mc_Entity.x == 8199) {
            if (abs(dot(gl_Normal * vec3(16.0 / 5.0, 16.0 / 5.5, 16.0 / 5.0), blockPos - vec3(0.5, 8.5 / 16.0, 0.5)) - 1.0) < 0.1) {
                material = 20480;
            }
        }
    }

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif
}
