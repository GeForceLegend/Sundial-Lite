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
//  Final sharpening
//

layout(location = 0) out vec4 fragColor;

in vec2 texcoord;

#define FINAL_SHARPENING
// #define SHARPENING_DENOISE
#define SHARPENING_SRENGTH 0.5 // [0.0, 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]
#define SHARPENING_LIMIT 0.18 // [0.0 0.02 0.04 0.06 0.08 0.1 0.12 0.14 0.16 0.18 0.2 0.22 0.24 0.26 0.28 0.3 0.32 0.34 0.36 0.38 0.4]

#include "/libs/Uniform.glsl"

// Copyright (C) 2025 Advanced Micro Devices, Inc.
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files(the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and /or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions :
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

float luma2(vec3 color) {
    return dot(color, vec3(0.5, 1.0, 0.5));
}

float min3(float a, float b, float c) {
    return min(min(a, b), c);
}

float max3(float a, float b, float c) {
    return max(max(a, b), c);
}

vec3 FidelityFX_RCAS(sampler2D colortex, vec2 coord, vec2 pixelSize) {
    // Algorithm uses minimal 3x3 pixel neighborhood.
    //    b
    //  d e f
    //    h
    // Input and output might not be same size in Optifine, so we should use textureLod()
	vec3 colorB = textureLod(colortex, coord + vec2( 0.0, -1.0) * pixelSize, 0.0).rgb;
	vec3 colorD = textureLod(colortex, coord + vec2(-1.0,  0.0) * pixelSize, 0.0).rgb;
	vec3 colorE = textureLod(colortex, coord                               , 0.0).rgb;
	vec3 colorF = textureLod(colortex, coord + vec2( 1.0,  0.0) * pixelSize, 0.0).rgb;
	vec3 colorH = textureLod(colortex, coord + vec2( 0.0,  1.0) * pixelSize, 0.0).rgb;
    // Luma times 2.
    float lumaB = luma2(colorB);
    float lumaD = luma2(colorD);
    float lumaE = luma2(colorE);
    float lumaF = luma2(colorF);
    float lumaH = luma2(colorH);
    // Noise detection.
    float nz = 0.25 * lumaB + 0.25 * lumaD + 0.25 * lumaF + 0.25 * lumaH - lumaE;
    float minLuma = min(min3(lumaB, lumaD, lumaF), lumaH);
    nz = clamp(abs(nz) / (max3(max3(lumaB, lumaD, lumaE), lumaF, lumaH) - min(minLuma, lumaE)), 0.0, 1.0);
    nz = float(-0.5) * nz + float(1.0);
    // Min and max of ring.
    float min4R = min(min3(colorB.r, colorD.r, colorF.r), colorH.r);
    float min4G = min(min3(colorB.g, colorD.g, colorF.g), colorH.g);
    float min4B = min(min3(colorB.b, colorD.b, colorF.b), colorH.b);
    float max4R = max(max3(colorB.r, colorD.r, colorF.r), colorH.r);
    float max4G = max(max3(colorB.g, colorD.g, colorF.g), colorH.g);
    float max4B = max(max3(colorB.b, colorD.b, colorF.b), colorH.b);
    // Immediate constants for peak range.
    vec2 peakC = vec2(1.0, -1.0 * 4.0);
    // Limiters, these need to be high precision RCPs.
    float lowerLimiterMultiplier = clamp(lumaE / minLuma, 0.0, 1.0);
    float hitMinR = min4R / (float(4.0) * max4R) * lowerLimiterMultiplier;
    float hitMinG = min4G / (float(4.0) * max4G) * lowerLimiterMultiplier;
    float hitMinB = min4B / (float(4.0) * max4B) * lowerLimiterMultiplier;
    float hitMaxR = (peakC.x - max4R) / (float(4.0) * min4R + peakC.y);
    float hitMaxG = (peakC.x - max4G) / (float(4.0) * min4G + peakC.y);
    float hitMaxB = (peakC.x - max4B) / (float(4.0) * min4B + peakC.y);
    float lobeR   = max(-hitMinR, hitMaxR);
    float lobeG   = max(-hitMinG, hitMaxG);
    float lobeB   = max(-hitMinB, hitMaxB);
    float lobe    = max(-SHARPENING_LIMIT, min(max3(lobeR, lobeG, lobeB), 0.0)) * SHARPENING_SRENGTH;
    // Apply noise removal.
    #ifdef SHARPENING_DENOISE
        lobe *= nz;
    #endif
    return (lobe * (colorB + colorD + colorF + colorH) + colorE) / (4.0 * lobe + 1.0);
}

#define ScreenOverlay 0 //[0 1]

// 在屏幕中央绘制文字纹理
vec4 drawTextFromTexture(vec2 uv, vec2 screenSize, int frameCounter) {
    // 只在加载的前几帧显示 (前180帧，约3秒)
    if (frameCounter > 180) return vec4(0.0);
    
    // 计算文字位置（屏幕偏左）- 固定大小，不随屏幕比例拉伸
    vec2 textSize = vec2(0.5, 0.23); // 固定大小：宽度40%，高度13%
    vec2 startPos = vec2(0.5, 0.5) - textSize * 0.5; // 往左移动（X从0.5改为0.35）
    
    // 检查当前像素是否在文字区域内
    vec2 p = (uv - startPos) / textSize;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) {
        return vec4(0.0);
    }
    
    // 从colortex9采样文字（在shaders.properties中定义为texture.composite.colortex9）
    // 使用textureLod避免mipmap问题，并翻转Y轴修正上下颠倒
    vec4 textColor = textureLod(colortex9, vec2(p.x, 1.0 - p.y), 0.0);
    
    // 修复透明度：确保文字在180帧后完全消失
    float fade = 1.0 - smoothstep(0.0, 180.0, float(frameCounter));
    
    // 确保alpha不会累积残留，透明部分不显示
    return vec4(textColor.rgb, textColor.a * fade);
}

void main() {
    vec3 color = textureLod(colortex0, texcoord, 0.0).rgb;
    #ifdef FINAL_SHARPENING
        vec2 pixelSize = 1.0 / vec2(textureSize(colortex0, 0));
        color = FidelityFX_RCAS(colortex0, texcoord, pixelSize);
    #endif
    
    #if ScreenOverlay == 1
    // 电影挡条 - 上下黑边效果
    // 可以调整 LETTERBOX_RATIO 来改变黑边高度 (0.1 = 10%)
    #define LETTERBOX_RATIO 0.2 // [0.05 0.1 0.15 0.2]
    float letterboxSize = LETTERBOX_RATIO * 0.5;
    if (texcoord.y < letterboxSize || texcoord.y > 1.0 - letterboxSize) {
        color = vec3(0.0, 0.0, 0.0);
    }
    #endif
    
    // 绘制Violet文字纹理
    vec4 textOverlay = drawTextFromTexture(texcoord, screenSize, frameCounter);
    color = mix(color, textOverlay.rgb, textOverlay.a);
    
    fragColor = vec4(color, 1.0);
}