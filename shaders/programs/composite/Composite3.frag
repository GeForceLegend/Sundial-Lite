layout(location = 0) out vec4 texBuffer4;

in vec2 texcoord;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/ReflectionFilter.glsl"

void main() {
    texBuffer4 = vec4(0.0);
    if (getWaterDepth(texcoord) < 1.0)
        texBuffer4 = reflectionFilter(6.0, false);
}

/* DRAWBUFFERS:4 */
