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
//  Gbuffer for particles, entities and block entities
//

layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

#if MC_VERSION < 11300
    in vec3 viewNormal;
    in mat3 tbnMatrix;
#endif

in vec4 color;
in vec4 viewPos;
in vec4 texlmcoord;
in vec3 mcPos;
in vec4 coordRange;

#define ENTITY_TEXTURE_RESOLUTION 16 // [4 8 16 32 64 128 256 512 1024 2048 4096 8192]

#ifdef END_PORTAL
    uniform int blockEntityId;
#endif

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"
#include "/libs/Common.glsl"
#include "/libs/Parallax.glsl"

#if defined PARTICLE && defined ENTITY_PARALLAX
    #undef ENTITY_PARALLAX
#endif

#ifdef END_PORTAL
    const vec3[] COLORS = vec3[](
        vec3(0.022087, 0.098399, 0.110818),
        vec3(0.011892, 0.095924, 0.089485),
        vec3(0.027636, 0.101689, 0.100326),
        vec3(0.046564, 0.109883, 0.114838),
        vec3(0.064901, 0.117696, 0.097189),
        vec3(0.063761, 0.086895, 0.123646),
        vec3(0.084817, 0.111994, 0.166380),
        vec3(0.097489, 0.154120, 0.091064),
        vec3(0.106152, 0.131144, 0.195191),
        vec3(0.097721, 0.110188, 0.187229),
        vec3(0.133516, 0.138278, 0.148582),
        vec3(0.070006, 0.243332, 0.235792),
        vec3(0.196766, 0.142899, 0.214696),
        vec3(0.047281, 0.315338, 0.321970),
        vec3(0.204675, 0.390010, 0.302066),
        vec3(0.080955, 0.314821, 0.661491)
    );

    mat2 mat2RotateZ(float radian) {
        return mat2(
            cos(radian), sin(radian),
            -sin(radian), cos(radian)
        );
    }

    vec2 endPortalLayer(vec2 coord, float layer) {
        vec2 offset = vec2(8.5 / layer, (1.0 + layer / 3.0) * (frameTimeCounter * 0.0015)) + 0.25;

        mat2 rotate = mat2RotateZ(radians(layer * layer * 8642.0 + layer * 18.0));

        return (4.5 - layer / 4.0) * (rotate * coord) + offset;
    }
#endif

vec2 calcTextureScale(vec2 dCoordDX, vec2 dCoordDY, vec3 position) {
    vec3 dPosDX = dFdx(position);
    vec3 dPosDY = dFdy(position);

    vec3 normal = cross(dPosDX, dPosDY);
    normal *= signI(-dot(normal, position)) * inversesqrt(dot(normal, normal));

    vec3 dPosPerpX = cross(normal, dPosDX);
    vec3 dPosPerpY = cross(dPosDY, normal);

    dPosPerpX /= dot(dPosDY, dPosPerpX);
    dPosPerpY /= dot(dPosDX, dPosPerpY);

    vec3 tangent = dPosPerpY * dCoordDX.x + dPosPerpX * dCoordDY.x;
    vec3 bitangent = dPosPerpY * dCoordDX.y + dPosPerpX * dCoordDY.y;

    float tangentLen = length(tangent);
    float bitangentLen = length(bitangent);

    vec2 textureScale = vec2(tangentLen, bitangentLen);

    return textureScale;
}

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

    vec2 texcoord = texlmcoord.st;
    vec2 texGradX = dFdx(texcoord);
    vec2 texGradY = dFdy(texcoord);
    vec2 textureScale;
    #if MC_VERSION >= 11300
        vec3 viewNormal;
        mat3 tbnMatrix = calcTbnMatrix(texGradX, texGradY, viewPos.xyz, viewNormal, textureScale);
    #else
        textureScale = calcTextureScale(texGradX, texGradY, viewPos.xyz);
    #endif
    float viewDepthInv = inversesqrt(dot(viewPos.xyz, viewPos.xyz));
    vec3 viewDir = viewPos.xyz * (-viewDepthInv);

    rawData.lightmap = texlmcoord.pq;
    rawData.geoNormal = viewNormal;
    rawData.normal = viewNormal;
    rawData.materialID = MAT_DEFAULT;
    #ifdef HAND
        rawData.materialID = MAT_HAND;
    #endif
    #ifdef PARTICLE
        rawData.materialID = MAT_PARTICLE;
    #endif
    rawData.parallaxOffset = 0.0;
    rawData.depth = 0.0;

    #ifdef END_PORTAL
        if (blockEntityId == 8193) {
            vec3 worldDir = -mat3(gbufferModelViewInverse) * viewDir;
	        vec3 worldDirAbs = abs(worldDir);
            vec3 samplePartAbs = step(vec3(max(worldDirAbs.x, max(worldDirAbs.y, worldDirAbs.z))), worldDirAbs);
            vec3 samplePart = samplePartAbs * signI(worldDir);
            float intersection = 1.0 / dot(samplePartAbs, worldDirAbs);
            vec3 sampleOffsetRaw = samplePart - worldDir * intersection;
            vec2 sampleOffset = vec2(
                sampleOffsetRaw.x * (samplePartAbs.y + samplePart.z) - sampleOffsetRaw.z * samplePart.x,
                sampleOffsetRaw.y * (1.0 - samplePartAbs.y) + sampleOffsetRaw.z * samplePartAbs.y
            );
            vec2 endPortalCoord = vec2(0.5 + sampleOffset * 0.5);

            vec3 enderPortalColor = vec3(0.0);
            for (int i = 0; i < 15; i++) {
                enderPortalColor += texture(gtexture, endPortalLayer(endPortalCoord, i + 1.0)).rgb * COLORS[i];
            }

            rawData.albedo = vec4(clamp(enderPortalColor, vec3(0.0), vec3(1.0)), 1.0);
            rawData.smoothness = 0.0;
            rawData.metalness = 1.0;
            rawData.porosity = 0.0;
            rawData.emissive = 1.0;
            rawData.materialID = MAT_END_PORTAL;
        } else
    #endif
    {
        vec4 albedoData = color;
        bool useTexAlbedo = false;
        bool noCoord = dot(abs(texGradX) + abs(texGradY), vec2(1.0)) < 1e-6;
        if (dot(abs(texcoord), vec2(1.0)) > 0.0) {
            #ifdef BEACON
                if (color.w < 0.999) discard;
            #endif
            #ifdef ENTITIES
                if (dot(color.rgb, vec3(1.0)) < 0.001 && abs(color.w - 0.5) < 0.49) discard;
            #endif
            useTexAlbedo = true;
        }
        #ifdef ENTITIES
            else {
                useTexAlbedo = abs(albedoData.w - 0.5) > 0.499;
                albedoData.w = useTexAlbedo ? albedoData.w : 1.0;
            }
        #endif
        #ifdef PARTICLE
            if (noCoord) {
                albedoData = vec4(1.0);
            }
        #endif

        vec2 albedoTexSize = vec2(textureSize(gtexture, 0));
        vec2 albedoTexelSize = 1.0 / albedoTexSize;
        vec4 fixedCoordRange = coordRange;
        if (fwidth(coordRange.x) + fwidth(coordRange.y) > 1e-6) {
            fixedCoordRange = vec4(0.0, 0.0, 1.0, 1.0);
        } else {
            fixedCoordRange = round(fixedCoordRange * vec4(albedoTexSize, albedoTexSize)) * vec4(albedoTexelSize, albedoTexelSize);
        }
        int textureResolutionFixed = (floatBitsToInt(max(textureScale.x * albedoTexSize.x, textureScale.y * albedoTexSize.y)) & 0x7FC00000) >> 22;
        textureResolutionFixed = ((textureResolutionFixed >> 1) + (textureResolutionFixed & 1)) - 0x0000007F;
        textureResolutionFixed = 1 << textureResolutionFixed;
        float parallaxScale = float(textureResolutionFixed) / ENTITY_TEXTURE_RESOLUTION;
        vec2 pixelScale = albedoTexelSize * parallaxScale / textureScale;
        vec2 quadSize = 1.0 / fixedCoordRange.zw;
        #if (defined ENTITY_PARALLAX && defined PARALLAX) || ANISOTROPIC_FILTERING_QUALITY > 0
            #ifdef ENTITY_PARALLAX
                #ifdef PARALLAX
                    float parallaxOffset = 0.0;
                    vec3 parallaxTexNormal = vec3(0.0, 0.0, 1.0);
                    vec3 textureViewer = -viewDir * tbnMatrix;
                    textureViewer.xy *= textureScale / parallaxScale;
                    #ifdef VOXEL_PARALLAX
                        texcoord = perPixelParallax(
                            texcoord, textureViewer, albedoTexSize, albedoTexelSize, fixedCoordRange, parallaxTexNormal, parallaxOffset
                        );
                    #else
                        texcoord = calculateParallax(texcoord, textureViewer, fixedCoordRange, quadSize, albedoTexSize, albedoTexelSize, parallaxOffset);
                    #endif
                    rawData.parallaxOffset = clamp(parallaxOffset / parallaxScale, 0.0, 1.0);
                #endif
            #endif
        #endif

        #if ANISOTROPIC_FILTERING_QUALITY > 0 && !defined PARTICLE && !defined MC_ANISOTROPIC_FILTERING
            vec4 texAlbedo = anisotropicFilter(texcoord, albedoTexSize, albedoTexelSize, texGradX, texGradY, fixedCoordRange, quadSize);
        #else
            vec4 texAlbedo = textureGrad(gtexture, texcoord, texGradX, texGradY);
        #endif
        #ifdef MC_NORMAL_MAP
            vec2 grad = min(abs(texGradX) , abs(texGradY));
            vec4 normalData = textureGrad(normals, texcoord, grad, grad);
            #ifdef LABPBR_TEXTURE_AO
                texAlbedo.rgb *= pow(normalData.b, 1.0 / 2.2);
            #endif
        #endif
        albedoData *= mix(vec4(1.0), texAlbedo, vec4(float(useTexAlbedo)));
        #ifdef COLORWHEEL
            float ao;
            vec4 overlayColor;
            clrwl_computeFragment(albedoData, albedoData, rawData.lightmap, ao, overlayColor);
            albedoData.rgb = mix(albedoData.rgb, overlayColor.rgb, overlayColor.a);
        #endif

        if (albedoData.w < 0.001) discard;

        rawData.albedo = albedoData;
        rawData.smoothness = 0.0;
        rawData.metalness = 0.0;
        rawData.porosity = 0.0;
        rawData.emissive = 0.0;

        #ifdef MC_SPECULAR_MAP
            vec4 specularData = texture(specular, texcoord);
            SPECULAR_FORMAT(rawData, specularData);
        #endif

        #ifdef TRANSPARENT
            rawData.smoothness += step(rawData.smoothness, 1e-3);
        #endif

        #ifndef SPECULAR_EMISSIVE
            rawData.emissive = 0.0;
        #endif

        #ifndef LABPBR_POROSITY
            rawData.porosity = 0.0;
        #endif

        #if (defined EMISSIVE) && (defined HARDCODED_EMISSIVE)
            rawData.emissive += step(rawData.emissive, 1e-3);
        #endif

        #ifdef PARTICLE
            if (noCoord) {
                rawData.emissive = 1.0;
            }
        #endif

        if (noCoord) {
            // Physics mod snow support
            rawData.parallaxOffset = 0.0;
            rawData.smoothness = 0.0;
            rawData.metalness = 0.0;
            rawData.porosity = 0.0;
            rawData.emissive = 0.0;
            #ifdef ENTITIES
                if (!useTexAlbedo) {
                    rawData.albedo.rgb = vec3(1.0);
                    rawData.emissive = 1.0;
                }
            #endif
        } else {
            float wetStrength = 0.0;
            vec3 rippleNormal = vec3(0.0, 0.0, 1.0);
            if (rainyStrength > 0.0) {
                float porosity = rawData.porosity * 255.0 / 64.0;
                porosity *= step(porosity, 1.0);
                float outdoor = clamp(15.0 * rawData.lightmap.y - 14.0, 0.0, 1.0);

                float porosityDarkness = porosity * outdoor * rainyStrength;
                rawData.albedo.rgb = pow(rawData.albedo.rgb, vec3(1.0 + porosityDarkness)) * (1.0 - 0.2 * porosityDarkness);

                vec3 worldNormal = mat3(gbufferModelViewInverse) * rawData.geoNormal;
                #if RAIN_PUDDLE == 0 || !defined USE_RAIN_PUDDLE
                #elif RAIN_PUDDLE == 1
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

            vec2 quadTexelSize = albedoTexelSize * quadSize;
            #if (defined PARALLAX_BASED_NORMAL) || (defined VOXEL_PARALLAX)
                #if defined ENTITY_PARALLAX && defined PARALLAX
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
                                vec2 tileCoord = (texcoord - fixedCoordRange.xy) * quadTexelSize;
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
                        rawData.normal = normalize(mix(rawData.geoNormal, rawData.normal, exp2(-sqrt(dot(vec4(texGradX, texGradY), vec4(texGradX, texGradY))))));
                    } else
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
                rawData.normal = normalize(tbnMatrix * rawData.normal);

                float NdotV = dot(rawData.normal, viewDir) * inversesqrt(dot(rawData.normal, rawData.normal));
                vec3 edgeNormal = rawData.normal - viewDir * NdotV;
                float curveStart = dot(viewDir, rawData.geoNormal);
                float weight = clamp(curveStart - curveStart * exp(NdotV / curveStart - 1.0), 0.0, 1.0);
                weight = max(NdotV, curveStart) - weight;
                rawData.normal = viewDir * weight + edgeNormal * inversesqrt(dot(edgeNormal, edgeNormal) / (1.0 - weight * weight));
            }
        }
    }

    packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
}

/* DRAWBUFFERS:012 */
