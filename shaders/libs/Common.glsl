struct Ray {
    vec3 origin;
    vec3 direction;
    vec3 dirInv;
    vec3 dirSigned;
};

float pow2(float a) {
    return a * a;
}

vec2 pow2(vec2 a) {
    return a * a;
}

vec3 pow2(vec3 a) {
    return a * a;
}

vec4 pow2(vec4 a) {
    return a * a;
}

float signI(float x) {
    return uintBitsToFloat((floatBitsToUint(x) & 0x80000000u) | 0x3F800000u);
}

vec2 signI(vec2 x) {
    return uintBitsToFloat((floatBitsToUint(x) & 0x80000000u) | 0x3F800000u);
}

vec3 signI(vec3 x) {
    return uintBitsToFloat((floatBitsToUint(x) & 0x80000000u) | 0x3F800000u);
}

/// x * sign(y)
float signMul(float x, float y) {
    return uintBitsToFloat(floatBitsToUint(x) ^ (floatBitsToUint(y) & 0x80000000u));
}

vec2 signMul(vec2 x, vec2 y) {
    return uintBitsToFloat(floatBitsToUint(x) ^ (floatBitsToUint(y) & 0x80000000u));
}

vec3 signMul(vec3 x, vec3 y) {
    return uintBitsToFloat(floatBitsToUint(x) ^ (floatBitsToUint(y) & 0x80000000u));
}

vec4 signMul(vec4 x, vec4 y) {
    return uintBitsToFloat(floatBitsToUint(x) ^ (floatBitsToUint(y) & 0x80000000u));
}

vec3 blueNoiseTemporal(vec2 coord) {
    const vec3 irrationals = vec3(0.447213595, 1.41421356, 1.61803398);
    vec2 noiseCoord = vec2(coord.st * screenSize) / 64.0;
    vec3 n = textureLod(noisetex, noiseCoord, 0.0).rgb;
    n = fract(n + irrationals * (frameCounter & 63));
    return n;
}

int bayer2(ivec2 a) {
    a &= 1;
    return ((a.x ^ a.y) << 1) + a.y;
}

float bayer64(vec2 a) {
    ivec2 ai = ivec2(a);
    return (
        (bayer2 (ai >> 5)      ) +
        (bayer2 (ai >> 4) << 2 ) +
        (bayer2 (ai >> 3) << 4 ) +
        (bayer2 (ai >> 2) << 6 ) +
        (bayer2 (ai >> 1) << 8 ) +
        (bayer2 (ai     ) << 10)
    ) * exp2(-12.0);
}

float bayer64Temporal(vec2 a) {
    float bayer = bayer64(a);
    #ifdef TAA
        bayer = fract(bayer + (frameCounter & 63) * sqrt(0.4));
    #endif
    return bayer;
}

float smooth2DNoise(vec2 coord) {
    vec2 whole = floor(coord);
    vec2 part = coord - whole;

    part *= part * (3.0 / 64.0 - 2.0 / 64.0 * part);
    coord = whole / 64.0 + part - 1.0 / 128.0;

    return textureLod(noisetex, coord, 0.0).x;
}

float smooth3DNoise(vec3 position) {
    position *= 64.0;

    vec3 whole = floor(position);
    vec3 part = position - whole;

    part *= part * (vec3(vec2(3.0 / 64.0), 3.0) - vec3(vec2(2.0 / 64.0), 2.0) * part);

    vec2 coord = (17.0 / 64.0 * whole.z + 1.0 / 128.0) + whole.xy / 64.0 + part.xy;
    vec2 noise = textureLod(noisetex, coord, 0.0).yz;

    return mix(noise.x, noise.y, part.z);
}

float luminanceLiner(vec3 color) {
    return dot(color.rgb, vec3(0.2125, 0.7154, 0.0721));
}

float luminanceExp(vec3 color) {
    color = pow(color, vec3(2.2));
    return pow(luminanceLiner(color), 1.0 / 2.2);
}

vec2 centralizeCoord(vec2 coord) {
    return (floor(coord * screenSize) + 0.5) * texelSize;
}

float f0ToIor(float f0) {
    return pow2(sqrt(f0) + 1.0) / max(1e-6, 1.0 - f0);
}

float distribution(float NoH, float roughness) {
    float r2 = roughness * roughness;
    float k = r2 / pow2(1.0 + NoH * NoH * (r2 - 1.0));
    return k * (1.0 / PI);
}

float geometry(float NdotV, float NdotL, float a) {
    vec2 ggx = vec2(NdotL, NdotV);
    ggx = ggx / (ggx - ggx * a + a);
    return ggx.x * ggx.y;
}

float fresnel(float LdotH, float LdotH2, float n) {
    float sinR2 = 1.0 - LdotH2;
    float cosR = sqrt(clamp(1.0 - sinR2 / (n * n), 0.0, 1.0));
    float r1 = (n * LdotH - cosR) / (n * LdotH + cosR);
    float r2 = (n * cosR - LdotH) / (n * cosR + LdotH);
    float kR = clamp(0.5 * (r1 * r1 + r2 * r2), 0.0, 1.0);
    return kR;
}

// https://seblagarde.wordpress.com/2013/04/29/memo-on-fresnel-equations/
vec3 fresnelFull(float LdotH, float LdotH2, vec3 n, vec3 k, float metalness) {
    float sinR2 = 1.0 - LdotH2;
    vec3 n2 = n * n;
    vec3 k2 = k * k;

    vec3 t0 = n2 - k2 - sinR2;
    vec3 a2b2 = sqrt(t0 * t0 + 4.0 * n2 * k2);
    vec3 t1 = a2b2 + LdotH2;
    vec3 a = sqrt(2.0 * max(a2b2 + t0, 0.0));
    vec3 t2 = a * LdotH;

    vec3 t3 = LdotH2 * a2b2 + sinR2 * sinR2;
    vec3 t4 = t2 * sinR2;

    vec3 kR = t3 * (t1 - t2) / ((t1 + t2) * (t3 + t4));
    #ifndef LABPBR_F0
        kR = mix(kR, vec3(1.0), metalness);
    #endif
    return kR;
}

vec3 diffuseAbsorptionWeight(float NdotV, float smoothness, float metalness, vec3 n, vec3 k) {
    vec3 F = fresnelFull(NdotV, NdotV * NdotV, n, k, metalness);
    F = 1.0 - F * pow(smoothness, 5.0);
    return F;
}

void hardcodedMetal(float metalness, inout vec3 n, inout vec3 k) {
    #ifdef HARDCODED_METAL
    float materialId = round(metalness * 255.0);
    // 230 ~ 237, hardcoded metals
    float isHardcoded = clamp(abs(materialId / 4.0 - 233.5 / 4.0) * 1e+10 - 1e+10, 0.0, 1.0);

    if (isHardcoded < 1e-6) {
        n = vec3(0.0);

        float isIron = clamp(1e+4 - abs(materialId - 230.0) * 1e+5, 0.0, 1.0);
        n += isIron * vec3(2.9114, 2.9497, 2.5845);
        k += isIron * vec3(3.0893, 2.9318, 2.7670);

        float isGold = clamp(1e+4 - abs(materialId - 231.0) * 1e+5, 0.0, 1.0);
        n += isGold * vec3(0.18299, 0.42108, 1.3734);
        k += isGold * vec3(3.4242, 2.3459, 1.7704);

        float isAluminum = clamp(1e+4 - abs(materialId - 232.0) * 1e+5, 0.0, 1.0);
        n += isAluminum * vec3(1.3456, 0.96521, 0.61722);
        k += isAluminum * vec3(7.4746, 6.3995, 5.3031);

        float isChrome = clamp(1e+4 - abs(materialId - 233.0) * 1e+5, 0.0, 1.0);
        n += isChrome * vec3(3.1071, 3.1812, 2.3230);
        k += isChrome * vec3(3.3314, 3.3291, 3.1350);

        float isCopper = clamp(1e+4 - abs(materialId - 234.0) * 1e+5, 0.0, 1.0);
        n += isCopper * vec3(0.27105, 0.67693, 1.3164);
        k += isCopper * vec3(3.6092, 2.6248, 2.2921);

        float isLead = clamp(1e+4 - abs(materialId - 235.0) * 1e+5, 0.0, 1.0);
        n += isLead * vec3(1.9100, 1.8300, 1.4400);
        k += isLead * vec3(3.5100, 3.4000, 3.1800);

        float isPlatinum = clamp(1e+4 - abs(materialId - 236.0) * 1e+5, 0.0, 1.0);
        n += isPlatinum * vec3(2.3757, 2.0847, 1.8453);
        k += isPlatinum * vec3(4.2655, 3.7153, 3.1365);

        float isSilver = clamp(1e+4 - abs(materialId - 237.0) * 1e+5, 0.0, 1.0);
        n += isSilver * vec3(0.15943, 0.14512, 0.13547);
        k += isSilver * vec3(3.9291, 3.1900, 2.3808);
    }
    #endif
}

vec3 metalColor(vec3 albedo, float NdotV, float metalness, float smoothness) {
    float f = pow(1.0 - NdotV, 6.0) * smoothness;
    albedo = f + albedo - albedo * f;
    return mix(vec3(1.0), albedo, vec3(metalness));
}

vec3 sunlightSpecular(vec3 viewDir, vec3 lightDir, vec3 normal, vec3 albedo, float smoothness, float metalness, float NdotL, float NdotV, vec3 n, vec3 k) {
    float LdotV = dot(-viewDir, lightDir);
    float LdotH2 = LdotV * 0.5 + 0.5;
    float LdotHInv = inversesqrt(LdotH2);
    float LdotH = clamp(LdotH2 * LdotHInv, 0.0, 1.0);

    float roughness = pow2(1.0 - smoothness);
    vec3 reflectDir = viewDir + 2.0 * NdotV * normal;
    float NdotH = sqrt(clamp(dot(reflectDir, lightDir) * 1.0001 * 0.5 + 0.0001 * 0.5 + 0.5, 0.0, 1.0));

    float D = clamp(distribution(NdotH, roughness) / 300.0, 0.0, 1.0) * 300.0;
    float V = geometry(NdotV, NdotL, roughness);
    vec3 F = fresnelFull(LdotH, LdotH2, n, k, metalness) * metalColor(albedo, LdotH, metalness, 1.0);
    return D * V * F;
}

float groundWetStrength(vec3 position, float normalDir, float metalness, float porosity, float outdoor) {
    position *= 0.004;
    position.y *= 0.2;
    float noise = smooth3DNoise(position);
    float weight = 1.0;
    float weights = 1.0;
    for (int i = 0; i < 3; i++) {
        position = position * 2.8;
        weight *= 0.45;
        noise += smooth3DNoise(position) * weight;
        weights += weight;
    }
    noise /= weights;
    noise = noise * (rainyStrength * 1.0 + porosity * 0.1) + (rainyStrength * 0.4 - porosity * 0.1);
    #ifdef LABPBR_F0
        metalness = step(229.5 / 255.0, metalness);
    #endif

    return (1.0 - metalness) * clamp(normalDir * 10.0 - 0.1, 0.0, 1.0) * outdoor * clamp(noise, 0.0, 1.0);
}

/***************************************************************************
 # Copyright (c) 2015-21, NVIDIA CORPORATION. All rights reserved.
 #
 # Redistribution and use in source and binary forms, with or without
 # modification, are permitted provided that the following conditions
 # are met:
 #  * Redistributions of source code must retain the above copyright
 #    notice, this list of conditions and the following disclaimer.
 #  * Redistributions in binary form must reproduce the above copyright
 #    notice, this list of conditions and the following disclaimer in the
 #    documentation and/or other materials provided with the distribution.
 #  * Neither the name of NVIDIA CORPORATION nor the names of its
 #    contributors may be used to endorse or promote products derived
 #    from this software without specific prior written permission.
 #
 # THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS "AS IS" AND ANY
 # EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 # IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 # PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR
 # CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 # EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 # PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 # PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 # OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 # (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 # OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 **************************************************************************/

/** Utility functions for Morton codes.
    This is using the usual bit twiddling. See e.g.: https://fgiesen.wordpress.com/2009/12/13/decoding-morton-codes/

    The interleave functions are named based to their output size in bits.
    The deinterleave functions are named based on their input size in bits.
    So, deinterleave_16bit(interleave_16bit(x)) == x should hold true.

    TODO: Make this a host/device shared header, ensure code compiles on the host.
    TODO: Add optimized 8-bit and 2x8-bit interleaving functions.
    TODO: Use NvApi intrinsics to optimize the code on NV.
*/

/** 32-bit bit interleave (Morton code).
    \param[in] v 16-bit values in the LSBs of each component (higher bits don't matter).
    \return 32-bit value.
*/
uint interleave_32bit(uvec2 v)
{
    uint x = v.x & 0x0000ffffu;              // x = ---- ---- ---- ---- fedc ba98 7654 3210
    uint y = v.y & 0x0000ffffu;

    x = (x | (x << 8)) & 0x00FF00FFu;        // x = ---- ---- fedc ba98 ---- ---- 7654 3210
    x = (x | (x << 4)) & 0x0F0F0F0Fu;        // x = ---- fedc ---- ba98 ---- 7654 ---- 3210
    x = (x | (x << 2)) & 0x33333333u;        // x = --fe --dc --ba --98 --76 --54 --32 --10
    x = (x | (x << 1)) & 0x55555555u;        // x = -f-e -d-c -b-a -9-8 -7-6 -5-4 -3-2 -1-0

    y = (y | (y << 8)) & 0x00FF00FFu;
    y = (y | (y << 4)) & 0x0F0F0F0Fu;
    y = (y | (y << 2)) & 0x33333333u;
    y = (y | (y << 1)) & 0x55555555u;

    return x | (y << 1);
}

/** Generates a pair of 32-bit pseudorandom numbers based on a pair of 32-bit values.

    The code uses a 64-bit block cipher, the Tiny Encryption Algorithm (TEA) by Wheeler et al., 1994.
    The 128-bit key is fixed and adapted from here: https://www.ibiblio.org/e-notes/webcl/mc.htm.
    This function can be useful for seeding other pseudorandom number generators.

    \param[in] v0 The first value (low dword of the block).
    \param[in] v1 The second value (high dword of the block).
    \param[in] iterations Number of iterations (the authors recommend 16 at a minimum).
    \return Two pseudorandom numbers (the block cipher of (v0,v1)).
*/
uvec2 blockCipherTEA(uint v0, uint v1)
{
    uint sum = 0u;
    const uint delta = 0x9e3779b9u;
    const uint k[4] = uint[4](0xa341316cu, 0xc8013ea4u, 0xad90777du, 0x7e95761eu); // 128-bit key.
    for (int i = 0; i < 16; i++)
    {
        sum += delta;
        v0 += ((v1 << 4) + k[0]) ^ (v1 + sum) ^ ((v1 >> 5) + k[1]);
        v1 += ((v0 << 4) + k[2]) ^ (v0 + sum) ^ ((v0 >> 5) + k[3]);
    }
    return uvec2(v0, v1);
}

struct NoiseGenerator{
    uint currentNum;
};

float nextFloat(inout NoiseGenerator noiseGenerator) {
    const uint A = 1664525u;
    const uint C = 1013904223u;
    noiseGenerator.currentNum = (A * noiseGenerator.currentNum + C);
    return float(noiseGenerator.currentNum >> 8) / 16777216.0;
}

vec2 nextVec2(inout NoiseGenerator noiseGenerator) {
    vec2 noise;
    noise.x = nextFloat(noiseGenerator);
    noise.y = nextFloat(noiseGenerator);
    return noise;
}

NoiseGenerator initNoiseGenerator(uvec2 texelIndex, uint frameIndex) {
    uint seed = blockCipherTEA(interleave_32bit(texelIndex), frameIndex).x;
    return NoiseGenerator(seed);
}
