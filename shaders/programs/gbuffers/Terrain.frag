//     _________      __        __     ___       __     __________      ________        ______        __           
//    /  _____  \    |  |      |  |   |   \     |  |   |   _____  \    |__    __|      /  __  \      |  |          
//   /  /     \__\   |  |      |  |   |    \    |  |   |  |     \  \      |  |        /  /  \  \     |  |          
//  |  |             |  |      |  |   |  |  \   |  |   |  |      |  |     |  |       /  /    \  \    |  |          
//   \  \______      |  |      |  |   |  |\  \  |  |   |  |      |  |     |  |      |  |______|  |   |  |          
//    \______  \     |  |      |  |   |  | \  \ |  |   |  |      |  |     |  |      |   ______   |   |  |          
//           \  \    |  |      |  |   |  |  \  \|  |   |  |      |  |     |  |      |  |      |  |   |  |          
//  ___       |  |   |  |      |  |   |  |   \  |  |   |  |      |  |     |  |      |  |      |  |   |  |          
//  \  \_____/  /     \  \____/  /    |  |    \    |   |  |_____/  /    __|  |__    |  |      |  |   |  |_________ 
//   \_________/       \________/     |__|     \___|   |__________/    |________|   |__|      |__|   |____________|
//
//  General Public License v3.0. © 2021-Now GeForceLegend.
//  https://github.com/GeForceLegend/Sundial-Lite
//  https://www.gnu.org/licenses/gpl-3.0.en.html
//
//  Gbuffer for solid terrain
//

#extension GL_ARB_gpu_shader5 : enable
#extension GL_ARB_shading_language_packing : enable

layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

in vec4 texlmcoord;
in vec3 color;
in vec3 viewPos;

flat in uint material;
flat in vec4 coordRange;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Common.glsl"
#include "/libs/Water.glsl"
#include "/libs/Parallax.glsl"

mat3 calcTbnMatrix(vec2 dCoordDX, vec2 dCoordDY, vec3 position, out vec3 normal, out vec2 textureScale) {
    vec3 dPosDX = dFdx(position);
    vec3 dPosDY = dFdy(position);

    normal = normalize(cross(dPosDX, dPosDY));

    vec3 dPosPerpX = cross(normal, dPosDX);
    vec3 dPosPerpY = cross(dPosDY, normal);

    dPosPerpX /= dot(dPosDY, dPosPerpX);
    dPosPerpY /= dot(dPosDX, dPosPerpY);

    vec3 tangent = dPosPerpY * dCoordDX.x + dPosPerpX * dCoordDY.x;
    vec3 bitangent = dPosPerpY * dCoordDX.y + dPosPerpX * dCoordDY.y;

    float tangentLen = inversesqrt(dot(tangent, tangent));
    float bitangentLen = inversesqrt(dot(bitangent, bitangent));

    textureScale = 1.0 / vec2(tangentLen, bitangentLen);

    return mat3(tangent * tangentLen, bitangent * bitangentLen, normal);
}

void main() {
    GbufferData rawData;

    vec2 texGradX = dFdx(texlmcoord.st);
    vec2 texGradY = dFdy(texlmcoord.st);
    vec2 textureScale;
    vec3 viewNormal;
    mat3 tbnMatrix = calcTbnMatrix(texGradX, texGradY, viewPos.xyz, viewNormal, textureScale);

    vec2 albedoTexSize = vec2(textureSize(gtexture, 0));
    vec2 albedoTexelSize = 1.0 / albedoTexSize;
    int textureResolutionFixed = (floatBitsToInt(max(textureScale.x * albedoTexSize.x, textureScale.y * albedoTexSize.y)) & 0x7FC00000) >> 22;
    textureResolutionFixed = ((textureResolutionFixed >> 1) + (textureResolutionFixed & 1)) - 0x0000007F;
    textureResolutionFixed = 1 << textureResolutionFixed;
    vec2 pixelScale = albedoTexelSize / textureScale;
    vec2 quadSize = 1.0 / coordRange.zw;

    float parallaxOffset = 0.0;
    vec2 texcoord = texlmcoord.st;
    #ifdef PARALLAX
        vec3 parallaxTexNormal = vec3(0.0, 0.0, 1.0);
        #if WATER_TYPE == 0 && defined CAULDRON_WAVE
            if ((material >> 1) != MAT_WATER)
        #endif
        {
            vec3 textureViewer = viewPos * tbnMatrix;
            textureViewer.xy *= textureScale;
            #ifdef VOXEL_PARALLAX
                texcoord = perPixelParallax(texlmcoord.st, textureViewer, albedoTexSize, albedoTexelSize, coordRange, parallaxTexNormal, parallaxOffset);
            #else
                texcoord = calculateParallax(texlmcoord.st, textureViewer, coordRange, quadSize, albedoTexSize, albedoTexelSize, parallaxOffset);
            #endif
        }
    #endif

    #if ANISOTROPIC_FILTERING_QUALITY > 0 && !defined MC_ANISOTROPIC_FILTERING
        vec4 albedoData = anisotropicFilter(texcoord, albedoTexSize, albedoTexelSize, texGradX, texGradY, coordRange, quadSize);
    #else
        vec4 albedoData = textureGrad(gtexture, texcoord, texGradX, texGradY);
    #endif
    if (albedoData.w < alphaTestRef) discard;

    vec2 grad = min(abs(texGradX) , abs(texGradY));
    #ifdef MC_NORMAL_MAP
        vec4 normalData = textureGrad(normals, texcoord, grad, grad);
        #ifdef LABPBR_TEXTURE_AO
            albedoData.rgb *= pow(normalData.b, 1.0 / 2.2);
        #endif
    #endif

    albedoData.rgb *= color;
    rawData.albedo = albedoData;
    rawData.lightmap = texlmcoord.pq;
    rawData.normal = tbnMatrix[2];
    rawData.geoNormal = tbnMatrix[2];
    rawData.smoothness = 0.0;
    rawData.metalness = 0.0;
    rawData.porosity = 0.0;
    rawData.emissive = 0.0;
    rawData.materialID = material >> 1;
    rawData.parallaxOffset = parallaxOffset;
    rawData.depth = 0.0;

    #ifdef MC_SPECULAR_MAP
        vec4 specularData = textureLod(specular, texcoord, 0.0);
        SPECULAR_FORMAT(rawData, specularData);
    #endif

    #ifndef SPECULAR_EMISSIVE
        rawData.emissive = 0.0;
    #endif

    #ifdef HARDCODED_EMISSIVE
        float emissive = clamp(float(material & 1u) - rawData.emissive * 1e+3, 0.0, 1.0);
        if (rawData.materialID == MAT_TORCH) {
            emissive *= 0.57 * length(rawData.albedo.rgb);
        }
        else if (rawData.materialID == MAT_BREWING_STAND) {
            emissive *= clamp(1.5 * rawData.albedo.r - 2.0 * rawData.albedo.b, 0.0, 1.0);
        }
        else if (rawData.materialID == MAT_GLOWING_BERRIES) {
            emissive *= clamp(2.0 * rawData.albedo.r - 1.5 * rawData.albedo.g, 0.0, 1.0);
        }
        rawData.emissive += emissive;
    #endif
    bool isCauldronWater = rawData.materialID == MAT_WATER;
    rawData.smoothness += float(rawData.smoothness < 1e-3 && isCauldronWater);

    #ifdef MOD_LIGHT_DETECTION
        if (rawData.lightmap.x > 0.99999) {
            rawData.emissive += float(rawData.emissive < 1e-3 && rawData.materialID < 0.5);
        }
    #endif

    #ifndef LABPBR_POROSITY
        rawData.porosity = 0.0;
    #endif

    rawData.porosity +=
        clamp(1.0 - rawData.porosity * 1e+3, 0.0, 1.0) *
        (0.5 * float(rawData.materialID == MAT_GRASS) + 0.7 * float(rawData.materialID == MAT_LEAVES || rawData.materialID == MAT_GLOWING_BERRIES));

    float wetStrength = 0.0;
    vec3 rippleNormal = vec3(0.0, 0.0, 1.0);
    float viewDepthInv = inversesqrt(dot(viewPos, viewPos));
    vec3 viewDir = viewPos * (-viewDepthInv);
    vec3 worldPos = viewToWorldPos(viewPos) + cameraPosition;
    if (rainyStrength > 0.0 && rawData.materialID != MAT_LAVA) {
        float porosity = rawData.porosity * 255.0 / 64.0;
        porosity *= step(porosity, 1.0);
        float outdoor = clamp(15.0 * rawData.lightmap.y - 14.0, 0.0, 1.0);

        float porosityDarkness = porosity * outdoor * rainyStrength;
        rawData.albedo.rgb = pow(rawData.albedo.rgb, vec3(1.0 + porosityDarkness)) * (1.0 - 0.2 * porosityDarkness);

        vec3 worldNormal = mat3(gbufferModelViewInverse) * rawData.geoNormal;
        #if RAIN_PUDDLE == 1
            wetStrength = (1.0 - rawData.metalness) * clamp(worldNormal.y * 10.0 - 0.1, 0.0, 1.0) * outdoor * rainyStrength * (1.0 - porosity);
        #elif RAIN_PUDDLE == 2
            wetStrength = groundWetStrength(worldPos, worldNormal.y, rawData.metalness, porosity, outdoor);
        #endif
        rawData.smoothness += (1.0 - rawData.smoothness) * wetStrength;

        #ifdef RAIN_RIPPLES
            rippleNormal = rainRippleNormal(worldPos);
            rippleNormal.xy *= viewDepthInv / (viewDepthInv + 0.1 * RIPPLE_FADE_SPEED);
        #endif
    }

    vec2 quadTexelSize = albedoTexelSize * quadSize;
    #ifdef PARALLAX
        #if (defined VOXEL_PARALLAX) || (defined PARALLAX_BASED_NORMAL)
            if (rawData.parallaxOffset > 0.0
                #ifdef VOXEL_PARALLAX
                    && parallaxTexNormal.z < 0.5
                #endif
            ) {
                #ifdef VOXEL_PARALLAX
                    rawData.normal = tbnMatrix * parallaxTexNormal;
                #else
                    #ifdef SMOOTH_PARALLAX
                        rawData.normal = heightBasedNormal(normals, texcoord, coordRange, quadTexelSize, albedoTexSize, pixelScale);
                    #else
                        const float eps = 1e-4;
                        vec2 tileCoord = (texcoord - coordRange.xy) * quadSize;
                        float rD = textureGrad(normals, clampCoordRange(tileCoord + vec2(eps * quadTexelSize.x, 0.0), coordRange), grad, grad).a;
                        float lD = textureGrad(normals, clampCoordRange(tileCoord - vec2(eps * quadTexelSize.x, 0.0), coordRange), grad, grad).a;
                        float uD = textureGrad(normals, clampCoordRange(tileCoord + vec2(0.0, eps * quadTexelSize.y), coordRange), grad, grad).a;
                        float dD = textureGrad(normals, clampCoordRange(tileCoord - vec2(0.0, eps * quadTexelSize.y), coordRange), grad, grad).a;
                        rawData.normal = vec3((lD - rD), (dD - uD), step(abs(lD - rD) + abs(dD - uD), 1e-3));
                    #endif
                    rawData.normal = mix(rawData.normal, rippleNormal, wetStrength);
                    rawData.normal = normalize(tbnMatrix * rawData.normal);
                #endif
                texGradX *= albedoTexSize;
                texGradY *= albedoTexSize;
                rawData.normal = normalize(mix(tbnMatrix[2], rawData.normal, exp2(-sqrt(dot(vec4(texGradX, texGradY), vec4(texGradX, texGradY))))));
            }
            else
        #endif
    #endif
    {
        #ifdef CAULDRON_WAVE
            #if WATER_TYPE == 0
                if (isCauldronWater) {
                    rawData.albedo = vec4(color.rgb * 0.2, 1.0);
                    vec3 tangentDir = viewPos * tbnMatrix;
                    rawData.normal = waterWave(worldPos / 32.0, tangentDir);
                    rawData.normal.xy += rippleNormal.xy * wetStrength;
                    rawData.smoothness = 1.0;
                    rawData.metalness = 0.0;
                    rawData.porosity = 0.0;
                    rawData.emissive = 0.0;
                }
                else
            #endif
        #endif
        {
            #ifdef SMOOTH_NORMAL
                normalData = bilinearNormalSample(normals, texcoord, coordRange, quadTexelSize, albedoTexSize);
            #endif
            #ifdef MC_NORMAL_MAP
                rawData.normal = NORMAL_FORMAT(normalData.xyz);
                rawData.normal.xy *= NORMAL_STRENGTH;
            #else
                rawData.normal = vec3(0.0, 0.0, 1.0);
            #endif
            rawData.normal = mix(rawData.normal, rippleNormal, wetStrength);
        }
        rawData.normal = normalize(tbnMatrix * rawData.normal);

        float NdotV = dot(rawData.normal, viewDir);
        vec3 edgeNormal = rawData.normal - viewDir * NdotV;
        float curveStart = dot(viewDir, tbnMatrix[2]);
        float weight = clamp(curveStart - curveStart * exp(NdotV / curveStart - 1.0), 0.0, 1.0);
        weight = max(NdotV, curveStart) - weight;
        rawData.normal = viewDir * weight + edgeNormal * inversesqrt(dot(edgeNormal, edgeNormal) / (1.0 - weight * weight));
    }
    rawData.lightmap = clamp(rawData.lightmap + blueNoiseTemporal(gl_FragCoord.st * texelSize).xy * 2.0 / 255.0 - 1.0 / 255.0, 0.0, 1.0) * clamp(rawData.lightmap * 500.0, 0.0, 1.0);

    packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
}

/* DRAWBUFFERS:012 */
