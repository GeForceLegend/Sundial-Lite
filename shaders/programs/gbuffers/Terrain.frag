#extension GL_ARB_gpu_shader5 : enable
#extension GL_ARB_shading_language_packing : enable

layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

in vec4 texlmcoord;
in vec3 color;

flat in uvec3 blockData;
flat in vec3 viewNormal;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Common.glsl"
#include "/libs/Water.glsl"
#include "/libs/Parallax.glsl"

void main() {
    GbufferData rawData;

    vec2 atlasTexSize = vec2(atlasSize);
    #ifdef MC_ANISOTROPIC_FILTERING
        atlasTexSize *= spriteBounds.zw - spriteBounds.xy;
    #endif
    vec4 viewTangent = vec4(unpackHalf2x16(blockData.y), unpackHalf2x16(blockData.z));
    float tangentLenInv = inversesqrt(dot(viewTangent.xyz, viewTangent.xyz));
    vec3 tangent = viewTangent.xyz * tangentLenInv;
    vec3 bitangent = cross(viewNormal, tangent) * signI(viewTangent.w);
    mat3 tbnMatrix = mat3(tangent, bitangent, viewNormal);

    vec2 atlasTexelSize = uintBitsToFloat(0x7F000000u - floatBitsToUint(atlasTexSize));
    ivec2 textureResolutionFixed = (0x3FC00000 - floatBitsToInt(vec2(tangentLenInv, abs(viewTangent.w)) * atlasTexelSize)) >> 23;
    textureResolutionFixed = ivec2(1) << textureResolutionFixed;
    int maxTextureResolution = max(textureResolutionFixed.x, textureResolutionFixed.y);
    float textureResolutionInv = uintBitsToFloat(0x7F000000u - floatBitsToUint(maxTextureResolution));
    ivec2 baseCoordI = ivec2(floor(texlmcoord.st * atlasTexSize * textureResolutionInv)) * maxTextureResolution;

    vec3 viewPos = screenToViewPos(gl_FragCoord.st * texelSize, gl_FragCoord.z);
    float viewDepthInv = inversesqrt(dot(viewPos, viewPos));
    vec3 viewDir = viewPos * (-viewDepthInv);
    float parallaxOffset = 0.0;
    vec2 texcoord = texlmcoord.st;
    #ifdef PARALLAX
        vec3 parallaxTexNormal = vec3(0.0, 0.0, 1.0);
        #if WATER_TYPE == 0 && defined CAULDRON_WAVE
            if (blockData.x >> 1 != MAT_WATER)
        #endif
        {
            vec3 textureViewer = -viewDir * tbnMatrix;
            textureViewer.xy *= textureResolutionFixed * textureResolutionInv;
            #ifdef VOXEL_PARALLAX
                texcoord = perPixelParallax(texlmcoord.st, textureViewer, atlasTexSize, baseCoordI, maxTextureResolution, true, parallaxTexNormal, parallaxOffset);
            #else
                texcoord = calculateParallax(texlmcoord.st, textureViewer, atlasTexSize, atlasTexelSize, baseCoordI, maxTextureResolution, true, parallaxOffset);
            #endif
        }
    #endif
    vec2 baseCoord = vec2(baseCoordI) * atlasTexelSize;

    vec2 texGradX = dFdx(texlmcoord.st);
    vec2 texGradY = dFdy(texlmcoord.st);
    vec2 atlasTiles = atlasTexSize * textureResolutionInv;
    vec2 tileCoordSize = maxTextureResolution * atlasTexelSize;
    #if ANISOTROPIC_FILTERING_QUALITY > 0 && !defined MC_ANISOTROPIC_FILTERING
        vec4 albedoData = anisotropicFilter(texcoord, atlasTexSize, atlasTexelSize, texGradX, texGradY, baseCoord, tileCoordSize, atlasTiles, true);
    #else
        vec4 albedoData = textureGrad(gtexture, texcoord, texGradX, texGradY);
    #endif
    if (albedoData.w < alphaTestRef) discard;

    #ifdef MC_NORMAL_MAP
        vec2 grad = min(abs(texGradX) , abs(texGradY));
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
    rawData.materialID = blockData.x >> 1;
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
        float emissive = step(rawData.emissive, 1e-3) * (blockData.x & 1u);
        if (rawData.materialID == MAT_TORCH) {
            emissive *= 0.57 * length(rawData.albedo.rgb);
        }
        else if (rawData.materialID == MAT_GLOWING_BERRIES) {
            emissive *= clamp(2.0 * rawData.albedo.r - 1.5 * rawData.albedo.g, 0.0, 1.0);
        }
        rawData.emissive += emissive;
    #endif
    bool isCauldronWater = rawData.materialID == MAT_WATER;
    rawData.smoothness += float(rawData.smoothness < 1e-3 && isCauldronWater);
    rawData.albedo.rgb *= 1.0 - 0.5 * float(isCauldronWater);

    #ifdef MOD_LIGHT_DETECTION
        if (rawData.lightmap.x > 0.99999) {
            rawData.emissive += float(rawData.emissive < 1e-3 && rawData.materialID < 0.5);
        }
    #endif

    #ifndef LABPBR_POROSITY
        rawData.porosity = 0.0;
    #endif

    rawData.porosity +=
        (1.0 - clamp(rawData.porosity * 1e+3, 0.0, 1.0)) *
        (0.5 * float(rawData.materialID == MAT_GRASS) + 0.7 * float(rawData.materialID == MAT_LEAVES || rawData.materialID == MAT_GLOWING_BERRIES));

    float wetStrength = 0.0;
    vec3 mcPos = viewToWorldPos(viewPos) + cameraPosition;
    vec3 rippleNormal = vec3(0.0, 0.0, 1.0);
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
            wetStrength = groundWetStrength(mcPos, worldNormal.y, rawData.metalness, porosity, outdoor);
        #endif
        rawData.smoothness += (1.0 - rawData.smoothness) * wetStrength;

        #ifdef RAIN_RIPPLES
            rippleNormal = rainRippleNormal(mcPos);
            rippleNormal.xy *= viewDepthInv / (viewDepthInv + 0.1 * RIPPLE_FADE_SPEED);
        #endif
    }

    vec2 atlasTexelOffset = 0.5 * atlasTexelSize;
    if (
        true
        #ifdef PARALLAX_BASED_NORMAL
            #ifdef PARALLAX
                && (parallaxOffset == 0.0
                #ifdef VOXEL_PARALLAX
                    || parallaxTexNormal.z > 0.5
                #endif
                )
            #endif
        #endif
    ) {
        #ifdef CAULDRON_WAVE
            #if WATER_TYPE == 0
                if (isCauldronWater) {
                    rawData.albedo = vec4(color.rgb * 0.1, 1.0);
                    vec3 tangentDir = transpose(tbnMatrix) * viewPos.xyz;
                    rawData.normal = waterWave(mcPos / 32.0, tangentDir);
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
                normalData = bilinearNormalSample(normals, texcoord, baseCoord, tileCoordSize, atlasTiles, atlasTexSize, atlasTexelOffset, true);
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
        if (NdotV < 1e-6) {
            vec3 edgeNormal = rawData.normal - viewDir * NdotV;
            float weight = 1.0 - NdotV;
            weight = sin(min(weight, PI / 2.0));
            weight = clamp(min(max(NdotV, dot(viewDir, tbnMatrix[2])), 1.0 - weight), 0.0, 1.0);
            rawData.normal = viewDir * weight + edgeNormal * inversesqrt(dot(edgeNormal, edgeNormal) / (1.0 - weight * weight));
        }
    }
    else {
        #ifdef VOXEL_PARALLAX
            #ifdef PARALLAX
                rawData.normal = tbnMatrix * parallaxTexNormal;
            #endif
        #else
            #ifdef SMOOTH_PARALLAX
                rawData.normal = heightBasedNormal(normals, texcoord, baseCoord, atlasTexSize, atlasTexelOffset, maxTextureResolution, true);
            #else
                const float eps = 1e-4;
                float rD = textureGrad(normals, calculateOffsetCoord(texcoord + vec2(eps * tileCoordSize.x, 0.0), baseCoord, tileCoordSize, atlasTiles), grad, grad).a;
                float lD = textureGrad(normals, calculateOffsetCoord(texcoord - vec2(eps * tileCoordSize.x, 0.0), baseCoord, tileCoordSize, atlasTiles), grad, grad).a;
                float uD = textureGrad(normals, calculateOffsetCoord(texcoord + vec2(0.0, eps * tileCoordSize.y), baseCoord, tileCoordSize, atlasTiles), grad, grad).a;
                float dD = textureGrad(normals, calculateOffsetCoord(texcoord - vec2(0.0, eps * tileCoordSize.y), baseCoord, tileCoordSize, atlasTiles), grad, grad).a;
                rawData.normal = vec3((lD - rD), (dD - uD), step(abs(lD - rD) + abs(dD - uD), 1e-3));
            #endif
            rawData.normal = mix(rawData.normal, rippleNormal, wetStrength);
            rawData.normal = normalize(tbnMatrix * rawData.normal);
        #endif
        rawData.normal = normalize(mix(tbnMatrix[2], rawData.normal, 1.0 / (1.0 + 4.0 * pow(dot(vec4(texGradX, texGradY), vec4(texGradX, texGradY)), 0.1))));
    }

    packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
}

/* DRAWBUFFERS:012 */
