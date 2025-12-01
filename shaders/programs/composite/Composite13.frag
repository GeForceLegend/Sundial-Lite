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
//  Bloom stage 4: final blur
//

layout(location = 0) out vec4 texBuffer4;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"

/*
const int colortex0Format = RGBA8;
const int colortex1Format = RGBA16;
const int colortex2Format = RGBA16;
const int colortex3Format = RGBA16F;
const int colortex4Format = RGBA16F;
const int colortex5Format = RGBA16F;
const int colortex6Format = RG32UI;
const int colortex7Format = RGBA32F;

// Voxy support
const int colortex16Format = RGBA8;
const int colortex17Format = RGBA16;
const int colortex18Format = RGBA16;
*/

const float shadowDistanceRenderMul = 1.0;

const bool shadowtex0Mipmap = true;
const bool shadowcolor0Mipmap = true;
const bool shadowcolor1Mipmap = true;
const bool shadowHardwareFiltering0 = true;
const bool colortex5Clear = false;
const bool colortex6Clear = false;
const bool colortex7Clear = false;

const vec4 colortex0ClearColor = vec4(0.0, 0.0, 0.0, 1.0);
const vec4 colortex4ClearColor = vec4(0.0, 0.0, 0.0, 0.6);

const int noiseTextureResolution = 64;

const float sunPathRotation = -40.0; // [-90.0 -85.0 -80.0 -75.0 -70.0 -65.0 -60.0 -55.0 -50.0 -45.0 -40.0 -35.0 -30.0 -25.0 -20.0 -15.0 -10.0 -5.0 0.0 5.0 10.0 15.0 20.0 25.0 30.0 35.0 40.0 45.0 50.0 55.0 60.0 65.0 70.0 75.0 80.0 85.0 90.0]
const float ambientOcclusionLevel = 0.0;

const float wetnessHalflife = 100.0;
const float drynessHalflife = 100.0;
const float eyeBrightnessHalflife = 1.0;

const int shadowMapResolution = 2048; // [1024 2048 4096 8192 16384]
const float shadowDistance = 120.0; // [80.0 120.0 160.0 200.0 240.0 280.0 320.0 360.0 400.0 480.0 560.0 640.0]

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    vec3 bloomColor = vec3(0.0);
    bloomColor += texelFetch(colortex4, texel, 0).rgb;
    bloomColor += texelFetch(colortex4, texel + ivec2(-1,  0), 0).rgb;
    bloomColor += texelFetch(colortex4, texel + ivec2( 0, -1), 0).rgb;
    bloomColor += texelFetch(colortex4, texel + ivec2(-1,  0), 0).rgb;
    bloomColor += texelFetch(colortex4, texel + ivec2( 0, -1), 0).rgb;
    bloomColor *= 4.0;
    bloomColor += texelFetch(colortex4, texel + ivec2( 1,  1), 0).rgb;
    bloomColor += texelFetch(colortex4, texel + ivec2( 1, -1), 0).rgb;
    bloomColor += texelFetch(colortex4, texel + ivec2(-1,  1), 0).rgb;
    bloomColor += texelFetch(colortex4, texel + ivec2(-1, -1), 0).rgb;
    bloomColor /= 24.0;

    texBuffer4 = vec4(bloomColor, 1.0);
}

/* DRAWBUFFERS:4 */
