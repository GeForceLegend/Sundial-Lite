uniform int frameCounter;
uniform int isEyeInWater;
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
uniform sampler2D colortex6;
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
    uniform float dhFarPlane;
#endif

const float PI = 3.1415926535897;

#ifdef SETTINGS
    float nightBrightness = mix(NIGHT_BRIGHTNESS, NIGHT_VISION_BRIGHTNESS, nightVision);
    vec3 sunColor = sunlightColor * (sunDirection.y > 0.0 ? 1.0 : nightBrightness);
#endif
