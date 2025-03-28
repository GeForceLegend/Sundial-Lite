#extension GL_ARB_shading_language_packing : enable

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
out vec3 vWorldPos;

out uint vMaterial;

// #define MOD_PLANT_DETECTION

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

uniform vec3 cameraPositionFract;

void main() {
    vec3 viewPos = (gl_ModelViewMatrix * gl_Vertex).xyz;
    vWorldPos = viewToWorldPos(viewPos) + cameraPosition;

    gl_Position = gl_ProjectionMatrix * vec4(viewPos, 1.0);
    vColor = gl_Color.rgb * gl_Color.a;
    vTexlmCoord.st = gl_MultiTexCoord0.st;
    vTexlmCoord.pq = gl_MultiTexCoord1.st / 240.0;
    #ifdef IS_IRIS
        vTexlmCoord.pq = clamp(gl_MultiTexCoord1.st / 232.0 - 8.0 / 232.0, 0.0, 1.0);
    #endif

    uint isEmissive = uint(511.5 < mc_Entity.x && mc_Entity.x < 1023.5);
    int materialID = MAT_OPAQUE;

    if (mc_Entity.x < -0.5) {
        // Used for MOD_LIGHT_DETECTION
        materialID = 0;
        #ifdef MOD_PLANT_DETECTION
            if (abs(max(abs(gl_Normal.x), abs(gl_Normal.z)) - 0.5) < 0.45) {
                materialID = MAT_GRASS;
            }
        #endif
    }
    // Early break for common blocks
    else if (mc_Entity.x > 1) {
        #ifdef IS_IRIS
            vec3 blockPos = fract(gl_Vertex.xyz + cameraPositionFract);
        #else
            #if MC_VERSION >= 11700
                vec3 blockPos = fract(vaPosition);
            #else
                vec3 blockPos = fract(gl_Vertex.xyz);
            #endif
        #endif

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
        else if (mc_Entity.x == 514) {
            materialID = MAT_LAVA;
        }
        else if (mc_Entity.x == 630) {
            isEmissive = uint(gl_Normal.y > 0.5 && abs(blockPos.y - 0.9375) < 0.01);
            materialID = MAT_LAVA_CAULDRON;
        }
        else if (abs(mc_Entity.x - 681.5) < 1.0) {
            isEmissive = uint(abs(dot(gl_Normal * vec3(16.0, 16.0 / 7.0, 16.0), blockPos - vec3(0.5, 0.4375, 0.5)) - 1.0) < 0.1);
            materialID = MAT_BREWING_STAND;
        }
        else if (abs(mc_Entity.x - 702.5) < 3.5) {
            materialID = MAT_GLOWING_BERRIES;
        }
    }

    vMaterial = isEmissive;
    vMaterial |= uint(materialID) << 1;

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif
}
