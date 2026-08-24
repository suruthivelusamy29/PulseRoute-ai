"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { io, type Socket } from "socket.io-client";
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
  const socketRef = useRef<Socket | null>(null);

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
              return (
                <div key={b.type} className={`rounded-lg p-2 text-center border ${needed ? "border-red-600 bg-red-950/40" : low ? "border-amber-800 bg-amber-950/20" : "border-gray-800 bg-gray-900/40"}`}>
                  <p className={`text-xs font-black ${needed ? "text-red-300" : low ? "text-amber-400" : "text-white"}`}>{b.type}</p>
                  <p className={`text-[10px] mt-0.5 ${low ? "text-amber-500" : "text-gray-500"}`}>{b.units}u {low ? "⚠" : ""}</p>
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
                {[["HR", `${p.heartRate}bpm`], ["BP", p.bp], ["O₂", `${p.o2}%`], ["GCS", p.gcs ?? "—"]].map(([k, v]) => (
                  <div key={k}>
                    <span className="block text-gray-700 text-[9px]">{k}</span>
                    <span className="font-mono font-bold text-white text-xs">{v}</span>
                  </div>
                ))}
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
