import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["polling", "websocket"],
});

app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: true,
}));
app.use(express.json({ limit: "4mb" }));

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const chunkRegistry: Record<number, { received: number; total: number }> = {};

type AiFeature = "summary" | "triage" | "handover";
const AI_DISCLAIMER = "AI-generated decision support. Requires verification by a qualified healthcare professional.";
const ALLOWED_FEATURES: AiFeature[] = ["summary", "triage", "handover"];

function cleanText(value: unknown, maxLength = 500): string {
  return typeof value === "string" ? value.replace(/[<>]/g, "").trim().slice(0, maxLength) : "";
}

function sanitizePatient(input: unknown) {
  const patient = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    name: cleanText(patient.name, 100), age: Number.isFinite(Number(patient.age)) ? Number(patient.age) : 0,
    sex: cleanText(patient.sex, 20), bloodGroup: cleanText(patient.bloodGroup, 20),
    allergies: cleanText(patient.allergies), conditions: cleanText(patient.conditions), medications: cleanText(patient.medications),
    severity: cleanText(patient.severity, 20), esi: Number(patient.esi) || 0, mechanism: cleanText(patient.mechanism, 30),
    heartRate: Number(patient.heartRate) || 0, bp: cleanText(patient.bp, 30), o2: Number(patient.o2) || 0,
    respRate: Number(patient.respRate) || 0, temperature: Number(patient.temperature) || 0,
    gcs: Number(patient.gcs) || 0, eta: Number(patient.eta) || 0, gpsStatus: cleanText(patient.gpsStatus, 100),
  };
}

function mockAi(feature: AiFeature, patient: ReturnType<typeof sanitizePatient>) {
  const priority = patient.severity === "Critical" || patient.esi <= 2 ? "CRITICAL" : patient.severity === "Moderate" || patient.esi === 3 ? "MODERATE" : "LOW";
  const observations = [
    patient.heartRate ? `Heart rate recorded at ${patient.heartRate} bpm.` : "Heart rate not recorded.",
    patient.o2 ? `SpO2 recorded at ${patient.o2}%.` : "SpO2 not recorded.",
    patient.gcs ? `GCS recorded at ${patient.gcs}/15.` : "GCS not recorded.",
  ];
  const concerns = [
    patient.allergies ? `Known allergies: ${patient.allergies}.` : "No allergy information recorded.",
    patient.mechanism !== "Other" ? `Mechanism recorded as ${patient.mechanism}.` : "Mechanism of injury not specified.",
  ];
  const handover = `PATIENT HANDOVER\n\nPriority: ${priority}\nCurrent Status: ${patient.gpsStatus || "Not recorded"}\nCritical Vitals: HR ${patient.heartRate || "not recorded"} bpm; BP ${patient.bp || "not recorded"}; SpO2 ${patient.o2 || "not recorded"}%\nAllergies: ${patient.allergies || "Not recorded"}\nConditions: ${patient.conditions || "Not recorded"}\nMedications: ${patient.medications || "Not recorded"}\nTrauma: ${patient.mechanism || "Not recorded"}\nKey Observations: ${observations.join(" ")}\nRecommended Attention: Verify this handover and assess according to local clinical protocol.`;
  return {
    feature, priority, patientOverview: `${patient.name || "Patient"}, age ${patient.age || "not recorded"}, ${patient.sex || "sex not recorded"}.`,
    currentVitalObservations: observations, importantMedicalInformation: [
      `Blood group: ${patient.bloodGroup || "Not recorded"}.`, `Conditions: ${patient.conditions || "Not recorded"}.`, `Medications: ${patient.medications || "Not recorded"}.`,
    ], keyObservations: observations, concerns, recommendedAttention: "Qualified healthcare professional should verify the record and determine care.",
    explanation: "This development mock compares recorded triage fields and does not diagnose or add clinical facts.", handover, disclaimer: AI_DISCLAIMER, mock: true,
  };
}

app.post("/api/ai", async (req, res) => {
  const feature = req.body?.feature as AiFeature;
  if (!ALLOWED_FEATURES.includes(feature)) { res.status(400).json({ error: "Invalid AI feature." }); return; }
  const patient = sanitizePatient(req.body?.patient);
  if (!patient.name) { res.status(400).json({ error: "Patient name is required." }); return; }
  if (!process.env.AI_API_KEY) { res.json(mockAi(feature, patient)); return; }

  const prompt = `You provide ${feature} for emergency healthcare coordination. Use only the supplied JSON. Do not diagnose, infer missing facts, or invent values. Return valid JSON matching this shape: {"priority":"LOW|MODERATE|HIGH|CRITICAL","patientOverview":"","currentVitalObservations":[],"importantMedicalInformation":[],"keyObservations":[],"concerns":[],"recommendedAttention":"","explanation":"","handover":""}. Patient data: ${JSON.stringify(patient)}`;
  try {
    const response = await fetch(process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({ model: process.env.AI_MODEL || "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: prompt }] }),
    });
    if (!response.ok) { res.status(502).json({ error: "AI service is unavailable. Patient data remains available locally." }); return; }
    const body = await response.json() as { choices?: [{ message?: { content?: string } }] };
    const result = JSON.parse(body.choices?.[0]?.message?.content || "{}");
    res.json({ ...result, feature, disclaimer: AI_DISCLAIMER, mock: false });
  } catch { res.status(502).json({ error: "AI service failed. Patient data remains available locally." }); }
});

// ── POST /api/patient ────────────────────────────────────────────────────────
// Ingests full extended patient payload and broadcasts to all hospital clients
app.post("/api/patient", (req, res) => {
  const {
    id, name, heartRate, bp, o2, severity,
    esi, mechanism, age, sex, bloodGroup,
    allergies, conditions, medications,
    eta, gpsStatus, respRate, temperature, gcs,
    redAlert,
  } = req.body;

  if (!name || heartRate === undefined || !bp || o2 === undefined || !severity) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const patient = {
    id, name, heartRate, bp, o2, severity,
    esi, mechanism, age, sex, bloodGroup,
    allergies, conditions, medications,
    eta, gpsStatus, respRate, temperature, gcs,
    redAlert: !!redAlert,
  };

  // Broadcast full patient to hospital dashboards
  io.emit("new-patient", patient);

  // If red alert, also emit a dedicated critical event
  if (redAlert) {
    io.emit("patient:incoming", { ...patient, priority: "RED" });
  }

  res.json({ success: true, patient });
});

// ── POST /api/upload-chunk ───────────────────────────────────────────────────
app.post("/api/upload-chunk", (req, res) => {
  const { patientId, chunkIndex, totalChunks, data } = req.body;
  if (patientId === undefined || chunkIndex === undefined || !data) {
    res.status(400).json({ error: "Missing chunk data" });
    return;
  }

  const chunkPath = path.join(UPLOAD_DIR, `patient_${patientId}_chunk_${chunkIndex}.b64`);
  fs.writeFileSync(chunkPath, data, "utf8");

  if (!chunkRegistry[patientId]) {
    chunkRegistry[patientId] = { received: 0, total: totalChunks };
  }
  chunkRegistry[patientId].received += 1;

  io.emit("chunk-progress", {
    patientId,
    received: chunkRegistry[patientId].received,
    total: totalChunks,
  });

  res.json({ success: true, chunkIndex });
});

// ── POST /api/complete-upload ────────────────────────────────────────────────
app.post("/api/complete-upload", (req, res) => {
  const { patientId, totalChunks } = req.body;
  if (patientId === undefined || !totalChunks) {
    res.status(400).json({ error: "Missing patientId or totalChunks" });
    return;
  }

  const buffers: Buffer[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(UPLOAD_DIR, `patient_${patientId}_chunk_${i}.b64`);
    if (!fs.existsSync(chunkPath)) {
      res.status(400).json({ error: `Missing chunk ${i}` });
      return;
    }
    const b64 = fs.readFileSync(chunkPath, "utf8");
    buffers.push(Buffer.from(b64, "base64"));
    fs.unlinkSync(chunkPath);
  }

  const finalBuffer = Buffer.concat(buffers);
  const outputPath = path.join(process.cwd(), "uploads", `patient_${patientId}_scan.bin`);
  fs.writeFileSync(outputPath, finalBuffer);
  delete chunkRegistry[patientId];

  res.json({ success: true, file: `patient_${patientId}_scan.bin`, bytes: finalBuffer.length });
});

// ── POST /api/resource-update ────────────────────────────────────────────────
// Hospital staff can update bed status; broadcasts back to paramedic terminals
app.post("/api/resource-update", (req, res) => {
  const { bedId, status } = req.body;
  if (!bedId || !status) {
    res.status(400).json({ error: "Missing bedId or status" });
    return;
  }
  io.emit("hospital:resource_update", { bedId, status });
  res.json({ success: true });
});

// ── POST /api/vitals-stream ──────────────────────────────────────────────────
// Paramedic can push live telemetry for a patient already in the system
app.post("/api/vitals-stream", (req, res) => {
  const { patientId, bpm, o2 } = req.body;
  if (!patientId || bpm === undefined || o2 === undefined) {
    res.status(400).json({ error: "Missing vitals data" });
    return;
  }
  io.emit("vitals:stream", { patientId, bpm, o2 });
  res.json({ success: true });
});

// ── Socket.io connection log ─────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[Socket.io] Connected: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`[Socket.io] Disconnected: ${socket.id}`);
  });
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`[PulseRoute] Backend running → http://localhost:${PORT}`);
});
