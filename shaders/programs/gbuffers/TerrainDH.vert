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
//  Gbuffer for Distant Horizons solid terrain
//

#ifndef DISTANT_HORIZONS
    #define DISTANT_HORIZONS

    in int dhMaterialId;
#endif

out vec3 color;
out vec3 viewPos;
flat out vec3 blockData;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Materials.glsl"

void main() {
    viewPos = (gl_ModelViewMatrix * gl_Vertex).xyz;
    gl_Position = dhProjection * vec4(viewPos, 1.0);

    color = gl_Color.rgb;
    blockData.xy = (gl_TextureMatrix[1] * gl_MultiTexCoord1).st * 16.0 / 15.0 - 0.5 / 15.0;

    blockData.z = MAT_OPAQUE;
    if (dhMaterialId == DH_BLOCK_LEAVES) {
        blockData.z = MAT_LEAVES;
    }
    if (dhMaterialId == DH_BLOCK_LAVA) {
        blockData.z = MAT_TORCH;
    }
    if (dhMaterialId == DH_BLOCK_ILLUMINATED) {
        blockData.z = MAT_TORCH;
    }

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif
}
