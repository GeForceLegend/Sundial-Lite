#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer0;
layout(location = 1) out vec4 texBuffer3;

#ifdef SHADOW_AND_SKY
    in vec3 skyColorUp;
#else
    const vec3 skyColorUp = vec3(0.0);
#endif

in vec2 texcoord;

#include "/settings/CloudSettings.glsl"
#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/Atmosphere.glsl"
#include "/libs/Cloud.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    texBuffer0 = vec4(texelFetch(colortex0, texel, 0).rgb, texelFetch(colortex4, texel, 0).w);

    float depth = texelFetch(depthtex1, texel, 0).r;
    vec3 viewPos = screenToViewPos(texcoord, depth);
    vec3 worldPos = mat3(gbufferModelViewInverse) * viewPos;
    float worldDepth = inversesqrt(dot(worldPos, worldPos));
    vec3 worldDir = worldPos * worldDepth;

    vec4 solidColor = texelFetch(colortex3, texel, 0);

    float backDepth;
    vec3 backColor;
    if (depth < 0.999999) {
        backDepth = 1.0 / worldDepth;
        backColor = solidColor.rgb;
    }
    else {
        backDepth = 0.0;
        solidColor.rgb = singleAtmosphereScattering(solidColor.rgb, worldDir, sunDirection, (30.0), backColor);
    }
    float cloudDepth;
    vec4 finalColor = sampleClouds(solidColor.rgb, backColor, gbufferModelViewInverse[3].xyz, worldDir, shadowDirection, sunDirection, skyColorUp, backDepth, cloudDepth);

    float transparentDensity = 1.0;
    if (cloudDepth > -0.5) {
        float waterDepth = texelFetch(depthtex0, texel, 0).r;
        vec3 waterViewPos = screenToViewPos(texcoord, waterDepth);
        float waterViewDepth = length(waterViewPos);

        float depthDiff = waterViewDepth - cloudDepth;
        if (depthDiff > 0.0) {
            #if CLOUD_TYPE == 1
                float minimumDensity = exp(-depthDiff * depthDiff * cloudNoiseScale * cloudNoiseScale * 500.0);
            #elif CLOUD_TYPE == 2
                float minimumDensity = exp(-depthDiff * CLOUD_REALISTIC_SAMPLE_DENSITY);
            #else
                float minimumDensity = 1.0;
            #endif
            transparentDensity = max(1.0 - finalColor.w, minimumDensity);
        }
    }

    texBuffer3 = vec4(finalColor.rgb, transparentDensity);
}

/* DRAWBUFFERS:03 */
