#if MC_VERSION >= 11700
in vec3 vaPosition;
in vec4 mc_Entity;
#elif MC_VERSION >= 11500
layout(location = 11) in vec4 mc_Entity;
#else
layout(location = 10) in vec4 mc_Entity;
#endif

out vec4 vTexlmCoord;
out vec3 vColor;
out vec3 vViewPos;
out vec3 vWorldPos;
out vec3 vWorldNormal;

out uint vMaterial;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    vViewPos = (gl_ModelViewMatrix * gl_Vertex).xyz;
    vWorldPos = viewToWorldPos(vViewPos) + cameraPosition;

    gl_Position = gl_ProjectionMatrix * vec4(vViewPos, 1.0);
    vColor = gl_Color.rgb * gl_Color.a;
    vTexlmCoord.st = gl_MultiTexCoord0.st;
    vTexlmCoord.pq = gl_MultiTexCoord1.st / 240.0;

    uint isEmissive = uint(511.5 < mc_Entity.x) * uint(mc_Entity.x < 1023.5);
    int materialID = MAT_OPAQUE;

    if (mc_Entity.x < -0.5) {
        // Used for MOD_LIGHT_DETECTION
        materialID = 0;
    }
    // Early break for common blocks
    else if (mc_Entity.x > 1) {
        if (abs(mc_Entity.x - 188.5) < 1.0 || mc_Entity.x == 265) {
            materialID = MAT_GRASS;
        }
        else if (mc_Entity.x == 2) {
            materialID = MAT_LEAVES;
        }
        else if (mc_Entity.x == 119) {
            materialID = MAT_CAULDRON;
        }
        else if (mc_Entity.x == 513 || abs(mc_Entity.x - 669) < 5.5) {
            materialID = MAT_TORCH;
        }
        else if (mc_Entity.x == 630) {
            materialID = MAT_LAVA_CAULDRON;
        }
        else if (abs(mc_Entity.x - 681.5) < 1.0) {
            materialID = MAT_BREWING_STAND;
        }
        else if (abs(mc_Entity.x - 702.5) < 3.5) {
            materialID = MAT_GLOWING_BERRIES;
        }
    }

    #ifdef MOD_MATERIAL_DETECTION
        if (dot(gl_Color.rgb, vec3(1.0)) < 2.999) {
            #if MC_VERSION >= 11700
                if (dot(fract(vaPosition), vec3(1.0)) < 0.001)
            #else
                if (dot(fract(gl_Vertex.xyz), vec3(1.0)) < 0.001)
            #endif
            {
                materialID = MAT_LEAVES;
            }
            else {
                materialID = MAT_GRASS;
            }
        }
    #endif
    vMaterial = isEmissive;
    vMaterial |= uint(materialID) << 1;

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif

    vWorldNormal = gl_Normal;
}
