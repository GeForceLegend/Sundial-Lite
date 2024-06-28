layout(location = 0) out vec4 texBuffer3;

in vec2 texcoord;

#define REFRACTION_STRENGTH 1.0 // [0.0 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]

#include "/settings/CloudSettings.glsl"
#include "/settings/GlobalSettings.glsl"
#include "/settings/VolumetricLightSettings.glsl"

#ifdef SHADOW_AND_SKY
    in vec3 skyColorUp;
    in mat4 shadowModelViewProjection;
#else
    const vec3 skyColorUp = vec3(0.0);
#endif

#ifdef THE_END
    #include "/libs/Galaxy.glsl"
#endif

#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/Atmosphere.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    GbufferData gbufferData = getGbufferData(texel, texcoord);
    float waterDepth = textureLod(depthtex0, texcoord, 0.0).r;
    float solidDepth = gbufferData.depth;
    vec4 solidColor = texelFetch(colortex3, texel, 0);
    vec3 viewPos = screenToViewPos(texcoord, solidDepth);
    vec3 waterViewPos = screenToViewPos(texcoord, waterDepth);
    vec3 worldPos = viewToWorldPos(viewPos);
    vec3 waterWorldDir = normalize(worldPos - gbufferModelViewInverse[3].xyz);

    float waterViewDepthNoLimit = length(waterViewPos);

    /********************************************************** Water Refraction **********************************************************/

    float n = 1.5;
    if (waterDepth < solidDepth) {
        vec3 worldDir = waterWorldDir;
        bool isTargetWater = gbufferData.materialID == MAT_WATER;
        bool isTargetNotParticle = gbufferData.materialID != MAT_PARTICLE;
        if (isTargetNotParticle) {
            float solidViewDepth = length(viewPos);
            float refractionStrength = (REFRACTION_STRENGTH * 2e-2 * clamp((solidViewDepth - waterViewDepthNoLimit) / (waterViewDepthNoLimit + 1.0), 0.0, 1.0));

            float roughness = 1.0 - gbufferData.smoothness;
            vec2 blueNoise = textureLod(noisetex, texcoord * screenSize / 64.0, 0.0).xy;
            vec2 randomOffset = vec2(cos(blueNoise.x * 2.0 * PI), sin(blueNoise.x * 2.0 * PI)) * blueNoise.y;
            vec2 refractionOffset = (gbufferData.normal.xy + roughness * randomOffset) * refractionStrength;

            vec2 refractionTarget = texcoord - refractionOffset;
            float targetSolidDepth = textureLod(depthtex1, refractionTarget, 0.0).r;
            if (waterDepth < targetSolidDepth) {
                solidDepth = targetSolidDepth;
                solidColor.rgb = textureLod(colortex3, refractionTarget, 0.0).rgb;
                vec3 viewPos = screenToViewPos(refractionTarget, targetSolidDepth);
                solidViewDepth = length(viewPos);
                worldPos = viewToWorldPos(viewPos);
                worldDir = normalize(worldPos - gbufferModelViewInverse[3].xyz);
            }
        }

        vec3 waterWorldPos = viewToWorldPos(waterViewPos);
        float waterDistance = distance(worldPos, waterWorldPos);
        vec3 stainedColor = vec3(1.0);
        vec3 rawSolidColor = solidColor.rgb;
        vec3 worldNormal = normalize(mat3(gbufferModelViewInverse) * gbufferData.normal);
        n -= 0.166666 * float(isTargetWater);
        n = mix(n, f0ToIor(gbufferData.metalness) , step(0.001, gbufferData.metalness));
        float LdotH = clamp(dot(worldNormal, -waterWorldDir), 0.0, 1.0);
        if (isTargetWater) {
            if (isEyeInWater == 1) {
                solidColor.rgb *= airAbsorption(waterDistance);
                #if defined ATMOSPHERE_SCATTERING_FOG && defined SHADOW_AND_SKY
                    solidColor.rgb = solidAtmosphereScattering(solidColor.rgb, worldDir, skyColorUp, waterDistance, gbufferData.lightmap.y);
                #endif
                n = 1.0 / n;
            }
            else {
                solidColor.rgb = waterFogTotal(solidColor.rgb, worldDir, skyColorUp, waterDistance, gbufferData.lightmap.y);
            }
            #if WATER_TYPE == 1
                stainedColor = pow(gbufferData.albedo.rgb * (1.0 - 0.5 * gbufferData.albedo.w * gbufferData.albedo.w), vec3(sqrt(gbufferData.albedo.w * 1.5)));
            #endif
            stainedColor *= pow(1.0 - fresnel(LdotH, LdotH * LdotH, n), gbufferData.smoothness * gbufferData.smoothness);
        }
        else {
            if (isEyeInWater == 0) {
                #ifdef NETHER
                    solidColor.rgb = netherFogTotal(solidColor.rgb, waterDistance);
                #elif defined THE_END
                    solidColor.rgb = endFogTotal(solidColor.rgb, waterDistance);
                    if (solidDepth > 0.999999)
                        solidColor.rgb += endStars(worldDir);
                #else
                    solidColor.rgb *= airAbsorption(waterDistance);
                    #if defined ATMOSPHERE_SCATTERING_FOG && defined SHADOW_AND_SKY
                        solidColor.rgb = solidAtmosphereScattering(solidColor.rgb, worldDir, skyColorUp, waterDistance, gbufferData.lightmap.y);
                    #endif
                #endif
            }
            else if (isEyeInWater == 1) {
                solidColor.rgb = waterFogTotal(solidColor.rgb, waterWorldDir, skyColorUp, waterDistance, gbufferData.lightmap.y);
                n = n / 1.333333;
            }
            else if (isEyeInWater == 2) {
                solidColor.rgb = lavaFogTotal(solidColor.rgb, waterDistance);
            }
            else if (isEyeInWater == 3) {
                solidColor.rgb = snowFogTotal(solidColor.rgb, skyColorUp, waterDistance, gbufferData.lightmap.y);
            }
            stainedColor = pow(gbufferData.albedo.rgb * (1.0 - 0.5 * gbufferData.albedo.w * gbufferData.albedo.w), vec3(sqrt(gbufferData.albedo.w * 1.5)));
            if (isTargetNotParticle) {
                stainedColor *= pow(1.0 - fresnel(LdotH, LdotH * LdotH, n), gbufferData.smoothness * gbufferData.smoothness);
            }
        }

        stainedColor = mix(vec3(1.0), stainedColor, vec3(solidColor.w));
        solidColor.rgb = mix(rawSolidColor, solidColor.rgb, vec3(solidColor.w)) * stainedColor;
        solidColor.rgb += gbufferData.albedo.rgb * gbufferData.emissive * BLOCK_LIGHT_BRIGHTNESS;
    }

    texBuffer3 = solidColor;
}

/* DRAWBUFFERS:3 */
