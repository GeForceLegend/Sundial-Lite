#extension GL_ARB_shading_language_packing: enable

layout(location = 0) out vec4 texBuffer4;

in vec2 texcoord;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/ReflectionFilter.glsl"

void main() {
    texBuffer4 = texture(colortex4, texcoord, 0.0);
    float depth = getWaterDepth(texcoord);
    #ifdef LOD
        depth += float(depth == 1.0) * (getLodDepthWater(texcoord) - 1.0);
    #endif
    if (depth < 1.0)
        texBuffer4 = reflectionFilter(2.5, false);
}

/* DRAWBUFFERS:4 */
