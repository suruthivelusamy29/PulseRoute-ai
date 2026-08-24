"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAllPatients, type Patient } from "@/lib/db";
import { requestAi, type AiResult } from "@/lib/ai";
import {
  ArrowLeft, Heart, Droplets, Wind, Thermometer,
  User, Phone, AlertTriangle, Activity, Ambulance,
} from "lucide-react";

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold border ${color}`}>
      {label}
    </span>
  );
}

function VitalCard({
  icon, label, value, unit, normal,
}: {
  icon: React.ReactNode; label: string; value: string | number; unit: string;
  normal?: boolean;
}) {
  const color = normal === undefined ? "text-white" : normal ? "text-emerald-400" : "text-red-400";
  return (
    <div className="rounded-2xl bg-[#0d0d10] border border-gray-800 p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-gray-500 mb-1">{icon}
        <span className="text-[10px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className={`text-2xl font-black ${color}`}>{value}<span className="text-sm font-normal text-gray-500 ml-1">{unit}</span></p>
      {normal !== undefined && (
        <p className={`text-[10px] ${normal ? "text-emerald-700" : "text-red-700"}`}>
          {normal ? "Within normal range" : "⚠ Outside normal range"}
        </p>
      )}
    </div>
  );
}

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiFeature, setAiFeature] = useState<"summary" | "triage" | null>(null);
  const [lastFeature, setLastFeature] = useState<"summary" | "triage">("summary");
  const [aiError, setAiError] = useState("");

  const generateAi = async (feature: "summary" | "triage") => {
    if (!patient) return;
    setAiFeature(feature); setAiError(""); setAiResult(null); setLastFeature(feature);
    try { setAiResult(await requestAi(feature, patient)); }
    catch (error) { setAiError(error instanceof Error ? error.message : "AI service is unavailable."); }
    finally { setAiFeature(null); }
  };

  useEffect(() => {
    getAllPatients().then((all) => {
      const found = all.find((p) => p.id === Number(id));
      setPatient(found ?? null);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center text-gray-600 text-sm">
        Loading patient record...
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500 text-sm">Patient record not found.</p>
        <button onClick={() => router.back()}
          className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white">
          <ArrowLeft size={14} /> Go Back
        </button>
      </div>
    );
  }

  const severityColor =
    patient.severity === "Critical" ? "bg-red-950 border-red-800 text-red-300"
    : patient.severity === "Moderate" ? "bg-amber-950 border-amber-800 text-amber-300"
    : "bg-emerald-950 border-emerald-800 text-emerald-300";

  const esiColor =
    patient.esi <= 2 ? "bg-red-950 border-red-800 text-red-300"
    : patient.esi === 3 ? "bg-amber-950 border-amber-800 text-amber-300"
    : "bg-gray-900 border-gray-700 text-gray-400";

  const reportId = `RPT-${patient.id}-${new Date(patient.createdAt).getTime().toString(36).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white">
      {/* Sticky Nav */}
      <div className="sticky top-0 z-20 flex items-center justify-between bg-[#0d0d10]/95 backdrop-blur border-b border-gray-800 px-5 py-3">
        <button onClick={() => router.back()}
          className="flex items-center gap-2 rounded-lg bg-gray-800 hover:bg-gray-700 px-4 py-2 text-sm font-semibold text-white transition-all">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-center gap-3">
          <Badge label={`ESI ${patient.esi}`} color={esiColor} />
          <Badge label={patient.severity} color={severityColor} />
          <span className="text-[10px] text-gray-600 font-mono hidden md:block">{reportId}</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header Card ── */}
        <div className="rounded-2xl bg-[#0d0d10] border border-gray-800 overflow-hidden">
          <div className="bg-gradient-to-r from-red-950/50 to-gray-900/40 border-b border-gray-800 px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">PulseRoute · Patient Record</p>
              <h1 className="text-2xl font-black text-white mt-1">{patient.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {patient.age > 0 ? `${patient.age} years old` : "Age unknown"} · {patient.sex}
                {patient.mechanism !== "Other" ? ` · ${patient.mechanism}` : ""}
              </p>
            </div>
            <div className="text-right text-xs text-gray-500 space-y-1">
              <p className="font-mono text-gray-400 text-[11px]">{reportId}</p>
              <p>Recorded: {new Date(patient.createdAt).toLocaleString()}</p>
              <p className={`font-semibold ${patient.synced ? "text-emerald-500" : "text-amber-500"}`}>
                {patient.synced ? "✓ Synced to Hospital" : "⏳ Pending Sync"}
              </p>
            </div>
          </div>

          {/* Demographics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-gray-800">
            {[
              ["Blood Group", patient.bloodGroup],
              ["Triage", `ESI ${patient.esi}`],
              ["Severity", patient.severity],
              ["Mechanism", patient.mechanism],
            ].map(([k, v]) => (
              <div key={k} className="px-5 py-3">
                <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-0.5">{k}</p>
                <p className="text-sm font-bold text-white">{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Vitals Grid ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Heart size={13} className="text-red-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Vitals & Telemetry</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <VitalCard icon={<Heart size={13} />} label="Heart Rate" value={patient.heartRate} unit="bpm"
              normal={patient.heartRate >= 60 && patient.heartRate <= 100} />
            <VitalCard icon={<Droplets size={13} />} label="Blood Pressure" value={patient.bp} unit="mmHg" />
            <VitalCard icon={<Droplets size={13} />} label="SpO₂" value={patient.o2} unit="%"
              normal={patient.o2 >= 95} />
            <VitalCard icon={<Wind size={13} />} label="Resp Rate" value={patient.respRate} unit="/min"
              normal={patient.respRate >= 12 && patient.respRate <= 20} />
            <VitalCard icon={<Thermometer size={13} />} label="Temperature" value={patient.temperature} unit="°C"
              normal={patient.temperature >= 36.1 && patient.temperature <= 37.5} />
            <VitalCard icon={<Activity size={13} />} label="GCS Score" value={patient.gcs} unit="/15"
              normal={patient.gcs >= 13} />
          </div>
        </div>

        <div className="rounded-2xl bg-[#0d0d10] border border-red-900/60 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-gray-800 bg-red-950/20 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-red-300">AI Clinical Support</p>
              <p className="mt-1 text-[11px] text-gray-500">Uses recorded data only. Review every result clinically.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => generateAi("summary")} disabled={aiFeature !== null}
                className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50">
                {aiFeature === "summary" ? "Generating..." : "Generate Summary"}
              </button>
              <button onClick={() => generateAi("triage")} disabled={aiFeature !== null}
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-bold text-gray-200 hover:border-red-700 disabled:opacity-50">
                {aiFeature === "triage" ? "Analyzing..." : "Run Triage Assistant"}
              </button>
            </div>
          </div>
          {aiError && <div className="flex items-center justify-between gap-3 border-b border-red-900/50 px-5 py-3 text-xs text-red-300"><span>{aiError}</span><button onClick={() => generateAi(lastFeature)} className="font-bold underline">Retry</button></div>}
          {aiResult && (
            <div className="space-y-4 p-5 text-sm text-gray-300">
              {/* ── Triage view ── */}
              {aiResult.feature === "triage" && (
                <>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Triage Priority</p>
                      <p className={`text-2xl font-black ${
                        aiResult.priority === "CRITICAL" ? "text-red-400"
                        : aiResult.priority === "HIGH" ? "text-orange-400"
                        : aiResult.priority === "MODERATE" ? "text-amber-400"
                        : "text-emerald-400"
                      }`}>{aiResult.priority}</p>
                    </div>
                    <div className="flex-1 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">ESI Reference</p>
                      <div className="grid grid-cols-5 gap-1 text-center text-[10px]">
                        {(["1","2","3","4","5"] as const).map((n) => {
                          const esiNum = Number(patient.esi);
                          const active = esiNum === Number(n);
                          return (
                            <div key={n} className={`rounded-lg py-1.5 font-bold border ${
                              active
                                ? Number(n) <= 2 ? "bg-red-700 border-red-600 text-white"
                                  : Number(n) === 3 ? "bg-amber-700 border-amber-600 text-white"
                                  : "bg-emerald-800 border-emerald-700 text-white"
                                : "bg-gray-800 border-gray-700 text-gray-500"
                            }`}>{n}</div>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-5 gap-1 text-center text-[9px] text-gray-600 mt-1">
                        {["Immed","Emerg","Urgent","Less","Non"].map((l) => <span key={l}>{l}</span>)}
                      </div>
                    </div>
                  </div>
                  {aiResult.patientOverview && <div><p className="text-[10px] uppercase tracking-wider text-gray-500">Patient Overview</p><p>{aiResult.patientOverview}</p></div>}
                  <div className="grid gap-4 md:grid-cols-2">
                    {aiResult.currentVitalObservations?.length ? <div><p className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Vital Observations</p><ul className="list-disc space-y-1 pl-4">{aiResult.currentVitalObservations.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                    <div><p className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Potential Concerns</p><ul className="list-disc space-y-1 pl-4">{aiResult.concerns.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  </div>
                  <div className="border-t border-gray-800 pt-3"><p className="text-[10px] uppercase tracking-wider text-gray-500">Recommended Attention</p><p>{aiResult.recommendedAttention}</p></div>
                </>
              )}

              {/* ── Summary view ── */}
              {aiResult.feature === "summary" && (
                <>
                  {aiResult.priority && <div><p className="text-[10px] uppercase tracking-wider text-gray-500">Priority</p><p className="text-xl font-black text-red-300">{aiResult.priority}</p></div>}
                  {aiResult.patientOverview && <div><p className="text-[10px] uppercase tracking-wider text-gray-500">Patient Overview</p><p>{aiResult.patientOverview}</p></div>}
                  <div className="grid gap-4 md:grid-cols-2">
                    {aiResult.currentVitalObservations?.length ? <div><p className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Current Vital Observations</p><ul className="list-disc space-y-1 pl-4">{aiResult.currentVitalObservations.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                    {aiResult.importantMedicalInformation?.length ? <div><p className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Important Medical Information</p><ul className="list-disc space-y-1 pl-4">{aiResult.importantMedicalInformation.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                    <div><p className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Key Observations</p><ul className="list-disc space-y-1 pl-4">{aiResult.keyObservations.map((item) => <li key={item}>{item}</li>)}</ul></div>
                    <div><p className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Potential Concerns</p><ul className="list-disc space-y-1 pl-4">{aiResult.concerns.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  </div>
                  <div className="border-t border-gray-800 pt-3"><p className="text-[10px] uppercase tracking-wider text-gray-500">Recommended Attention</p><p>{aiResult.recommendedAttention}</p>{aiResult.explanation && <p className="mt-2 text-xs text-gray-500">{aiResult.explanation}</p>}</div>
                </>
              )}

              <p className="text-[11px] font-semibold text-amber-400">{aiResult.disclaimer}</p>
            </div>
          )}
        </div>

        {/* ── Blood Group Highlight ── */}
        <div className="rounded-2xl bg-[#0d0d10] border border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Droplets size={13} className="text-red-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Blood Information</span>
          </div>
          <div className="flex items-center gap-5">
            <div className={`rounded-2xl border-2 px-8 py-5 text-center ${
              patient.bloodGroup === "Unknown" ? "border-gray-700 bg-gray-900/40" : "border-red-700 bg-red-950/40"
            }`}>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Blood Group</p>
              <p className={`text-4xl font-black ${patient.bloodGroup === "Unknown" ? "text-gray-500" : "text-red-300"}`}>
                {patient.bloodGroup}
              </p>
            </div>
            <div className="space-y-2 text-sm text-gray-400">
              {patient.bloodGroup !== "Unknown" && (
                <>
                  <p>🩸 Ensure matching blood units are reserved</p>
                  <p>⚠ Verify cross-match before transfusion</p>
                  <p className="text-[11px] text-gray-600">Compatible donors depend on blood type</p>
                </>
              )}
              {patient.bloodGroup === "Unknown" && (
                <p className="text-amber-500">⚠ Blood group not confirmed — use O- universal donor if transfusion needed</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Patient Info ── */}
        <div className="rounded-2xl bg-[#0d0d10] border border-gray-800 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800 bg-gray-900/30">
            <User size={13} className="text-blue-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Patient Information</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-x md:divide-y-0 divide-gray-800">
            {[
              ["Contact", patient.contact || "—"],
              ["Emergency Contact", patient.emergencyContact || "—"],
            ].map(([k, v]) => (
              <div key={k} className="px-5 py-4">
                <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">{k}</p>
                <p className="text-sm text-white flex items-center gap-2">
                  <Phone size={11} className="text-gray-600" />{v}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Clinical Notes ── */}
        {(patient.conditions || patient.allergies || patient.medications) && (
          <div className="rounded-2xl bg-[#0d0d10] border border-gray-800 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800 bg-gray-900/30">
              <AlertTriangle size={13} className="text-amber-400" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Clinical Notes</span>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                ["Pre-existing Conditions", patient.conditions],
                ["Known Allergies", patient.allergies],
                ["Current Medications", patient.medications],
              ].map(([k, v]) =>
                v ? (
                  <div key={k}>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">{k}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {v.split(",").map((item) => item.trim()).filter(Boolean).map((item) => (
                        <span key={item} className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                          k === "Known Allergies"
                            ? "bg-red-950/60 border-red-800/60 text-red-300"
                            : "bg-gray-900 border-gray-700 text-gray-300"
                        }`}>
                          {k === "Known Allergies" ? "⚠ " : ""}{item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}

        {/* ── ETA & Transport ── */}
        <div className="rounded-2xl bg-[#0d0d10] border border-gray-800 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800 bg-gray-900/30">
            <Ambulance size={13} className="text-amber-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Transport & ETA</span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-gray-800">
            <div className="px-5 py-4">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">ETA</p>
              <p className="text-2xl font-black text-amber-400">{patient.eta}<span className="text-sm font-normal text-gray-500 ml-1">min</span></p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">GPS / Status</p>
              <p className="text-sm font-semibold text-white">{patient.gpsStatus || "En Route"}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-700 pb-4">
          PulseRoute EHR · Auto-generated · {new Date().toLocaleString()} · {reportId}
        </p>
      </div>
    </div>
  );
}
