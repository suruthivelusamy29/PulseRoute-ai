"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere, MeshDistortMaterial, OrbitControls } from "@react-three/drei";
import type { Mesh } from "three";
import type { Severity } from "@/lib/db";

interface HeartCoreProps {
  bpm: number;
  severity: Severity;
  o2?: number;
}

function getColor(bpm: number, severity: Severity, o2 = 98): string {
  // Hypoxia override: SpO2 < 90 = deep red regardless of other vitals
  if (o2 < 90) return "#DC2626";
  // Ischemia risk: SpO2 90-94 + high BPM
  if (o2 < 95 && bpm > 100) return "#F97316";
  if (severity === "Critical" || bpm > 120) return "#EF4444";
  if (severity === "Moderate" || bpm > 100) return "#F59E0B";
  return "#10B981";
}

function getDistort(o2 = 98, severity: Severity): number {
  if (o2 < 90 || severity === "Critical") return 0.6;
  if (o2 < 95 || severity === "Moderate") return 0.45;
  return 0.28;
}

function PulsingCore({ bpm, severity, o2 = 98 }: HeartCoreProps) {
  const meshRef = useRef<Mesh>(null);
  const clock = useRef(0);
  const color = getColor(bpm, severity, o2);
  const speed = (bpm / 60) * 2;

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    clock.current += delta * speed;
    const pulse = 1 + Math.sin(clock.current * Math.PI) * 0.14;
    meshRef.current.scale.setScalar(pulse);
  });

  return (
    <Sphere ref={meshRef} args={[1.2, 64, 64]}>
      <MeshDistortMaterial
        color={color}
        distort={getDistort(o2, severity)}
        speed={speed}
        roughness={0.08}
        metalness={0.5}
      />
    </Sphere>
  );
}

export default function HeartVisual({ bpm, severity, o2 = 98 }: HeartCoreProps) {
  const color = getColor(bpm, severity, o2);
  return (
    <Canvas camera={{ position: [0, 0, 4], fov: 50 }} style={{ background: "transparent" }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[4, 4, 4]} intensity={2} color={color} />
      <pointLight position={[-4, -2, -4]} intensity={0.3} color="#ffffff" />
      <PulsingCore bpm={bpm} severity={severity} o2={o2} />
      <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={1.2} />
    </Canvas>
  );
}
