"use client";

/* eslint-disable react-hooks/immutability -- the render loop (useFrame) updates GPU uniforms,
   the camera and the scene graph every frame by design; React never re-renders from these. */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { particleFragment, particleVertex } from "./particle-shaders";

/** Shared, mutable inputs. Written by scroll, pointer and live-status code; read every frame. */
export type CoreSignals = {
  /** 0..1 how far the hero has scrolled (sphere rises, camera approaches). */
  rise: number;
  /** 0..1 reorganisation into category clusters (section two). */
  morph: number;
  /** -1..1 horizontal offset in sphere radii (moves aside for text). */
  shiftX: number;
  /** 0..1 real scanning activity. */
  activity: number;
  /** Set to performance.now() when a real discovery arrives. */
  pulseAt: number;
  /** Normalised cursor position in the canvas, -1..1. */
  pointer: { x: number; y: number; active: boolean };
};

export const createSignals = (): CoreSignals => ({ rise: 0, morph: 0, shiftX: 0, activity: 0, pulseAt: -1e9, pointer: { x: 0, y: 0, active: false } });

/** Deterministic PRNG so the particle field is identical on every render and reload. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Six cluster centres: paid testing, prediction markets, trading, protocols, bounties, work. */
const CLUSTERS = [
  [0.9, 0.55, 0.2], [-0.85, 0.6, -0.1], [0.1, -0.95, 0.35], [-0.6, -0.55, 0.6], [0.55, -0.2, -0.85], [-0.2, 0.95, 0.4],
].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize().multiplyScalar(1.05));

function buildGeometry(count: number) {
  const rnd = mulberry32(20261126);
  const pos = new Float32Array(count * 3);
  const cluster = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const size = new Float32Array(count);
  const tone = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // Fibonacci sphere for an even surface, jittered; ~15% live in a shallow outer volume.
    const k = i + 0.5;
    const phi = Math.acos(1 - (2 * k) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * k + rnd() * 0.02;
    const shell = rnd() < 0.93 ? 1 + (rnd() - 0.5) * 0.03 : 1 + rnd() * 0.12;
    v.setFromSphericalCoords(shell, phi, theta);
    pos.set([v.x, v.y, v.z], i * 3);
    // Cluster target: nearest of six centres, spread in a small soft ball.
    const c = CLUSTERS[Math.floor(rnd() * CLUSTERS.length)]!;
    const r = Math.cbrt(rnd()) * 0.32;
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    cluster.set([c.x + r * s * Math.cos(a), c.y + r * s * Math.sin(a), c.z + r * u], i * 3);
    seed[i] = rnd();
    size[i] = 0.6 + Math.pow(rnd(), 3) * 2.2; // mostly fine dust, a few larger fragments
    tone[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aCluster", new THREE.BufferAttribute(cluster, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aTone", new THREE.BufferAttribute(tone, 1));
  g.computeBoundingSphere();
  return g;
}

export function ParticleSphere({ count, signals, radius = 1, baseY = -1.05, still = false }: {
  count: number;
  signals: React.RefObject<CoreSignals>;
  radius?: number;
  /** Resting vertical position before scroll (negative = emerging from below). */
  baseY?: number;
  /** Reduced motion: render a calm, static frame. */
  still?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const { gl, camera } = useThree();
  const geometry = useMemo(() => buildGeometry(count), [count]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: 1 },
          uSize: { value: 10 },
          uMorph: { value: 0 },
          uActivity: { value: 0 },
          uPulse: { value: 0 },
          uPulseDir: { value: new THREE.Vector3(0.6, 0.6, 0.5).normalize() },
          uPointer: { value: new THREE.Vector3(0, 0, 1) },
          uPointerStrength: { value: 0 },
          uReveal: { value: still ? 1 : 0 },
        },
      }),
    [still],
  );

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  // Starts lower and rises into place on load (part of the intro); still mode starts in place.
  const damp = useRef({ rx: 0, ry: 0, y: still ? baseY : baseY - 0.7, x: 0, z: 0, morph: 0, activity: 0, pstr: 0, scale: radius });
  const tmp = useMemo(() => ({ ray: new THREE.Raycaster(), sphere: new THREE.Sphere(new THREE.Vector3(), radius), hit: new THREE.Vector3(), ndc: new THREE.Vector2(), inv: new THREE.Matrix4() }), [radius]);

  useFrame((state, delta) => {
    const s = signals.current;
    const u = material.uniforms;
    const d = damp.current;
    const k = (rate: number) => 1 - Math.exp(-rate * Math.min(delta, 0.1));
    if (!s || !group.current) return;

    u.uPixelRatio!.value = gl.getPixelRatio();
    if (!still) u.uTime!.value += delta;
    u.uReveal!.value = still ? 1 : Math.min(1, u.uReveal!.value + delta / 1.6);

    // Scroll: rise into view, approach, move aside, reorganise.
    d.y += (baseY + s.rise * (0 - baseY) * 0.92 - d.y) * k(4);
    d.x += (s.shiftX * radius - d.x) * k(3);
    d.morph += (s.morph - d.morph) * k(3);
    d.activity += (s.activity - d.activity) * k(1.5);
    // Shrinks as it rises so the whole sphere stays recognisable in view.
    d.scale += (radius * (1 - 0.12 * s.rise) - d.scale) * k(4);
    group.current.scale.setScalar(d.scale);
    group.current.position.set(d.x, d.y, 0);
    camera.position.z = 3.4 - s.rise * 0.35;
    u.uMorph!.value = d.morph * 0.65; // keeps the sphere recognisable
    u.uActivity!.value = d.activity;

    // Continuous rotation, plus a damped tilt toward the cursor (never attached to it).
    const p = s.pointer;
    const targetRx = p.active ? -p.y * 0.18 : 0;
    const targetRy = p.active ? p.x * 0.25 : 0;
    d.rx += (targetRx - d.rx) * k(2);
    d.ry += (targetRy - d.ry) * k(2);
    if (!still) group.current.rotation.y += delta * (0.045 + d.activity * 0.05);
    group.current.rotation.x = d.rx;
    group.current.rotation.z = d.ry * 0.3;

    // Cursor: project onto the sphere and let nearby particles respond.
    d.pstr += ((p.active ? 1 : 0) - d.pstr) * k(3);
    u.uPointerStrength!.value = d.pstr;
    if (p.active) {
      tmp.ndc.set(p.x, p.y);
      tmp.ray.setFromCamera(tmp.ndc, camera);
      tmp.sphere.center.copy(group.current.position);
      tmp.sphere.radius = d.scale;
      if (tmp.ray.ray.intersectSphere(tmp.sphere, tmp.hit)) {
        tmp.inv.copy(group.current.matrixWorld).invert();
        (u.uPointer!.value as THREE.Vector3).copy(tmp.hit.applyMatrix4(tmp.inv).normalize());
      }
    }

    // Real discovery pulse decays over ~2.5s.
    const since = (performance.now() - s.pulseAt) / 2500;
    u.uPulse!.value = since >= 0 && since < 1 ? 1 - since : 0;
  });

  return (
    <group ref={group}>
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}
