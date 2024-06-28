out vec4 color;
out vec2 texcoord;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"

void main() {
    color = gl_Color;
    #ifdef TEXTURE_MATRIX
        texcoord = vec2(gl_TextureMatrix[0] * gl_MultiTexCoord0);
    #else
        texcoord = gl_MultiTexCoord0.st;
    #endif
    gl_Position = ftransform();

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif
}
