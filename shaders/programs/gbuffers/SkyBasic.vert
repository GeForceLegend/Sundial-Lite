out vec3 color;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"

void main() {
    color = vec3(0.0);
    if (abs(gl_Color.r - gl_Color.g) + abs(gl_Color.g - gl_Color.b) < 1e-3) {
        color = gl_Color.rgb;
    }
    gl_Position = ftransform();

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif
}
