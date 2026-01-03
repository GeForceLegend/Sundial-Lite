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
//  Visibility bitmask things; Lighting that don't need calculated in visibility bitmask
//

layout(location = 0) out vec4 texBuffer3;
layout(location = 1) out vec4 texBuffer5;

in vec2 texcoord;

#define VB_TRACE_COUNT 1 // [1 2 3 4 5 6 7 8]
#define VB_STEPS 16 // [4 6 8 12 16 20 24 32 40 48 64 80 96 112 128]
#define VB_GI_LENGTH 514.0 // [64.0 80.0 96.0 114.0 128.0 160.0 192.0 224.0 256.0 320.0 384.0 448.0 514.0 640.0 768.0 896.0 1024.0 1280.0 1536.0 1792.0 2048.0]
#define VB_AO_LENGTH 128.0 // [64.0 80.0 96.0 114.0 128.0 160.0 192.0 224.0 256.0 320.0 384.0 448.0 514.0 640.0 768.0 896.0 1024.0 1280.0 1536.0 1792.0 2048.0]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Common.glsl"
#include "/libs/GbufferData.glsl"

vec3 directionDistribution(vec3 normal, vec2 randVec2) {
    float randAngle = 6.2831853 * randVec2.x;
    float randStrength = sqrt(randVec2.y);
    float inversed = signI(normal.z);
    vec3 tangentDirection = vec3(cos(randAngle) * randStrength, sin(randAngle) * randStrength, sqrt(1.0 - randVec2.y) * inversed);
    vec3 reflectDirection = vec3(normal.xy, normal.z + inversed);
    vec3 rayDirection = dot(tangentDirection, reflectDirection) * reflectDirection / abs(reflectDirection.z) - tangentDirection;
    return rayDirection;
}

// https://graphics.stanford.edu/%7Eseander/bithacks.html#CountBitsSetParallel | license: public domain
uint CountBits(uint v)
{
    v = v - ((v >> 1u) & 0x55555555u);
    v = (v & 0x33333333u) + ((v >> 2u) & 0x33333333u);
    return ((v + (v >> 4u) & 0xF0F0F0Fu) * 0x1010101u) >> 24u;
}

// Edited from https://www.shadertoy.com/view/XcdBWf, here is the source License:
/*
    This work is licensed under a dual license, public domain and MIT, unless noted otherwise. Choose the one that best suits your needs:

    CC0 1.0 Universal https://creativecommons.org/publicdomain/zero/1.0/
    To the extent possible under law, the author has waived all copyrights and related or neighboring rights to this work.

    or

    The MIT License
    Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"),
    to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
    and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
    The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
    DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
    THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

float ArcTan11(vec2 dir)// == ArcTan(dir) / Pi
{
    float x = abs(dir.x);
    float y =     dir.y;

    //float u = 2.0 + x * (1.27324 + x * (-0.189431 + x * (0.0908837 + x * (-0.0511549 + (0.0236728 - 0.005618 * x) * x))));
    float u = 2.0 + x * (1.27324 + x * (-0.189431 + (0.08204 - 0.0242564 * x) * x));

    float f = y / u;

    if(dir.x < 0.0) f = signI(dir.y) - f;

    return f;
}

float ACosPoly(float x)
{
    return 1.5707963267948966 + (-0.20491203466059038 + 0.04832927023878897 * x) * x;
}

float ACos_Approx(float x)
{
    float u = ACosPoly(abs(x)) * sqrt(1.0 - abs(x));
			
    return x >= 0.0 ? u : PI - u;
}

float ACos(float x)
{
    return ACos_Approx(clamp(x, -1.0, 1.0));
}

vec2 ACos(vec2 x)
{
    return vec2(ACos(x.x), ACos(x.y));
}

float ASin01_Approx(float x)// x: [0,1]
{
	return 1.5707963267948966 - ACosPoly(x) * sqrt(1.0 - x);
}

vec4 GetQuaternion(vec3 to)
{
    vec3 xyz = vec3( to.y,-to.x, 0.0);// cross(from, to);
    float s  =                  -to.z;//   dot(from, to);

    float u = inversesqrt(max(0.0, s * 0.5 + 0.5));// rcp(cosine half-angle formula)

    s    = 1.0 / u;
    xyz *= u * 0.5;

    return vec4(xyz, s);
}

vec2 cmul(vec2 c0, vec2 c1)
{
	return vec2(c0.x * c1.x - c0.y * c1.y,
		        c0.y * c1.x + c0.x * c1.y);
}

float SamplePartialSlice(float x, float sin_thVN)
{
    const float Pi   = 3.1415926535897930;
    const float Pi05 = 1.5707963267948966;

    if((abs(x) - 0.5) < 0.5) {
        uint sgn = floatBitsToUint(x) & 0x80000000u;
        x = abs(x);

        float s = sin_thVN;

        float o = s - s * s;
        float slp0 = 1.0 / (1.0 + (Pi  - 1.0        ) * (s - o * 0.30546           ));
        float slp1 = 1.0 / (1.0 - (1.0 - exp2(-20.0)) * (s + o * mix(0.5, 0.785, s)));

        float k = mix(0.1, 0.25, s);

        float a = 1.0 - (Pi - 2.0) / (Pi - 1.0);
        float b = 1.0 / (Pi - 1.0);

        float d0 =   a - slp0 * b;
        float d1 = 1.0 - slp1;

        float f0 = d0 * (Pi * x - ASin01_Approx(x));
        float f1 = d1 * (     x - 1.0);

        float kk = k * k;

        float h0 = sqrt(f0*f0 + kk) - k;
        float h1 = sqrt(f1*f1 + kk) - k;

        float hh = (h0 * h1) / (h0 + h1);

        float y = x - sqrt(hh*(hh + 2.0*k));
        x = uintBitsToFloat(floatBitsToUint(y) ^ sgn);
    }
    return x;
}

// vvsN: view vec space normal | rnd01: [0, 1]
vec2 SamplePartialSliceDir(vec3 vvsN, float rnd01)
{
    float ang0 = rnd01 * PI * 2.0;

    vec2 dir0 = vec2(cos(ang0), sin(ang0));

    float l = inversesqrt(dot(vvsN.xy, vvsN.xy));
    float l2 = 1.0 / l;

    if(l2 > 0.0) {
        vec2 n = vvsN.xy * l;

        // align n with x-axis
        dir0 = cmul(dir0, n * vec2(1.0, -1.0));

        // sample slice angle
        float ang;
        {
            float x = ArcTan11(dir0);
            float sinNV = l2;

            ang = SamplePartialSlice(x, sinNV) * PI;
        }

        // ray space slice direction
        vec2 dir = vec2(cos(ang), sin(ang));

        // align x-axis with n
        dir0 = cmul(dir, n);
    }
    return dir0;
}

vec2 SliceRelCDF_Cos(vec2 x, float angN, float cosN)
{
    vec2 phi = x * PI - PI * 0.5;

    vec2 t0 = 3.0 * cosN + -cos(angN - 2.0 * phi) + (4.0 * angN - 2.0 * phi + PI) * sin(angN);
    float t1 = 4.0 * (cosN + angN * sin(angN));

    return mix(x, t0 / t1, step(abs(x - 0.5), vec2(0.5)));
}

// transform v by unit quaternion q.xy0s
vec3 Transform_Qz0(vec3 v, vec4 q)
{
    float k = v.y * q.x - v.x * q.y;
    float g = 2.0 * (v.z * q.w + k);

    vec3 r;
    r.xy = v.xy + q.yx * vec2(g, -g);
    r.z  = v.z  + 2.0 * (q.w * k - v.z * dot(q.xy, q.xy));

    return r;
}

// transform v.xy0 by unit quaternion q.xy0s
vec3 Transform_Vz0Qz0(vec2 v, vec4 q)
{
    float o = q.x * v.y;
    float c = q.y * v.x;

    vec3 b = vec3( o - c,
                  -o + c,
                   o - c);

    return vec3(v, 0.0) + 2.0 * (b * q.yxw);
}

vec4 screenSpaceVisibiliyBitmask(vec3 originViewPos, vec3 normal, vec2 texcoord, float viewLengthInv, float isOriginNotHand) {
    vec3 viewDir = -viewLengthInv * originViewPos;
    vec4 Q_toV = GetQuaternion(viewDir);
    vec4 Q_fromV = Q_toV * vec4(vec3(-1.0), 1.0);
    vec3 normalVVS = Transform_Qz0(normal, Q_fromV);

    vec2 noise = vec2(blueNoiseTemporal(texcoord).x, bayer64Temporal(gl_FragCoord.xy));
    const float r2Double = 0.7548776662;
    vec4 originProjPos = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * originViewPos + gbufferProjection[3].xyz, -originViewPos.z);
    #ifdef TAA
        originProjPos.xy += taaOffset * originProjPos.w;
    #endif
    float originProjScale = 0.5 / originProjPos.w;
    vec2 originCoord = vec2(originProjPos.xy * originProjScale + 0.5);

    vec4 totalSamples = vec4(0.0);
    for (int i = 0; i < VB_TRACE_COUNT; i++) {
        noise = fract(noise + vec2(r2Double, r2Double * r2Double));
        vec2 screenDir = SamplePartialSliceDir(normalVVS, noise.x);
        vec3 rayDir = Transform_Vz0Qz0(screenDir, Q_toV);

        vec4 projDirection = vec4(vec3(gbufferProjection[0].x, gbufferProjection[1].y, gbufferProjection[2].z) * rayDir, -rayDir.z);
        projDirection.xy += gbufferProjection[2].xy * rayDir.z;
        float traceLength = projIntersectionScreenEdge(originProjPos, projDirection);

        vec4 targetProjPos = originProjPos + projDirection * traceLength;
        float targetProjScale = 0.5 / targetProjPos.w;
        vec2 targetCoord = vec2(targetProjPos.xy * targetProjScale + 0.5);

        vec2 sampleRange = (targetCoord - originCoord) * screenSize;
        float projTraceLength = inversesqrt(dot(sampleRange, sampleRange));
        vec2 stepDir = sampleRange * projTraceLength * texelSize;
        float VB_LENGTH = VB_AO_LENGTH;
        #ifdef VBGI
            VB_LENGTH = VB_GI_LENGTH;
        #endif
        float stepScale = log2(max(1.0 / VB_LENGTH, clamp(projTraceLength, 0.0, 1.0))) / -float(VB_STEPS);

        vec3 sliceN = cross(viewDir, rayDir);
        vec3 projN = normal - sliceN * dot(normal, sliceN);
        float projNSqrLen = dot(projN, projN);
        if (projNSqrLen == 0.0) continue;
        vec3 T = cross(sliceN, projN);
        float projNRcpLen = inversesqrt(projNSqrLen);
        float cosN = dot(projN, viewDir) * projNRcpLen;
        float angN = signMul(ACos(cosN), dot(viewDir, T));

        float angOff = angN / PI + 0.5;
        float w0 = clamp((sin(angN) / (cos(angN) + angN * sin(angN))) * (PI/4.0) + 0.5, 0.0, 1.0);

        // partial slice re-mapping constants
        float w0_remap_mul = 1.0 / (1.0 - w0);
        float w0_remap_add = -w0 * w0_remap_mul;

        uint occBits = 0u;
        float stepSize = exp2(stepScale * noise.y);
        stepScale = exp2(stepScale);

        for (int j = 0; j < VB_STEPS; j++) {
            vec2 sampleCoord = originCoord + stepDir * stepSize;
            ivec2 sampleTexel = ivec2(sampleCoord * screenSize);
            float sampleDepth = uintBitsToFloat(texelFetch(colortex6, sampleTexel, 0).r);
            stepSize *= stepScale;
            if (any(greaterThan(abs(sampleCoord - 0.5), vec2(0.5)))) {
                break;
            }

            float isHand = float(sampleDepth > 1.0);
            vec3 sampleViewPos;
            #ifdef LOD
                if (sampleDepth < 0.0) {
                    if (sampleDepth == -1.0) {
                        continue;
                    }
                    sampleViewPos = screenToViewPosLod(sampleCoord, -sampleDepth);
                }
            #else
                if (sampleDepth == 1.0) {
                    continue;
                }
            #endif
            else {
                sampleViewPos = screenToViewPos(sampleCoord, sampleDepth - isHand);
            }

            vec3 deltaPosFront = sampleViewPos - originViewPos;
            vec3 deltaPosBack = deltaPosFront - viewDir * max(abs(sampleViewPos.z) * 0.1, 0.2);

            vec2 horCos = vec2(dot(deltaPosFront, viewDir) * inversesqrt(dot(deltaPosFront, deltaPosFront)),
                                dot(deltaPosBack , viewDir) * inversesqrt(dot(deltaPosBack , deltaPosBack )));

            vec2 horAng = ACos(horCos);

            // shift relative angles from V to N + map to [0,1]
            vec2 hor01 = clamp(horAng / PI + angOff, 0.0, 1.0);

            // map to slice relative distribution
            hor01 = SliceRelCDF_Cos(hor01, angN, cosN);

            // partial slice re-mapping
            hor01 = hor01 * w0_remap_mul + w0_remap_add;

            uvec2 horInt = (floatBitsToUint(hor01 * 32.0 + 64.0) >> 17) & 0x3Fu;
            uint mX = horInt.x < 32u ? 0xFFFFFFFFu <<        horInt.x  : 0u;
            uint mY = horInt.y != 0u ? 0xFFFFFFFFu >> (32u - horInt.y) : 0u;
            uint occBits0 = mX & mY;

            uint visBits0 = occBits0 & (~occBits);
            #ifdef VBGI
                if(visBits0 != 0u) {
                    float vis0 = float(CountBits(visBits0)) * (1.0 / 32.0);
                    vec4 sampleData = texelFetch(colortex3, sampleTexel, 0);
                    totalSamples.rgb += sampleData.rgb * vis0 * clamp(1.0 - isOriginNotHand * isHand, 0.0, 1.0);
                }
            #endif
            occBits = occBits | occBits0;
        }
        float occ0 = float(CountBits(occBits)) * (1.0 / 32.0);
        totalSamples.a += occ0;
    }
    totalSamples /= VB_TRACE_COUNT;
    return totalSamples;
}

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    GbufferData gbufferData = getGbufferData(texel, texcoord);
    vec3 viewPos;
    float isOriginNotHand = 1.0;
    gbufferData.depth = uintBitsToFloat(texelFetch(colortex6, texel, 0).r);
    #ifdef LOD
        if (gbufferData.depth < 0.0) {
            viewPos = screenToViewPosLod(texcoord, -gbufferData.depth - 1e-7);
        } else
    #endif
    {
        float isHand = float(gbufferData.depth > 1.0);
        isOriginNotHand -= isHand;
        gbufferData.depth -= isHand;
        viewPos = screenToViewPos(texcoord, gbufferData.depth - 1e-7);
    }
    viewPos += gbufferData.geoNormal * 3e-3;
    vec4 currData = vec4(0.0);
    vec4 colorData = texelFetch(colortex3, texel, 0);
    if (abs(gbufferData.depth) < 1.0) {
        float viewLengthInv = inversesqrt(dot(viewPos, viewPos));
        // Merge some vec3s into floats to save registers
        float NdotV = clamp(dot(viewPos, -gbufferData.normal) * viewLengthInv, 0.0, 1.0);
        #ifdef IS_IRIS
            vec3 worldPos = viewToWorldPos(viewPos);
            float eyeRelatedDistance = length(worldPos + relativeEyePosition);
            gbufferData.lightmap.x = max(gbufferData.lightmap.x, heldBlockLightValue / 15.0 * clamp(1.0 - eyeRelatedDistance / 15.0, 0.0, 1.0));
        #endif

        currData = screenSpaceVisibiliyBitmask(viewPos, gbufferData.normal, texcoord, viewLengthInv, isOriginNotHand);
        vec4 prevData = texelFetch(colortex5, texel, 0);
        float blendWeight = clamp(1.0 / colorData.w, 0.0, 1.0);
        currData = mix(prevData, currData, blendWeight);

        vec3 lightColor = vec3(BASIC_LIGHT);
        lightColor += pow(texelFetch(colortex4, ivec2(0), 0).rgb, vec3(2.2)) * NIGHT_VISION_BRIGHTNESS;
        const float fadeFactor = VANILLA_BLOCK_LIGHT_FADE;
        vec3 blockLight = pow2(1.0 / (fadeFactor - fadeFactor * fadeFactor / (1.0 + fadeFactor) * gbufferData.lightmap.x) - 1.0 / fadeFactor) * commonLightColor;
        lightColor += blockLight;
        lightColor *= (1.0 - currData.w);
        #ifdef VBGI
            lightColor += currData.rgb;
        #endif

        float diffuseWeight = pow(1.0 - gbufferData.smoothness, 5.0);
        vec3 n = vec3(1.5);
        vec3 k = vec3(0.0);
        #ifdef LABPBR_F0
            n = mix(n, vec3(f0ToIor(gbufferData.metalness)), step(0.001, gbufferData.metalness));
            hardcodedMetal(gbufferData.metalness, n, k);
            gbufferData.metalness = step(229.5 / 255.0, gbufferData.metalness);
        #endif
        #ifndef FULL_REFLECTION
            diffuseWeight = 1.0 - (1.0 - diffuseWeight) * sqrt(clamp(gbufferData.smoothness - (1.0 - gbufferData.smoothness) * (1.0 - 0.6666 * gbufferData.metalness), 0.0, 1.0));
        #endif
        vec3 diffuseAbsorption = (1.0 - gbufferData.metalness) * diffuseAbsorptionWeight(NdotV, gbufferData.smoothness, gbufferData.metalness, n, k);
        lightColor *= diffuseAbsorption + diffuseWeight / PI;
        lightColor *= gbufferData.albedo.rgb;
        colorData.rgb += lightColor;
    }
    texBuffer3 = colorData;
    texBuffer5 = currData;
}

/* DRAWBUFFERS:35 */
