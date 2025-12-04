uniform int frameCounter;
uniform int isEyeInWater;
uniform int heldBlockLightValue;
uniform float far;
uniform float blindness;
uniform float frameTime;
uniform float nightVision;
uniform float alphaTestRef;
uniform float rainStrength;
uniform float rainyMieBeta;
uniform float rainyStrength;
uniform float darknessFactor;
uniform float weatherStrength;
uniform float frameTimeCounter;
uniform ivec2 atlasSize;
uniform ivec2 eyeBrightnessSmooth;
uniform vec2 taaOffset;
uniform vec2 texelSize;
uniform vec2 screenSize;
uniform vec3 fogColor;
uniform vec3 sunDirection;
uniform vec3 sunlightColor;
uniform vec3 cameraPosition;
uniform vec3 cameraMovement;
uniform vec3 shadowDirection;
uniform vec3 relativeEyePosition;
uniform vec3 shadowModelViewProj0;
uniform vec3 shadowModelViewProj1;
uniform vec3 shadowModelViewProj2;
uniform vec3 shadowModelViewProj3;
uniform vec4 spriteBounds;

uniform sampler2D gtexture;
uniform sampler2D normals;
uniform sampler2D specular;
uniform sampler2D noisetex;
uniform sampler2D gaux2;
uniform sampler2D colortex0;
uniform sampler2D colortex1;
uniform sampler2D colortex2;
uniform sampler2D colortex3;
uniform sampler2D colortex4;
uniform sampler2D colortex5;
uniform usampler2D colortex6;
uniform sampler2D colortex7;
uniform sampler2D depthtex0;
uniform sampler2D depthtex1;
uniform sampler2D depthtex2;
uniform sampler2D shadowtex1;
uniform sampler2D shadowcolor0;
uniform sampler2D shadowcolor1;
uniform sampler2DShadow shadowtex0;

uniform mat4 shadowModelView;
uniform mat4 shadowProjection;
uniform mat4 shadowModelViewInverse;
uniform mat4 shadowProjectionInverse;
uniform mat4 gbufferModelView;
uniform mat4 gbufferProjection;
uniform mat4 gbufferModelViewInverse;
uniform mat4 gbufferProjectionInverse;
uniform mat4 gbufferPreviousModelView;
uniform mat4 gbufferPreviousProjection;

#ifdef DISTANT_HORIZONS
    uniform sampler2D dhDepthTex0;
    uniform sampler2D dhDepthTex1;

    uniform mat4 dhProjection;
    uniform mat4 dhProjectionInverse;
    uniform mat4 dhPreviousProjection;

    uniform int dhRenderDistance;
#endif

#ifdef VOXY
    uniform sampler2D vxDepthTexOpaque;
    uniform sampler2D vxDepthTexTrans;

    uniform mat4 vxProj;
    uniform mat4 vxProjInv;
    uniform mat4 vxProjPrev;

    uniform int vxRenderDistance;
#endif

const float PI = 3.1415926535897;

#ifdef SETTINGS
    float nightBrightness = mix(NIGHT_BRIGHTNESS, NIGHT_VISION_BRIGHTNESS, nightVision);
    vec3 sunColor = sunlightColor * clamp(nightBrightness + clamp(sunDirection.y * 1e+5, 0.0, 1.0), 0.0, 1.0);
#endif

#ifndef MC_GL_ARB_shading_language_packing
vec2 unpackHalf2x16(uint x) {
    uvec2 data = uvec2(x & 0xFFFFu, x >> 16u);
    uvec2 signData = (data & 0x8000u) << 16u;
    uvec2 expData = ((data & 0x7C00u) - 0x3C00u + 0x1FC00u) << 13u;
    uvec2 fracData = (data & 0x03FFu) << 13u;
    return uintBitsToFloat(signData | expData | fracData);
}

uint packHalf2x16(vec2 x) {
    uvec2 data = uvec2(floatBitsToUint(x));
    uvec2 signData = (data & 0x80000000u) >> 16u;
    uvec2 expData = clamp(((data & 0x7F800000u) >> 13u) - 0x1FC00u + 0x3C00u, 0u, 0x7C00u);
    uvec2 fracData = (data & 0x007FFFFFu) >> 13u;
    uvec2 result = signData | expData | fracData;
    return result.x | (result.y << 16u);
}
#endif
