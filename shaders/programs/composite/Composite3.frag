layout(location = 0) out vec4 texBuffer4;

#ifdef SHADOW_AND_SKY
    in vec3 skyColorUp;
#endif

in vec2 texcoord;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/ReflectionFilter.glsl"

void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    float waterDepth = texelFetch(depthtex0, texel, 0).r;
    vec3 reflectionColor = vec3(0.0);

    #ifdef REFLECTION
        bool isTerrain = waterDepth < 1.0;
        #ifdef DISTANT_HORIZONS
            isTerrain = isTerrain || texelFetch(dhDepthTex0, texel, 0).r < 1.0;
        #endif
        if (isTerrain) {
            GbufferData gbufferData = getGbufferData(texel, texcoord);
            vec4 originData = texelFetch(colortex4, texel, 0);

            vec3 viewPos = screenToViewPos(texcoord, waterDepth);
            float NdotV = -dot(viewPos, gbufferData.normal) * inversesqrt(dot(viewPos, viewPos));
            #ifdef LABPBR_F0
                gbufferData.metalness = step(229.5 / 255.0, gbufferData.metalness);
            #endif
            vec3 reflectionWeight = metalColor(gbufferData.albedo.rgb, NdotV, gbufferData.metalness, gbufferData.smoothness);
            if (waterDepth == texelFetch(depthtex1, texel, 0).r) {
                float diffuseWeight = pow(1.0 - gbufferData.smoothness, 5.0);
                #ifndef FULL_REFLECTION
                    diffuseWeight = 1.0 - (1.0 - diffuseWeight) * sqrt(clamp(gbufferData.smoothness - (1.0 - gbufferData.smoothness) * (1.0 - 0.6666 * gbufferData.metalness), 0.0, 1.0));
                #endif
                reflectionWeight *= 1.0 - diffuseWeight;
            }

            #ifdef REFLECTION_FILTER
                float originReflectionDepth = originData.w;
                float originSmoothness = gbufferData.smoothness;
                if (originSmoothness < 0.9975 && originReflectionDepth > 1e-5) {
                    float routhness = pow2(1.0 - originSmoothness);
                    float roughnessInv = 100.0 / max(routhness, 1e-5);
                    vec2 coordOffset = vec2(4.0 * clamp(routhness * 20.0, 0.0, 1.0) * (1.0 - exp(-sqrt(originReflectionDepth) * 50.0)));
                    coordOffset *= blueNoiseTemporal(texcoord).x + 0.5;

                    vec3 accumulation = originData.rgb;
                    float weightAccumulation = 1.0;

                    for (int i = -2; i < 3; i++) {
                        for (int j = -2; j < 3; j++) {
                            ivec2 sampleTexel = ivec2(texel + 0.5 + vec2(i, j) * coordOffset);
                            if (abs(i) + abs(j) > 0.5 && max(abs(sampleTexel.x / screenSize.x - 0.5), abs(sampleTexel.y / screenSize.y - 0.5)) < 0.5) {
                                vec4 sampleData = texelFetch(colortex4, sampleTexel, 0);
                                float sampleReflectionDepth = sampleData.w;
                                float sampleSmoothness = unpack16Bit(texelFetch(colortex2, sampleTexel, 0).g).x;

                                vec3 sampleNormal = getNormalTexel(sampleTexel);

                                float weight =
                                    pow(max(dot(gbufferData.normal, sampleNormal), 1e-6), roughnessInv) *
                                    pow(1.0 - abs(originSmoothness - sampleSmoothness), 100.0) *
                                    exp(-abs(originReflectionDepth - sampleReflectionDepth) * originSmoothness) *
                                    step(sampleSmoothness, 0.9975);
                                weight = clamp(weight, 0.0, 1.0);

                                accumulation += sampleData.rgb * weight;
                                weightAccumulation += weight;
                            }
                        }
                    }
                    originData.rgb = accumulation / weightAccumulation;
                }
            #endif

            reflectionColor = originData.rgb * reflectionWeight;
        }
    #endif

    texBuffer4 = vec4(reflectionColor, 1.0);
}

/* DRAWBUFFERS:4 */
