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
    #ifdef DISTANT_HORIZONS
        depth += float(depth == 1.0) * (textureLod(dhDepthTex0, texcoord, 0.0).r - 1.0);
    #endif
    if (depth < 1.0)
        texBuffer4 = reflectionFilter(6.0, false);
}

/* DRAWBUFFERS:4 */
