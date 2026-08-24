"use client";

import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Box, Text, OrbitControls, Grid } from "@react-three/drei";
import type { Mesh } from "three";
import { ArrowLeft, Heart, Thermometer, Wind, Droplets, FlaskConical, ClipboardList, User } from "lucide-react";

export type BedStatus = "available" | "occupied" | "reserved";

export interface Bed {
  id: string;
  label: string;
  status: BedStatus;
  patient?: BedPatient;
}

export interface BedPatient {
  name: string;
  mrn: string;
  age: number;
  sex: string;
  bloodGroup: string;
  admitTime: string;
  physician: string;
  // Vitals
  heartRate: number;
  o2: number;
  bp: string;
  temperature: number;
  respRate: number;
  // Labs
  hemoglobin: string;
  wbc: string;
  troponin: string;
  lactate: string;
  // Clinical
  chiefComplaint: string;
  triageLevel: string;
  allergies: string[];
  fieldNotes: string;
}

const STATUS_COLOR: Record<BedStatus, string> = {
  available: "#10B981",
  occupied: "#EF4444",
  reserved: "#F59E0B",
};

const STATUS_EMISSIVE: Record<BedStatus, number> = {
  available: 0.12,
  occupied: 0.2,
  reserved: 0.5,
};

// ── Default demo beds ────────────────────────────────────────────────────────
const DEMO_BEDS: Bed[] = [
  {
    id: "b1", label: "Bay 1", status: "occupied",
    patient: {
      name: "Marcus Reyes", mrn: "MRN-00421", age: 54, sex: "Male", bloodGroup: "O+",
      admitTime: "08:42 AM", physician: "Dr. Priya Nair",
      heartRate: 118, o2: 91, bp: "158/96", temperature: 38.4, respRate: 22,
      hemoglobin: "9.2 g/dL", wbc: "14.3 ×10³/µL", troponin: "0.82 ng/mL", lactate: "3.1 mmol/L",
      chiefComplaint: "Chest pain radiating to left arm, diaphoresis",
      triageLevel: "ESI 2 — Emergent",
      allergies: ["Penicillin", "Aspirin"],
      fieldNotes: "Patient found unresponsive at scene. GCS 12 on arrival. Suspected STEMI. IV access established en route.",
    },
  },
  {
    id: "b2", label: "Bay 2", status: "available",
  },
  {
    id: "b3", label: "Bay 3", status: "reserved",
    patient: {
      name: "Incoming — ETA 8 min", mrn: "MRN-PENDING", age: 0, sex: "Unknown", bloodGroup: "Unknown",
      admitTime: "—", physician: "On Call",
      heartRate: 134, o2: 88, bp: "90/60", temperature: 36.1, respRate: 28,
      hemoglobin: "—", wbc: "—", troponin: "—", lactate: "—",
      chiefComplaint: "MVA — polytrauma, suspected internal bleeding",
      triageLevel: "ESI 1 — Immediate",
      allergies: [],
      fieldNotes: "Dispatched via PulseRoute Red Alert. Paramedic reports loss of consciousness at scene. Airway secured.",
    },
  },
  { id: "b4", label: "Bay 4", status: "occupied",
    patient: {
      name: "Lena Hoffman", mrn: "MRN-00398", age: 31, sex: "Female", bloodGroup: "A-",
      admitTime: "07:15 AM", physician: "Dr. James Okafor",
      heartRate: 102, o2: 95, bp: "130/84", temperature: 37.9, respRate: 18,
      hemoglobin: "11.4 g/dL", wbc: "11.1 ×10³/µL", troponin: "0.04 ng/mL", lactate: "1.8 mmol/L",
      chiefComplaint: "Severe abdominal pain, nausea, vomiting",
      triageLevel: "ESI 2 — Emergent",
      allergies: ["Latex"],
      fieldNotes: "Acute abdomen presentation. Ultrasound ordered. Patient alert and oriented x3.",
    },
  },
  { id: "b5", label: "ICU 1", status: "available" },
  { id: "b6", label: "Trauma 1", status: "reserved",
    patient: {
      name: "Incoming — ETA 3 min", mrn: "MRN-PENDING", age: 0, sex: "Unknown", bloodGroup: "O-",
      admitTime: "—", physician: "Trauma Team",
      heartRate: 145, o2: 84, bp: "80/50", temperature: 35.8, respRate: 32,
      hemoglobin: "—", wbc: "—", troponin: "—", lactate: "—",
      chiefComplaint: "Gunshot wound to abdomen",
      triageLevel: "ESI 1 — Immediate",
      allergies: [],
      fieldNotes: "Critical. Two large-bore IVs. Massive transfusion protocol activated. O- blood requested.",
    },
  },
];

// ── 3D Bed Box ───────────────────────────────────────────────────────────────
function BedBox({
  bed, position, onClick,
}: {
  bed: Bed;
  position: [number, number, number];
  onClick: () => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const color = STATUS_COLOR[bed.status];

  useFrame(() => {
    if (!meshRef.current) return;
    if (bed.status === "reserved") {
      const t = Date.now() / 400;
      meshRef.current.scale.y = 1 + Math.sin(t) * 0.1;
    } else {
      meshRef.current.scale.y = 1;
    }
  });

  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {/* Bed frame */}
      <Box ref={meshRef} args={[1.1, 0.22, 0.65]}>
        <meshStandardMaterial
          color={color}
          roughness={0.25}
          metalness={0.5}
          emissive={color}
          emissiveIntensity={STATUS_EMISSIVE[bed.status]}
        />
      </Box>
      {/* Pillow */}
      <Box args={[0.28, 0.1, 0.5]} position={[-0.36, 0.16, 0]}>
        <meshStandardMaterial color="#e5e7eb" roughness={0.8} />
      </Box>
      {/* Label */}
      <Text
        position={[0, 0.32, 0]}
        fontSize={0.16}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {bed.label}
      </Text>
      <Text
        position={[0, -0.26, 0]}
        fontSize={0.11}
        color={color}
        anchorX="center"
        anchorY="middle"
      >
        {bed.status.toUpperCase()}
      </Text>
    </group>
  );
}

// ── Lab Report Page ──────────────────────────────────────────────────────────
function LabReport({ bed, onBack }: { bed: Bed; onBack: () => void }) {
  const p = bed.patient;
  const reportId = `RPT-${bed.id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const vitalOk = (val: number, low: number, high: number) =>
    val >= low && val <= high ? "text-emerald-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white overflow-y-auto">
      {/* Nav Bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0d0d10]/95 backdrop-blur border-b border-gray-800 px-5 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg bg-gray-800 hover:bg-gray-700 px-4 py-2 text-sm font-semibold text-white transition-all"
        >
          <ArrowLeft size={15} /> Back to ER Floor
        </button>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-bold border ${
            bed.status === "reserved" ? "bg-amber-950 border-amber-700 text-amber-300" :
            bed.status === "occupied" ? "bg-red-950 border-red-800 text-red-300" :
            "bg-emerald-950 border-emerald-800 text-emerald-300"
          }`}>
            {bed.label} — {bed.status.toUpperCase()}
          </span>
          <span className="text-[10px] text-gray-600 font-mono">{reportId}</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 py-6 space-y-5">
        {/* ── Header & Demographics ── */}
        <div className="rounded-2xl bg-[#0d0d10] border border-gray-800 overflow-hidden">
          <div className="bg-gradient-to-r from-red-950/60 to-gray-900/60 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                PulseRoute EHR · Emergency Clinical Report
              </p>
              <h2 className="text-xl font-black text-white mt-0.5">
                {p?.name || "Bed Available"}
              </h2>
            </div>
            <div className="text-right text-xs text-gray-500 space-y-0.5">
              <p className="font-mono text-gray-400">{reportId}</p>
              <p>Admit: {p?.admitTime || "—"}</p>
              <p>Physician: {p?.physician || "—"}</p>
            </div>
          </div>

          {p ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-y divide-gray-800">
              {[
                ["MRN", p.mrn],
                ["Age / Sex", p.age > 0 ? `${p.age}y · ${p.sex}` : "Unknown"],
                ["Blood Group", p.bloodGroup],
                ["Triage", p.triageLevel],
              ].map(([k, v]) => (
                <div key={k} className="px-5 py-3">
                  <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-0.5">{k}</p>
                  <p className="text-sm font-bold text-white">{v}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-gray-700 text-sm">
              This bed is currently available. No patient assigned.
            </div>
          )}
        </div>

        {p && (
          <>
            {/* ── Section 1: Telemetry & Vitals ── */}
            <div className="rounded-2xl bg-[#0d0d10] border border-gray-800 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800 bg-gray-900/30">
                <Heart size={13} className="text-red-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Section 1 — Telemetry &amp; Vitals
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-0 divide-x divide-gray-800">
                {[
                  { icon: <Heart size={14} />, label: "Heart Rate", value: `${p.heartRate} bpm`, cls: vitalOk(p.heartRate, 60, 100), ref: "60–100 bpm" },
                  { icon: <Droplets size={14} />, label: "SpO₂", value: `${p.o2}%`, cls: vitalOk(p.o2, 95, 100), ref: "95–100%" },
                  { icon: <Heart size={14} />, label: "Blood Pressure", value: p.bp, cls: "text-white", ref: "<120/80 mmHg" },
                  { icon: <Thermometer size={14} />, label: "Temperature", value: `${p.temperature}°C`, cls: vitalOk(p.temperature, 36.1, 37.2), ref: "36.1–37.2°C" },
                  { icon: <Wind size={14} />, label: "Resp Rate", value: `${p.respRate} /min`, cls: vitalOk(p.respRate, 12, 20), ref: "12–20 /min" },
                ].map((v) => (
                  <div key={v.label} className="px-4 py-4 text-center">
                    <div className="flex justify-center mb-1 text-gray-600">{v.icon}</div>
                    <p className="text-[9px] text-gray-600 uppercase tracking-wider mb-1">{v.label}</p>
                    <p className={`text-lg font-black ${v.cls}`}>{v.value}</p>
                    <p className="text-[9px] text-gray-700 mt-1">{v.ref}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Section 2: Diagnostic Lab Panel ── */}
            <div className="rounded-2xl bg-[#0d0d10] border border-gray-800 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800 bg-gray-900/30">
                <FlaskConical size={13} className="text-blue-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Section 2 — Diagnostic Lab Panel
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/20">
                    <th className="text-left px-5 py-2.5 text-[10px] text-gray-600 uppercase tracking-wider font-bold">Test</th>
                    <th className="text-left px-5 py-2.5 text-[10px] text-gray-600 uppercase tracking-wider font-bold">Result</th>
                    <th className="text-left px-5 py-2.5 text-[10px] text-gray-600 uppercase tracking-wider font-bold">Reference Range</th>
                    <th className="text-left px-5 py-2.5 text-[10px] text-gray-600 uppercase tracking-wider font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {[
                    { test: "Hemoglobin", value: p.hemoglobin, ref: "13.5–17.5 g/dL (M) / 12–15.5 g/dL (F)", flag: p.hemoglobin !== "—" && parseFloat(p.hemoglobin) < 12 },
                    { test: "WBC Count", value: p.wbc, ref: "4.5–11.0 ×10³/µL", flag: p.wbc !== "—" && parseFloat(p.wbc) > 11 },
                    { test: "Troponin I", value: p.troponin, ref: "< 0.04 ng/mL", flag: p.troponin !== "—" && parseFloat(p.troponin) > 0.04 },
                    { test: "Lactate", value: p.lactate, ref: "0.5–2.0 mmol/L", flag: p.lactate !== "—" && parseFloat(p.lactate) > 2.0 },
                  ].map((row) => (
                    <tr key={row.test} className="hover:bg-gray-900/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-300">{row.test}</td>
                      <td className={`px-5 py-3 font-mono font-bold ${row.value === "—" ? "text-gray-600" : row.flag ? "text-red-400" : "text-emerald-400"}`}>
                        {row.value}
                      </td>
                      <td className="px-5 py-3 text-gray-600 text-xs">{row.ref}</td>
                      <td className="px-5 py-3">
                        {row.value === "—" ? (
                          <span className="text-[10px] text-gray-700">Pending</span>
                        ) : row.flag ? (
                          <span className="rounded-full bg-red-950 border border-red-800 text-red-400 text-[10px] px-2 py-0.5 font-bold">ABNORMAL</span>
                        ) : (
                          <span className="rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] px-2 py-0.5 font-bold">NORMAL</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Section 3: Clinical Notes & Triage ── */}
            <div className="rounded-2xl bg-[#0d0d10] border border-gray-800 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800 bg-gray-900/30">
                <ClipboardList size={13} className="text-amber-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Section 3 — Clinical Notes &amp; Triage
                </span>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1.5">Chief Complaint</p>
                    <p className="text-sm text-white bg-gray-900/50 rounded-xl px-4 py-3 border border-gray-800">
                      {p.chiefComplaint}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1.5">Triage Classification</p>
                    <p className={`text-sm font-bold rounded-xl px-4 py-3 border ${
                      p.triageLevel.includes("1") ? "bg-red-950/50 border-red-800 text-red-300" :
                      p.triageLevel.includes("2") ? "bg-orange-950/50 border-orange-800 text-orange-300" :
                      "bg-amber-950/50 border-amber-800 text-amber-300"
                    }`}>
                      {p.triageLevel}
                    </p>
                  </div>
                </div>

                {p.allergies.length > 0 && (
                  <div>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <User size={9} /> Known Allergies
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {p.allergies.map((a) => (
                        <span key={a} className="rounded-full bg-red-950/60 border border-red-800/60 text-red-300 text-xs px-3 py-1 font-semibold">
                          ⚠ {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1.5">Paramedic Field Notes</p>
                  <p className="text-sm text-gray-300 bg-gray-900/50 rounded-xl px-4 py-3 border border-gray-800 leading-relaxed">
                    {p.fieldNotes}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center text-[10px] text-gray-700 pb-4">
              PulseRoute EHR · Auto-generated clinical report · {new Date().toLocaleString()} · {reportId}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main BedMapVisual ────────────────────────────────────────────────────────
export default function BedMapVisual({ beds = DEMO_BEDS }: { beds?: Bed[] }) {
  const [selectedBed, setSelectedBed] = useState<Bed | null>(null);

  if (selectedBed) {
    return <LabReport bed={selectedBed} onBack={() => setSelectedBed(null)} />;
  }

  const cols = 3;
  const GAP_X = 2.2;
  const GAP_Z = 1.8;

  return (
    <div className="relative w-full h-full min-h-[400px]">
      {/* Legend */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 bg-black/60 backdrop-blur rounded-xl p-3 border border-gray-800">
        {(["available", "occupied", "reserved"] as BedStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-2 text-[10px] text-gray-400">
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </div>
        ))}
      </div>
      <div className="absolute top-3 right-3 z-10 bg-black/60 backdrop-blur rounded-xl px-3 py-2 border border-gray-800">
        <p className="text-[10px] text-gray-500">Click a bed to view report</p>
      </div>

      <Canvas camera={{ position: [0, 8, 8], fov: 52 }} style={{ background: "transparent" }}>
        <ambientLight intensity={0.6} />
        <pointLight position={[6, 8, 6]} intensity={1.4} />
        <pointLight position={[-6, 4, -4]} intensity={0.4} color="#6366f1" />

        {/* Floor grid */}
        <Grid
          args={[16, 16]}
          position={[0, -0.25, 0]}
          cellColor="#1f2937"
          sectionColor="#374151"
          fadeDistance={20}
          infiniteGrid={false}
        />

        {beds.map((bed, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = (col - (cols - 1) / 2) * GAP_X;
          const z = row * GAP_Z - ((Math.ceil(beds.length / cols) - 1) * GAP_Z) / 2;
          return (
            <BedBox
              key={bed.id}
              bed={bed}
              position={[x, 0, z]}
              onClick={() => setSelectedBed(bed)}
            />
          );
        })}

        <OrbitControls
          enableZoom={true}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={4}
          maxDistance={18}
          autoRotate={false}
        />
      </Canvas>
    </div>
  );
}
