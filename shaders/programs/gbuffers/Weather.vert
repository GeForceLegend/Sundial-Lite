out vec4 color;
out vec3 worldPos;
out vec2 texcoord;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"

vec3 viewToWorldPos(vec3 viewPos) {
    return mat3(gbufferModelViewInverse) * viewPos + gbufferModelViewInverse[3].xyz;
}

void main() {
    vec4 viewPos = gl_ModelViewMatrix * gl_Vertex;
    worldPos = viewToWorldPos(viewPos.xyz);

    gl_Position = ftransform();
    color = gl_Color;
    texcoord = vec2(gl_TextureMatrix[0] * gl_MultiTexCoord0);

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif
}