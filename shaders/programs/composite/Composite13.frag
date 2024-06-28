layout(location = 0) out vec4 texBuffer4;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"

/*
const int colortex0Format = RGBA8;
const int colortex1Format = RGBA16;
const int colortex2Format = RGBA16;
const int colortex3Format = RGBA16F;
const int colortex4Format = RGBA16F;
// const int colortex5Format = RGBA16F;
// const int colortex6Format = RGBA16F;
const int colortex7Format = RGBA32F;
*/

const float shadowDistanceRenderMul = 1.0;

const bool shadowtex0Mipmap = true;
const bool shadowcolor0Mipmap = true;
const bool shadowcolor1Mipmap = true;
const bool shadowHardwareFiltering0 = true;
const bool colortex7Clear = false;

const vec4 colortex0ClearColor = vec4(0.0, 0.0, 0.0, 1.0);
const vec4 colortex4ClearColor = vec4(0.0, 0.0, 0.0, 0.6);

const int noiseTextureResolution = 64;

const float sunPathRotation = -40.0; // [-90.0 -85.0 -80.0 -75.0 -70.0 -65.0 -60.0 -55.0 -50.0 -45.0 -40.0 -35.0 -30.0 -25.0 -20.0 -15.0 -10.0 -5.0 0.0 5.0 10.0 15.0 20.0 25.0 30.0 35.0 40.0 45.0 50.0 55.0 60.0 65.0 70.0 75.0 80.0 85.0 90.0]

const float wetnessHalflife = 100.0;
const float drynessHalflife = 100.0;
const float eyeBrightnessHalflife = 1.0;

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
