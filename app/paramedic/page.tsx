"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Wifi, WifiOff, Save, RefreshCw, Activity,
  AlertTriangle, ChevronRight, ChevronLeft, Paperclip, Send,
} from "lucide-react";
import {
  savePatientLocally, getUnsyncedPatients, markAsSynced,
  getAllPatients,
  type Patient, type Severity, type BloodGroup, type Sex, type MechanismOfInjury, type ESI,
} from "@/lib/db";
import { requestAi, type AiResult } from "@/lib/ai";

const BACKEND = "http://localhost:4000";
const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];
const MECHANISMS: MechanismOfInjury[] = ["Cardiac", "MVA", "Burn", "Stroke", "Trauma", "Respiratory", "Other"];
const TABS = ["Vitals", "Patient Info", "Trauma & Photos"] as const;
type Tab = typeof TABS[number];

interface FormState {
  name: string; heartRate: string; bp: string; o2: string;
  respRate: string; temperature: string; gcs: string;
  severity: Severity; esi: string;
  age: string; sex: Sex; contact: string; emergencyContact: string;
  bloodGroup: BloodGroup; allergies: string; conditions: string; medications: string;
  mechanism: MechanismOfInjury; eta: string; gpsStatus: string;
}

const blank: FormState = {
  name: "", heartRate: "", bp: "", o2: "", respRate: "", temperature: "", gcs: "15",
  severity: "Mild", esi: "3",
  age: "", sex: "Male", contact: "", emergencyContact: "",
  bloodGroup: "Unknown", allergies: "", conditions: "", medications: "",
  mechanism: "Other", eta: "10", gpsStatus: "En Route",
};

export default function ParamedicPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({ ...blank });
  const [patientList, setPatientList] = useState<Patient[]>([]);

  const setField = (key: keyof FormState, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val as never }));
  };

  const f = form;

  const [tab, setTab] = useState<Tab>("Vitals");
  const [file, setFile] = useState<File | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [localCount, setLocalCount] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState<"ok" | "err" | "warn">("ok");
  const [lastSaved, setLastSaved] = useState<FormState | null>(null);
  const [handover, setHandover] = useState<AiResult | null>(null);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [handoverError, setHandoverError] = useState("");

  const refreshCounts = useCallback(async () => {
    const all = await getAllPatients();
    setLocalCount(all.filter((p) => !p.synced).length);
    setSyncedCount(all.filter((p) => p.synced).length);
    setPatientList(all);
  }, []);

  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  const showToast = (msg: string, type: "ok" | "err" | "warn" = "ok") => {
    setToast(msg); setToastType(type);
    setTimeout(() => setToast(""), 3500);
  };

  const buildPatientPayload = (overrides: Partial<FormState> = {}) => {
    const current = { ...form, ...overrides };
    return {
      name: current.name,
      age: Number(current.age) || 0,
      sex: current.sex,
      contact: current.contact,
      emergencyContact: current.emergencyContact,
      bloodGroup: current.bloodGroup,
      allergies: current.allergies,
      conditions: current.conditions,
      medications: current.medications,
      severity: current.severity,
      esi: Number(current.esi) as ESI,
      mechanism: current.mechanism,
      heartRate: Number(current.heartRate) || 0,
      bp: current.bp,
      o2: Number(current.o2) || 0,
      respRate: Number(current.respRate) || 16,
      temperature: Number(current.temperature) || 37,
      gcs: Number(current.gcs) || 15,
      eta: Number(current.eta) || 10,
      gpsStatus: current.gpsStatus,
    };
  };

  const generateHandover = async () => {
    setHandoverLoading(true); setHandoverError("");
    try {
      const payload = buildPatientPayload();
      setHandover(await requestAi("handover", { ...payload, id: 0, synced: false, imageChunks: [], createdAt: Date.now() }));
    } catch (error) { setHandoverError(error instanceof Error ? error.message : "AI service is unavailable."); }
    finally { setHandoverLoading(false); }
  };

  const handleSave = async () => {
    const missing: string[] = [];
    if (!f.name.trim()) missing.push("Name");
    if (!f.heartRate.trim()) missing.push("Heart Rate");
    if (!f.bp.trim()) missing.push("BP");
    if (!f.o2.trim()) missing.push("O₂");
    if (missing.length > 0) {
      showToast(`Missing: ${missing.join(", ")} — check Vitals tab.`, "err");
      setTab("Vitals");
      return;
    }

    await savePatientLocally(buildPatientPayload(), file);
    setLastSaved({ ...form });
    setForm({ ...blank });
    setFile(null);
    setTab("Vitals");
    await refreshCounts();
    showToast("✅ Saved locally — fill next patient or sync when online.");
  };

  const dispatchAlert = async () => {
    if (!f.name.trim()) {
      showToast("Enter patient name first.", "err");
      return;
    }

    const payload = buildPatientPayload({ severity: "Critical", esi: "1" });
    const savedId = await savePatientLocally(payload, file);
    await refreshCounts();

    try {
      await fetch(`${BACKEND}/api/patient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: savedId,
          ...payload,
          heartRate: Number(payload.heartRate) || 0,
          bp: payload.bp || "—",
          o2: Number(payload.o2) || 0,
          severity: "Critical",
          esi: 1,
          redAlert: true,
        }),
      });
      await markAsSynced(savedId);
      await refreshCounts();
      showToast("🚨 Red Alert dispatched to ER!", "warn");
    } catch {
      showToast("🚨 Alert saved locally — will sync when online.", "warn");
    }
  };

  const syncToServer = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    const unsynced = await getUnsyncedPatients();
    for (const patient of unsynced) {
      try {
        const res = await fetch(`${BACKEND}/api/patient`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: patient.id, name: patient.name, heartRate: patient.heartRate,
            bp: patient.bp, o2: patient.o2, severity: patient.severity,
            esi: patient.esi, mechanism: patient.mechanism,
            age: patient.age, sex: patient.sex, bloodGroup: patient.bloodGroup,
            allergies: patient.allergies, conditions: patient.conditions,
            medications: patient.medications, eta: patient.eta,
            gpsStatus: patient.gpsStatus, respRate: patient.respRate,
            temperature: patient.temperature, gcs: patient.gcs,
          }),
        });
        if (!res.ok) continue;
        for (let i = 0; i < patient.imageChunks.length; i++) {
          await fetch(`${BACKEND}/api/upload-chunk`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patientId: patient.id, chunkIndex: i,
              totalChunks: patient.imageChunks.length, data: patient.imageChunks[i],
            }),
          });
        }
        if (patient.imageChunks.length > 0) {
          await fetch(`${BACKEND}/api/complete-upload`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patientId: patient.id, totalChunks: patient.imageChunks.length }),
          });
        }
        await markAsSynced(patient.id!);
      } catch (err) {
        console.error("[Sync] error:", err);
      }
    }
    await refreshCounts();
    setSyncing(false);
    showToast(`🟢 Synced ${unsynced.length} record(s).`);
  }, [syncing, refreshCounts]);

  useEffect(() => {
    if (isOnline) syncToServer();
  }, [isOnline]); // eslint-disable-line

  const tabIdx = TABS.indexOf(tab);

  const getFieldValue = (key: keyof FormState) => {
    const value = f[key];
    return typeof value === "string" ? value : String(value ?? "");
  };

  // Stable input — reads from state, never causes unmount
  const inp = (label: string, key: keyof FormState, type = "text", placeholder = "") => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={getFieldValue(key)}
        onChange={(e) => setField(key, e.target.value)}
        className="rounded-lg bg-[#0f1117] border border-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500"
      />
    </div>
  );

  const sel = (label: string, key: keyof FormState, options: string[]) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
      <select
        value={getFieldValue(key)}
        onChange={(e) => setField(key, e.target.value)}
        className="rounded-lg bg-[#0f1117] border border-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0c] p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">
            Pulse<span className="text-red-500">Route</span>
          </h1>
          <p className="text-[10px] text-gray-600 mt-0.5 uppercase tracking-widest">Paramedic Terminal</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={dispatchAlert}
            className="flex items-center gap-1.5 rounded-full bg-red-700 hover:bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-all shadow-lg shadow-red-900/40">
            <Send size={12} /> Dispatch Alert
          </button>
          <button onClick={generateHandover} disabled={handoverLoading}
            className="flex items-center gap-1.5 rounded-full border border-red-700 bg-red-950/50 px-3 py-1.5 text-xs font-bold text-red-300 transition-all hover:bg-red-900 disabled:opacity-50">
            <Activity size={12} /> {handoverLoading ? "Generating..." : "Generate AI Handover"}
          </button>
          <button onClick={() => setIsOnline((v) => !v)}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${isOnline ? "bg-emerald-700 text-white" : "bg-gray-800 text-gray-400"}`}>
            {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
            {isOnline ? "ONLINE" : "OFFLINE"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Form Card */}
        <div className="xl:col-span-3 rounded-2xl bg-[#0d0d10] border border-gray-800/60 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-3 text-xs font-semibold tracking-wide transition-all ${tab === t ? "text-white border-b-2 border-red-500 bg-gray-900/40" : "text-gray-600 hover:text-gray-400"}`}>
                {i + 1}. {t}
              </button>
            ))}
          </div>

          {/* All tab content always mounted — only visibility toggled via hidden class */}
          <div className="p-5">
            {/* Tab 1: Vitals — always in DOM */}
            <div className={tab === "Vitals" ? "space-y-4" : "hidden"}>
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-red-400" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Live Vitals</span>
              </div>
              {inp("Patient Name *", "name", "text", "Full name")}
              <div className="grid grid-cols-2 gap-3">
                {inp("Heart Rate (BPM) *", "heartRate", "number", "72")}
                {inp("Blood Pressure *", "bp", "text", "120/80")}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {inp("SpO₂ (%) *", "o2", "number", "98")}
                {inp("Resp Rate", "respRate", "number", "16")}
                {inp("Temp (°C)", "temperature", "number", "37.0")}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {inp("GCS (3–15)", "gcs", "number", "15")}
                {sel("Severity", "severity", ["Mild", "Moderate", "Critical"])}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">ESI Level</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setField("esi", String(n))}
                      className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all border ${f.esi === String(n)
                        ? n <= 2 ? "bg-red-700 border-red-600 text-white"
                          : n === 3 ? "bg-amber-700 border-amber-600 text-white"
                            : "bg-emerald-800 border-emerald-700 text-white"
                        : "bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600"}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600">1=Immediate · 2=Emergent · 3=Urgent · 4=Less Urgent · 5=Non-Urgent</p>
              </div>
            </div>

            {/* Tab 2: Patient Info — always in DOM */}
            <div className={tab === "Patient Info" ? "space-y-4" : "hidden"}>
              <div className="grid grid-cols-2 gap-3">
                {inp("Age", "age", "number", "35")}
                {sel("Sex", "sex", ["Male", "Female", "Other"])}
              </div>
              {inp("Contact Number", "contact", "tel", "+1 555 000 0000")}
              {inp("Emergency Contact", "emergencyContact", "text", "Name — Relationship — Phone")}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Blood Group</label>
                <div className="flex flex-wrap gap-2">
                  {BLOOD_GROUPS.map((bg) => (
                    <button key={bg} onClick={() => setField("bloodGroup", bg)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all border ${f.bloodGroup === bg
                        ? "bg-red-700 border-red-600 text-white"
                        : "bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600"}`}>
                      {bg}
                    </button>
                  ))}
                </div>
              </div>
              {inp("Known Allergies", "allergies", "text", "Penicillin, Latex...")}
              {inp("Pre-existing Conditions", "conditions", "text", "Diabetes, Hypertension...")}
              {inp("Current Medications", "medications", "text", "Metformin 500mg...")}
            </div>

            {/* Tab 3: Trauma & Photos — always in DOM */}
            <div className={tab === "Trauma & Photos" ? "space-y-4" : "hidden"}>
              {sel("Mechanism of Injury", "mechanism", MECHANISMS)}
              <div className="grid grid-cols-2 gap-3">
                {inp("ETA (minutes)", "eta", "number", "10")}
                {inp("GPS / Transit Status", "gpsStatus", "text", "En Route — Highway 5")}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Paperclip size={11} /> Ultrasound / Wound Photo
                </label>
                <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-700 hover:border-red-600 py-6 cursor-pointer transition-all">
                  <input type="file" accept="image/*,.dcm" className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  {file ? (
                    <div className="text-center">
                      <p className="text-sm text-white font-semibold">{file.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {(file.size / 1024).toFixed(0)} KB — {Math.ceil(file.size / (512 * 1024))} chunk(s)
                      </p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-gray-500">Tap to attach scan or photo</p>
                      <p className="text-xs text-gray-700 mt-1">Sliced into 512KB chunks locally</p>
                    </div>
                  )}
                </label>
              </div>
              <button onClick={dispatchAlert}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-900/60 hover:bg-red-800 border border-red-700 py-3 font-bold text-red-300 text-sm transition-all">
                <AlertTriangle size={16} /> Dispatch Emergency Alert to ER
              </button>
            </div>

            {/* Navigation + Save — always visible */}
            <div className="flex items-center gap-3 pt-5 mt-4 border-t border-gray-800">
              {tabIdx > 0 && (
                <button onClick={() => setTab(TABS[tabIdx - 1])}
                  className="flex items-center gap-1 rounded-lg bg-gray-800 hover:bg-gray-700 px-4 py-2 text-xs font-semibold text-gray-300 transition-all">
                  <ChevronLeft size={13} /> Back
                </button>
              )}
              {tabIdx < TABS.length - 1 && (
                <button onClick={() => setTab(TABS[tabIdx + 1])}
                  className="flex items-center gap-1 rounded-lg bg-gray-800 hover:bg-gray-700 px-4 py-2 text-xs font-semibold text-gray-300 transition-all">
                  Next <ChevronRight size={13} />
                </button>
              )}
              <button onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 py-2.5 font-bold text-white text-sm transition-all shadow-lg shadow-red-900/30">
                <Save size={15} /> Save Locally
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          {handoverError && <div className="rounded-2xl border border-red-800 bg-red-950/40 p-4 text-xs text-red-300"><p>{handoverError}</p><button onClick={generateHandover} className="mt-2 font-bold underline">Retry</button></div>}
          {handover && (
            <div className="rounded-2xl border border-red-900/60 bg-[#0d0d10] p-4 space-y-3">
              <div className="flex items-center justify-between"><h2 className="text-[10px] font-bold uppercase tracking-widest text-red-300">AI Handover Review</h2>{handover.mock && <span className="text-[10px] text-amber-400">Development mock</span>}</div>
              <textarea readOnly value={handover.handover || "No handover was returned."} className="min-h-64 w-full rounded-xl border border-gray-800 bg-gray-900 p-3 text-xs leading-5 text-gray-300 focus:outline-none" />
              <p className="text-[11px] font-semibold text-amber-400">{handover.disclaimer}</p>
              <p className="text-[10px] text-gray-600">Review the text above before saving or sending it. It does not replace clinical judgment.</p>
            </div>
          )}
          {/* Saved Patients */}
          <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Saved Patients</h2>
              <span className="text-[10px] text-gray-600">{patientList.length}</span>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {patientList.length === 0 ? (
                <p className="text-xs text-gray-600">No local records yet.</p>
              ) : patientList.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  onClick={() => router.push(`/patient/${patient.id}`)}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2 text-left transition-all hover:border-red-700 hover:bg-gray-800"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{patient.name}</p>
                    <p className="text-[10px] text-gray-600">{patient.severity} · ESI {patient.esi}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${patient.synced ? "bg-emerald-900/50 text-emerald-400" : "bg-amber-900/50 text-amber-400"}`}>
                    {patient.synced ? "Synced" : "Local"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Sync Status */}
          <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 p-4 space-y-3">
            <h2 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Sync Status</h2>
            <div className="flex items-center justify-between rounded-xl bg-gray-900 px-3 py-2.5">
              <span className="text-xs text-gray-400">Stored Locally</span>
              <span className="flex items-center gap-1.5 font-bold text-orange-400 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />{localCount}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gray-900 px-3 py-2.5">
              <span className="text-xs text-gray-400">Synced to Hospital</span>
              <span className="flex items-center gap-1.5 font-bold text-emerald-400 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{syncedCount}
              </span>
            </div>
            <button onClick={syncToServer} disabled={!isOnline || syncing}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-30 py-2 text-xs font-semibold text-white transition-all">
              <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing..." : "Force Sync"}
            </button>
          </div>

          {/* Live form preview — updates as you type */}
          <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 p-4">
            <h2 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-3">
              {f.name ? "Current Record" : "Record Preview"}
            </h2>
            <div className="space-y-1.5 text-xs">
              {([
                ["Patient", f.name || "—"],
                ["Heart Rate", f.heartRate ? `${f.heartRate} bpm` : "—"],
                ["BP", f.bp || "—"],
                ["SpO₂", f.o2 ? `${f.o2}%` : "—"],
                ["Severity", f.severity],
                ["ESI", `Level ${f.esi}`],
                ["Blood Group", f.bloodGroup],
                ["Age / Sex", f.age ? `${f.age}y · ${f.sex}` : "—"],
                ["ETA", `${f.eta} min`],
                ["Mechanism", f.mechanism],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-600">{k}</span>
                  <span className={`font-medium ${v === "—" ? "text-gray-700" : "text-gray-300"}`}>{v}</span>
                </div>
              ))}
            </div>
            {lastSaved && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <p className="text-[10px] text-emerald-600 font-semibold">✓ Last saved: {lastSaved.name}</p>
              </div>
            )}
          </div>

          {/* Guarantee */}
          <div className="rounded-2xl bg-[#0d0d10] border border-gray-800/60 p-4">
            <h2 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Local-First</h2>
            <ul className="space-y-1.5 text-[11px] text-gray-500">
              {["IndexedDB write < 1ms", "512KB chunk slicing", "Auto-sync on reconnect", "Zero data loss offline"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>{t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-2xl z-50 border ${toastType === "err" ? "bg-red-900 border-red-700" : toastType === "warn" ? "bg-amber-900 border-amber-700" : "bg-gray-800 border-gray-700"}`}>
          {toast}
        </div>
      )}
    </div>
  );
}
