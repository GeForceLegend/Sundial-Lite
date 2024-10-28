#define WATER_WAVE_SCALE 1.0 // [0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]
#define WATER_WAVE_HEIGHT 0.4 // [0.0 0.05 0.1 0.15 0.2 0.25 0.3 0.35 0.4 0.45 0.5 0.55 0.6 0.65 0.7 0.75 0.8 0.85 0.9 0.95 1.0 1.1 1.2 1.3 1.4 1.5 1.6 1.7 1.8 1.9 2.0 2.2 2.4 2.6 2.8 3.0 3.2 3.4 3.6 3.8 4.0 4.2 4.4 4.6 4.8 5.0 5.5 6.0 6.5 7.0 7.5 8.0 9.5 10.0 11.0 12.0 13.0 14.0 15.0 16.0 17.0 18.0 19.0 20.0]

float sampleWaterHeight(vec2 coord) {
    vec2 whole = floor(coord);
    vec2 part = coord - whole;

    part *= part * (3.0 / 64.0 - 2.0 / 64.0 * part);
    coord = whole / 64.0 + part - 1.0 / 128.0;

    return textureLod(noisetex, coord, 0.0).x;
}

float waterWaveHeight(vec2 coord) {
    float totalHeight = 0.0;

    const mat2 rotation1 = mat2(cos(-0.2), sin(-0.2), -sin(-0.2), cos(-0.2));
    const vec2 scale1 = vec2(0.8, 0.4) * 64.0;
    vec2 speed = vec2(0.03, 0.01) * frameTimeCounter * WATER_WAVE_SPEED;
    totalHeight += smooth2DNoise(rotation1 * (coord + speed) * scale1);

    const mat2 rotation2 = mat2(cos(0.2), sin(0.2), -sin(0.2), cos(0.2));
    const vec2 scale2 = vec2(1.2, 0.6) * 64.0;
    speed = -0.75 * vec2(0.03, -0.01) * frameTimeCounter * WATER_WAVE_SPEED;
    totalHeight += smooth2DNoise(rotation2 * (coord + speed) * scale2) * 0.4;

    const vec2 scale3 = vec2(1.5, 2.0) * 64.0;
    speed = 0.3 * vec2(0.01, -0.05) * frameTimeCounter * WATER_WAVE_SPEED;
    totalHeight += smooth2DNoise((coord + speed) * scale3) * 0.2;

    totalHeight /= 1.0 + 0.4 + 0.2;

    return totalHeight;
}

vec2 sampleWaterNormal(vec2 coord, vec2 scale) {
    coord = coord * 64.0;
    vec2 fpc = floor(coord);
    vec4 sh = textureGather(noisetex, fpc / 64.0 - 1.0 / 128.0, 0);

    fpc = coord - fpc;
    vec2 weight = fpc * fpc * (3.0 - 2.0 * fpc);

    sh.y = sh.w + sh.y - sh.x - sh.z;
    vec2 normal = (sh.yy * weight.yx + (sh.zx - sh.ww)) * fpc * (6.0 * fpc - 6.0) * scale;
    return normal;
}

vec2 waterWaveNormal(vec2 coord) {
    vec2 totalNormal = vec2(0.0);

    const mat2 rotation1 = mat2(cos(-0.2), sin(-0.2), -sin(-0.2), cos(-0.2));
    const vec2 scale1 = vec2(0.8, 0.4);
    vec2 speed = vec2(0.03, 0.01) * frameTimeCounter * WATER_WAVE_SPEED;
    totalNormal += sampleWaterNormal(rotation1 * (coord + speed) * scale1, rotation1 * scale1);

    const mat2 rotation2 = mat2(cos(0.2), sin(0.2), -sin(0.2), cos(0.2));
    const vec2 scale2 = vec2(1.2, 0.6);
    speed = -0.75 * vec2(0.03, -0.01) * frameTimeCounter * WATER_WAVE_SPEED;
    totalNormal += sampleWaterNormal(rotation2 * (coord + speed) * scale2, rotation2 * scale2) * 0.4;

    const vec2 scale3 = vec2(1.5, 2.0);
    speed = 0.3 * vec2(0.01, -0.05) * frameTimeCounter * WATER_WAVE_SPEED;
    totalNormal += sampleWaterNormal((coord + speed) * scale3, scale3) * 0.2;

    totalNormal /= 1.0 + 0.4 + 0.2;

    return totalNormal.xy;
}

vec3 waterWave(vec3 position, vec3 tangentDir) {
    position /= (WATER_WAVE_SCALE);
    vec2 coord = position.xz + vec2(position.y);

    const vec3 stepScale = vec3(vec2(0.2 * WATER_WAVE_HEIGHT / (WATER_WAVE_SCALE * 32.0)), 1.0);
    vec3 stepSize = tangentDir * stepScale;
    stepSize *= 0.02 / abs(stepSize.z);

    vec3 samplePos = vec3(coord, 0.6);
    float originHeight = waterWaveHeight(samplePos.xy);
    float sampleDir = samplePos.z - originHeight;
    for (int i = 1; i < 30; i++) {
        samplePos += signMul(stepSize, vec3(sampleDir));
        float sampleHeight = waterWaveHeight(samplePos.xy);
        float prevSampleDir = sampleDir;
        sampleDir = samplePos.z - sampleHeight;
        if (sampleDir * prevSampleDir < 0.0) {
            break;
        }
    }
    vec2 sampleNormal = waterWaveNormal(samplePos.xy);

    return normalize(vec3(sampleNormal * 64.0, 1.0) * stepScale);
}
