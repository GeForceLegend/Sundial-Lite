#extension GL_ARB_gpu_shader5 : enable
#extension GL_ARB_shading_language_packing: enable

layout(location = 0) out vec4 gbufferData4;

in vec4 color;
in vec3 worldPos;
in vec2 texcoord;

#define RAIN_DROP_SIZE 0.40 // [0.01 0.02 0.03 0.04 0.05 0.06 0.07 0.08 0.09 0.10 0.12 0.14 0.16 0.18 0.20 0.24 0.28 0.32 0.36 0.40 0.44 0.48 0.52 0.56 0.60 0.65 0.70 0.75 0.80 0.85 0.90 0.95 1.00]
#define RAIN_DROP_AMOUNT 1.0 // [0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]

#include "/settings/GlobalSettings.glsl"
#include "/settings/CloudSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/Atmosphere.glsl"
#include "/libs/Cloud.glsl"
#include "/libs/Shadow.glsl"

void main() {
    vec4 albedoData = texture(gtexture, texcoord) * color;

    vec2 rainTexcoord = vec2(fract(texcoord.x * RAIN_DROP_AMOUNT), texcoord.y);
    vec4 albedoData2 = texture(gtexture, rainTexcoord) * color;

    float rainOrSnow = signI(0.001 - abs(albedoData2.r - albedoData2.g) - abs(albedoData2.g - albedoData2.b) - abs(albedoData.r - albedoData.g) - abs(albedoData.g - albedoData.b));

    if (rainOrSnow < 0.0) {
        albedoData = albedoData2;
        albedoData.w *= step(abs(fract(textureSize(gtexture, 0).x * rainTexcoord.x) - 0.5), clamp(RAIN_DROP_AMOUNT * RAIN_DROP_SIZE, 0.0, 1.0) * 0.5);
    }
    if (albedoData.w < max(0.1, alphaTestRef)) discard;

    float sunlightStrength = 0.0;
    #ifdef SHADOW_AND_SKY
        vec3 shadowCoord = worldPosToShadowCoord(worldPos);
        sunlightStrength = texture(shadowtex0, shadowCoord);
        #ifdef CLOUD_SHADOW
            sunlightStrength *= cloudShadow(worldPos, shadowDirection);
        #endif
    #endif

    float lightData = 0.5 + sunlightStrength * 0.5;

    gbufferData4 = vec4(0.0, 0.0, 0.0, (rainOrSnow * lightData) * 0.4 + 0.6);
}

/* DRAWBUFFERS:4 */
