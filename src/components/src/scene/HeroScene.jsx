import React, { useEffect, useMemo, useRef, Suspense } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { pointer } from "../lib/pointer";

/* ============================================================
   CENA 3D DA HERO — three + @react-three/fiber
   Sem @react-three/drei: environment, partículas e vidro são
   construídos com o core do three.js.
   ============================================================ */

const NEON = new THREE.Color("#22d3ee"); // Ciano
const PLASMA = new THREE.Color("#ff2fd0"); // Magenta

/* ------------------------------------------------------------
   ENVIRONMENT PROCEDURAL (canvas 2D → PMREM)
   É o que dá reflexo ciano/magenta no vidro sem carregar HDRI.
------------------------------------------------------------ */
function NeonEnvironment() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#050509";
    ctx.fillRect(0, 0, 512, 256);

    const blob = (x, y, r, color) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 256);
    };

    blob(110, 80, 175, "rgba(34,211,238,0.95)");
    blob(395, 165, 185, "rgba(255,47,208,0.80)");
    blob(256, 18, 120, "rgba(255,255,255,0.35)");

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    if ("colorSpace" in texture && THREE.SRGBColorSpace) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }

    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const envMap = pmrem.fromEquirectangular(texture).texture;
    scene.environment = envMap;

    return () => {
      scene.environment = null;
      envMap.dispose();
      pmrem.dispose();
      texture.dispose();
    };
  }, [gl, scene]);

  return null;
}

/* ------------------------------------------------------------
   MALHA DE PARTÍCULAS
------------------------------------------------------------ */
const PARTICLE_COUNT = 2600;

const particleVertex = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform vec2  uPointer;

  attribute float aScale;
  attribute float aMix;
  attribute float aSeed;

  varying float vMix;
  varying float vAlpha;

  void main() {
    vMix = aMix;

    vec3 p = position;
    float t = uTime * 0.22 + aSeed * 6.2831;

    p.x += sin(t + p.z * 0.55) * 0.42;
    p.y += cos(t * 1.15 + p.x * 0.45) * 0.42;
    p.z += sin(t * 0.75 + p.y * 0.35) * 0.42;

    // reação sutil ao mouse
    p.x += uPointer.x * 0.55 * (1.0 - aScale * 0.4);
    p.y += uPointer.y * 0.55 * (1.0 - aScale * 0.4);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(-mv.z, 0.001);

    vAlpha = smoothstep(26.0, 4.0, dist);
    gl_PointSize = uSize * aScale * (9.0 / dist);
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFragment = /* glsl */ `
  uniform vec3 uNeon;
  uniform vec3 uPlasma;

  varying float vMix;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;

    float core = smoothstep(0.5, 0.0, d);
    vec3 color = mix(uNeon, uPlasma, vMix);

    // ATENÇÃO: additive blending. Subir este alpha estoura a cena em branco.
    gl_FragColor = vec4(color, core * core * vAlpha * 0.72);
  }
`;

function ParticleField() {
  const pointsRef = useRef(null);
  const materialRef = useRef(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const scales = new Float32Array(PARTICLE_COUNT);
    const mixes = new Float32Array(PARTICLE_COUNT);
    const seeds = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const radius = 3.2 + Math.pow(Math.random(), 0.6) * 7.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.62;
      positions[i * 3 + 2] = radius * Math.cos(phi);

      scales[i] = 0.35 + Math.random() * 1.35;
      mixes[i] = Math.pow(Math.random(), 1.8); // maioria ciano, poucas magenta
      seeds[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    geo.setAttribute("aMix", new THREE.BufferAttribute(mixes, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    return geo;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: 4.4 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uNeon: { value: NEON.clone() },
      uPlasma: { value: PLASMA.clone() },
    }),
    []
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    const u = materialRef.current?.uniforms;
    if (u) {
      u.uTime.value += delta;
      u.uPointer.value.x += (pointer.x - u.uPointer.value.x) * 0.04;
      u.uPointer.value.y += (pointer.y - u.uPointer.value.y) * 0.04;
    }
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.035;
      pointsRef.current.rotation.x =
        Math.sin(state.clock.elapsedTime * 0.12) * 0.12;
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={particleVertex}
        fragmentShader={particleFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ------------------------------------------------------------
   FORMAS DE VIDRO (meshPhysicalMaterial · transmission)
------------------------------------------------------------ */
function GlassShape({ geometry, position, scale = 1, speed = 1, offset = 0 }) {
  const ref = useRef(null);

  useFrame((state, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime * speed + offset;

    mesh.rotation.x += delta * 0.18 * speed;
    mesh.rotation.y += delta * 0.24 * speed;
    mesh.position.y = position[1] + Math.sin(t * 0.7) * 0.28;
    mesh.position.x = position[0] + Math.cos(t * 0.5) * 0.16 + pointer.x * 0.32;
    mesh.position.z = position[2] + pointer.y * 0.18;
  });

  return (
    <mesh ref={ref} position={position} scale={scale} geometry={geometry}>
      <meshPhysicalMaterial
        color="#ffffff"
        transmission={1}
        thickness={1.35}
        roughness={0.08}
        ior={1.46}
        metalness={0}
        clearcoat={1}
        clearcoatRoughness={0.12}
        iridescence={1}
        iridescenceIOR={1.34}
        iridescenceThicknessRange={[100, 640]}
        envMapIntensity={1.6}
        transparent
      />
    </mesh>
  );
}

function GlassCluster() {
  const groupRef = useRef(null);

  const geometries = useMemo(
    () => ({
      ico: new THREE.IcosahedronGeometry(1, 0),
      octa: new THREE.OctahedronGeometry(1, 0),
      torus: new THREE.TorusGeometry(0.72, 0.26, 24, 64),
      wire: new THREE.IcosahedronGeometry(6.4, 1),
    }),
    []
  );

  useEffect(
    () => () => Object.values(geometries).forEach((g) => g.dispose()),
    [geometries]
  );

  useFrame((state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.05;
  });

  return (
    <group ref={groupRef}>
      <GlassShape
        geometry={geometries.ico}
        position={[-3.15, 0.6, -0.5]}
        scale={1.15}
        speed={0.9}
      />
      <GlassShape
        geometry={geometries.torus}
        position={[3.35, -0.9, 0.4]}
        scale={1.25}
        speed={1.15}
        offset={2.1}
      />
      <GlassShape
        geometry={geometries.octa}
        position={[2.35, 1.85, -2.2]}
        scale={0.85}
        speed={0.75}
        offset={4.4}
      />
      <GlassShape
        geometry={geometries.ico}
        position={[-2.1, -2.05, -1.6]}
        scale={0.6}
        speed={1.35}
        offset={1.2}
      />

      {/* arquitetura de dados */}
      <mesh geometry={geometries.wire}>
        <meshBasicMaterial
          color="#22d3ee"
          wireframe
          transparent
          opacity={0.045}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------
   CÂMERA COM PARALAXE
------------------------------------------------------------ */
function Rig() {
  useFrame((state, delta) => {
    const damp = 1 - Math.pow(0.001, delta);
    state.camera.position.x +=
      (pointer.x * 0.85 - state.camera.position.x) * damp;
    state.camera.position.y +=
      (pointer.y * 0.55 - state.camera.position.y) * damp;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

function Scene() {
  return (
    <>
      <color attach="background" args={["#030305"]} />
      <fog attach="fog" args={["#030305", 9, 26]} />

      <NeonEnvironment />

      <ambientLight intensity={0.35} />
      <pointLight position={[-6, 3, 4]} intensity={55} color="#22d3ee" />
      <pointLight position={[6, -3, 3]} intensity={45} color="#ff2fd0" />
      <directionalLight position={[0, 6, 6]} intensity={0.6} />

      <ParticleField />
      <GlassCluster />
      <Rig />
    </>
  );
}

export default function HeroScene() {
  return (
    <Canvas
      dpr={[1, 1.9]}
      camera={{ position: [0, 0, 8.5], fov: 42, near: 0.1, far: 60 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
