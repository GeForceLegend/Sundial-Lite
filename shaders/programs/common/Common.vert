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
//  General Public License v3.0. Copyright (C) 2026 GeForceLegend.
//  https://github.com/GeForceLegend/Sundial-Lite
//  https://www.gnu.org/licenses/gpl-3.0.en.html
//
//  Common vertex shader for composite shader
//

out vec2 texcoord;

#ifdef AVERAGE_EXPOSURE
    out float prevExposure;
#endif

#define DOF_FOCUS_TEXTURE 2 // [0 1 2]

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"

#ifdef SKY_COLOR_UP
    out vec3 skyColorUp;

    #include "/libs/Atmosphere.glsl"
#endif

#ifdef PREV_HAND_ANIMATION
    out vec2 prevHandAnimation;
    out vec2 temporalHandRotation;

    #include "/libs/Common.glsl"
#endif

#ifdef SMOOTH_CENTER_DEPTH
    out float smoothCenterDepth;

    #include "/libs/GbufferData.glsl"
#endif

void main() {
    vec2 offset = vec2(-float(gl_VertexID & 2), float(min(gl_VertexID, 1) << 1)) + vec2(1.0, -1.0);
    #if SR_ENABLE && !defined AFTER_SR
        offset *= renderScale;
    #endif
    texcoord = offset;
    gl_Position = vec4(offset * 2.0 - 1.0, 0.0, 1.0);

    #ifdef AVERAGE_EXPOSURE
        prevExposure = texelFetch(colortex7, ivec2(0), 0).w;
    #endif

    #ifdef SMOOTH_CENTER_DEPTH
        float prevCenterDepth = texelFetch(colortex7, ivec2(screenSize - 0.5), 0).w;
        vec2 screenCenter = vec2(0.5);
        #if SR_ENABLE
            screenCenter *= renderScale;
        #endif
        #if DOF_FOCUS_TEXTURE == 0
            float currCenterDepth = textureLod(depthtex0, screenCenter, 0.0).x;
        #elif DOF_FOCUS_TEXTURE == 1
            float currCenterDepth = textureLod(depthtex1, screenCenter, 0.0).x;
        #else
            float currCenterDepth = textureLod(depthtex2, screenCenter, 0.0).x;
        #endif
        ivec2 centerTexel = ivec2(screenSize * screenCenter);
        float materialData = texelFetch(colortex2, centerTexel, 0).a;
        uint uMaterialData = floatBitsToUint(materialData * 65535.0 / 65536.0 + 65536.5 / 65536.0);
        #if (defined CORRECT_DOF_HAND_DEPTH) && (DOF_FOCUS_TEXTURE != 2)
            uint uMaterialID = (uMaterialData >> 20) & 0x0000007u;
            float handDepth = currCenterDepth / MC_HAND_DEPTH - 0.5 / MC_HAND_DEPTH + 0.5;
            if (uMaterialID == 2u && abs(handDepth - 0.5) < 0.5) {
                currCenterDepth = handDepth;
            }
        #endif
        #ifdef PARALLAX_DOF
            float viewCurrCenterDepth = screenToViewDepth(currCenterDepth);
            uint uParallaxOffset = ((uMaterialData << 3) & 0x007FFC00u) | 0x3F800000u;
            float parallaxOffset = uintBitsToFloat(uParallaxOffset) * 8192.0 / 8191.0 - 8192.0 / 8191.0;
            vec3 geoNormal = getGeoNormalTexel(centerTexel);
            viewCurrCenterDepth += (parallaxOffset * 0.2 * PARALLAX_DEPTH) / max(1e-5, abs(geoNormal.z));
            currCenterDepth = viewToScreenDepth(viewCurrCenterDepth);
        #endif
        float fadeFactor = exp(log(0.5) * frameTime * 10.0 / centerDepthHalflife) * float(prevCenterDepth > 0.0);
        smoothCenterDepth = mix(currCenterDepth, prevCenterDepth, fadeFactor);
    #endif

    #ifdef SKY_COLOR_UP
        vec3 atmosphere;
        skyColorUp = atmosphereScatteringUp(sunDirection.y, 30.0);
    #endif

    #ifdef PREV_HAND_ANIMATION
        float prevHandRotationX = uintBitsToFloat(texelFetch(colortex6, ivec2(0, 0), 0).x);
        float prevHandRotationY = uintBitsToFloat(texelFetch(colortex6, ivec2(1, 0), 0).x);
        float currHeadRotationX = atan(gbufferModelView[0].x, -gbufferModelView[2].x);
        float currHeadRotationY = asin(clamp(gbufferModelView[1].z, -1.0, 1.0));
        float blendFactor = exp2(-20.0 * frameTime);
        float currHandRotationX = mix(currHeadRotationX, prevHandRotationX + float(abs(currHeadRotationX - prevHandRotationX) > PI) * signMul(2.0 * PI, currHeadRotationX), blendFactor);
        float currHandRotationY = mix(currHeadRotationY, prevHandRotationY, blendFactor);
        temporalHandRotation = vec2(currHandRotationX, currHeadRotationY);

        float prevHeadRotationX = atan(gbufferPreviousModelView[0].x, -gbufferPreviousModelView[2].x);
        float prevHeadRotationY = asin(clamp(gbufferPreviousModelView[1].z, -1.0, 1.0));
        prevHandRotationX = prevHeadRotationX - prevHandRotationX - float(abs(prevHeadRotationX - prevHandRotationX) > PI) * signMul(2.0 * PI, prevHeadRotationX);
        prevHandRotationY = prevHeadRotationY - prevHandRotationY;
        currHandRotationX = currHeadRotationX - currHandRotationX;
        currHandRotationY = currHeadRotationY - currHandRotationY;

        float prevHandAnimationX = (prevHandRotationX - currHandRotationX) * 0.1;
        float prevHandAnimationY = (prevHandRotationY - currHandRotationY) * 0.1;
        prevHandAnimation = vec2(prevHandAnimationX, prevHandAnimationY);
    #endif
}
