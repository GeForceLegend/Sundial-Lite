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
//  DoF stage 1: CoC spread; TAA stage 1: velocity and blend weight
//

layout(location = 0) out uint texBuffer6;

in vec2 texcoord;

#define DOF_DEPTH_TEXTURE depthtex1 // [depthtex0 depthtex1]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    float centerDepth = textureLod(DOF_DEPTH_TEXTURE, texcoord, 0.0).x;
    float materialID = texelFetch(colortex0, texel, 0).z;
    bool isHand = abs(materialID * 255.0 - MAT_HAND) < 0.4;
    #ifdef CORRECT_DOF_HAND_DEPTH
        float handDepth = centerDepth / MC_HAND_DEPTH - 0.5 / MC_HAND_DEPTH + 0.5;
        if (isHand) {
            centerDepth = handDepth;
        }
    #endif
    texBuffer6 = floatBitsToUint(screenToViewDepth(centerDepth) * (1.0 - 2.0 * float(isHand)));
}

/* DRAWBUFFERS:6 */
