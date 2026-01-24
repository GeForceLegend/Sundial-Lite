#define WATER_WAVE_SCALE 0.2 // [0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]
#define WATER_WAVE_HEIGHT 0.9 // [0.0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0]
    #define OCEAN_DRAG_MULT 0.22 // [0.1 0.2 0.3 0.4]

#define OCEAN_DRAG_MULT 0.22 // 
#define OCEAN_WAVE_ITERATIONS 20 //  [8 10 12 14 16 18 20]

// "Very fast procedural ocean
// https://www.shadertoy.com/view/MdXyzX

vec2 oceanWaveDX(vec2 position, vec2 direction, float frequency, float time) {
    float x = dot(direction, position) * frequency + time;
    float wave = exp(sin(x) - 1.0);
    float dx = wave * cos(x);
    return vec2(wave, -dx);
}

float oceanWaveHeight(vec2 position, float time) {
    float wavePhaseShift = length(position) * 0.12; 
    float iter = 0.0;
    float frequency = 2.0; 
    float timeMultiplier = 1.8;
    float weight = 1.0;
    float sumOfValues = 0.0;
    float sumOfWeights = 0.0;
    
    for (int i = 0; i < OCEAN_WAVE_ITERATIONS; i++) {
        vec2 direction = vec2(sin(iter), cos(iter));
        
        vec2 waveData = oceanWaveDX(
            position,
            direction,
            frequency,
            time * timeMultiplier + wavePhaseShift
        );
        
        position += direction * waveData.y * weight * OCEAN_DRAG_MULT;
        
        sumOfValues += waveData.x * weight;
        sumOfWeights += weight;
        
        weight = mix(weight, 0.0, 0.25); 
        frequency *= 1.35; 
        timeMultiplier *= 1.12; 
        
        iter += 1232.4;
    }
    
    return sumOfValues / sumOfWeights;
}

vec3 waterWave(vec3 position, vec3 tangentDir) {
    position /= (WATER_WAVE_SCALE);
    vec2 coord = position.xz + vec2(position.y * 0.2);

    const vec3 stepScale = vec3(vec2(0.3 * WATER_WAVE_HEIGHT / (WATER_WAVE_SCALE * 25.0)), 1.0);
    float tangentDirZ = abs(tangentDir.z * inversesqrt(dot(tangentDir, tangentDir)));
    vec3 stepSize = tangentDir * stepScale;
    stepSize *= 0.3 / abs(stepSize.z);
    tangentDirZ /= 0.3;

    float time = frameTimeCounter * WATER_WAVE_SPEED * 0.6;
    vec2 sampleCoord = coord;
    float samplePosZ = 1.0;
    vec3 sampleCoordZ = vec3(sampleCoord, samplePosZ);

    vec2 stepSizeXY = stepSize.xy;
    float stepSizeZ = stepSize.z;
    vec3 stepSizeXYZ = vec3(stepSizeXY, stepSizeZ);
    
    for (int i = 0; i < 5; i++) {
        sampleCoordZ += stepSizeXYZ;
        float sampleHeight = oceanWaveHeight(sampleCoordZ.xy, time);
        if (sampleCoordZ.z - sampleHeight < 0.0) {
            break;
        }
    }
    sampleCoordZ -= stepSizeXYZ;
    
    for (int i = 0; i < 5; i++) {
        float sampleHeight = oceanWaveHeight(sampleCoordZ.xy, time);
        float nextLength = sampleCoordZ.z - sampleHeight;
        float nextScale = nextLength * tangentDirZ;
        sampleCoordZ += stepSizeXYZ * nextScale;
    }
    
    const float delta = 0.02;
    float height = oceanWaveHeight(sampleCoordZ.xy, time) * WATER_WAVE_HEIGHT;
    float heightL = oceanWaveHeight(sampleCoordZ.xy - vec2(delta, 0.0), time) * WATER_WAVE_HEIGHT;
    float heightR = oceanWaveHeight(sampleCoordZ.xy + vec2(delta, 0.0), time) * WATER_WAVE_HEIGHT;
    float heightD = oceanWaveHeight(sampleCoordZ.xy - vec2(0.0, delta), time) * WATER_WAVE_HEIGHT;
    float heightU = oceanWaveHeight(sampleCoordZ.xy + vec2(0.0, delta), time) * WATER_WAVE_HEIGHT;
    
    vec2 sampleNormal = vec2(
        (heightL - heightR) / (2.0 * delta),
        (heightD - heightU) / (2.0 * delta)
    );

    return normalize(vec3(sampleNormal * stepScale.xy, 1.0));
}
