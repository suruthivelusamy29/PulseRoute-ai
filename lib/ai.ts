import type { Patient } from "@/lib/db";

export type AiFeature = "summary" | "triage" | "handover";

export interface AiResult {
  feature: AiFeature;
  priority?: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  patientOverview?: string;
  currentVitalObservations?: string[];
  importantMedicalInformation?: string[];
  keyObservations: string[];
  concerns: string[];
  recommendedAttention: string;
  explanation?: string;
  handover?: string;
  disclaimer: string;
  mock: boolean;
}

export async function requestAi(feature: AiFeature, patient: Patient): Promise<AiResult> {
  const response = await fetch("http://localhost:4000/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feature, patient }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "AI service is unavailable.");
  return data as AiResult;
}