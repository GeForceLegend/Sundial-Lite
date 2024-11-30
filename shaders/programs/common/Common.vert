out vec2 texcoord;

#ifdef SHADOW_MATRIX
    out mat4 shadowModelViewProjection;
#endif

#ifdef AVERAGE_EXPOSURE
    out float prevExposure;
#endif

#ifdef SMOOTH_CENTER_DEPTH
    out float smoothCenterDepth;
#endif

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
    gl_Position = ftransform();
    texcoord = gl_MultiTexCoord0.st;

    #ifdef SHADOW_MATRIX
        shadowModelViewProjection = shadowProjection * shadowModelView;
    #endif

    #ifdef AVERAGE_EXPOSURE
        prevExposure = texelFetch(colortex7, ivec2(0), 0).w;
    #endif

    #ifdef SMOOTH_CENTER_DEPTH
        float prevCenterDepth = texelFetch(colortex7, ivec2(screenSize - 0.5), 0).w;
        float currCenterDepth = textureLod(DOF_DEPTH_TEXTURE, vec2(0.5), 0.0).x;
        float fadeFactor = exp(log(0.5) * frameTime * 10.0 / centerDepthHalflife) * float(prevCenterDepth > 0.0);
        smoothCenterDepth = mix(currCenterDepth, prevCenterDepth, fadeFactor);
    #endif

    #ifdef SKY_COLOR_UP
        vec3 atmosphere;
        skyColorUp = atmosphereScatteringUp(sunDirection.y, 30.0);
    #endif
}
