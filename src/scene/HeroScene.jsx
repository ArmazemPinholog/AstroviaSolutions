import React, { useEffect, useMemo, useRef, Suspense } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { pointer } from "../lib/pointer";

/* ============================================================
   NÚCLEO ASTROVIA — o "momento uau" do site
   A própria logo (núcleo de plasma magenta + anéis orbitais
   ciano) reconstruída em 3D com partículas:
   1. Abertura: as partículas saem do caos e montam a logo.
   2. Vivo: os anéis orbitam, o núcleo pulsa, o mouse inclina.
   3. Scroll: a câmera mergulha pelos anéis até o núcleo, que se
      abre em estrelas — o resto do site acontece "dentro" dele.
   Tudo procedural (sem assets), um único draw call de pontos.
   ============================================================ */

const CYAN = new THREE.Color("#22d3ee");
const MAGENTA = new THREE.Color("#ff2fd0");
const HOT = new THREE.Color("#ffe3f4");

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isSmall = () => typeof window !== "undefined" && window.innerWidth < 768;

/* gerador determinístico: a logo nasce igual em toda visita */
function rng(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* anéis da logo: raio, inclinação e velocidade de órbita */
const RINGS = [
  { r: 1.55, tilt: [1.18, 0.0, -0.62], speed: 0.16, w: 0.05 },
  { r: 2.05, tilt: [1.22, 0.1, -0.55], speed: -0.11, w: 0.08 },
  { r: 2.6, tilt: [1.1, -0.12, -0.7], speed: 0.07, w: 0.12 },
  { r: 3.25, tilt: [1.3, 0.05, -0.5], speed: -0.045, w: 0.2 },
];

function buildGeometry(small) {
  const R = rng(11);
  const nCore = small ? 1700 : 3400;
  const nRing = small ? 650 : 1500;
  const nStar = small ? 1400 : 3200;
  const total = nCore + nRing * RINGS.length + nStar;

  const pos = new Float32Array(total * 3); // forma final (local)
  const start = new Float32Array(total * 3); // posição no caos
  const orbit = new Float32Array(total * 4); // r, ângulo0, velocidade, id do anel
  const kind = new Float32Array(total); // 0 núcleo · 1 anel · 2 estrela
  const seed = new Float32Array(total);
  const tint = new Float32Array(total); // 0..1 usado na cor
  const size = new Float32Array(total);

  let i = 0;
  const put = (k, p, s, t, sz) => {
    pos.set(p, i * 3);
    // caos: casca larga ao redor da cena
    const a = R() * Math.PI * 2;
    const b = Math.acos(2 * R() - 1);
    const rr = 9 + R() * 9;
    start.set([rr * Math.sin(b) * Math.cos(a), rr * Math.sin(b) * Math.sin(a) * 0.7, rr * Math.cos(b) - 2], i * 3);
    kind[i] = k;
    seed[i] = s;
    tint[i] = t;
    size[i] = sz;
    i++;
  };

  // NÚCLEO: esfera de plasma, mais densa no centro
  for (let n = 0; n < nCore; n++) {
    const a = R() * Math.PI * 2;
    const b = Math.acos(2 * R() - 1);
    const shell = R() < 0.62;
    const r = shell ? 0.92 + R() * 0.12 : Math.pow(R(), 1.8) * 0.9;
    put(0, [r * Math.sin(b) * Math.cos(a), r * Math.sin(b) * Math.sin(a), r * Math.cos(b)], R(), r, shell ? 0.8 + R() * 0.5 : 0.9 + R() * 1.1);
  }

  // ANÉIS: pontos ao longo de elipses inclinadas (órbita no shader)
  RINGS.forEach((ring, id) => {
    for (let n = 0; n < nRing; n++) {
      const j = () => (R() - 0.5) * ring.w;
      orbit.set([ring.r + j() * 2.0, R() * Math.PI * 2, ring.speed * (0.85 + R() * 0.3), id], i * 4);
      // tint > 0.82 = ponto magenta (como os brilhos rosados da logo)
      put(1, [j(), j(), j() * 0.6], R(), R() < 0.1 ? 0.9 + R() * 0.1 : R() * 0.5, R() < 0.04 ? 2.2 : 0.55 + R() * 0.7);
    }
  });

  // ESTRELAS: campo profundo que fica no fundo do site inteiro
  for (let n = 0; n < nStar; n++) {
    const a = R() * Math.PI * 2;
    const b = Math.acos(2 * R() - 1);
    const r = 5 + Math.pow(R(), 0.7) * 22;
    put(2, [r * Math.sin(b) * Math.cos(a), r * Math.sin(b) * Math.sin(a) * 0.65, r * Math.cos(b) - 4], R(), R(), 0.35 + R() * 0.9);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
  g.setAttribute("aOrbit", new THREE.BufferAttribute(orbit, 4));
  g.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  g.setAttribute("aTint", new THREE.BufferAttribute(tint, 1));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  return g;
}

const ringMatrix = (tilt) =>
  new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...tilt)));

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uIntro;   // 0 caos → 1 logo montada
  uniform float uScroll;  // 0 topo → 1 dentro do núcleo
  uniform float uPixel;
  uniform mat3 uR0; uniform mat3 uR1; uniform mat3 uR2; uniform mat3 uR3;
  uniform vec3 uCyan; uniform vec3 uMagenta; uniform vec3 uHot;

  attribute vec3 aStart;
  attribute vec4 aOrbit;
  attribute float aKind;
  attribute float aSeed;
  attribute float aTint;
  attribute float aSize;

  varying vec3 vColor;
  varying float vAlpha;

  mat3 ring(float id) {
    if (id < 0.5) return uR0;
    if (id < 1.5) return uR1;
    if (id < 2.5) return uR2;
    return uR3;
  }

  void main() {
    vec3 target;
    vec3 color;
    float glow = 1.0;
    float t = uTime;

    if (aKind < 0.5) {
      // núcleo: pulsa e, no mergulho, se abre em estrelas
      vec3 p = position;
      float pulse = 1.0 + 0.035 * sin(t * 1.7 + aSeed * 6.2831) + 0.02 * sin(t * 0.6);
      p *= pulse;
      p += normalize(p + 0.0001) * pow(uScroll, 1.6) * (3.0 + aSeed * 9.0);
      target = p;
      float hot = pow(1.0 - clamp(aTint, 0.0, 1.0), 2.2);
      color = mix(uMagenta, uHot, hot);
      glow = 0.9 + hot * 0.9;
    } else if (aKind < 1.5) {
      // anéis: órbita contínua + abertura no mergulho
      float ang = aOrbit.y + t * aOrbit.z;
      float r = aOrbit.x * (1.0 + pow(uScroll, 1.4) * 2.4);
      vec3 local = vec3(cos(ang) * r, sin(ang) * r, 0.0) + position;
      target = ring(aOrbit.w) * local;
      color = aTint > 0.82 ? uMagenta : mix(uCyan, vec3(0.75, 0.97, 1.0), aTint * 0.6);
      glow = aTint > 0.82 ? 1.2 : 0.85;
    } else {
      target = position;
      color = mix(vec3(0.55, 0.85, 1.0), uMagenta, step(0.93, aTint));
      glow = 0.55;
    }

    // abertura: cada partícula viaja do caos para a forma com seu próprio atraso
    float d = clamp(uIntro * 1.55 - aSeed * 0.55, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - d, 3.0);
    float travel = (aKind > 1.5) ? 1.0 : e;
    vec3 p = mix(aStart, target, travel);
    // curva lateral durante o voo (parece atraída por gravidade, não interpolada)
    p += vec3(-aStart.z, 0.0, aStart.x) * 0.12 * sin(d * 3.1416) * step(aKind, 1.5);

    // cor pela velocidade: quem está voando brilha mais e puxa para o branco
    float speed = sin(d * 3.1416) * step(aKind, 1.5);
    color = mix(color, vec3(1.0), speed * 0.55);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(-mv.z, 0.05);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixel * (1.0 + speed * 1.4) * (30.0 / dist);

    // perto demais da câmera some (evita "borrões" no mergulho)
    float nearFade = smoothstep(0.35, 1.6, dist);
    float farFade = smoothstep(42.0, 10.0, dist);
    float twinkle = aKind > 1.5 ? 0.6 + 0.4 * sin(t * (0.6 + aSeed * 2.0) + aSeed * 40.0) : 1.0;
    // depois do mergulho, núcleo e anéis viram poeira discreta para não brigar com o texto
    float settle = aKind > 1.5 ? 1.0 : mix(1.0, 0.28, smoothstep(0.55, 1.0, uScroll));
    float appear = aKind > 1.5 ? smoothstep(0.0, 0.6, uIntro) : 1.0;

    vColor = color * glow;
    vAlpha = nearFade * farFade * twinkle * settle * appear;
  }
`;

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    // additive: o alpha controla o "bloom" — não subir sem testar
    gl_FragColor = vec4(vColor, core * core * vAlpha * 0.85);
  }
`;

/* halo de luz atrás do núcleo (o brilho da logo, sem pós-processamento) */
function useHaloTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,226,244,0.95)");
    grad.addColorStop(0.18, "rgba(255,47,208,0.55)");
    grad.addColorStop(0.5, "rgba(120,30,160,0.12)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

const scrollProgress = () => {
  if (typeof window === "undefined") return 0;
  return Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 1.15)));
};
const smooth = (x) => x * x * (3 - 2 * x);

function AstroviaCore() {
  const small = useMemo(isSmall, []);
  const reduce = useMemo(reduceMotion, []);
  const geometry = useMemo(() => buildGeometry(small), [small]);
  const halo = useHaloTexture();
  const group = useRef(null);
  const haloRef = useRef(null);
  const mat = useRef(null);
  const { gl, camera, size } = useThree();
  const state = useRef({ intro: reduce ? 1 : 0, scroll: scrollProgress(), tiltX: 0, tiltY: 0 });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntro: { value: reduce ? 1 : 0 },
      uScroll: { value: 0 },
      uPixel: { value: Math.min(gl.getPixelRatio(), 2) },
      uR0: { value: ringMatrix(RINGS[0].tilt) },
      uR1: { value: ringMatrix(RINGS[1].tilt) },
      uR2: { value: ringMatrix(RINGS[2].tilt) },
      uR3: { value: ringMatrix(RINGS[3].tilt) },
      uCyan: { value: CYAN.clone() },
      uMagenta: { value: MAGENTA.clone() },
      uHot: { value: HOT.clone() },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => () => { geometry.dispose(); halo.dispose(); }, [geometry, halo]);

  // onde a logo mora na tela: à direita do título no desktop, acima no celular
  const anchor = useMemo(() => {
    const wide = size.width >= 1024;
    return wide ? { x: 3.95, y: 0.7, s: 0.82 } : size.width >= 768 ? { x: 2.4, y: 1.0, s: 0.75 } : { x: 0.9, y: 2.2, s: 0.55 };
  }, [size.width]);

  useFrame((s, delta) => {
    const st = state.current;
    const dt = Math.min(delta, 1 / 20);
    const u = mat.current?.uniforms;
    if (!u) return;

    u.uTime.value += reduce ? 0 : dt;
    // abertura: 2,6 s depois do primeiro frame
    // (pelo relógio real: em celular lento a abertura não se arrasta)
    if (st.intro < 1) {
      st.t0 ??= performance.now();
      st.intro = Math.min(1, (performance.now() - st.t0) / 2600);
    }
    u.uIntro.value = smooth(st.intro);

    // scroll com inércia (sem tranco quando o Lenis para)
    const target = reduce ? 0 : scrollProgress();
    st.scroll += (target - st.scroll) * (1 - Math.pow(0.0008, dt));
    u.uScroll.value = st.scroll;
    const dive = smooth(st.scroll);

    // inclinação pelo mouse com inércia
    st.tiltX += (pointer.y * 0.22 - st.tiltX) * (1 - Math.pow(0.02, dt));
    st.tiltY += (pointer.x * 0.35 - st.tiltY) * (1 - Math.pow(0.02, dt));

    const g = group.current;
    if (g) {
      g.position.set(anchor.x * (1 - dive), anchor.y * (1 - dive), 0);
      g.scale.setScalar(anchor.s);
      g.rotation.x = st.tiltX + dive * 0.5;
      g.rotation.y = st.tiltY + (reduce ? 0 : s.clock.elapsedTime * 0.04) + dive * 0.9;
      g.rotation.z = dive * 0.35;
    }

    // câmera: mergulha até o núcleo conforme a página desce
    camera.position.x += (pointer.x * 0.5 * (1 - dive) - camera.position.x) * (1 - Math.pow(0.001, dt));
    camera.position.y += (pointer.y * 0.35 * (1 - dive) - camera.position.y) * (1 - Math.pow(0.001, dt));
    camera.position.z = 9.5 - dive * 7.6;
    camera.lookAt(anchor.x * (1 - dive) * 0.12, anchor.y * (1 - dive) * 0.12, 0);

    if (haloRef.current) {
      const pulse = 1 + 0.05 * Math.sin(s.clock.elapsedTime * 1.7);
      haloRef.current.scale.setScalar(4.2 * pulse * (1 + dive * 2.5));
      haloRef.current.material.opacity = u.uIntro.value * (1 - dive) * 0.9;
    }
  });

  return (
    <group ref={group}>
      <sprite ref={haloRef}>
        <spriteMaterial map={halo} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0} />
      </sprite>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={mat}
          uniforms={uniforms}
          vertexShader={vertex}
          fragmentShader={fragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

function Scene() {
  return (
    <>
      <color attach="background" args={["#030305"]} />
      <AstroviaCore />
    </>
  );
}

export default function HeroScene() {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 9.5], fov: 42, near: 0.05, far: 80 }}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
