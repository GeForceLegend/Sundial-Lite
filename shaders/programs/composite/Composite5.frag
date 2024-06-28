layout(location = 0) out vec4 texBuffer3;

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
    vec4 diffuseData = texelFetch(colortex3, texel, 0);
    float waterDepth = texelFetch(depthtex0, texel, 0).r;

    #ifdef REFLECTION
        if (waterDepth < 1.0) {
            GbufferData gbufferData = getGbufferData(texel, texcoord);
            vec4 originData = texelFetch(colortex4, texel, 0);

            vec3 viewPos = screenToViewPos(texcoord, waterDepth);
            float NdotV = -dot(viewPos, gbufferData.normal) * inversesqrt(dot(viewPos, viewPos));
            #ifdef LABPBR_F0
                gbufferData.metalness = step(229.5 / 255.0, gbufferData.metalness);
            #endif
            vec3 reflectionWeight = metalColor(gbufferData.albedo.rgb, NdotV, gbufferData.metalness, gbufferData.smoothness) * diffuseData.w;

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

            diffuseData.rgb += originData.rgb * reflectionWeight;
        }
    #endif

    texBuffer3 = vec4(diffuseData.rgb, 1.0);
}

/* DRAWBUFFERS:3 */
