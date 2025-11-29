layout(location = 0) out vec4 texBuffer0;
layout(location = 1) out vec4 texBuffer1;
layout(location = 2) out vec4 texBuffer2;

uniform sampler2D colortex16;
uniform sampler2D colortex17;
uniform sampler2D colortex18;

#include "/libs/Uniform.glsl"

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    vec4 trasnparent = texelFetch(colortex16, texel, 0);
    float overlay = clamp(trasnparent.w * 1e+3, 0.0, 1.0) * float(texelFetch(depthtex1, texel, 0).r == 1.0);
    texBuffer0 = mix(texelFetch(colortex0, texel, 0), trasnparent, overlay);
    texBuffer1 = mix(texelFetch(colortex1, texel, 0), texelFetch(colortex17, texel, 0), overlay);
    texBuffer2 = mix(texelFetch(colortex2, texel, 0), texelFetch(colortex18, texel, 0), overlay);
}

/* DRAWBUFFERS:012 */
