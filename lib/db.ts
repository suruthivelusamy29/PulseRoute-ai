import Dexie, { type Table } from "dexie";

export type Severity = "Mild" | "Moderate" | "Critical";
export type ESI = 1 | 2 | 3 | 4 | 5;
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "Unknown";
export type Sex = "Male" | "Female" | "Other";
export type MechanismOfInjury = "Cardiac" | "MVA" | "Burn" | "Stroke" | "Trauma" | "Respiratory" | "Other";

export interface Patient {
  id?: number;
  // Demographics
  name: string;
  age: number;
  sex: Sex;
  contact: string;
  emergencyContact: string;
  // Medical
  bloodGroup: BloodGroup;
  allergies: string;
  conditions: string;
  medications: string;
  // Triage
  severity: Severity;
  esi: ESI;
  mechanism: MechanismOfInjury;
  // Vitals
  heartRate: number;
  bp: string;
  o2: number;
  respRate: number;
  temperature: number;
  gcs: number;
  // ETA
  eta: number; // minutes
  gpsStatus: string;
  // Sync
  synced: boolean;
  imageChunks: string[];
  createdAt: number;
}

const CHUNK_SIZE = 512 * 1024;

class PulseRouteDB extends Dexie {
  patients!: Table<Patient, number>;

  constructor() {
    super("PulseRouteDB");
    this.version(1).stores({ patients: "++id, name, severity, synced" });
    // Version 2: extended schema — existing records kept, new fields default to undefined
    this.version(2).stores({ patients: "++id, name, severity, synced, esi, bloodGroup, createdAt" });
  }
}

export const db = new PulseRouteDB();

async function fileToChunks(file: File): Promise<string[]> {
  const chunks: string[] = [];
  let offset = 0;
  while (offset < file.size) {
    const blob = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const BATCH = 8192;
    let binary = "";
    for (let i = 0; i < bytes.length; i += BATCH) {
      binary += String.fromCharCode(...bytes.subarray(i, i + BATCH));
    }
    chunks.push(btoa(binary));
    offset += CHUNK_SIZE;
  }
  return chunks;
}

export async function savePatientLocally(
  data: Omit<Patient, "id" | "synced" | "imageChunks" | "createdAt">,
  file: File | null
): Promise<number> {
  const imageChunks = file ? await fileToChunks(file) : [];
  const id = await db.patients.add({
    ...data,
    synced: false,
    imageChunks,
    createdAt: Date.now(),
  });
  return id as number;
}

export async function getUnsyncedPatients(): Promise<Patient[]> {
  const all = await db.patients.toArray();
  return all.filter((p) => p.synced === false);
}

export async function markAsSynced(id: number): Promise<void> {
  await db.patients.update(id, { synced: true });
}

export async function getAllPatients(): Promise<Patient[]> {
  return db.patients.orderBy("createdAt").reverse().toArray();
}
