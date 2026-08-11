#version 330 compatibility

#if defined IS_IRIS && MC_VERSION >= 12109
const float shadowDistanceRenderMul = 1.0;
const bool shadowHardwareFiltering0 = true;
#else
const float shadowDistanceRenderMul = 0.0126;
#endif

#include "/programs/composite/Composite13.frag"
