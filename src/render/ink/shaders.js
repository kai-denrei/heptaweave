// shaders.js — GLSL ES 1.0 sources for the ink fluid.
//
// The dye field is an RGBA texture: RGB = accumulated colour, A = density.
// Advection traces every texel back along a curl-noise velocity, so ink
// unspools into filaments; a per-step dissipation is the clock.

export const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Value noise → fbm → 2D curl (perpendicular gradient of a scalar potential).
const NOISE = `
float hash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
                mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
                mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z);
}
float fbm(vec3 p, float octaves) {
  float amp = 0.5;
  float sum = 0.0;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= octaves) break;
    sum += amp * vnoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
vec2 curl(vec2 p, float z, float eps, float octaves) {
  vec3 P = vec3(p, z);
  float dy = fbm(P + vec3(0.0, eps, 0.0), octaves) - fbm(P - vec3(0.0, eps, 0.0), octaves);
  float dx = fbm(P + vec3(eps, 0.0, 0.0), octaves) - fbm(P - vec3(eps, 0.0, 0.0), octaves);
  return vec2(dy, -dx) / (2.0 * eps);
}`;

export const FRAG_ADVECT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_dye;
uniform vec2  u_texel;
uniform float u_time;
uniform float u_dt;
uniform float u_dissip;
uniform float u_flowScale;
uniform float u_flowStr;
uniform float u_aspect;
uniform float u_eps;
uniform float u_octaves;
uniform float u_current;
${NOISE}
void main() {
  vec2 p = vec2(v_uv.x * u_aspect, v_uv.y) * u_flowScale;
  vec2 vel = curl(p, u_time, u_eps, u_octaves) * u_flowStr;
  vec2 back = v_uv - vel * u_dt * u_current * u_texel * vec2(1.0 / u_aspect, 1.0);
  gl_FragColor = texture2D(u_dye, back) * u_dissip;
}`;

export const FRAG_SPLAT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_dye;
uniform vec2  u_point;
uniform float u_aspect;
uniform float u_radius;
uniform vec3  u_color;
uniform float u_amount;
void main() {
  vec4 base = texture2D(u_dye, v_uv);
  vec2 d = (v_uv - u_point) * vec2(u_aspect, 1.0);
  float f = exp(-dot(d, d) / (u_radius * u_radius));
  base.rgb += u_color * f * u_amount;
  base.a   += f * u_amount;
  gl_FragColor = base;
}`;

export const FRAG_PREFILTER = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_dye;
uniform float u_thresh;
void main() {
  vec4 d = texture2D(u_dye, v_uv);
  float dens = clamp(d.a * 1.6, 0.0, 1.0);
  float b = max(0.0, pow(dens, 1.6) - u_thresh);
  vec3 col = d.rgb / (d.a + 0.0004);
  gl_FragColor = vec4(col * b, 1.0);
}`;

export const FRAG_BLUR = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_dir;
uniform vec2 u_texel;
void main() {
  vec2 o = u_dir * u_texel;
  vec3 s = texture2D(u_tex, v_uv).rgb * 0.2270;
  s += texture2D(u_tex, v_uv + o * 1.3846).rgb * 0.3162;
  s += texture2D(u_tex, v_uv - o * 1.3846).rgb * 0.3162;
  s += texture2D(u_tex, v_uv + o * 3.2307).rgb * 0.0702;
  s += texture2D(u_tex, v_uv - o * 3.2307).rgb * 0.0702;
  gl_FragColor = vec4(s, 1.0);
}`;

export const FRAG_DISPLAY = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_dye;
uniform sampler2D u_bloom;
uniform sampler2D u_lut;
uniform vec2  u_texel;
uniform vec2  u_dtexel;
uniform float u_time;
uniform float u_grain;
uniform float u_caustic;
uniform float u_bloomGain;
uniform float u_bloomMix;
uniform float u_vig;
uniform float u_light;

vec3 lut(float x) { return texture2D(u_lut, vec2(clamp(x, 0.002, 0.998), 0.5)).rgb; }
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec4 dye = texture2D(u_dye, v_uv);
  float dens = dye.a;

  // Refraction caustics: the density gradient bends the floor light and
  // concentrates it along the ridges of the dye.
  float dL = texture2D(u_dye, v_uv - vec2(u_dtexel.x, 0.0)).a;
  float dR = texture2D(u_dye, v_uv + vec2(u_dtexel.x, 0.0)).a;
  float dD = texture2D(u_dye, v_uv - vec2(0.0, u_dtexel.y)).a;
  float dU = texture2D(u_dye, v_uv + vec2(0.0, u_dtexel.y)).a;
  vec2 grad = vec2(dR - dL, dU - dD);
  float caustic = pow(clamp(1.0 - length(grad) * u_caustic, 0.0, 1.0), 3.0);
  caustic *= clamp(dens * 2.2, 0.0, 1.0);

  // Palette coordinate: dense, bright ink sits at the core stop; thin,
  // faded ink drifts to the tail.
  float lum  = dot(dye.rgb, vec3(0.3333));
  float core = clamp(lum / (dens + 0.0004), 0.0, 1.0);
  float density = clamp(dens * 1.6, 0.0, 1.0);
  float coord = clamp(0.5 * (1.0 - core) + 0.5 * (1.0 - clamp(dens * 3.5, 0.0, 1.0)), 0.0, 1.0);
  vec3 col = lut(coord);

  float I = pow(density, 0.72);
  vec3 ink = col * I;
  ink += vec3(pow(density, 3.5)) * u_bloomGain;
  ink += col * caustic * 0.9 + vec3(caustic) * 0.25;

  vec3 bloom = texture2D(u_bloom, v_uv).rgb;
  vec3 c = ink + bloom * u_bloomMix;

  // Stage: near-black floor with a faint radial pool of light, scaled by
  // u_light (the ⧖ run dims the room).
  vec2 q = v_uv - 0.5;
  float vg = 1.0 - dot(q, q) * u_vig;
  vec3 floorCol = mix(vec3(0.030, 0.034, 0.048), vec3(0.064, 0.070, 0.096), clamp(vg, 0.0, 1.0)) * u_light;
  c = floorCol + c;
  c *= clamp(vg * 1.25 + 0.15, 0.0, 1.0);

  // Soft filmic shoulder, then grain.
  c = c / (c + vec3(0.85)) * 1.85;
  c += (rnd(v_uv * u_texel * 900.0 + u_time) - 0.5) * u_grain;

  gl_FragColor = vec4(c, 1.0);
}`;
