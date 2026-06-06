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
//  General Public License v3.0. Copyright (C) 2026 GeForceLegend.
//  https://github.com/GeForceLegend/Sundial-Lite
//  https://www.gnu.org/licenses/gpl-3.0.en.html
//
//  Reflection filter stage 2, applying BRDF weight
//

layout(location = 0) out vec4 texBuffer4;

in vec2 texcoord;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    vec3 reflectionColor = vec3(0.0);
    #ifdef REFLECTION
        float waterDepth = texelFetch(depthtex0, texel, 0).r;
        float solidDepth = texelFetch(depthtex1, texel, 0).r;
        #ifdef LOD
            waterDepth += float(waterDepth == 1.0) * (getLodDepthWater(texcoord) - 1.0);
            solidDepth += float(solidDepth == 1.0) * (getLodDepthSolid(texcoord) - 1.0);
        #endif
        if (abs(waterDepth) < 1.0) {
            vec4 originData = texelFetch(colortex4, texel, 0);
            vec2 materialData = unpack2x8Bit(texelFetch(colortex2, texel, 0).g);
            float smoothness = materialData.x;
            float metalness = materialData.y;

            #ifdef LABPBR_F0
                metalness = step(229.5 / 255.0, metalness);
            #endif
            float reflectionWeight = 1.0;
            if (waterDepth == solidDepth) {
                float diffuseWeight = pow(1.0 - smoothness, 5.0);
                #ifndef FULL_REFLECTION
                    diffuseWeight = 1.0 - (1.0 - diffuseWeight) * sqrt(clamp(smoothness - (1.0 - smoothness) * (1.0 - 0.6666 * metalness), 0.0, 1.0));
                #endif
                reflectionWeight *= 1.0 - diffuseWeight;
            }

            #if REFLECTION_FILTER > 0
                float originReflectionDepth = originData.w;
                float originSmoothness = smoothness;
                if (originSmoothness < 0.9975 && originReflectionDepth > 1e-5) {
                    vec3 originNormal = getNormalTexel(texel);
                    float roughness = pow2(1.0 - originSmoothness);
                    float roughnessInv = 100.0 / max(roughness, 1e-5);
                    vec2 coordOffset = vec2(4.0 * clamp(roughness * 20.0, 0.0, 1.0) * (1.0 - exp(-sqrt(originReflectionDepth) * 50.0)));
                    coordOffset *= blueNoiseTemporal(texcoord).x + 0.5;

                    vec3 accumulation = originData.rgb;
                    float weightAccumulation = 1.0;
                    vec2 centerTexelCoord = texel + 0.5;

                    for (int i = -REFLECTION_FILTER; i < REFLECTION_FILTER + 1; i++) {
                        for (int j = -REFLECTION_FILTER; j < REFLECTION_FILTER + 1; j++) {
                            vec2 sampleTexelCoord = centerTexelCoord + vec2(i, j) * coordOffset;
                            ivec2 sampleTexel = ivec2(sampleTexelCoord);
                            vec4 sampleData = texelFetch(colortex4, sampleTexel, 0);
                            float sampleReflectionDepth = sampleData.w;
                            vec3 sampleNormal = getNormalTexel(sampleTexel);
                            float sampleSmoothness = unpack2x8Bit(texelFetch(colortex2, sampleTexel, 0).g).x;

                            float weight =
                                exp2(
                                    roughnessInv * log2(max(dot(originNormal, sampleNormal), 1e-6)) +
                                    100.0 * log2(1.0 - abs(roughness - pow2(1.0 - sampleSmoothness))) -
                                    1.44269502 * abs(originReflectionDepth - sampleReflectionDepth) / (max(originReflectionDepth, sampleReflectionDepth) + 0.2) * originSmoothness
                                ) *
                                step(0.0025, sampleSmoothness);
                            weight = clamp(weight, 0.0, 1.0);
                            if (abs(i) != -abs(j) && all(lessThan(floatBitsToUint(sampleTexelCoord * texelSize), uvec2(floatBitsToUint(screenEdge))))) {
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

    texBuffer4 = vec4(reflectionColor, texelFetch(colortex0, texel, 0).w);
}

/* DRAWBUFFERS:4 */
