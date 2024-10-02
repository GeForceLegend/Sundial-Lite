#extension GL_ARB_gpu_shader5 : enable

layout(location = 0) out vec4 texBuffer3;

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

    float depth = texelFetch(depthtex1, texel, 0).r;
    vec3 viewPos;
    #ifdef DISTANT_HORIZONS
        if (depth == 1.0) {
            depth = textureLod(dhDepthTex1, texcoord, 0.0).r;
            viewPos = screenToViewPosDH(texcoord, depth);
            depth = -depth;
        } else
    #endif
    {
        viewPos = screenToViewPos(texcoord, depth);
    }
    vec3 worldPos = mat3(gbufferModelViewInverse) * viewPos;
    float worldDepth = inversesqrt(dot(worldPos, worldPos));
    vec3 worldDir = worldPos * worldDepth;
    vec3 intersectionData = planetIntersectionData(gbufferModelViewInverse[3].xyz, worldDir);

    vec4 solidColor = texelFetch(colortex3, texel, 0);

    float backDepth;
    vec3 backColor;
    vec4 planeCloud = vec4(0.0);
    if (abs(depth) < 0.999999) {
        if (texelFetch(depthtex0, texel, 0).r == depth) {
            solidColor.rgb += texelFetch(colortex4, texel, 0).rgb;
        }
        backDepth = 1.0 / worldDepth;
        backColor = solidColor.rgb;
    }
    #ifdef SHADOW_AND_SKY
        else {
            backDepth = 0.0;
            solidColor.rgb = singleAtmosphereScattering(solidColor.rgb, gbufferModelViewInverse[3].xyz, worldDir, sunDirection, intersectionData, (30.0), backColor);
            #ifdef PLANE_CLOUD
                planeCloud = planeClouds(gbufferModelViewInverse[3].xyz, worldDir, sunDirection, skyColorUp, intersectionData);
            #endif
            if (gbufferModelViewInverse[3].y + cameraPosition.y + WORLD_BASIC_HEIGHT - 500.0 < PLANE_CLOUD_HEIGHT) {
                solidColor.rgb = mix(solidColor.rgb, planeCloud.rgb, planeCloud.a);
            }
        }
        float cloudDepth;
        solidColor = sampleClouds(
            solidColor.rgb, backColor, gbufferModelViewInverse[3].xyz, worldDir, shadowDirection, sunDirection, skyColorUp, intersectionData, backDepth, cloudDepth
        );

        if (gbufferModelViewInverse[3].y + cameraPosition.y + WORLD_BASIC_HEIGHT - 500.0 >= PLANE_CLOUD_HEIGHT) {
            solidColor.rgb = mix(solidColor.rgb, planeCloud.rgb, planeCloud.a);
        }

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
                transparentDensity = max(1.0 - solidColor.w, minimumDensity);
            }
        }
        solidColor.w = transparentDensity;
    #endif

    texBuffer3 = solidColor;
}

/* DRAWBUFFERS:3 */
