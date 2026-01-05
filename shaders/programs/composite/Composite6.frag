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
//  DoF stage 1: Prepare depth texture for DOF
//

layout(location = 0) out uint texBuffer6;

in vec2 texcoord;

// #define PARALLAX_DOF
#define DOF_DEPTH_TEXTURE depthtex1 // [depthtex0 depthtex1]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/GbufferData.glsl"

void main() {
    ivec2 texel = ivec2(gl_FragCoord.st);
    float screenDepth = textureLod(DOF_DEPTH_TEXTURE, texcoord, 0.0).x;
    float materialID = texelFetch(colortex0, texel, 0).z;
    bool isHand = abs(materialID * 255.0 - MAT_HAND) < 0.4;
    #ifdef CORRECT_DOF_HAND_DEPTH
        float handDepth = screenDepth / MC_HAND_DEPTH - 0.5 / MC_HAND_DEPTH + 0.5;
        if (isHand && abs(handDepth - 0.5) < 0.5) {
            screenDepth = handDepth;
        }
    #endif
    vec3 viewPos;
    #ifdef LOD
        if (screenDepth == 1.0) {
            viewPos = screenToViewPosLod(texcoord, getLodDepthWater(texcoord));
        } else
    #endif
    {
        viewPos = screenToViewPos(texcoord, screenDepth) * (1.0 - 2.0 * float(isHand));
        #ifdef PARALLAX_DOF
            float parallaxOffset = texelFetch(colortex3, texel, 0).w * 0.2 * PARALLAX_DEPTH;
            vec3 normal = getGeoNormalTexel(texel);
            viewPos += viewPos * parallaxOffset / max(1e-5, -dot(viewPos, normal));
        #endif
    }
    texBuffer6 = floatBitsToUint(-viewPos.z);
}

/* DRAWBUFFERS:6 */
