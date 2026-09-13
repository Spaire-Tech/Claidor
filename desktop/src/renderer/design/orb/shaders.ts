/**
 * The orb's shaders, lifted verbatim from the founder's canvas
 * (`docs/product/design/cloud-orb.js`).
 *
 * A circular disc of slow-moving, domain-warped fBm clouds, ramped
 * vertically from near-white at the top to the palette's base hue at the
 * bottom, with soft watercolour edges.
 *
 * Do not reformat or "tidy" these. They are the design, they are known to
 * render correctly, and every constant in them was arrived at by looking
 * at the result. `uCols` takes up to six colours; the app sends five.
 */

export const ORB_VERTEX_SHADER = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const ORB_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec3 uCols[6];
uniform int uCount;
uniform float uSeed;
uniform float uGrain;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453123); }

vec2 hash2(vec2 p){
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))) + uSeed;
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(dot(hash2(i + vec2(0,0)), f - vec2(0,0)),
                 dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
             mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)),
                 dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x), u.y);
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++){ v += a * gnoise(p); p = rot * p * 2.03; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  float t = uTime * 0.085;

  // gentle domain warp so the colour blobs drift and fold rather than slide
  vec2 w = vec2(fbm(uv * 1.4 + vec2(0.0, t)), fbm(uv * 1.4 + vec2(4.7, 1.9) - vec2(t, 0.0)));
  w += 0.14 * vec2(sin(t * 2.3 + uv.y * 2.1), cos(t * 1.9 + uv.x * 2.4));
  vec2 p = uv + w * 0.42;

  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 6; i++){
    if (i >= uCount) break;
    float fi = float(i);
    float ang = fi * 2.3999632 + uSeed * 0.7 + t * (0.6 + 0.18 * mod(fi, 3.0)) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0);
    float rad = 0.42 + 0.3 * sin(t * 1.7 + fi * 1.31);
    vec2 c = vec2(cos(ang), sin(ang)) * rad;
    float d = length(p - c);
    float k = 0.62 + 0.16 * sin(t * 2.1 + fi);
    float wi = exp(-(d * d) / (k * k));
    sum += uCols[i] * wi;
    wsum += wi;
  }
  vec3 col = sum / max(wsum, 0.0001);

  // let the lightest colour pool where the warp field is high — keeps it airy, not muddy
  float lift = smoothstep(-0.2, 0.35, fbm(p * 1.9 + vec2(t * 0.6, -t * 0.4)));
  col = mix(col, col + vec3(1.0) * 0.32, lift * 0.22);

  // soft inner falloff at the rim, watercolour rather than a hard edge
  col = mix(col, col * 0.88, smoothstep(0.55, 1.0, r) * 0.6);

  // film grain
  float g = hash(gl_FragCoord.xy) - 0.5;
  col += g * uGrain;

  float mask = smoothstep(1.0, 0.955, r);
  fragColor = vec4(clamp(col, 0.0, 1.0) * mask, mask);
}`;
