#extension GL_ARB_shading_language_packing: enable

layout(location = 0) out vec4 texBuffer3;

in vec2 texcoord;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    float depth = textureLod(depthtex1, texcoord, 0.0).x;
    vec3 viewPos = screenToViewPos(texcoord, depth);

    ivec2 texel = ivec2(gl_FragCoord.st);
    vec3 geoNormal = decodeNormal(texelFetch(colortex1, texel, 0).zw);
    vec2 gbufferData = unpack16Bit(texelFetch(colortex2, texel, 0).a);
    float parallaxDepthDiff = -0.2 * PARALLAX_DEPTH * viewPos.z * gbufferData.y / max(1e-5, dot(viewPos, -geoNormal));
    float materialID = round(gbufferData.x * 255.0);
    bool isHand = materialID == MAT_HAND;
    vec3 parallaxViewPos = viewPos;
    float parallaxDepthOrigin = depth;
    if (isHand) {
        parallaxDepthOrigin = depth / MC_HAND_DEPTH - 0.5 / MC_HAND_DEPTH + 0.5;
        parallaxViewPos = screenToViewPos(texcoord, parallaxDepthOrigin);
    }
    float parallaxViewDepth = parallaxViewPos.z + parallaxDepthDiff * normalize(parallaxViewPos).z;
    float parallaxDepth = viewToScreenDepth(-parallaxViewDepth);
    parallaxDepthDiff = (parallaxDepth - parallaxDepthOrigin) * 512.0;

    texBuffer3 = vec4(0.0, 0.0, 0.0, parallaxDepthDiff);
}

/* DRAWBUFFERS:3 */
