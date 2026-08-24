"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { io, type Socket } from "socket.io-client";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  AlertTriangle, Radio, User, Bed, Droplets,
  Ambulance, Activity, ChevronRight,
} from "lucide-react";
import { getAllPatients, type Severity, type BloodGroup } from "@/lib/db";

// ── Dynamic 3D imports (SSR disabled) ──────────────────────────────────────
const HeartVisual = dynamic(() => import("@/components/3d/HeartVisual"), { ssr: false,
  loading: () => <Loader text="Heart Model" /> });
const BedMapVisual = dynamic(() => import("@/components/3d/BedMapVisual"), { ssr: false,
  loading: () => <Loader text="Bed Map" /> });
const LiveVitalsChart = dynamic(() => import("@/components/3d/LiveVitalsChart"), { ssr: false,
  loading: () => <Loader text="Vitals Chart" /> });

// ── ETA urgency helpers ─────────────────────────────────────────────────────
type UrgencyLevel = "stable" | "alert" | "urgent" | "crisis";

function etaUrgency(eta: number): UrgencyLevel {
  if (eta < 2) return "crisis";
  if (eta < 5) return "urgent";
  if (eta <= 10) return "alert";
  return "stable";
}

const URGENCY_BORDER: Record<UrgencyLevel, string> = {
  stable: "border-emerald-700",
  alert:  "border-amber-500",
  urgent: "border-orange-500",
  crisis: "border-red-500 animate-pulse",
};
const URGENCY_LABEL: Record<UrgencyLevel, string> = {
  stable: "🟢 Stable Tracking",
  alert:  "🟡 Alert State",
  urgent: "🟠 Urgent Action Required",
  crisis: "🔴 Immediate Crisis Canopy",
};
const URGENCY_TEXT: Record<UrgencyLevel, string> = {
  stable: "text-emerald-400",
  alert:  "text-amber-400",
  urgent: "text-orange-400",
  crisis: "text-red-400",
};

function buildChecklist(p: LivePatient): string[] {
  const critical = p.o2 < 90 || p.heartRate > 130;
  if (critical) return [
    "• Stage Trauma Bay 2 immediately",
    "• Pre-route O-Negative cross-match blood reserves",
    "• Disseminate alert to Trauma Core Response Group",
    `• Prepare airway management — SpO₂ at ${p.o2}%`,
    `• Cardiac monitoring on standby — HR ${p.heartRate} bpm`,
  ];
  return [
    "• Confirm receiving bay assignment",
    "• Verify IV access and fluid prep",
    "• Notify on-call physician of inbound",
    "• Stage standard trauma assessment kit",
    "• Confirm blood type on file if available",
  ];
}

// ── Telemetry 3D scene ──────────────────────────────────────────────────────
function AmbulanceNode({ eta }: { eta: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef  = useRef<THREE.MeshStandardMaterial>(null);

  // Path: outer grid edge → hospital center. t=0 → far, t=1 → center.
  const maxEta = 15;
  const t = useMemo(() => Math.max(0, Math.min(1, 1 - eta / maxEta)), [eta]);

  // Cubic bezier control points
  const curve = useMemo(() => new THREE.CubicBezierCurve3(
    new THREE.Vector3(-7, 0, -7),
    new THREE.Vector3(-3, 0.5, -2),
    new THREE.Vector3(2, 0.5, 3),
    new THREE.Vector3(0, 0, 0),
  ), []);

  useFrame(({ clock }) => {
    if (!meshRef.current || !matRef.current) return;
    const pos = curve.getPoint(t);
    meshRef.current.position.lerp(pos, 0.08);
    meshRef.current.rotation.y = clock.getElapsedTime() * 1.2;
    const crisis = eta < 2;
    const flash = crisis ? Math.abs(Math.sin(clock.getElapsedTime() * 6)) : 1;
    matRef.current.emissive.setHex(crisis ? 0xff1111 : 0xff4400);
    matRef.current.emissiveIntensity = flash * (crisis ? 2.5 : 1.2);
  });

  return (
    <mesh ref={meshRef}>
      <coneGeometry args={[0.22, 0.5, 4]} />
      <meshStandardMaterial ref={matRef} color={eta < 2 ? "#ff2222" : "#ff6600"} emissive="#ff2200" emissiveIntensity={1.2} />
    </mesh>
  );
}

function RadarRing() {
  const meshRef = useRef<THREE.Mesh>(null);
  const PERIOD = 3;
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = (clock.getElapsedTime() % PERIOD) / PERIOD;
    const s = t * 15;
    meshRef.current.scale.set(s, 1, s);
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = 0.15 * (1 - t);
  });
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <ringGeometry args={[0.9, 1.0, 64]} />
      <meshBasicMaterial color="#00ffff" transparent opacity={0.15} side={THREE.DoubleSide} />
    </mesh>
  );
}

function TelemetryScene({ eta }: { eta: number }) {
  const pathRef = useRef<THREE.Line | null>(null);

  const curve = useMemo(() => new THREE.CubicBezierCurve3(
    new THREE.Vector3(-7, 0, -7),
    new THREE.Vector3(-3, 0.5, -2),
    new THREE.Vector3(2, 0.5, 3),
    new THREE.Vector3(0, 0, 0),
  ), []);

  const pathPoints = useMemo(() => curve.getPoints(60), [curve]);
  const pathGeo    = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(pathPoints);
    return g;
  }, [pathPoints]);

  useFrame(({ clock }) => {
    if (pathRef.current) {
      (pathRef.current.material as THREE.LineBasicMaterial).opacity =
        0.5 + 0.3 * Math.abs(Math.sin(clock.getElapsedTime() * 1.5));
    }
  });

  // Grid lines
  const gridLines = useMemo(() => {
    const lines: THREE.Vector3[][] = [];
    for (let i = -8; i <= 8; i += 2) {
      lines.push([new THREE.Vector3(i, 0, -8), new THREE.Vector3(i, 0, 8)]);
      lines.push([new THREE.Vector3(-8, 0, i), new THREE.Vector3(8, 0, i)]);
    }
    return lines;
  }, []);

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 4, 0]} intensity={1.5} color="#00ffff" />

      {/* Neon grid */}
      {gridLines.map((pts, i) => {
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        return (
          <primitive key={i} object={
            new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x003333, transparent: true, opacity: 0.5 }))
          } />
        );
      })}

      {/* Route path */}
      <primitive ref={pathRef} object={
        new THREE.Line(pathGeo, new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.7 }))
      } />

      {/* Hospital center node */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={1.5} />
      </mesh>

      {/* Ambulance unit */}
      <AmbulanceNode eta={eta} />

      {/* Radar scanning ring */}
      <RadarRing />

      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.4} />
    </>
  );
}

function Loader({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-gray-700 text-xs">
      Loading {text}...
    </div>
  );
}

// ── Types ───────────────────────────────────────────────────────────────────
interface LivePatient {
  id: number; name: string; heartRate: number; bp: string; o2: number;
  severity: Severity; esi?: number; mechanism?: string;
  age?: number; sex?: string; bloodGroup?: BloodGroup;
  allergies?: string; conditions?: string; medications?: string;
  eta?: number; gpsStatus?: string; respRate?: number;
  temperature?: number; gcs?: number; redAlert?: boolean;
  chunkProgress?: { received: number; total: number };
}

interface VitalsPoint { t: number; bpm: number; o2: number; }

interface BloodStock { type: BloodGroup; units: number; }

type BedStatus = "available" | "occupied" | "reserved";

interface Bed {
  id: string;
  label: string;
  status: BedStatus;
}

// ── Static resource state (would come from hospital DB in production) ───────
const INITIAL_BEDS: Bed[] = [
  { id: "b1", label: "Bay 1", status: "occupied" },
  { id: "b2", label: "Bay 2", status: "available" },
  { id: "b3", label: "Bay 3", status: "available" },
  { id: "b4", label: "Bay 4", status: "occupied" },
  { id: "b5", label: "ICU 1", status: "available" },
  { id: "b6", label: "ICU 2", status: "occupied" },
  { id: "b7", label: "Trauma 1", status: "available" },
  { id: "b8", label: "Trauma 2", status: "available" },
];

const INITIAL_BLOOD: BloodStock[] = [
  { type: "O-", units: 4 }, { type: "O+", units: 12 },
  { type: "A+", units: 8 }, { type: "A-", units: 3 },
  { type: "B+", units: 6 }, { type: "B-", units: 2 },
  { type: "AB+", units: 5 }, { type: "AB-", units: 1 },
];

const SEVERITY_BORDER: Record<Severity, string> = {
  Mild: "border-emerald-800", Moderate: "border-amber-700", Critical: "border-red-700",
};
const SEVERITY_BG: Record<Severity, string> = {
  Mild: "bg-emerald-950/20", Moderate: "bg-amber-950/30", Critical: "bg-red-950/40",
};
const SEVERITY_BADGE: Record<Severity, string> = {
  Mild: "bg-emerald-800 text-emerald-100",
  Moderate: "bg-amber-800 text-amber-100",
  Critical: "bg-red-800 text-red-100",
};

export default function HospitalPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<LivePatient[]>([]);
  const [selected, setSelected] = useState<LivePatient | null>(null);
  const [connected, setConnected] = useState(false);
  const [criticalAlert, setCriticalAlert] = useState<string | null>(null);
  const [beds, setBeds] = useState<Bed[]>(INITIAL_BEDS);
  const [blood] = useState<BloodStock[]>(INITIAL_BLOOD);
  const [vitalsHistory, setVitalsHistory] = useState<VitalsPoint[]>([]);
  const [activeView, setActiveView] = useState<"heart" | "beds">("heart");
  const socketRef   = useRef<Socket | null>(null);
  const etaTickRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const [liveEta, setLiveEta] = useState<number | null>(null);
  const [vitalFlash, setVitalFlash] = useState<Record<string, boolean>>({});

  const refreshPatientsFromDb = useCallback(async () => {
    const all = await getAllPatients();
    setPatients(all.map((p) => ({ ...p, id: p.id ?? 0, redAlert: false })) as LivePatient[]);
  }, []);

  // Reserve a bed when a new patient arrives
  const reserveNextBed = useCallback(() => {
    setBeds((prev) => {
      const idx = prev.findIndex((b) => b.status === "available");
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], status: "reserved" };
      return next;
    });
  }, []);

  // Append vitals point for selected patient
  const pushVitals = useCallback((p: LivePatient) => {
    setVitalsHistory((prev) => [
      ...prev.slice(-120),
      { t: Date.now(), bpm: p.heartRate, o2: p.o2 },
    ]);
  }, []);

  useEffect(() => {
    refreshPatientsFromDb();

    const interval = window.setInterval(() => {
      refreshPatientsFromDb();
    }, 2000);

    let socket: ReturnType<typeof io> | null = null;
    const tid = setTimeout(() => {
      socket = io("http://localhost:4000", {
        transports: ["polling", "websocket"],
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        timeout: 5000,
      });
      socketRef.current = socket;

      socket.on("connect", () => setConnected(true));
      socket.on("disconnect", () => setConnected(false));
      socket.on("connect_error", (err) => {
        console.warn("[PulseRoute] Socket error:", err.message);
        setConnected(false);
      });

      socket.on("new-patient", (data: LivePatient) => {
        setPatients((prev) => {
          const exists = prev.find((p) => p.id === data.id);
          if (exists) return prev.map((p) => (p.id === data.id ? { ...p, ...data } : p));
          return [data, ...prev];
        });
        setSelected((prev) => {
          if (!prev) pushVitals(data);
          return prev ?? data;
        });
        reserveNextBed();
        if (data.severity === "Critical" || data.redAlert) {
          setCriticalAlert(data.name);
          setTimeout(() => setCriticalAlert(null), 8000);
        }
      });

      socket.on("chunk-progress", (data: { patientId: number; received: number; total: number }) => {
        setPatients((prev) =>
          prev.map((p) =>
            p.id === data.patientId
              ? { ...p, chunkProgress: { received: data.received, total: data.total } }
              : p
          )
        );
      });

      socket.on("vitals:stream", (data: { patientId: number; bpm: number; o2: number }) => {
        setSelected((prev) => {
          if (prev?.id === data.patientId) {
            const updated = { ...prev, heartRate: data.bpm, o2: data.o2 };
            pushVitals(updated);
            return updated;
          }
          return prev;
        });
        const key = `${data.patientId}`;
        setVitalFlash((prev) => ({ ...prev, [key]: true }));
        setTimeout(() => setVitalFlash((prev) => ({ ...prev, [key]: false })), 600);
      });

      socket.on("hospital:resource_update", (data: { bedId: string; status: "available" | "occupied" | "reserved" }) => {
        setBeds((prev) => prev.map((b) => b.id === data.bedId ? { ...b, status: data.status } : b));
      });
    }, 0);

    return () => {
      window.clearInterval(interval);
      clearTimeout(tid);
      if (socket) { socket.removeAllListeners(); socket.disconnect(); }
    };
  }, [refreshPatientsFromDb, reserveNextBed, pushVitals]);

  // Update vitals history when selected patient changes
  useEffect(() => {
    if (selected) setVitalsHistory([{ t: Date.now(), bpm: selected.heartRate, o2: selected.o2 }]);
  }, [selected?.id]); // eslint-disable-line

  // ── ETA live countdown: pick the most urgent inbound patient ───────────────
  // Separate the "which patient is inbound" check from the tick so that the
  // 2-second DB poll doesn't reset the countdown on every refresh.
  const minEtaRef = useRef<number | null>(null);

  useEffect(() => {
    const inbound = patients.filter((p) => p.eta && p.eta > 0);
    if (inbound.length === 0) {
      minEtaRef.current = null;
      setLiveEta(null);
      if (etaTickRef.current) { clearInterval(etaTickRef.current); etaTickRef.current = null; }
      return;
    }
    const incoming = Math.min(...inbound.map((p) => p.eta!));
    // Only (re)start the timer when a genuinely new / different patient arrives
    if (minEtaRef.current === incoming) return;
    minEtaRef.current = incoming;
    if (etaTickRef.current) clearInterval(etaTickRef.current);
    setLiveEta(incoming);
    etaTickRef.current = setInterval(() => {
      setLiveEta((prev) => (prev !== null && prev > 0 ? +(prev - 1 / 60).toFixed(3) : prev));
    }, 1000);
    return () => { if (etaTickRef.current) { clearInterval(etaTickRef.current); etaTickRef.current = null; } };
  }, [patients]);

  const availBeds = beds.filter((b) => b.status === "available").length;
  const icuFree = beds.filter((b) => b.label.startsWith("ICU") && b.status === "available").length;
  const traumaOpen = beds.filter((b) => b.label.startsWith("Trauma") && b.status === "available").length;

  return (
    <div className="min-h-screen bg-[#0a0a0c] p-4 md:p-5">
      {/* ── Critical Alert Banner ── */}
      {criticalAlert && (
        <div className="animate-flash fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-red-700 py-3 text-white font-black text-sm shadow-2xl">
          <AlertTriangle size={16} />
          ⚠ CRITICAL INCOMING: {criticalAlert.toUpperCase()} — PREPARE TRAUMA BAY
          <AlertTriangle size={16} />
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">
            Pulse<span className="text-red-500">Route</span>
          </h1>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mt-0.5">Hospital ER Dashboard</p>
        </div>
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold border ${connected ? "bg-emerald-950/50 text-emerald-400 border-emerald-800" : "bg-gray-900 text-gray-600 border-gray-800"}`}>
          <Radio size={11} className={connected ? "animate-pulse" : ""} />
          {connected ? "LIVE FEED CONNECTED" : "AWAITING CONNECTION"}
        </div>
      </div>

      {/* ── Resource Metrics Banner ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {/* Bed Availability */}
        <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bed size={13} className="text-blue-400" />
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">ER Beds</span>
          </div>
          <p className="text-2xl font-black text-white">{availBeds}<span className="text-sm text-gray-600">/{beds.length}</span></p>
          <p className="text-[10px] text-gray-600 mt-1">Available</p>
          <div className="mt-2 flex gap-1">
            {beds.map((b) => (
              <div key={b.id} className={`h-1.5 flex-1 rounded-full ${b.status === "available" ? "bg-emerald-500" : b.status === "reserved" ? "bg-amber-500" : "bg-red-600"}`} />
            ))}
          </div>
        </div>

        {/* ICU & Trauma */}
        <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={13} className="text-purple-400" />
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Critical Units</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">ICU Free</span>
              <span className={`font-bold ${icuFree > 0 ? "text-emerald-400" : "text-red-400"}`}>{icuFree}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Trauma Open</span>
              <span className={`font-bold ${traumaOpen > 0 ? "text-emerald-400" : "text-red-400"}`}>{traumaOpen}</span>
            </div>
            {beds.filter((b) => b.status === "available").map((b) => (
              <div key={b.id} className="text-[10px] text-emerald-600">{b.label} OPEN</div>
            ))}
          </div>
        </div>

        {/* Blood Bank */}
        <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 p-4 md:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <Droplets size={13} className="text-red-400" />
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Blood Bank Reserve</span>
            {selected?.bloodGroup && selected.bloodGroup !== "Unknown" && (
              <span className="ml-auto text-[10px] bg-red-900/50 border border-red-800 text-red-300 rounded-full px-2 py-0.5">
                Patient needs: {selected.bloodGroup}
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {blood.map((b) => {
              const needed = selected?.bloodGroup === b.type;
              const low = b.units <= 3;
              const MAX_UNITS = 15;
              const fillPct = Math.min(100, Math.round((b.units / MAX_UNITS) * 100));
              const fillColor = needed
                ? "rgba(220,38,38,0.55)"
                : low
                ? "rgba(217,119,6,0.45)"
                : "rgba(5,150,105,0.35)";
              return (
                <div
                  key={b.type}
                  className={`relative rounded-lg overflow-hidden text-center border ${
                    needed ? "border-red-600" : low ? "border-amber-800" : "border-gray-800"
                  }`}
                  style={{ minHeight: 56 }}
                >
                  {/* Liquid fill layer */}
                  <div
                    className="absolute bottom-0 left-0 right-0 transition-all duration-1000"
                    style={{
                      height: `${fillPct}%`,
                      background: fillColor,
                      animation: "waveShift 3s ease-in-out infinite",
                    }}
                  />
                  {/* Wave shimmer overlay */}
                  <div
                    className="absolute bottom-0 left-0 right-0 pointer-events-none"
                    style={{
                      height: `${fillPct}%`,
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 60%)",
                      animation: "waveShift 2s ease-in-out infinite alternate",
                    }}
                  />
                  <div className="relative z-10 px-2 py-2">
                    <p className={`text-xs font-black ${
                      needed ? "text-red-200" : low ? "text-amber-300" : "text-white"
                    }`}>{b.type}</p>
                    <p className={`text-[10px] mt-0.5 ${
                      low ? "text-amber-400" : "text-gray-400"
                    }`}>{b.units}u {low ? "⚠" : ""}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Ambulance ETA List ── */}
      {patients.filter((p) => p.eta && p.eta > 0).length > 0 && (
        <div className="mb-5 rounded-2xl bg-[#0d0d10] border border-gray-800/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Ambulance size={13} className="text-amber-400" />
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Inbound Ambulances</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {patients.filter((p) => p.eta).map((p) => (
              <div key={p.id} className={`flex-shrink-0 flex items-center gap-3 rounded-xl border px-3 py-2 ${SEVERITY_BORDER[p.severity]} ${SEVERITY_BG[p.severity]}`}>
                <Ambulance size={14} className="text-amber-400" />
                <div>
                  <button
                    type="button"
                    onClick={() => p.id && router.push(`/patient/${p.id}`)}
                    className="text-left text-xs font-bold text-white transition-all hover:text-red-300"
                  >
                    {p.name}
                  </button>
                  <p className="text-[10px] text-gray-500">{p.gpsStatus || "En Route"}</p>
                </div>
                <div className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEVERITY_BADGE[p.severity]}`}>
                  {p.eta}m
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Readiness Command + Telemetry Grid ── */}
      {(() => {
        const inboundPatient = patients.find((p) => p.eta && p.eta > 0) ?? null;
        const displayEta = liveEta ?? inboundPatient?.eta ?? null;
        const urgency: UrgencyLevel = displayEta !== null ? etaUrgency(displayEta) : "stable";
        const checklist = inboundPatient ? buildChecklist(inboundPatient) : null;

        return (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">

            {/* 🚨 Readiness Command Card */}
            <div className={`rounded-2xl bg-[#0d0d10] border-2 p-5 flex flex-col gap-3 transition-all duration-700 ${
              inboundPatient ? URGENCY_BORDER[urgency] : "border-gray-800"
            }`}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">🚨 Inbound Readiness Command</p>
                {inboundPatient && displayEta !== null && (
                  <span className={`text-xs font-black ${URGENCY_TEXT[urgency]}`}>
                    {URGENCY_LABEL[urgency]} · ETA {Math.max(0, displayEta).toFixed(1)}m
                  </span>
                )}
              </div>

              {inboundPatient && displayEta !== null ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-black text-white">{inboundPatient.name}</p>
                      <p className="text-[10px] text-gray-500">
                        {inboundPatient.age ? `${inboundPatient.age}y · ` : ""}
                        {inboundPatient.mechanism ?? "Unknown mechanism"} · ESI {inboundPatient.esi ?? "—"}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                      {([["HR", `${inboundPatient.heartRate}`, inboundPatient.heartRate > 130],
                        ["SpO₂", `${inboundPatient.o2}%`, inboundPatient.o2 < 90],
                        ["BP", inboundPatient.bp, false]] as [string, string, boolean][]).map(([k, v, warn]) => (
                        <div key={k} className={`rounded-lg px-2 py-1 border ${
                          warn ? "border-red-700 bg-red-950/40" : "border-gray-800 bg-gray-900/40"
                        }`}>
                          <span className="block text-gray-600 text-[9px]">{k}</span>
                          <span className={`font-black text-xs ${warn ? "text-red-300" : "text-white"}`}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-2">Preparation Action Checklist</p>
                    <ul className="space-y-1">
                      {checklist!.map((item) => (
                        <li key={item} className={`text-xs ${
                          item.includes("Trauma") || item.includes("O-Negative") || item.includes("Trauma Core")
                            ? "text-red-300 font-semibold" : "text-gray-400"
                        }`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center py-8">
                  <p className="text-xs text-gray-600 italic">Scanning airspace for inbound emergency transponders...</p>
                </div>
              )}

              <p className="text-[10px] italic text-gray-600 border-t border-gray-800 pt-2 mt-auto">
                Decision Support Matrix Only — Final operational deployment remains under direct medical officer supervision.
              </p>
            </div>

            {/* 📡 Live Telemetry Grid */}
            <div className="rounded-2xl bg-[#060810] border border-cyan-900/40 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-cyan-900/30">
                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-500">📡 Live Inbound Telemetry Grid</p>
                {inboundPatient && displayEta !== null ? (
                  <span className="flex items-center gap-2 text-[10px] font-black font-mono tracking-widest text-cyan-300 bg-cyan-950/50 border border-cyan-800/60 rounded-full px-3 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    TRACKING: {inboundPatient.name.toUpperCase()} • ETA {Math.max(0, displayEta).toFixed(1)} MIN
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-600">No active transponder</span>
                )}
              </div>
              <div className="flex-1" style={{ height: 240 }}>
                {displayEta !== null ? (
                  <Canvas camera={{ position: [0, 10, 12], fov: 45 }} style={{ background: "#060810" }}>
                    <TelemetryScene eta={displayEta} />
                  </Canvas>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-xs text-gray-700 italic">Scanning airspace for inbound emergency transponders...</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        );
      })()}

      {/* ── Main Split View ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        {/* Patient Cards */}
        <div className="xl:col-span-2 space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
          {patients.length === 0 && (
            <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 p-10 text-center text-gray-700 text-xs">
              Awaiting incoming patients...
            </div>
          )}
          {patients.map((p) => (
            <div key={p.id} role="button" tabIndex={0} onClick={() => { setSelected(p); setVitalsHistory([{ t: Date.now(), bpm: p.heartRate, o2: p.o2 }]); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(p); setVitalsHistory([{ t: Date.now(), bpm: p.heartRate, o2: p.o2 }]); } }}
              className={`w-full text-left rounded-2xl border p-4 transition-all hover:brightness-110 ${SEVERITY_BORDER[p.severity]} ${SEVERITY_BG[p.severity]} ${selected?.id === p.id ? "ring-1 ring-white/10" : ""}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <User size={13} className="text-gray-500" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (p.id) router.push(`/patient/${p.id}`);
                    }}
                    className="font-bold text-white text-sm transition-all hover:text-red-300"
                  >
                    {p.name}
                  </button>
                  {p.age && <span className="text-[10px] text-gray-600">{p.age}y {p.sex}</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  {p.esi && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${p.esi <= 2 ? "bg-red-900 text-red-300" : p.esi === 3 ? "bg-amber-900 text-amber-300" : "bg-gray-800 text-gray-400"}`}>
                      ESI {p.esi}
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${SEVERITY_BADGE[p.severity]}`}>
                    {p.severity}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-[11px] text-gray-500 mb-2">
                {([["HR", `${p.heartRate}bpm`], ["BP", p.bp], ["O₂", `${p.o2}%`], ["GCS", String(p.gcs ?? "—")]] as [string, string][]).map(([k, v]) => {
                  const isLive = (k === "HR" || k === "BP") && vitalFlash[`${p.id}`];
                  return (
                    <div key={k} className="relative">
                      <span className="block text-gray-700 text-[9px]">{k}</span>
                      <span className={`font-mono font-bold text-white text-xs transition-colors duration-150 ${
                        isLive ? "text-emerald-300" : "text-white"
                      }`}>{v}</span>
                      {isLive && (
                        <span className="absolute inset-0 rounded animate-ping bg-emerald-500/20 pointer-events-none" />
                      )}
                    </div>
                  );
                })}
              </div>

              {p.mechanism && (
                <p className="text-[10px] text-gray-600 mb-1.5">⚡ {p.mechanism}{p.bloodGroup ? ` · ${p.bloodGroup}` : ""}</p>
              )}

              {/* Chunk progress */}
              {p.chunkProgress && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                    <span>Scan Upload</span>
                    <span>Chunk {p.chunkProgress.received}/{p.chunkProgress.total}</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-gray-800">
                    <div className="h-1 rounded-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${(p.chunkProgress.received / p.chunkProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end mt-2">
                <ChevronRight size={12} className="text-gray-700" />
              </div>
            </div>
          ))}
        </div>

        {/* Right Panel: 3D + Charts */}
        <div className="xl:col-span-3 space-y-4">
          {selected ? (
            <>
              {/* Patient header */}
              <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-wider">Monitoring</p>
                  <p className="font-black text-white">{selected.name}
                    {selected.age && <span className="text-gray-500 font-normal text-sm ml-2">{selected.age}y · {selected.sex}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {[["HR", `${selected.heartRate}`], ["BP", selected.bp], ["O₂", `${selected.o2}%`],
                    ["RR", selected.respRate ? `${selected.respRate}` : "—"],
                    ["Temp", selected.temperature ? `${selected.temperature}°` : "—"],
                    ["GCS", selected.gcs ?? "—"]].map(([k, v]) => (
                    <div key={k} className="text-center">
                      <span className="block text-gray-700 text-[9px]">{k}</span>
                      <span className="font-mono font-bold text-white">{v}</span>
                    </div>
                  ))}
                  <span className={`rounded-full px-2 py-0.5 font-bold self-center ${SEVERITY_BADGE[selected.severity]}`}>
                    {selected.severity}
                  </span>
                </div>
              </div>

              {/* View toggle */}
              <div className="flex gap-2">
                {(["heart", "beds"] as const).map((v) => (
                  <button key={v} onClick={() => setActiveView(v)}
                    className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all border ${activeView === v ? "bg-gray-700 border-gray-600 text-white" : "bg-transparent border-gray-800 text-gray-600 hover:border-gray-700"}`}>
                    {v === "heart" ? "❤ Heart Model" : "🏥 Bed Map"}
                  </button>
                ))}
              </div>

              {/* 3D View */}
              <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 overflow-hidden" style={{ height: 280 }}>
                {activeView === "heart"
                  ? <HeartVisual bpm={selected.heartRate} severity={selected.severity} o2={selected.o2} />
                  : <BedMapVisual beds={beds} />}
              </div>

              {/* Live Vitals Chart */}
              <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 p-4">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-2">Live Vitals Stream</p>
                <LiveVitalsChart points={vitalsHistory} />
              </div>

              {/* Clinical details */}
              {(selected.conditions || selected.allergies || selected.medications) && (
                <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 p-4 grid grid-cols-3 gap-3 text-xs">
                  {[["Conditions", selected.conditions], ["Allergies", selected.allergies], ["Medications", selected.medications]].map(([k, v]) =>
                    v ? (
                      <div key={k}>
                        <p className="text-[9px] text-gray-600 uppercase tracking-wider mb-1">{k}</p>
                        <p className="text-gray-300">{v}</p>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 flex items-center justify-center" style={{ height: 320 }}>
              <p className="text-gray-700 text-sm">Select a patient to view live monitoring</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
