layout(location = 0) out vec4 shadowColor0;
layout(location = 1) out vec4 shadowColor1;

in vec4 color;
in vec3 worldPos;
in vec3 worldNormal;
in vec2 texcoord;
in vec2 shadowOffset;

// #define SHADOW_DISTORTION_FIX

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"

uniform sampler2D gaux1;

const int shadowMapResolution = 2048; // [1024 2048 4096 8192 16384]
const float realShadowMapResolution = shadowMapResolution * MC_SHADOW_QUALITY;

vec3 waterCaustic(vec3 mcPos, vec3 lightDir) {

    float causticStrength = 0.5;

    #ifdef WATER_CAUSTIC
        vec3 causticPos = mcPos + vec3(1.0, 0.0, 0.5) * frameTimeCounter * WATER_WAVE_SPEED;
        vec2 causticCoord = causticPos.xz + (causticPos.y / lightDir.y) * lightDir.xz;

        vec3 position = vec3(causticCoord, frameTimeCounter);

        const mat3 rotation = mat3(
            -0.6666667,-0.3333333, 0.6666667,
             0.6666667,-0.6666667, 0.3333333,
             0.3333333, 0.6666667, 0.6666667
        );

        float dist = 1.0;

        for (int i = 0; i < 4; i++) {
            position = rotation * position * 0.9 + 114.514;
            vec3 offset = 0.5 - fract(position);
            dist = min(dist, dot(offset, offset));
        }

        causticStrength = dist * sqrt(dist) * (3.0 - 2.0 * dist) * 0.9 + 0.1;
    #endif

    vec3 caustic = vec3(causticStrength);

    return caustic;
}

vec3 shadowCoordToWorldPos(vec3 shadowCoord) {
    float shadowBias = (1.0 - SHADOW_BIAS) / (1.0 - length(shadowCoord.st) * SHADOW_BIAS);
    shadowCoord.st *= shadowBias;

    vec3 shadowViewPos = vec3(shadowProjectionInverse[0].x, shadowProjectionInverse[1].y, shadowProjectionInverse[2].z) * shadowCoord + shadowProjectionInverse[3].xyz;
    vec3 shadowPos = mat3(shadowModelViewInverse) * shadowViewPos + shadowModelViewInverse[3].xyz;
    return shadowPos;
}

void main() {
    #ifdef SHADOW_AND_SKY
        vec4 albedo = textureLod(gtexture, texcoord, 0.0);
        albedo *= color;
        vec2 centerTexelOffset = gl_FragCoord.st - realShadowMapResolution * 0.75 - shadowOffset;
        if (any(greaterThan(abs(centerTexelOffset), vec2(1024.0))) || fwidth(shadowOffset.x) > 0.0
            #ifdef ALPHA_TEST
                || albedo.w < alphaTestRef
            #endif
        ) discard;

        #ifdef SHADOW_DISTORTION_FIX
            vec3 shadowProjPos = vec3(centerTexelOffset / (realShadowMapResolution * 0.25), gl_FragCoord.z * 10.0 - 5.0);
            vec3 pixelWorldPos = shadowCoordToWorldPos(shadowProjPos);
            vec3 positionDiff = worldPos - pixelWorldPos;
            float pixelDistanceToFace = dot(positionDiff, worldNormal);
            float NdotL = dot(worldNormal, shadowDirection);
            float offsetLength = signMul(pixelDistanceToFace / max(1e-5, abs(NdotL)), NdotL);
            gl_FragDepth = gl_FragCoord.z + offsetLength * shadowProjection[2].z * 0.1;
        #endif

        vec3 mcPos = worldPos + cameraPosition;
        mcPos.y += 128.0;
        float floorMcHeight = floor(mcPos.y / 2.0);
        shadowColor1 = vec4(1.0, 1.0, mcPos.y * 0.5 - floorMcHeight, 1.0 - floorMcHeight / 255.0);
        if (shadowOffset.y < -0.5) {
            vec3 caustic = waterCaustic(mcPos, shadowDirection);
            albedo = vec4(caustic, 1.0);
        }
        shadowColor0 = albedo;
    #else
        discard;
    #endif
}
