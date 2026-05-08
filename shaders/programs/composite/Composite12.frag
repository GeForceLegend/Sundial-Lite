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
//  Bloom stage 3: blur in y axis; Chromatic dispersion
//

layout(location = 0) out vec4 texBuffer4;

in vec2 texcoord;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"

vec3 sampleBloomY(vec2 coord) {
    vec2 offset = uintBitsToFloat(floatBitsToUint(1.0 - coord) & 0x7F800000u);
    if (offset.x != offset.y) {
        discard;
    }
    ivec2 texel = ivec2(coord * screenSize);
    int maxTexelY = int(floor(screenSize.y * (1.0 - offset.y)));
    int minTexelY = int(ceil(screenSize.y * (1.0 - 2.0 * offset.y)));

    const float weights[5] = float[5](0.27343750, 0.21875000, 0.10937500, 0.03125000, 0.00390625);
    vec3 totalColor = texelFetch(colortex4, texel, 0).rgb * weights[0];
    ivec2 sampleTexel0 = texel;
    ivec2 sampleTexel1 = texel;

    for (int i = 1; i < 5; i++) {
        sampleTexel0.y = min(maxTexelY, sampleTexel0.y + 1);
        sampleTexel1.y = max(minTexelY, sampleTexel1.y - 1);
        totalColor += (texelFetch(colortex4, sampleTexel0, 0).rgb + texelFetch(colortex4, sampleTexel1, 0).rgb) * weights[i];
    }
    return totalColor;
}

void main() {
    vec3 bloomColor = sampleBloomY(texcoord);
    texBuffer4 = vec4(pow(bloomColor, vec3(1.0 / 2.2)), 1.0);
}

/* DRAWBUFFERS:4 */
