layout(location = 0) out vec4 texBuffer3;

in vec2 texcoord;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    float depth = textureLod(depthtex1, texcoord, 0.0).x;
    vec3 viewPos = screenToViewPos(texcoord, depth);

    ivec2 texel = ivec2(gl_FragCoord.st);
    float parallaxOffset = unpack16Bit(texelFetch(colortex2, texel, 0).a).y;
    vec3 geoNormal = decodeNormal(texelFetch(colortex1, texel, 0).zw);
    float parallaxViewDepth = -0.2 * PARALLAX_DEPTH * viewPos.z * parallaxOffset / max(1e-5, dot(viewPos, -geoNormal));

    texBuffer3 = vec4(0.0, 0.0, 0.0, parallaxViewDepth);
}

/* DRAWBUFFERS:3 */
