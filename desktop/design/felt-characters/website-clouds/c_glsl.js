// ------------------------------------------------------------------ GLSL
const GLSL_NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+10.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056,0.00583715)))); }
`;
const GLSL_LIGHT = /* glsl */`
uniform vec3 uCamPos;
uniform vec3 uKeyDir; uniform vec3 uKeyCol;
uniform vec3 uFillDir; uniform vec3 uFillCol;
uniform vec3 uRimDir; uniform vec3 uRimCol;
uniform vec3 uSkyCol; uniform vec3 uGroundCol;
uniform sampler2DShadow uShadowMap; uniform mat4 uShadowMat; uniform float uShadowBias;
const vec2 PD[12] = vec2[12](vec2(-0.326,-0.406),vec2(-0.840,-0.074),vec2(-0.696,0.457),vec2(-0.203,0.621),vec2(0.962,-0.195),vec2(0.473,-0.480),vec2(0.519,0.767),vec2(0.185,-0.893),vec2(0.507,0.064),vec2(0.896,0.412),vec2(-0.322,-0.933),vec2(-0.792,-0.598));
// hardware-filtered (bilinear compare) PCF over a fixed Poisson disc: smooth, no per-pixel dither noise
float shadowAt(vec3 wp, float soft, float rot, int taps){
  vec4 sc = uShadowMat*vec4(wp,1.); vec3 s = sc.xyz/sc.w*.5+.5;
  if(s.x<0.||s.x>1.||s.y<0.||s.y>1.||s.z>1.) return 1.;
  float c=cos(rot), sn=sin(rot); float acc=0.; float n=0.;
  for(int i=0;i<12;i++){ if(i>=taps) break; vec2 o=PD[i]; o=vec2(c*o.x-sn*o.y, sn*o.x+c*o.y)*soft;
    acc += texture(uShadowMap, vec3(s.xy+o, s.z-uShadowBias)); n+=1.; }
  return acc/n;
}
vec3 hemi(vec3 N){ return mix(uGroundCol, uSkyCol, clamp(N.y*.5+.5,0.,1.)); }
float charlieD(float rough, float NoH){ float inv=1./rough; float s2=max(1.-NoH*NoH, 1e-4); return (2.+inv)*pow(s2, inv*.5)/6.2831853; }
`;

// the app's character fill: a 3-stop linear gradient, top -> mid (55%) -> bottom, x drifting 0 -> 0.15 across the height.
// Evaluated in the body's rest space (uGradM = inverse body bone) so hops, squash and blinking lids never slide it.
const GLSL_GRAD = /* glsl */`
uniform vec3 uGradTop; uniform vec3 uGradMid; uniform vec3 uGradBot; uniform mat4 uGradM; uniform vec3 uGradBox; uniform float uGradOn;
vec3 gradCol(vec3 wp){
  vec3 q = (uGradM*vec4(wp,1.)).xyz;
  float u = clamp((q.x - uGradBox.x)/uGradBox.y, 0., 1.);
  float v = clamp((uGradBox.z - q.y)/uGradBox.z, 0., 1.);
  float t = clamp((0.15*u + v)/1.0225, 0., 1.);
  vec3 c = t < 0.55 ? mix(uGradTop, uGradMid, t/0.55) : mix(uGradMid, uGradBot, (t-0.55)/0.45);
  return pow(c, vec3(2.2));
}
`;

// The app's morph (ported to 3D): the body's surface slides radially onto a ball (or the app's teardrop,
// point down, for the pencil) of radius uMorphR around the body centre; the bone then scales it down to a dot.
const GLSL_MORPH = /* glsl */`
uniform float uMorph; uniform vec3 uMorphC; uniform float uMorphR; uniform float uTear;
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba = b - a; float l2 = dot(ba,ba); float rr = r1 - r2; float a2 = l2 - rr*rr; float il2 = 1./l2;
  vec3 pa = p - a; float y = dot(pa,ba); float z = y - l2; vec3 xv = pa*l2 - ba*y; float x2 = dot(xv,xv); float y2 = y*y*l2; float z2 = z*z*l2;
  float k = sign(rr)*rr*rr*x2;
  if (sign(z)*a2*z2 > k) return sqrt(x2 + z2)*il2 - r2;
  if (sign(y)*a2*y2 < k) return sqrt(x2 + y2)*il2 - r1;
  return (sqrt(x2*a2*il2) + y*rr)*il2 - r1;
}
float sdTear(vec3 q){ return sdRoundCone(q, uMorphC + vec3(0., .228*uMorphR, 0.), uMorphC - vec3(0., .86*uMorphR, 0.), .77*uMorphR, .14*uMorphR); }
void morphPN(inout vec3 p, inout vec3 n){
  vec3 d = p - uMorphC; float l = length(d); d = l > 1e-5 ? d/l : vec3(0.,0.,1.);
  vec3 q = uMorphC + d*uMorphR; vec3 nq = d;
  if (uTear > 0.) {
    float lo = 0., hi = 1.7*uMorphR;
    for (int i = 0; i < 14; i++) { float m = .5*(lo+hi); if (sdTear(uMorphC + d*m) < 0.) lo = m; else hi = m; }
    vec3 qt = uMorphC + d*(.5*(lo+hi)); float e = .004;
    vec3 nt = normalize(vec3(sdTear(qt+vec3(e,0,0))-sdTear(qt-vec3(e,0,0)), sdTear(qt+vec3(0,e,0))-sdTear(qt-vec3(0,e,0)), sdTear(qt+vec3(0,0,e))-sdTear(qt-vec3(0,0,e))));
    q = mix(q, qt, uTear); nq = normalize(mix(nq, nt, uTear));
  }
  p = mix(p, q, uMorph); n = normalize(mix(n, nq, uMorph));
}
`;

// --- velvet/felt underlayer
const FELT_VS = /* glsl */`
attribute vec4 aReg; attribute float aAO;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vReg; varying float vAO;
void main(){
  vec4 w = modelMatrix*vec4(position,1.);
  vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vO = position; vReg = aReg; vAO = aAO;
  gl_Position = projectionMatrix*viewMatrix*w;
}`;
const FELT_FS = /* glsl */`
${GLSL_NOISE}
${GLSL_LIGHT}
${GLSL_GRAD}
uniform vec3 uPal[4];
uniform float uFeltFreq; uniform float uBump; uniform float uSheen; uniform float uWrap; uniform float uAOAmt;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vReg; varying float vAO;
vec3 feltLight(vec3 N, vec3 V, vec3 L, vec3 Lc, vec3 alb, vec3 sheenCol){
  float NoL = dot(N,L);
  float diff = max(0., (NoL + uWrap)/(1.+uWrap));
  // wool scatters: the terminator goes saturated instead of grey
  float term = smoothstep(-uWrap, 0.1, NoL) * (1.-smoothstep(0.1, 0.7, NoL));
  vec3 satAlb = alb * mix(vec3(1.), alb/max(max(alb.r,max(alb.g,alb.b)),1e-3), 0.55*term);
  vec3 H = normalize(L+V); float NoV = max(dot(N,V),1e-3); float nl = max(NoL,0.);
  float D = charlieD(0.55, max(dot(N,H),0.)); float Vis = 1./(4.*(nl+NoV-nl*NoV)+1e-3);
  vec3 sheen = sheenCol * D * Vis * nl * uSheen;
  return (satAlb*diff + sheen) * Lc;
}
void main(){
  vec4 rw = vReg / max(1e-3, vReg.x+vReg.y+vReg.z+vReg.w);
  vec3 base = (uGradOn > 0.5 ? gradCol(vW) : uPal[0])*rw.x + uPal[1]*rw.y + uPal[2]*rw.z + uPal[3]*rw.w;
  vec3 q = vO * uFeltFreq;
  float n1 = snoise(q), n2 = snoise(q*2.13+vec3(7.1,3.3,1.7)), n3 = snoise(q*0.31+11.);
  float fib = pow(1.-abs(n1), 4.)*0.6 + pow(1.-abs(n2), 4.)*0.4;   // squiggly tangled fibres
  float fw = length(fwidth(q));
  float detail = 1. - smoothstep(0.35, 1.2, fw);                  // fade before it aliases
  float h = (n1*0.22 + n3*0.35) * detail;   // smooth only: sharp ridges through dFdx give 2x2-block grain
  vec3 N0 = normalize(vN);
  vec3 dpx = dFdx(vW), dpy = dFdy(vW); float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, N0), r2 = cross(N0, dpx); float det = dot(dpx, r1);
  vec3 grad = sign(det)*(dhx*r1 + dhy*r2);
  vec3 N = normalize(abs(det)*N0 - uBump*grad);
  if (!gl_FrontFacing) N = -N;
  vec3 alb = base * mix(1., mix(0.9, 1.05, fib) * (1.+n3*0.05), detail);
  vec3 V = normalize(uCamPos - vW);
  float sh = shadowAt(vW + N0*0.012, 0.0065, 0.7, 8);
  float ao = mix(1., vAO, uAOAmt);
  vec3 sheenCol = mix(alb, vec3(1.), 0.35);
  vec3 col = feltLight(N, V, uKeyDir, uKeyCol*sh, alb, sheenCol)*mix(0.6,1.,ao)
           + feltLight(N, V, uFillDir, uFillCol, alb, sheenCol)*ao
           + feltLight(N, V, uRimDir, uRimCol, alb, sheenCol)*ao;
  // back-lit fuzz: fibres on the silhouette scatter the rim light
  float NoV = max(dot(N0,V),0.);
  float rimScatter = pow(1.-NoV, 3.) * max(0., dot(uRimDir, -V)*.5+.5);
  col += alb * uRimCol * rimScatter * 0.9 * ao;
  col += alb * hemi(N) * ao * (0.85 + 0.15*fib);
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// --- knit (stockinette + 1x1 rib), procedural, derivative-filtered
const KNIT_VS = /* glsl */`
attribute vec4 aKnit; attribute float aAO;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vKnit; varying float vAO;
void main(){
  vec4 w = modelMatrix*vec4(position,1.);
  vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vO = position; vKnit = aKnit; vAO = aAO;
  gl_Position = projectionMatrix*viewMatrix*w;
}`;
const KNIT_FS = /* glsl */`
${GLSL_NOISE}
${GLSL_LIGHT}
uniform vec3 uYarn; uniform vec3 uYarnLight;
uniform vec3 uArmA[2]; uniform vec3 uArmDir[2];
uniform vec2 uStitch;       // stitch width, row height (object units)
uniform float uBump;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vKnit; varying float vAO;
// one yarn leg: rounded tube with an elliptical footprint.
// returns (height, ply coordinate, d height/d uv) - the gradient is analytic so the bump has no 2x2-quad grain
vec4 leg(vec2 p, vec2 c, vec2 ax, float hl, float hw){
  vec2 d = p - c; vec2 px = vec2(-ax.y, ax.x); float a = dot(d, ax); float b = dot(d, px);
  float e = (a*a)/(hl*hl) + (b*b)/(hw*hw);
  float m = max(0., 1.-e);
  float h = pow(m, 0.62);                                  // rounder shoulder, soft contact with the next leg
  vec2 de = 2.*a/(hl*hl)*ax + 2.*b/(hw*hw)*px;
  vec2 g = m > 1e-3 ? -0.62*pow(m, -0.38)*de : vec2(0.);
  g = g/(1.+length(g)*0.08);
  return vec4(h, a*9. + b*16., g);
}
struct K { float h; float ply; vec2 g; float id; };
// stockinette: columns of V's, uv in stitch units (x across, y up); hand-knit jitter per stitch
K stock(vec2 uv){
  vec2 cell = floor(uv); vec2 f = uv - cell;
  K k; k.h = 0.; k.ply = 0.; k.g = vec2(0.); k.id = 0.;
  vec2 aL = normalize(vec2(-0.42, 1.)), aR = normalize(vec2(0.42, 1.));
  for (int dy=-1; dy<=1; dy++) for (int dx=-1; dx<=1; dx++){
    vec2 o = vec2(float(dx), float(dy));
    float hj = hash11(dot(cell+o, vec2(17.13, 91.7)));
    vec2 j = (vec2(hj, hash11(hj*77.1+3.))-.5)*vec2(0.07, 0.09);
    float sz = 0.94 + 0.1*hj;
    vec4 L1 = leg(f, o + j + vec2(0.5-0.215, 0.64), aL, 0.6*sz, 0.235*sz);
    vec4 R1 = leg(f, o + j + vec2(0.5+0.215, 0.64), aR, 0.6*sz, 0.235*sz);
    if (L1.x > k.h) { k.h = L1.x; k.ply = L1.y; k.g = L1.zw; k.id = hash11(dot(cell+o, vec2(12.9898, 78.233))); }
    if (R1.x > k.h) { k.h = R1.x; k.ply = R1.y + 3.1; k.g = R1.zw; k.id = hash11(dot(cell+o, vec2(12.9898, 78.233))+.37); }
  }
  return k;
}
// 1x1 rib: raised knit columns (V's), recessed purl columns (small horizontal bumps, mostly hidden)
K rib(vec2 uv){
  // 1x1 rib pulls in: knit columns take ~72% of each 2-column repeat, purl sits deep in the valley
  float rep = uv.x*0.5; float cid = floor(rep); float fx = fract(rep);
  K k; k.h = 0.; k.ply = 0.; k.g = vec2(0.); k.id = hash11(cid*7.13+.5);
  float kw = 0.72;
  if (fx < kw){
    float sx = 1./(2.*kw);                       // du_local/du
    vec2 g = vec2(fx/kw, fract(uv.y));
    vec2 aL = normalize(vec2(-0.36, 1.)), aR = normalize(vec2(0.36, 1.));
    for (int dy=-1; dy<=1; dy++){
      vec2 o = vec2(0., float(dy));
      vec4 L1 = leg(g, o + vec2(0.5-0.2, 0.64), aL, 0.6, 0.27);
      vec4 R1 = leg(g, o + vec2(0.5+0.2, 0.64), aR, 0.6, 0.27);
      if (L1.x > k.h) { k.h = L1.x; k.ply = L1.y; k.g = L1.zw; }
      if (R1.x > k.h) { k.h = R1.x; k.ply = R1.y; k.g = R1.zw; }
    }
    k.h = 0.25 + 0.75*k.h; k.g *= vec2(sx, 1.)*0.75;
    // columns roll down into the valley on both sides
    float edge = min(fx, kw-fx)/kw;
    k.h *= smoothstep(0.0, 0.18, edge);
  } else {
    float px = (fx-kw)/(1.-kw);
    vec2 g = vec2(px, fract(uv.y*1.0));
    vec4 B = leg(g, vec2(0.5, 0.5), vec2(1.,0.), 0.5, 0.3);
    k.h = B.x*0.1; k.ply = B.y; k.g = B.zw*0.1;
  }
  return k;
}
void main(){
  vec3 p = vO;
  // choose mapping: torso cylinder vs sleeve cylinder
  float wl = vKnit.x, wr = vKnit.y;
  vec2 uv;
  float isRib = step(0.5, vKnit.z);
  if (max(wl, wr) > 0.5){
    int i = wl > wr ? 0 : 1;
    vec3 ax = uArmDir[i]; vec3 q = p - uArmA[i];
    float along = dot(q, ax); vec3 rad = q - ax*along;
    vec3 ef = normalize(vec3(0.,0.,1.) - ax*ax.z); vec3 es = cross(ax, ef);
    float ang = atan(dot(rad, es), dot(rad, ef));
    uv = vec2(ang*0.2/uStitch.x, -along/uStitch.y);
  } else {
    float ang = atan(p.x, p.z);
    float R = vKnit.w > 0.5 ? 0.34 : 0.74;
    uv = vec2(ang*R/uStitch.x, p.y/uStitch.y);
    if (vKnit.w > 0.5) uv.y = (p.y - 1.29)/uStitch.y*1.4;
  }
  vec2 kuv = isRib > 0.5 ? uv*vec2(2.1,1.) : uv;
  K k; if (isRib > 0.5) k = rib(kuv); else k = stock(uv);
  float stitchVar = k.id;
  float fw = max(length(fwidth(uv)), 1e-4);
  float detail = 1. - smoothstep(0.22, 0.6, fw);
  // yarn: ply twist and fibre noise
  float plyT = 0.5+0.5*sin(k.ply);
  float fn2 = snoise(vO*45.+3.);
  vec3 N0 = normalize(vN);
  // cotangent frame from the (smooth) uv mapping, then perturb with the analytic stitch gradient
  vec3 dpx = dFdx(vW), dpy = dFdy(vW); vec2 dux = dFdx(kuv), duy = dFdy(kuv);
  vec3 dp2perp = cross(dpy, N0), dp1perp = cross(N0, dpx);
  vec3 Tu = dp2perp*dux.x + dp1perp*duy.x; vec3 Tv = dp2perp*dux.y + dp1perp*duy.y;
  float invmax = inversesqrt(max(dot(Tu,Tu), dot(Tv,Tv)) + 1e-12);
  Tu *= invmax; Tv *= invmax;
  vec2 gk = k.g * detail * step(0.02, k.h);
  vec3 N = normalize(N0 - uBump*(gk.x*Tu + gk.y*Tv));
  if (!gl_FrontFacing) N = -N;
  float h = mix(0.55, k.h, detail);
  float cavity = mix(1., mix(0.55, 1., smoothstep(0.0, 0.5, k.h)), detail);
  vec3 fq = vO*150.; float fdet = 1. - smoothstep(0.3, 0.9, length(fwidth(fq)));
  float fib = snoise(fq*vec3(1.,2.6,1.)) ;
  float plyD = detail * (1. - smoothstep(0.35, 1.2, length(fwidth(vec2(k.ply)))*0.15));
  vec3 alb = uYarn * (0.88 + 0.16*plyT*plyD) * (1. + fn2*0.06) * (1. + (stitchVar-.5)*0.16*detail) * (1. + fib*0.1*fdet);
  alb = mix(alb, uYarnLight, 0.16*smoothstep(0.5,1.,k.h)*detail);
  vec3 V = normalize(uCamPos - vW);
  float sh = shadowAt(vW + N0*0.012, 0.0065, 0.7, 8);
  float ao = vAO * cavity;
  vec3 col = vec3(0.);
  vec3 Ls[3]; Ls[0]=uKeyDir; Ls[1]=uFillDir; Ls[2]=uRimDir;
  vec3 Cs[3]; Cs[0]=uKeyCol*sh; Cs[1]=uFillCol; Cs[2]=uRimCol;
  float NoV = max(dot(N,V),1e-3);
  for (int i=0;i<3;i++){
    float NoL = dot(N, Ls[i]);
    float diff = max(0., (NoL+0.35)/1.35);
    vec3 H = normalize(Ls[i]+V); float nl = max(NoL,0.);
    float D = charlieD(0.45, max(dot(N,H),0.)); float Vis = 1./(4.*(nl+NoV-nl*NoV)+1e-3);
    vec3 sheen = mix(alb, vec3(1.), 0.4) * D*Vis*nl*0.6;
    col += (alb*diff + sheen) * Cs[i] * (i==0 ? mix(0.55,1.,ao) : ao);
  }
  float rimScatter = pow(1.-max(dot(N0,V),0.), 3.) * max(0., dot(uRimDir, -V)*.5+.5);
  col += alb * uRimCol * rimScatter * 0.7 * ao;
  col += alb * hemi(N) * ao;
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// --- strands
const STRAND_VS = /* glsl */`
${GLSL_NOISE}
${GLSL_LIGHT}
${GLSL_GRAD}
uniform mat4 uBones[6];
uniform vec3 uPal[8];
uniform float uViewH; uniform float uWidthScale; uniform float uMinPx; uniform float uLenScale; uniform float uTime;
uniform float uTipRatio;
uniform vec4 uHoles[8];
uniform float uBodyFade;
${GLSL_MORPH}
attribute vec3 iRoot; attribute vec3 iNrm; attribute vec3 iDir;
attribute vec4 iShape;   // len, width, lean, bend
attribute vec4 iMisc;    // seed, region, ao, bone
attribute vec3 iCurl;    // amp, freq, alpha
varying vec3 vT; varying vec3 vN; varying vec3 vW; varying vec3 vCol;
varying float vTt; varying float vAlpha; varying float vAO; varying float vSh; varying float vSide; varying float vFade;
vec3 curve(float t, vec3 R, vec3 N, vec3 D, vec3 B, float L, float lean, float bend, float amp, float freq, float ph){
  float k = abs(bend) < 1e-3 ? 1e-3 : bend;
  float a = lean + k*t;
  float cn = (sin(a) - sin(lean))/k;
  float cd = (cos(lean) - cos(a))/k;
  vec3 P = R + L*(N*cn + D*cd);
  float c = amp*L*sqrt(t);
  float w = 6.2831853*freq*t + ph;
  vec3 perp = N*(-sin(a)) + D*cos(a);
  P += c*(B*sin(w) + perp*cos(w)*0.7);
  return P;
}
void main(){
  float t = position.x; float side = position.y;
  int bi = int(iMisc.w + .5);
  mat4 M = uBones[bi];
  vec3 r0 = iRoot, n0 = iNrm;
  if (bi == 0 && uMorph > 0.) morphPN(r0, n0);   // the app's morph: the cloud becomes a dot / a pencil tip
  vec3 R = (M*vec4(r0,1.)).xyz;
  vec3 N = normalize(mat3(M)*n0);
  vFade = bi == 0 ? uBodyFade : 1.;
  vec3 D = mat3(M)*iDir; D = normalize(D - N*dot(D,N));
  vec3 B = cross(N, D);
  float seed = iMisc.x;
  float L = iShape.x*uLenScale;
  // features (eyes, mouth) clear the coat around them: roots inside a hole are dropped, near it they shorten
  float hd = 9.;
  if (bi == 0) for (int i=0;i<8;i++) hd = min(hd, length(iRoot - uHoles[i].xyz) - uHoles[i].w);
  float holeK = smoothstep(0., 0.07, hd);
  L *= mix(0.3, 1., holeK);
  float ph = seed*61.7;
  vec3 P = curve(t, R, N, D, B, L, iShape.z, iShape.w, iCurl.x, iCurl.y, ph);
  float dt = t < .95 ? .03 : -.03;
  vec3 P2 = curve(t+dt, R, N, D, B, L, iShape.z, iShape.w, iCurl.x, iCurl.y, ph);
  vec3 T = normalize((P2 - P)*sign(dt));
  vec3 toCam = uCamPos - P;
  vec3 S = cross(T, toCam); float sl = length(S); S = sl > 1e-6 ? S/sl : vec3(1.,0.,0.);
  float w = iShape.y*uWidthScale*mix(1., uTipRatio, t);
  vec4 clip = projectionMatrix*viewMatrix*vec4(P,1.);
  float px = clip.w*2./(projectionMatrix[1][1]*uViewH);
  float wMin = px*uMinPx; float cov = 1.;
  if (w < wMin) { cov = w/wMin; w = wMin; }
  vec3 Pw = P + S*side*w*.5;
  gl_Position = projectionMatrix*viewMatrix*vec4(Pw,1.);
  // colour
  int reg = int(iMisc.y + .5);
  vec3 base = uPal[reg];
  if (uGradOn > 0.5 && (reg == 0 || reg == 6 || reg == 7)) {
    vec3 g = gradCol(R);
    base = reg == 6 ? mix(g, mix(g, vec3(1., 0.92, 0.83), 0.6), 0.55) : g;   // fly-aways run a touch paler, as before
  }
  float h1 = hash11(seed*1000.+.5), h2 = hash11(seed*1731.+7.3), h3 = hash11(seed*913.+2.1);
  base *= 0.92 + 0.14*h1;
  base = mix(base, base*base/max(max(base.r,max(base.g,base.b)),1e-3), 0.15*h3);   // some fibres deeper
  if (h2 > 0.97) base = mix(base, vec3(1.), 0.2);                               // a few pale fibres
  vCol = base;
  vT = T; vN = N; vW = P; vTt = t; vAO = iMisc.z; vSide = side;
  float tipFade = 1. - smoothstep(0.62, 1., t);
  vAlpha = cov * iCurl.z * tipFade * step(0., hd);
  vSh = shadowAt(P + N*0.006, 0.006, seed*6.2831, 6);
}`;
const STRAND_FS = /* glsl */`
${GLSL_LIGHT}
uniform vec2 uSpecShift; uniform vec2 uSpecExp; uniform vec2 uSpecAmt; uniform float uTrans; uniform float uRootOcc;
uniform float uOpacity; uniform float uTipLight; uniform float uHalo;
varying vec3 vT; varying vec3 vN; varying vec3 vW; varying vec3 vCol;
varying float vTt; varying float vAlpha; varying float vAO; varying float vSh; varying float vSide; varying float vFade;
vec3 hairLight(vec3 L, vec3 Lc, vec3 T, vec3 N, vec3 V, vec3 base, float t, float occ){
  float NoL = dot(N, L);
  float wrap = clamp((NoL + .55)/1.55, 0., 1.);
  float TL = dot(T, L); float kk = sqrt(max(0., 1. - TL*TL));
  float diff = wrap * mix(1., kk, .45);
  vec3 H = normalize(L + V);
  float a1 = dot(normalize(T + N*uSpecShift.x), H); float s1 = pow(sqrt(max(0.,1.-a1*a1)), uSpecExp.x);
  float a2 = dot(normalize(T + N*uSpecShift.y), H); float s2 = pow(sqrt(max(0.,1.-a2*a2)), uSpecExp.y);
  float facing = smoothstep(-.2, .4, NoL);
  vec3 spec = (vec3(s1)*uSpecAmt.x + base*s2*uSpecAmt.y) * facing;
  float back = max(0., dot(L, -V));
  vec3 trans = base * pow(back, 3.) * kk * uTrans * (.35 + .65*t);
  return (base*diff*occ + spec*mix(.4,1.,t) + trans) * Lc;
}
void main(){
  float t = vTt;
  float a = vAlpha * uOpacity * vFade;
  if (a < 0.004) discard;
  vec3 T = normalize(vT); vec3 N = normalize(vN); vec3 V = normalize(uCamPos - vW);
  float occ = mix(uRootOcc, 1., smoothstep(0., .9, t)) * mix(vAO, 1., .45 + .55*t);
  vec3 base = vCol;
  // thin tips scatter more and read lighter / less saturated than the roots
  vec3 tipCol = mix(base, vec3(max(base.r, max(base.g, base.b))), 0.3) * 1.18;
  base = mix(base, tipCol, t*t*uTipLight);
  vec3 col = hairLight(uKeyDir, uKeyCol*vSh, T, N, V, base, t, occ)
           + hairLight(uFillDir, uFillCol, T, N, V, base, t, occ)
           + hairLight(uRimDir, uRimCol, T, N, V, base, t, occ);
  col += base * hemi(N) * occ;
  // silhouette halo: tips seen edge-on against the backdrop scatter the rim + sky light
  float edgeOn = pow(1. - abs(dot(N, V)), 2.5);
  col += mix(base, vec3(1.), .35) * (uRimCol*.55 + uSkyCol*.6) * edgeOn * t * uHalo;
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}`;

// --- eye
const EYE_VS = /* glsl */`
varying vec3 vW; varying vec3 vN; varying vec3 vL;
uniform float uEyeR;
void main(){ vL = position/uEyeR; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`;
const EYE_FS = /* glsl */`
${GLSL_NOISE}
${GLSL_LIGHT}
uniform float uF0;
uniform vec3 uCamLocal; uniform float uIrisAng; uniform float uPupil; uniform float uIrisDepth;
uniform vec3 uIris; uniform vec3 uIrisDark; uniform vec3 uSclera;
uniform mat4 uLidInv; uniform mat4 uLowInv; uniform float uLidEdge; uniform float uLowEdge;
varying vec3 vW; varying vec3 vN; varying vec3 vL;
vec3 studioEnv(vec3 R){
  vec3 c = mix(uGroundCol*0.35, uSkyCol*1.05, smoothstep(-0.35, 0.75, R.y));
  vec3 k = normalize(uKeyDir); vec3 ku = normalize(cross(vec3(0.,1.,0.), k)); vec3 kv = cross(k, ku);
  float d = dot(R, k);
  if (d > 0.){ vec2 q = vec2(dot(R,ku), dot(R,kv))/d; vec2 b = abs(q) - vec2(0.2, 0.28); float sd = length(max(b,0.)) + min(max(b.x,b.y),0.) - 0.08; c += uKeyCol*7.*smoothstep(0.04, -0.04, sd); }
  vec3 r = normalize(uRimDir); vec3 ru = normalize(cross(vec3(0.,1.,0.), r)); vec3 rv = cross(r, ru);
  float d2 = dot(R, r);
  if (d2 > 0.){ vec2 q = vec2(dot(R,ru), dot(R,rv))/d2; vec2 b = abs(q) - vec2(0.08, 0.5); float sd = length(max(b,0.)) + min(max(b.x,b.y),0.) - 0.04; c += uRimCol*4.*smoothstep(0.04, -0.04, sd); }
  // round beauty-dish near the camera, up-left: the catchlight that sits just under the lid
  vec3 bd = normalize(vec3(-0.36, -0.28, 1.0)); float db = dot(R, bd);
  c += vec3(1.,.98,.95)*9.*smoothstep(0.9965, 0.998, db);
  c += vec3(1.)*0.9*smoothstep(0.985, 0.998, db);
  return c;
}
void main(){
  vec3 n = normalize(vL);
  vec3 Vl = normalize(uCamLocal - n);
  vec3 N = normalize(vN); vec3 V = normalize(uCamPos - vW);
  float cz = cos(uIrisAng), sz = sin(uIrisAng);
  // refract into the anterior chamber and hit the recessed iris plane
  vec3 rd = refract(-Vl, n, 1./1.376);
  float planeZ = cz - uIrisDepth;
  float tt = (planeZ - n.z)/min(rd.z, -1e-3);
  vec3 hp = n + rd*max(tt, 0.);
  vec2 ip = hp.xy/sz;
  float r = length(ip); float ang = atan(ip.y, ip.x);
  float corneaMask = smoothstep(cz - 0.035, cz + 0.01, n.z);
  float irisMask = corneaMask * smoothstep(1.03, 0.95, r);
  float streak = snoise(vec3(cos(ang)*9., sin(ang)*9., r*2.2)) * 0.5 + snoise(vec3(cos(ang)*22., sin(ang)*22., r*5.)) * 0.35;
  vec3 iris = mix(uIrisDark, uIris, smoothstep(1.0, 0.6, r));
  iris *= 0.8 + 0.35*streak;
  iris = mix(iris, uIris*1.35, 0.35*smoothstep(0.1, 0.0, abs(r - uPupil*1.45)));
  float pupil = smoothstep(uPupil + 0.035, uPupil - 0.035, r);
  iris = mix(iris, vec3(0.004, 0.004, 0.006), pupil);
  vec3 sclera = uSclera * mix(1., 0.8, smoothstep(0.35, -0.5, n.z));
  vec3 alb = mix(sclera, iris, irisMask);
  // lid contact shadows (analytic): angle below the upper lid edge, above the lower lid edge
  vec3 lu = (uLidInv*vec4(vW,1.)).xyz; float bu = atan(lu.y, lu.z);
  float lidAO = mix(0.4, 1., smoothstep(-0.02, 0.22, uLidEdge - bu));
  vec3 ll = (uLowInv*vec4(vW,1.)).xyz; float bl = atan(ll.y, ll.z);
  lidAO *= mix(0.6, 1., smoothstep(0.0, 0.16, bl - uLowEdge));
  float sh = shadowAt(vW + N*0.004, 0.004, 0.7, 8);
  float NoV = max(dot(N,V), 1e-3);
  vec3 col = vec3(0.);
  vec3 Ls[3]; Ls[0]=uKeyDir; Ls[1]=uFillDir; Ls[2]=uRimDir;
  vec3 Cs[3]; Cs[0]=uKeyCol*sh; Cs[1]=uFillCol; Cs[2]=uRimCol;
  for (int i=0;i<3;i++){ float NoL = dot(N, Ls[i]); col += alb*max(0.,(NoL+.25)/1.25)*Cs[i]; }
  col += alb*hemi(N);
  col *= lidAO;
  // wet cornea: fresnel reflection of the studio + a tight key highlight
  vec3 R = reflect(-V, N);
  float F = uF0 + (1.-uF0)*pow(1.-NoV, 5.);
  vec3 env = studioEnv(R);
  float spec = pow(max(dot(R, uKeyDir),0.), 900.)*18.;
  col = col*(1.-F) + env*F*mix(0.45,1.,lidAO) + uKeyCol*spec*0.25*sh*lidAO;
  // wet meniscus where the lower lid meets the eye: a thin bright line
  float men = smoothstep(0.07, 0.0, bl - uLowEdge) * smoothstep(-0.02, 0.01, bl - uLowEdge);
  col += vec3(0.9,0.95,1.)*men*0.22*pow(max(dot(R, normalize(vec3(0.,0.6,1.))),0.),4.);
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// --- backdrop (cyclorama) with contact AO from analytic occluders
const BG_VS = /* glsl */`
varying vec3 vW; varying vec3 vN;
void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`;
const BG_FS = /* glsl */`
${GLSL_LIGHT}
uniform vec3 uBg; uniform vec3 uBgFloor; uniform vec4 uOcc[6]; uniform float uNOcc;
varying vec3 vW; varying vec3 vN;
float ign2(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056,0.00583715)))); }
void main(){
  vec3 N = normalize(vN);
  float wall = smoothstep(0.2, 3.5, vW.y);
  vec3 base = mix(uBgFloor, uBg, wall);
  // soft top-to-bottom studio falloff and a gentle vignette around the subject
  float r = length(vec2(vW.x*0.55, (vW.y-1.8)*0.8 + min(vW.z,0.)*0.0));
  base *= mix(1.06, 0.84, smoothstep(1.5, 9., r));
  float occ = 0.;
  for (int i=0;i<6;i++){ if (float(i) >= uNOcc) break; vec3 d = uOcc[i].xyz - vW; float l = length(d); float rr = uOcc[i].w;
    occ += rr*rr*max(dot(N, d/l), 0.)/(l*l) ; }
  float ao = 1. - 0.55*clamp(occ, 0., 1.);
  float sh = shadowAt(vW + N*0.02, 0.018, 0.7, 12);
  float key = max(dot(N, uKeyDir), 0.);
  vec3 col = base * (0.78 + 0.28*key*mix(0.55, 1., sh)) * ao;
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// --- the body's felt: the approved felt shader + the morph + a fade (the app dims the dot in some morphs)
const BODY_VS = /* glsl */`
${GLSL_MORPH}
attribute vec4 aReg; attribute float aAO;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vReg; varying float vAO;
void main(){
  vec3 p = position, n = normal;
  if (uMorph > 0.) morphPN(p, n);
  vec4 w = modelMatrix*vec4(p,1.);
  vW = w.xyz; vN = normalize(mat3(modelMatrix)*n); vO = position; vReg = aReg; vAO = aAO;
  gl_Position = projectionMatrix*viewMatrix*w;
}`;
const BODY_FS = FELT_FS.replace('uniform vec3 uPal[4];', 'uniform vec3 uPal[4];\nuniform float uBodyFade; uniform vec3 uBgCol;')
  .replace(/\}\s*$/, '  gl_FragColor.rgb = mix(uBgCol, gl_FragColor.rgb, uBodyFade);\n}');
// --- the effects around the character (dots, rings, pencil, "!"): the same felt, with an opacity; rings are tori
// built in the vertex shader (radius, tube, arc from 12 o'clock clockwise)
const FX_VS = /* glsl */`
attribute vec4 aReg; attribute float aAO;
uniform vec4 uRing;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vReg; varying float vAO;
void main(){
  vec3 p = position, n = normal;
  if (uRing.w > .5) {
    float a = 1.5707963 - uv.x*uRing.z, b = uv.y*6.2831853;
    vec3 c = vec3(cos(a), sin(a), 0.);
    n = c*cos(b) + vec3(0.,0.,sin(b)); p = c*uRing.x + n*uRing.y;
  }
  vec4 w = modelMatrix*vec4(p,1.);
  vW = w.xyz; vN = normalize(mat3(modelMatrix)*n); vO = mat3(modelMatrix)*p; vReg = aReg; vAO = aAO;
  gl_Position = projectionMatrix*viewMatrix*w;
}`;
const FX_FS = FELT_FS.replace('uniform vec3 uPal[4];', 'uniform vec3 uPal[4];\nuniform float uOp;')
  .replace(/\}\s*$/, '  gl_FragColor *= uOp;\n}');
