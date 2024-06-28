layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

flat in vec4 color;

#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    if (color.w < alphaTestRef) discard;

    GbufferData rawData;

    rawData.albedo = vec4(color.rgb, 1.0);
    rawData.normal = vec3(0.0, 0.0, 1.0);
    rawData.geoNormal = vec3(0.0, 0.0, 1.0);
    rawData.lightmap = vec2(0.0);
    rawData.smoothness = 0.0;
    rawData.metalness = 0.0;
    rawData.porosity = 0.0;
    rawData.emissive = 0.0;
    rawData.materialID = 0.0;
    rawData.parallaxOffset = 0.0;
    rawData.depth = 0.0;

    packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
}

/* DRAWBUFFERS:012 */
