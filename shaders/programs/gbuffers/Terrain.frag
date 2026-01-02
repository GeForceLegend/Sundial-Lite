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

layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

in vec4 texlmcoord;
in vec3 color;
in vec3 viewPos;
in vec4 coordRange;

flat in int material;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Common.glsl"
#include "/libs/Water.glsl"
#include "/libs/Parallax.glsl"

mat3 calcTbnMatrix(vec2 dCoordDX, vec2 dCoordDY, vec3 position, out vec2 textureScale) {
    vec3 dPosDX = dFdx(position);
    vec3 dPosDY = dFdy(position);

    vec3 normal = normalize(cross(dPosDX, dPosDY));

    vec3 dPosPerpX = cross(normal, dPosDX);
    vec3 dPosPerpY = cross(dPosDY, normal);

    dPosPerpX /= dot(dPosDY, dPosPerpX);
    dPosPerpY /= dot(dPosDX, dPosPerpY);

    vec3 tangent = dPosPerpY * dCoordDX.x + dPosPerpX * dCoordDY.x;
    vec3 bitangent = dPosPerpY * dCoordDX.y + dPosPerpX * dCoordDY.y;

    float tangentLen = inversesqrt(dot(tangent, tangent));
    float bitangentLen = inversesqrt(dot(bitangent, bitangent));

    textureScale = vec2(tangentLen, bitangentLen);

    return mat3(tangent * tangentLen, bitangent * bitangentLen, normal);
}

void main() {
    GbufferData rawData;

    vec2 texGradX = dFdx(texlmcoord.st);
    vec2 texGradY = dFdy(texlmcoord.st);
    vec2 textureScale;
    mat3 tbnMatrix = calcTbnMatrix(texGradX, texGradY, viewPos.xyz, textureScale);

    vec2 albedoTexSize = vec2(textureSize(gtexture, 0));
    vec2 albedoTexelSize = 1.0 / albedoTexSize;
    vec4 fixedCoordRange = coordRange;
    if (fwidth(coordRange.x) + fwidth(coordRange.y) > 1e-6) {
        fixedCoordRange = vec4(0.0, 0.0, 1.0, 1.0);
    }
    vec2 pixelScale = albedoTexelSize * textureScale;
    vec2 quadSize = 1.0 / fixedCoordRange.zw;

    float parallaxOffset = 0.0;
    vec2 texcoord = texlmcoord.st;
    #ifdef PARALLAX
        vec3 parallaxTexNormal = vec3(0.0, 0.0, 1.0);
        #if WATER_TYPE == 0 && defined CAULDRON_WAVE
            if (material != 8192)
        #endif
        {
            vec3 textureViewer = viewPos * tbnMatrix;
            textureViewer.xy /= textureScale;
            #ifdef VOXEL_PARALLAX
                texcoord = perPixelParallax(texlmcoord.st, textureViewer, albedoTexSize, albedoTexelSize, fixedCoordRange, parallaxTexNormal, parallaxOffset);
            #else
                texcoord = calculateParallax(texlmcoord.st, textureViewer, fixedCoordRange, quadSize, albedoTexSize, albedoTexelSize, parallaxOffset);
            #endif
        }
    #endif

    #if ANISOTROPIC_FILTERING_QUALITY > 0 && !defined MC_ANISOTROPIC_FILTERING
        vec4 albedoData = anisotropicFilter(texcoord, albedoTexSize, albedoTexelSize, texGradX, texGradY, fixedCoordRange, quadSize);
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
    rawData.materialID = MAT_DEFAULT;
    rawData.parallaxOffset = parallaxOffset;
    rawData.depth = 0.0;

    if ((max(material, 0) & 0x4800) == 0x4800 || material == 8198 || material == 8206 || material == 8207) {
        rawData.materialID = MAT_GRASS;
    }

    #ifdef MC_SPECULAR_MAP
        vec4 specularData = textureLod(specular, texcoord, 0.0);
        SPECULAR_FORMAT(rawData, specularData);
    #endif

    #ifndef SPECULAR_EMISSIVE
        rawData.emissive = 0.0;
    #endif

    #ifdef HARDCODED_EMISSIVE
        int commonEmissive = max(0, material) & 0x7000;
        float hardcodedEmissive = float(material == 8195);
        if (commonEmissive > 16384) {
            hardcodedEmissive = clamp(0.57 * length(rawData.albedo.rgb) + float(commonEmissive == 0x5000), 0.0, 1.0);
        }
        else if (material == 8198) {
            hardcodedEmissive = clamp(2.0 * rawData.albedo.r - 1.5 * rawData.albedo.g, 0.0, 1.0);
        }
        else if (material == 8200) {
            hardcodedEmissive = clamp(2.0 * rawData.albedo.b - 1.0 * rawData.albedo.r, 0.0, 1.0);
        }
        else if (material == 8197 || material == 8202) {
            hardcodedEmissive = clamp((0.8 * rawData.albedo.r - 1.2 * rawData.albedo.b) * dot(rawData.albedo.rgb, vec3(0.3333)), 0.0, 1.0);
        }
        else if (material == 8203) {
            hardcodedEmissive = float(pow2(rawData.albedo.r) > 0.3 * (pow2(rawData.albedo.b) + pow2(rawData.albedo.g)) + 0.3);
        }
        else if (material == 8204) {
            hardcodedEmissive = clamp(2.0 * rawData.albedo.b - 4.5 * rawData.albedo.r, 0.0, 1.0) + clamp(2.0 * rawData.albedo.r - 3.0 * rawData.albedo.b, 0.0, 1.0);
        }
        else if (material == 8205) {
            hardcodedEmissive = clamp(0.5 * rawData.albedo.b - 1.0 * rawData.albedo.r - 0.2, 0.0, 1.0);
        }
        rawData.emissive += hardcodedEmissive * clamp(1.0 - rawData.emissive * 1e+3, 0.0, 1.0);
    #endif
    bool isCauldronWater = material == 8192;
    rawData.smoothness += float(rawData.smoothness < 1e-3 && isCauldronWater);

    #ifdef MOD_LIGHT_DETECTION
        if (rawData.lightmap.x > 0.99999 && material < 0) {
            rawData.emissive += float(rawData.emissive < 1e-3 && rawData.materialID < 0.5);
        }
    #endif

    #ifndef LABPBR_POROSITY
        rawData.porosity = 0.0;
    #endif

    int commonPorosity = max(0, material) & 0x4E00;
    if (material == 8198) {
        commonPorosity = 0x4E00;
    }
    rawData.porosity +=
        clamp(1.0 - rawData.porosity * 1e+3, 0.0, 1.0) * clamp(float(commonPorosity - 16384), 0.0, 1.0) *
        intBitsToFloat(0x3F400000 - ((commonPorosity & 0x0800) << 11));

    float wetStrength = 0.0;
    vec3 rippleNormal = vec3(0.0, 0.0, 1.0);
    float viewDepthInv = inversesqrt(dot(viewPos, viewPos));
    vec3 viewDir = viewPos * (-viewDepthInv);
    vec3 worldPos = viewToWorldPos(viewPos) + cameraPosition;
    if (rainyStrength > 0.0 && material != 8195 && rawData.materialID != MAT_GRASS) {
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
                        rawData.normal = heightBasedNormal(normals, texcoord, fixedCoordRange, quadTexelSize, albedoTexSize, pixelScale);
                    #else
                        const float eps = 1e-4;
                        vec2 tileCoord = (texcoord - fixedCoordRange.xy) * quadSize;
                        float rD = textureGrad(normals, clampCoordRange(tileCoord + vec2(eps * quadTexelSize.x, 0.0), fixedCoordRange), grad, grad).a;
                        float lD = textureGrad(normals, clampCoordRange(tileCoord - vec2(eps * quadTexelSize.x, 0.0), fixedCoordRange), grad, grad).a;
                        float uD = textureGrad(normals, clampCoordRange(tileCoord + vec2(0.0, eps * quadTexelSize.y), fixedCoordRange), grad, grad).a;
                        float dD = textureGrad(normals, clampCoordRange(tileCoord - vec2(0.0, eps * quadTexelSize.y), fixedCoordRange), grad, grad).a;
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
                normalData = bilinearNormalSample(normals, texcoord, fixedCoordRange, quadTexelSize, albedoTexSize);
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
    rawData.lightmap = 
        clamp(rawData.lightmap + blueNoiseTemporal(gl_FragCoord.st * texelSize).xy * 2.0 / 255.0 - 1.0 / 255.0, 0.0, 1.0) *
        clamp(rawData.lightmap * 500.0, 0.0, 1.0);

    packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
}

/* DRAWBUFFERS:012 */
