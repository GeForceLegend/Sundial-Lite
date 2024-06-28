// License CC0: Stars and galaxy
// Bit of sunday tinkering lead to stars and a galaxy
// Didn't turn out as I envisioned but it turned out to something
// that I liked so sharing it.
// https://www.shadertoy.com/view/stBcW1

// Controls how many layers of stars
#define LAYERS            2.0

// Original source: License: MIT OR CC-BY-NC-4.0, author: mercury, found: https://mercury.sexy/hg_sdf/
// Replaced by a new version from GeForceLegend.
vec2 mod2(inout vec2 p, vec2 size) {
  vec2 c = floor(p / size + 0.5);
  p = p - c * size;
  return c;
}

// License: Unknown, author: Unknown, found: don't remember
vec2 hash2(vec2 p) {
  p = vec2(dot (p, vec2 (127.1, 311.7)), dot (p, vec2 (269.5, 183.3)));
  return fract(sin(p)*43758.5453123);
}

vec2 toSpherical(vec3 p) {
  float t   = acos(p.z);
  float ph  = atan(p.y, p.x);
  return vec2(t, ph);
}

vec3 endStars(vec3 rd) {
  vec2 sp = toSpherical(rd.xzy);
  vec3 col = vec3(0.0);

  const float m = LAYERS;

  for (float i = 0.0; i < m; ++i) {
    vec2 pp = sp+0.5*i;
    float s = i/(m-END_GALAXY_AMOUNT);
    vec2 dim  = vec2(mix(0.05, 0.003, s)*3.1415926);
    vec2 np = mod2(pp, dim);
    vec2 h = hash2(np+127.0+i);
    vec2 o = -1.0+2.0*h;
    float y = sin(sp.x);
    pp += o*dim*0.5;
    pp.y *= y;
    float l = length(pp);

    float h1 = fract(h.x*1667.0);
    float h2 = fract(h.x*1887.0);
    float h3 = fract(h.x*2997.0);

    float scol = mix(8.0*h2, 0.25*h2*h2, s);

    vec3 ccol = col + exp(-(6000.0/mix(2.0, 0.25, s))*max(l-0.001, 0.0))*scol;
    col = h3 < y ? ccol : col;
  }

  return 5.0 * col * END_GALAXY_BRIGHTNESS;
}
