/**
 * GLSL for the XEN Intelligence Core. Kept apart from React and business logic.
 * Particle motion runs entirely on the GPU: the CPU only updates a handful of uniforms.
 */

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT).
const SIMPLEX = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

export const particleVertex = /* glsl */ `
${SIMPLEX}
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
uniform float uMorph;      // 0 = sphere, 1 = category clusters
uniform float uActivity;   // 0 idle .. 1 scanning (real system state)
uniform float uPulse;      // 0..1 decaying pulse after a real discovery
uniform vec3  uPulseDir;   // where the pulse appears on the surface
uniform vec3  uPointer;    // cursor projected onto the sphere (object space)
uniform float uPointerStrength;
uniform float uReveal;     // 0..1 intro illumination

attribute float aSeed;
attribute float aSize;
attribute float aTone;
attribute vec3  aCluster;

varying float vLight;
varying float vTone;
varying float vAlpha;
varying float vSpark;

void main(){
  vec3 base = position;
  vec3 dir = normalize(base);

  // Organic surface: slow simplex displacement along the normal, plus a travelling wave.
  float t = uTime;
  float n = snoise(dir * 1.55 + vec3(0.0, t * 0.07, t * 0.05));
  float wave = sin(dot(dir, normalize(vec3(0.6, 1.0, 0.25))) * 7.0 - t * (0.9 + uActivity * 1.6));
  float disp = n * (0.055 + uActivity * 0.025) + wave * (0.008 + uActivity * 0.018);

  // Breathing and per-particle drift.
  float breathe = 1.0 + 0.012 * sin(t * 0.55);
  vec3 drift = vec3(sin(t * 0.6 + aSeed * 31.0), cos(t * 0.5 + aSeed * 17.0), sin(t * 0.4 + aSeed * 7.0)) * 0.006;

  vec3 p = base * breathe + dir * disp + drift;

  // Cursor: nearby particles lift away gently.
  float dp = distance(dir, uPointer);
  p += dir * smoothstep(0.55, 0.0, dp) * 0.07 * uPointerStrength;

  // Real discovery pulse: a ring expanding from uPulseDir.
  float pd = distance(dir, uPulseDir);
  float ring = smoothstep(0.12, 0.0, abs(pd - (1.0 - uPulse) * 1.2)) * uPulse;
  p += dir * ring * 0.05;

  // Reorganise into clusters as the story scrolls on.
  p = mix(p, aCluster + drift * 2.0, uMorph);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // Light from the right, in view space; the far side stays dim.
  vec3 nView = normalize(normalMatrix * dir);
  float lambert = max(dot(nView, normalize(vec3(0.85, 0.25, 0.55))), 0.0);
  float facing = smoothstep(-0.35, 0.6, nView.z);
  float region = smoothstep(0.15, 0.85, snoise(dir * 0.9 + vec3(t * 0.03)) * 0.5 + 0.5);
  // Limb: particles near the silhouette catch the light, which draws the sphere's outline.
  float rim = pow(1.0 - abs(nView.z), 2.5);
  vLight = (0.55 + 0.45 * lambert) * (0.62 + 0.38 * facing) * (0.8 + 0.4 * region) + rim * (0.25 + 0.45 * lambert) + ring * 1.2 + uActivity * 0.08;
  vTone = aTone;
  vSpark = step(0.985, fract(aSeed * 91.7 + floor(t * 0.25 + aSeed * 3.0) * 0.37));
  vAlpha = uReveal * (0.5 + 0.5 * facing + rim * 0.3);

  float size = aSize * (1.0 + ring * 1.5 + vSpark * 0.8);
  gl_PointSize = size * uSize * uPixelRatio * (1.0 / -mv.z);
}`;

export const particleFragment = /* glsl */ `
precision highp float;
varying float vLight;
varying float vTone;
varying float vAlpha;
varying float vSpark;

// Palette: deep teal -> turquoise -> cyan -> pale aqua -> cool white, rare lavender.
vec3 tone(float x){
  vec3 deep = vec3(0.0, 0.51, 0.486);     // #00827c
  vec3 turq = vec3(0.24, 0.80, 0.76);
  vec3 cyan = vec3(0.796, 1.0, 0.988);    // #cbfffc
  vec3 aqua = vec3(0.929, 1.0, 0.996);    // #edfffe
  vec3 lav  = vec3(0.98, 0.82, 1.0);      // #fad1ff
  if (x > 0.975) return lav;
  if (x < 0.35) return mix(deep, turq, x / 0.35);
  if (x < 0.75) return mix(turq, cyan, (x - 0.35) / 0.4);
  return mix(cyan, aqua, (x - 0.75) / 0.225);
}

void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  float a = pow(core, 1.6) * vAlpha;
  vec3 col = tone(vTone) * vLight + vec3(vSpark) * 0.35;
  gl_FragColor = vec4(col, a * clamp(vLight, 0.0, 1.2));
}`;
