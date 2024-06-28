layout(location = 0) out vec4 gbufferData0;

in vec3 color;

void main() {
    gbufferData0 = vec4(color, 1.0);
}

/* DRAWBUFFERS:0 */
