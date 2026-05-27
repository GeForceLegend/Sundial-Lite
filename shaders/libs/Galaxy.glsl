// Hash from https://www.shadertoy.com/view/43jSRR
// The MIT License
// Copyright © 2024 Giorgi Azmaipharashvili
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// For copy/paste
vec2 hash2(vec2 p) {
    uvec2 u = floatBitsToUint(p * vec2(141421356, 2718281828));
    return vec2((u ^ u.yx) * uvec2(1618033988, 2718281828)) / float(~0u);
}

// Octahedron random star by GeForceLegend
float endStars(vec3 direction) {
    vec2 samplePos = encodeNormal(direction) * 0.5 + 0.5;
    float starColor = 0.0;
    float sampleSize = floor(1300.0 * END_GALAXY_AMOUNT);
    vec2 startTexel = floor(samplePos * sampleSize - 0.5) + 0.5;

    for (int i = 0; i < 2; i++) {
        for (int j = 0; j < 2; j++) {
            vec2 sampleTexel = startTexel + vec2(i, j);
            bvec2 repeat = lessThan(floatBitsToUint(sampleTexel), floatBitsToUint(vec2(sampleSize)));
            if (repeat.x != repeat.y) {
                sampleTexel = -sampleTexel;
            }
            sampleTexel = mod(sampleTexel, sampleSize);
            vec2 noise = hash2(sampleTexel / sampleSize).xy;

            vec3 sampleDirection = decodeNormal(sampleTexel / sampleSize * 2.0 - 1.0);
            float angle = dot(sampleDirection, direction);

            float starBrightness = clamp(mix(-1000000.0 * (0.3 + 0.7 * noise.y), 1.0,  angle), 0.0, 1.0);
            starColor += starBrightness * float(noise.x < 0.01 * pow2(abs(sampleDirection.x) + abs(sampleDirection.y) + abs(sampleDirection.z)));
        }
    }

    return starColor * END_GALAXY_BRIGHTNESS;
}
