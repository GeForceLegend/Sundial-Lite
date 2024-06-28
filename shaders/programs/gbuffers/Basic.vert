flat out vec4 color;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"

void main() {
    color = gl_Color;
    gl_Position = ftransform();

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif
}
