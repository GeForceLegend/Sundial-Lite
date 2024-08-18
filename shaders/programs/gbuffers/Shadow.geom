layout(triangles) in;
layout(triangle_strip, max_vertices = 6) out;

in vec4 vColor[];
in vec3 vWorldPos[];
in vec3 vWorldNormal[];
in vec2 vTexcoord[];
in vec2 vShadowOffset[];

out vec4 color;
out vec3 worldPos;
out vec3 worldNormal;
out vec2 texcoord;
out vec2 shadowOffset;

#include "/settings/GlobalSettings.glsl"
#include "/libs/Uniform.glsl"

const int shadowMapResolution = 2048; // [1024 2048 4096 8192 16384]
const float realShadowMapResolution = shadowMapResolution * MC_SHADOW_QUALITY;

void main() {
    #ifdef SHADOW_AND_SKY
        vec2 maxCoord = max(vTexcoord[0], max(vTexcoord[1], vTexcoord[2]));
        vec2 minCoord = min(vTexcoord[0], min(vTexcoord[1], vTexcoord[2]));
        vec2 midCoord = (maxCoord + minCoord) * 0.5;

        vec3 screenPos0 = vec3(gl_in[0].gl_Position.xy, 0.0);
        vec3 screenPos1 = vec3(gl_in[1].gl_Position.xy, 0.0);
        vec3 screenPos2 = vec3(gl_in[2].gl_Position.xy, 0.0);

        vec2 shadowOffsetCenter = vShadowOffset[0];
        float isTransparent = float(abs(textureLod(gtexture, midCoord + 1e-6, 0.0).w - 0.5) < 0.499) * float(abs(shadowOffsetCenter.y) == 0.0);
        shadowOffsetCenter.x -= isTransparent * 0.5 * realShadowMapResolution;
        vec4 positionOffset = vec4(-isTransparent, vec3(0.0));

        gl_Position = gl_in[0].gl_Position + positionOffset;
        color = vColor[0];
        worldPos = vWorldPos[0];
        worldNormal = vWorldNormal[0];
        texcoord = vTexcoord[0];
        shadowOffset = shadowOffsetCenter;
        EmitVertex();

        bool front = cross(screenPos1 - screenPos0, screenPos2 - screenPos1).z > 0;

        if (front) {
            gl_Position = gl_in[1].gl_Position + positionOffset;
            color = vColor[1];
            worldPos = vWorldPos[1];
            worldNormal = vWorldNormal[1];
            texcoord = vTexcoord[1];
            shadowOffset = shadowOffsetCenter;
            EmitVertex();

            gl_Position = gl_in[2].gl_Position + positionOffset;
            color = vColor[2];
            worldPos = vWorldPos[2];
            worldNormal = vWorldNormal[2];
            texcoord = vTexcoord[2];
        } else {
            gl_Position = gl_in[2].gl_Position + positionOffset;
            color = vColor[2];
            worldPos = vWorldPos[2];
            worldNormal = vWorldNormal[2];
            texcoord = vTexcoord[2];
            shadowOffset = shadowOffsetCenter;
            EmitVertex();

            gl_Position = gl_in[1].gl_Position + positionOffset;
            color = vColor[1];
            worldPos = vWorldPos[1];
            worldNormal = vWorldNormal[1];
            texcoord = vTexcoord[1];
        }
        shadowOffset = shadowOffsetCenter;
        EmitVertex();

        EndPrimitive();
    #endif
}
