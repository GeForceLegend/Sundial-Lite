layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

in vec3 color;
in vec3 viewPos;
flat in vec3 blockData;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Common.glsl"

void main() {
    vec3 worldPos = viewToWorldPos(viewPos);
    if (max(dot(worldPos.xz, worldPos.xz), worldPos.y * worldPos.y) < (far - 16.0) * (far - 16.0)) {
        discard;
    }

    GbufferData rawData;

	vec4 albedo = vec4(color, 1.0);
	ivec3 pixelPos = ivec3(floor((worldPos + cameraPosition) * 16.0 + 1e-3));
	ivec2 texel = (pixelPos.xz + 17 * pixelPos.y) & 63;
	float noise = texelFetch(noisetex, texel, 0).r;
	albedo.rgb = pow(albedo.rgb, vec3(noise * 0.3 + 0.85));

    vec3 dPosDX = dFdx(viewPos);
    vec3 dPosDY = dFdy(viewPos);
    vec3 viewNormal = cross(dPosDX, dPosDY);
    viewNormal *= signMul(inversesqrt(dot(viewNormal, viewNormal)), -dot(viewNormal, viewPos));

    rawData.albedo = albedo;
    rawData.lightmap = blockData.xy;
    rawData.normal = viewNormal;
    rawData.geoNormal = viewNormal;
    rawData.smoothness = 0.0;
    rawData.metalness = 0.0;
    rawData.porosity = 0.7 * float(blockData.z == MAT_LEAVES);
    rawData.emissive = float(blockData.z == MAT_TORCH);
    rawData.materialID = blockData.z;
    rawData.parallaxOffset = 0.0;
    rawData.depth = 0.0;

    if (rainyStrength > 0.0) {
        float outdoor = clamp(15.0 * rawData.lightmap.y - 14.0, 0.0, 1.0);
        vec3 worldNormal = mat3(gbufferModelViewInverse) * rawData.geoNormal;
        #if RAIN_WET == 1
            float rainWetness = clamp(worldNormal.y * 10.0 + 0.5, 0.0, 1.0) * outdoor * rainyStrength;
            rawData.smoothness += (1.0 - rawData.metalness) * (1.0 - rawData.smoothness) * rainWetness;
        #elif RAIN_WET == 2
            rawData.smoothness = groundWetSmoothness(worldPos + cameraPosition, worldNormal.y, rawData.smoothness, rawData.metalness, 0.0, outdoor);
        #endif
    }

    packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
}

/* DRAWBUFFERS:012 */
