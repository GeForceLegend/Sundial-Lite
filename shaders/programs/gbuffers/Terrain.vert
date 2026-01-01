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
out vec4 coordRange;

flat out int material;

// #define MOD_PLANT_DETECTION

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"

uniform vec3 cameraPositionFract;

void main() {
    color = gl_Color.rgb;
    texlmcoord.st = gl_MultiTexCoord0.st;
    texlmcoord.pq = gl_MultiTexCoord1.st / 240.0;
    #ifdef IS_IRIS
        texlmcoord.pq = clamp(gl_MultiTexCoord1.st / 232.0 - 8.0 / 232.0, 0.0, 1.0);
    #endif
    viewPos = (gl_ModelViewMatrix * gl_Vertex).xyz;
    vec3 worldPos = viewToWorldPos(viewPos);
    vec3 mcPos = worldPos + cameraPosition;

    material = int(mc_Entity.x);
    int commonWave = max(0, material) & 0x4E00;
    if (mc_Entity.x < -0.5) {
        // Used for MOD_LIGHT_DETECTION
        #ifdef MOD_PLANT_DETECTION
            if (abs(max(abs(gl_Normal.x), abs(gl_Normal.z)) - 0.5) < 0.4) {
                material = 19968;
            }
        #endif
    }
    // Early break for common blocks
    else if (material > 1) {
        #ifdef IS_IRIS
            vec3 blockPos = fract(gl_Vertex.xyz + cameraPositionFract);
        #else
            #if MC_VERSION >= 11700
                vec3 blockPos = fract(vaPosition);
            #else
                vec3 blockPos = fract(gl_Vertex.xyz);
            #endif
        #endif

        if (material == 8194) {
            if (abs(gl_Color.r - gl_Color.b) > 1e-5) {
                material = 8192;
                color *= 0.5;
            }
        }
        if (material == 8196) {
            if (gl_Normal.y > 0.5 && abs(blockPos.y - 0.9375) < 0.01) {
                material = 8195;
            }
        }
        if (material == 8197 || material == 8201) {
            if (material == 8201) {
                material = 20480 * int(gl_Normal.y > -0.5);
            }
            if (abs(dot(gl_Normal * vec3(16.0, 16.0 / 7.0, 16.0), blockPos - vec3(0.5, 0.4375, 0.5)) - 1.0) > 0.1) {
                material = 0;
            }
        }
        if (material == 8198) {
            commonWave = 0x4200;
        }
        if (material == 8199) {
            if (abs(dot(gl_Normal * vec3(16.0 / 5.0, 16.0 / 5.5, 16.0 / 5.0), blockPos - vec3(0.5, 8.5 / 16.0, 0.5)) - 1.0) < 0.1) {
                material = 20480;
            }
        }
        if (abs(mc_Entity.x - 8206.5) < 1.0) {
            material = int(abs(max(abs(gl_Normal.x), abs(gl_Normal.z)) - 0.5) < 0.4) * (18432 + (material - 8206) * 1024);
            commonWave = material & 0x4E00;
        }
        if (material == 8209) {
            material = 16896;
            if (abs(max(abs(gl_Normal.x), abs(gl_Normal.z)) - 0.5) < 0.4) {
                material = 18944 + 1024 * int(mc_midTexCoord.t < gl_MultiTexCoord0.t);
            }
            commonWave = material & 0x4E00;
        }
    }

    #ifdef PLANT_WAVE
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
    #endif

    viewPos = worldToViewPos(worldPos);
    gl_Position = gl_ProjectionMatrix * vec4(viewPos, 1.0);

    vec2 minCoord = vec2(0.0);
    vec2 coordSize = vec2(1.0);
    vec2 vertexCoord = gl_MultiTexCoord0.st;
    if (min(abs(mc_midTexCoord.s - gl_MultiTexCoord0.s), abs(mc_midTexCoord.t - gl_MultiTexCoord0.t)) < 1e-6) {
        vertexCoord = gl_MultiTexCoord0.st + (mc_midTexCoord.st - gl_MultiTexCoord0.st).ts;
    }
    vec2 coordToCenter = abs(vertexCoord - mc_midTexCoord.st);
    vec2 albedoTexSize = textureSize(gtexture, 0);
    vec2 albedoTexelSize = 1.0 / albedoTexSize;
    minCoord = round((mc_midTexCoord.st - coordToCenter) * albedoTexSize) * albedoTexelSize;
    coordSize = round(coordToCenter * 2.0 * albedoTexSize) * albedoTexelSize;
    coordRange = vec4(minCoord, coordSize);


    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif
}
