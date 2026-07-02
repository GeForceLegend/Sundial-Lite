#define WATER_WAVE_SCALE 1.0 // [0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.4 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
#define WATER_WAVE_HEIGHT 1.0 // [0.0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.4 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
#define WATER_WAVE_STEEPNESS 0.5 // [0.0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]
#define WATER_WAVE_LAYERS_SCALE 1.55 // [1.05 1.1 1.15 1.2 1.25 1.3 1.35 1.4 1.45 1.5 1.55 1.6 1.65 1.7 1.75 1.8 1.85 1.9 1.95 2.0 2.1 2.2 2.3 2.4 2.5 2.6 2.7 2.8 2.9 3.0]
#define WATER_WAVE_LAYERS_FADE 0.6 // [0.0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]
#define WATER_WAVE_HEIGHT_LAYERS 3 // [1 2 3 4 5 6 7 8 9 10]
#define WATER_WAVE_NORMAL_LAYERS 6 // [1 2 3 4 5 6 7 8 9 10 12 14 16 18 20]

float gerstnerApproxGeForceLegend(vec2 coord) {
    const float waveSmoothness = 1.0 - 0.7 * WATER_WAVE_STEEPNESS;
    const float curveOffset1 = (1.0 - waveSmoothness) / PI;
    const float curveOffset2 = pow(curveOffset1, 1.0 / waveSmoothness);
    coord.x += textureLod(noisetex, vec2(coord * 0.003), 0.0).x * 6.0;
    float x = fract(coord.x * 0.5 / PI) * 2.0 - 1.0;
    return cos(PI * (pow(abs(x) + curveOffset2, waveSmoothness) - curveOffset1) / (pow(1.0 + curveOffset2, waveSmoothness) - curveOffset1));
}

float waterWaveHeight(vec2 coord, int layers) {
    coord *= 30.0;
    float totalHeight = 0.0;
    float currentWeight = 1.0;
    float totalWeight = 0.0;
    float speed = 1.5 * frameTimeCounter * WATER_WAVE_SPEED;
    for (int i = 0; i < layers; i++) {
        coord = goldenRotate * coord;
        totalHeight += currentWeight * gerstnerApproxGeForceLegend(coord - vec2(speed, 0.0));
        totalWeight += currentWeight;
        currentWeight *= WATER_WAVE_LAYERS_FADE;
        coord *= WATER_WAVE_LAYERS_SCALE;
    }
    return totalHeight / totalWeight * 0.5 + 0.5;
}

vec2 waterWaveNormal(vec2 coord) {
    vec2 totalNormal = vec2(0.0);

    const float offset = 0.02;
	float wavesCenter = waterWaveHeight(coord, WATER_WAVE_NORMAL_LAYERS);
	float wavesLeft = waterWaveHeight(coord + vec2(offset, 0.0), WATER_WAVE_NORMAL_LAYERS);
	float wavesUp   = waterWaveHeight(coord + vec2(0.0, offset), WATER_WAVE_NORMAL_LAYERS);

    totalNormal.r = wavesCenter - wavesLeft;
    totalNormal.g = wavesCenter - wavesUp;

    totalNormal.rg *= 1.0 / offset;
    return totalNormal;
}

vec3 waterWave(vec3 position, vec3 tangentDir) {
    position /= (WATER_WAVE_SCALE);
    vec3 coord = vec3(position.xz + vec2(position.y), 1.0);

    const vec3 stepScale = vec3(vec2(0.2 * WATER_WAVE_HEIGHT / (WATER_WAVE_SCALE * 32.0)), 1.0);
    float tangentDirZ = abs(tangentDir.z * inversesqrt(dot(tangentDir, tangentDir)));
    vec3 stepSize = tangentDir * stepScale;
    stepSize *= 0.2 / abs(stepSize.z);
    tangentDirZ /= 0.2;

    for (int i = 0; i < 5; i++) {
        coord += stepSize;
        float sampleHeight = waterWaveHeight(coord.xy, WATER_WAVE_HEIGHT_LAYERS);
        if (coord.z - sampleHeight < 0.0) {
            break;
        }
    }
    for (int i = 0; i < 5; i++) {
        float sampleHeight = waterWaveHeight(coord.xy, WATER_WAVE_HEIGHT_LAYERS);
        float nextLength = coord.z - sampleHeight;
        float nextScale = nextLength * tangentDirZ;
        coord += stepSize * nextScale;
    }
    vec2 sampleNormal = waterWaveNormal(coord.xy);

    return normalize(vec3(sampleNormal * stepScale.xy, 1.0));
}
