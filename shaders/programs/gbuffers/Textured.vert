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
//  Gbuffer for particles, entities and block entities
//

#if MC_VERSION >= 11700
in vec4 mc_midTexCoord;
#elif MC_VERSION >= 11500
layout(location = 12) in vec4 mc_midTexCoord;
#else
layout(location = 11) in vec4 mc_midTexCoord;
#endif

#if MC_VERSION < 11300
    layout(location = 12) in vec4 at_tangent;

    out vec3 viewNormal;
    out mat3 tbnMatrix;
#endif

// #define GLOWING_OVERLAY

out vec4 color;
out vec4 viewPos;
out vec4 texlmcoord;
out vec3 mcPos;

flat out vec4 coordRange;

#ifdef ENTITIES
    uniform vec4 entityColor;
#endif

uniform sampler2D gaux1;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"
#include "/libs/Materials.glsl"
#include "/libs/Common.glsl"

void main() {
    viewPos = gl_ModelViewMatrix * gl_Vertex;
    #ifdef HAND
        viewPos.xyz *= 0.8;
    #endif
    mcPos = (gbufferModelViewInverse * viewPos).xyz + cameraPosition;

    gl_Position = gl_ProjectionMatrix * viewPos;
    color = gl_Color;
    texlmcoord.st = vec2(gl_TextureMatrix[0] * gl_MultiTexCoord0);
    texlmcoord.pq = gl_MultiTexCoord1.st / 240.0;

    vec2 albedoTexSize = vec2(textureSize(gtexture, 0));
    bool clampCoord = textureSize(gaux1, 0) == albedoTexSize;
    #ifdef MC_ANISOTROPIC_FILTERING
        clampCoord = (spriteBounds.zw - spriteBounds.xy) * textureSize(gaux1, 0) == albedoTexSize;
    #endif
    vec2 minCoord = vec2(0.0);
    vec2 coordSize = vec2(1.0);
    #ifndef COLORWHEEL
    if (clampCoord) {
        vec2 vertexCoord = gl_MultiTexCoord0.st;
        if (min(abs(mc_midTexCoord.s - gl_MultiTexCoord0.s), abs(mc_midTexCoord.t - gl_MultiTexCoord0.t)) < 1e-6) {
            vertexCoord = gl_MultiTexCoord0.st + (mc_midTexCoord.st - gl_MultiTexCoord0.st).ts;
        }
        vec2 coordToCenter = abs(vertexCoord - mc_midTexCoord.st);
        vec2 albedoTexSize = textureSize(gtexture, 0);
        vec2 albedoTexelSize = 1.0 / albedoTexSize;
        minCoord = round((mc_midTexCoord.st - coordToCenter) * albedoTexSize) * albedoTexelSize;
        coordSize = round(coordToCenter * 2.0 * albedoTexSize) * albedoTexelSize;
    }
    #endif
    coordRange = vec4(minCoord, coordSize);

    #ifdef ENTITIES
        color.rgb = mix(color.rgb, entityColor.rgb, vec3(entityColor.a));
    #endif

    #ifdef GLOWING
        #ifdef GLOWING_OVERLAY
            gl_Position.z = (gl_Position.z * 0.5 + 0.5) * 0.02 - 0.01;
        #endif
    #endif

    #ifdef OVERLAY
        gl_Position.z -= 1e-5;
    #endif

    #ifdef TAA
        gl_Position.xy += taaOffset * gl_Position.w;
    #endif

    #if MC_VERSION < 11300
        viewNormal = normalize(gl_NormalMatrix * gl_Normal);
        vec3 tangent = normalize(gl_NormalMatrix * at_tangent.xyz);
        vec3 bitangent = normalize(cross(tangent, viewNormal) * at_tangent.w);
        tbnMatrix = mat3(tangent, bitangent, viewNormal);
    #endif
}
