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
//  Common vertex shader for composite shader
//

out vec2 texcoord;

#ifdef AVERAGE_EXPOSURE
    out float prevExposure;
#endif

#ifdef SMOOTH_CENTER_DEPTH
    out float smoothCenterDepth;
#endif

#define DOF_FOCUS_TEXTURE depthtex2 // [depthtex0 depthtex1 depthtex2]

#ifdef SKY_COLOR_UP
    out vec3 skyColorUp;

    #include "/settings/GlobalSettings.glsl"
    #include "/libs/Uniform.glsl"
    #include "/libs/Atmosphere.glsl"
#else
    #include "/settings/GlobalSettings.glsl"
    #include "/libs/Uniform.glsl"
#endif

void main() {
    ivec2 offset = ivec2((min(gl_VertexID, 2) & 1) << 1, gl_VertexID & 2);
    texcoord = offset;
    gl_Position = vec4(offset * 2.0 - 1.0, 0.0, 1.0);

    #ifdef AVERAGE_EXPOSURE
        prevExposure = texelFetch(colortex7, ivec2(0), 0).w;
    #endif

    #ifdef SMOOTH_CENTER_DEPTH
        float prevCenterDepth = texelFetch(colortex7, ivec2(screenSize - 0.5), 0).w;
        float currCenterDepth = textureLod(DOF_FOCUS_TEXTURE, vec2(0.5), 0.0).x;
        float fadeFactor = exp(log(0.5) * frameTime * 10.0 / centerDepthHalflife) * float(prevCenterDepth > 0.0);
        smoothCenterDepth = mix(currCenterDepth, prevCenterDepth, fadeFactor);
    #endif

    #ifdef SKY_COLOR_UP
        vec3 atmosphere;
        skyColorUp = atmosphereScatteringUp(sunDirection.y, 30.0);
    #endif
}
