layout(location = 0) out vec4 gbufferData0;

in vec4 color;
in vec2 texcoord;

#include "/libs/Uniform.glsl"

void main() {
    vec4 albedo = color * texture(gtexture, texcoord);
    if (albedo.w < alphaTestRef) discard;
    gbufferData0 = albedo;
}

/* DRAWBUFFERS:0 */
