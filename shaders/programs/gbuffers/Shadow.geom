layout(triangles) in;
layout(triangle_strip, max_vertices = 6) out;

in vec4 vColor[];
in vec3 vWorldPos[];
in vec3 vWorldNormal[];
in vec2 vTexcoord[];
in vec2 vMidTexCoord[];
in vec2 vShadowOffset[];

out vec4 color;
out vec3 worldPos;
out vec3 worldNormal;
out vec2 texcoord;
out vec2 shadowOffset;

void main() {
    #ifdef SHADOW_AND_SKY
        if (vMidTexCoord[0] == vMidTexCoord[1] && vMidTexCoord[1] == vMidTexCoord[2]) {
            vec3 screenPos0 = vec3(gl_in[0].gl_Position.xy, 0.0);
            vec3 screenPos1 = vec3(gl_in[1].gl_Position.xy, 0.0);
            vec3 screenPos2 = vec3(gl_in[2].gl_Position.xy, 0.0);

            gl_Position = gl_in[0].gl_Position;
            color = vColor[0];
            worldPos = vWorldPos[0];
            worldNormal = vWorldNormal[0];
            texcoord = vTexcoord[0];
            shadowOffset = vShadowOffset[0];
            EmitVertex();

            bool front = cross(screenPos1 - screenPos0, screenPos2 - screenPos1).z > 0;

            if (front) {
                gl_Position = gl_in[1].gl_Position;
                color = vColor[1];
                worldPos = vWorldPos[1];
                worldNormal = vWorldNormal[1];
                texcoord = vTexcoord[1];
                shadowOffset = vShadowOffset[1];
                EmitVertex();

                gl_Position = gl_in[2].gl_Position;
                color = vColor[2];
                worldPos = vWorldPos[2];
                worldNormal = vWorldNormal[2];
                texcoord = vTexcoord[2];
                shadowOffset = vShadowOffset[2];
            } else {
                gl_Position = gl_in[2].gl_Position;
                color = vColor[2];
                worldPos = vWorldPos[2];
                worldNormal = vWorldNormal[2];
                texcoord = vTexcoord[2];
                shadowOffset = vShadowOffset[2];
                EmitVertex();

                gl_Position = gl_in[1].gl_Position;
                color = vColor[1];
                worldPos = vWorldPos[1];
                worldNormal = vWorldNormal[1];
                texcoord = vTexcoord[1];
                shadowOffset = vShadowOffset[1];
            }
            EmitVertex();

            EndPrimitive();
        }
    #endif
}
