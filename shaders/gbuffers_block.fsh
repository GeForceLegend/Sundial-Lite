#version 330 compatibility

#if MC_VERSION >= 11600 && MC_VERSION < 11700
    #define BEACON
#endif
#define END_PORTAL
#define USE_RAIN_PUDDLE

#include "/programs/gbuffers/Textured.frag"
