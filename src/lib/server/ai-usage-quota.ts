import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/server/firebase-admin";
import type { CompanyPlan } from "@/types/domain";

export type AiQuotaFeature = "transcription" | "roleplay";

export type AiUsageLogFeature =
  | AiQuotaFeature
  | "transcript_blocks"
  | "summary"
  | "conversation_analysis"
  | "knowledge_search";

type CompanyQuotaRecord = {
  companyId: string;
  companyName: string;
  plan: CompanyPlan;
  monthlyTranscriptionQuota: number | null;
  monthlyRoleplayQuota: number | null;
};

const defaultMonthlyAiQuotas: Record<CompanyPlan, number | null> = {
  standard: 15,
  pro: 30,
  enterprise: null,
};

export async function readMeetingQuotaContext(meetingId: string) {
  const db = getAdminFirestore();
  const snapshot = await db.collection("meetings").doc(meetingId).get();

  if (!snapshot.exists) {
    throw new Error("対象の商談が見つかりません。");
  }

  const data = snapshot.data() ?? {};
  return {
    companyId: readNullableString(data.companyId),
    userId: readNullableString(data.userId),
  };
}

export async function assertAndConsumeAiQuota(input: {
  companyId: string | null;
  userId: string | null;
  feature: AiQuotaFeature;
  model: string | null;
  meetingId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await assertAiQuotaAvailable(input);

  return writeAiUsageLog({
    companyId: input.companyId,
    userId: input.userId,
    feature: input.feature,
    model: input.model,
    meetingId: input.meetingId,
    status: "success",
  });
}

export async function assertAiQuotaAvailable(input: {
  companyId: string | null;
  feature: AiQuotaFeature;
}) {
  if (!input.companyId) {
    return;
  }

  const company = await readCompanyQuota(input.companyId);
  const limit = input.feature === "transcription" ? company.monthlyTranscriptionQuota : company.monthlyRoleplayQuota;

  if (limit !== null) {
    const used = await countMonthlyUsage(input.companyId, input.feature);

    if (used >= limit) {
      const label = input.feature === "transcription" ? "音声文字起こし" : "ロープレ";
      throw new AiQuotaExceededError(`${label}の月間利用上限（${limit}回）に達しています。プラン変更または上限回数の変更を行ってください。`, {
        feature: input.feature,
        limit,
        used,
      });
    }
  }
}

export async function writeAiUsageLog(input: {
  companyId: string | null;
  userId: string | null;
  feature: AiUsageLogFeature;
  model: string | null;
  meetingId?: string | null;
  audioDurationSec?: number | null;
  estimatedCostUsd?: number | null;
  status?: "success" | "failed";
  errorMessage?: string | null;
}) {
  if (!input.companyId) {
    return;
  }

  const db = getAdminFirestore();
  await db.collection("aiUsageLogs").add({
    companyId: input.companyId,
    userId: input.userId,
    feature: input.feature,
    model: input.model,
    meetingId: input.meetingId ?? null,
    inputTokens: null,
    outputTokens: null,
    audioDurationSec: input.audioDurationSec ?? null,
    estimatedCostUsd: input.estimatedCostUsd ?? null,
    status: input.status ?? "success",
    errorMessage: input.errorMessage ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function readCompanyQuota(companyId: string): Promise<CompanyQuotaRecord> {
  const db = getAdminFirestore();
  const snapshot = await db.collection("companies").doc(companyId).get();

  if (!snapshot.exists) {
    throw new Error("会社情報が見つかりません。");
  }

  const data = snapshot.data() ?? {};
  const plan = readCompanyPlan(data.plan);
  const fallback = defaultMonthlyAiQuotas[plan];

  return {
    companyId,
    companyName: readString(data.companyName, "未設定の会社"),
    plan,
    monthlyTranscriptionQuota: readQuota(data.monthlyTranscriptionQuota, fallback),
    monthlyRoleplayQuota: readQuota(data.monthlyRoleplayQuota, fallback),
  };
}

async function countMonthlyUsage(companyId: string, feature: AiQuotaFeature) {
  const db = getAdminFirestore();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const snapshot = await db
    .collection("aiUsageLogs")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.filter((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;

    return (
      data.feature === feature &&
      data.status === "success" &&
      createdAt !== null &&
      createdAt >= monthStart &&
      createdAt < nextMonthStart
    );
  }).length;
}

function readCompanyPlan(value: unknown): CompanyPlan {
  return value === "pro" || value === "enterprise" || value === "standard" ? value : "standard";
}

function readQuota(value: unknown, fallback: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export class AiQuotaExceededError extends Error {
  feature: AiQuotaFeature;
  limit: number;
  used: number;

  constructor(message: string, input: { feature: AiQuotaFeature; limit: number; used: number }) {
    super(message);
    this.name = "AiQuotaExceededError";
    this.feature = input.feature;
    this.limit = input.limit;
    this.used = input.used;
  }
}
