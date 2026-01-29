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
//  Gbuffer for selection outline and leash (basic)
//

layout(location = 0) out vec4 gbufferData0;
layout(location = 1) out vec4 gbufferData1;
layout(location = 2) out vec4 gbufferData2;

flat in vec4 color;
in vec2 lmcoord;

#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

#include "/libs/SelenctionBox.glsl"

/* RENDERTARGETS: 0 */
void main() {
    // 首先进行基本的 alpha 测试
    if (color.a < alphaTestRef) discard;
    
    #if MC_VERSION >= 11605
        if (color.a < 0.1) discard;
    #else
        if (color.a <= 0.004) discard;
    #endif

    // 检测是否为选择框（通过 alpha 通道范围）
    if (color.a > 0.3 && color.a < 0.5) {
        // 根据选择框颜色模式渲染
        vec4 finalColor;
        
        #if selectionBoxColorMode == 0
            // 模式0：自定义RGB颜色
            finalColor = vec4(SELECTION_BOX_COLOR_R, SELECTION_BOX_COLOR_G, SELECTION_BOX_COLOR_B, 1.0);
        #elif selectionBoxColorMode == 1
            // 模式1：透明（不渲染）
            discard;
            return;
        #elif selectionBoxColorMode == 2
            // 模式2：彩色渐变（彩虹色）
            float time = frameTimeCounter * colorSpeed;
            float r = SELECTION_BOX_COLOR_R + SELECTION_BOX_COLOR_R * cos(time);
            float g = SELECTION_BOX_COLOR_G + SELECTION_BOX_COLOR_G * cos(time + 2.094); // 2π/3
            float b = SELECTION_BOX_COLOR_B + SELECTION_BOX_COLOR_B * cos(time + 4.188); // 4π/3
            finalColor = vec4(r, g, b, 1.0);
        #else
            // 模式3：四角彩虹旋转效果
            vec2 uv = gl_FragCoord.xy / screenSize; // 归一化屏幕坐标 [0,1]
            vec2 centered = uv * 2.0 - 1.0; // 转换到 [-1,1]
            
            // 计算到四个角的距离权重
            float wTL = (1.0 - uv.x) * (1.0 - uv.y); // 左上角权重
            float wTR = uv.x * (1.0 - uv.y);         // 右上角权重
            float wBR = uv.x * uv.y;                 // 右下角权重
            float wBL = (1.0 - uv.x) * uv.y;         // 左下角权重
            
            // 四个角的不同相位偏移
            float time = frameTimeCounter * colorSpeed;
            float phaseTL = time;                    // 左上角相位
            float phaseTR = time + 1.5708;           // 右上角相位 + π/2
            float phaseBR = time + 3.1416;           // 右下角相位 + π
            float phaseBL = time + 4.7124;           // 左下角相位 + 3π/2
            
            // 计算每个角的彩虹色，增加对比度
            vec3 colorTL = 0.5 + 0.9 * vec3(
                cos(phaseTL),
                cos(phaseTL + 2.094),
                cos(phaseTL + 4.188)
            );
            
            vec3 colorTR = 0.5 + 0.9 * vec3(
                cos(phaseTR),
                cos(phaseTR + 2.094),
                cos(phaseTR + 4.188)
            );
            
            vec3 colorBR = 0.5 + 0.9 * vec3(
                cos(phaseBR),
                cos(phaseBR + 2.094),
                cos(phaseBR + 4.188)
            );
            
            vec3 colorBL = 0.5 + 0.9 * vec3(
                cos(phaseBL),
                cos(phaseBL + 2.094),
                cos(phaseBL + 4.188)
            );
            
            // 加权混合四个角的颜色
            vec3 rainbow = wTL * colorTL + wTR * colorTR + wBR * colorBR + wBL * colorBL;
            
            // 增加饱和度，使颜色更纯正
            float luminance = dot(rainbow, vec3(0.299, 0.587, 0.114));
            vec3 saturated = mix(vec3(luminance), rainbow, colorMax);
            saturated = clamp(saturated, 0.0, 1.0);
            finalColor = vec4(saturated, 1.0);
        #endif
        
        GbufferData rawData;
        rawData.albedo = vec4(finalColor.rgb, 1.0);
        rawData.normal = vec3(0.0, 0.0, 1.0);
        rawData.geoNormal = vec3(0.0, 0.0, 1.0);
        rawData.lightmap = vec2(1.0, 1.0); // 最大光照
        rawData.smoothness = 0.0;
        rawData.metalness = 0.0;
        rawData.porosity = 0.0;
        rawData.emissive = Emissive_Mode; // 自发光，默认0.5亮度，开启后1.0
        rawData.materialID = 0.0;
        rawData.parallaxOffset = 0.0;
        rawData.depth = 0.0;

        packUpGbufferDataSolid(rawData, gbufferData0, gbufferData1, gbufferData2);
        return;
    }
    
    // 非选择框：正常处理，乘以光照贴图
    vec4 finalColor = color * texture(colortex4, lmcoord);
    
    GbufferData rawData;
    rawData.albedo = vec4(finalColor.rgb, 1.0);
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
