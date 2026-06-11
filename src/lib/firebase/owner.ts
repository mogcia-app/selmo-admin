"use client";

import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { writeAdminAuditLogSafely } from "@/lib/firebase/audit";
import { assertFirebaseClient } from "@/lib/firebase/client";
import type { CompanyPlan, CompanyStatus, UserRole, UserStatus } from "@/types/domain";

export type CompanyRecord = {
  id: string;
  companyName: string;
  plan: CompanyPlan;
  status: CompanyStatus;
  monthlyTranscriptionQuota: number | null;
  monthlyRoleplayQuota: number | null;
  monthlyFee: number | null;
  billingCurrency: "JPY";
  contractStartDate: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type FeatureFlagRecord = {
  id: string;
  companyId: string;
  aiAnalysis: boolean;
  aiRoleplay: boolean;
  knowledgeSearch: boolean;
  adminDashboard: boolean;
  newUi: boolean;
  betaFeatures: boolean;
  updatedAt: Date | null;
};

export type AnnouncementRecord = {
  id: string;
  title: string;
  body: string;
  target: "all" | "admins" | "sales";
  status: "draft" | "published";
  startsAt: Date | null;
  endsAt: Date | null;
  kind: "maintenance" | "feature" | "notice";
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type AiPromptRecord = {
  id: string;
  promptType: string;
  title: string;
  body: string;
  version: string;
  isActive: boolean;
  updatedAt: Date | null;
};

export type AiUsageLogRecord = {
  id: string;
  companyId: string | null;
  userId: string | null;
  feature: "transcription" | "transcript_blocks" | "summary" | "conversation_analysis" | "roleplay" | "knowledge_search" | string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  audioDurationSec: number | null;
  estimatedCostUsd: number | null;
  status: "success" | "failed" | string;
  errorMessage: string | null;
  createdAt: Date | null;
};

export type AiChargeEventRecord = {
  id: string;
  companyId: string | null;
  companyName: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  amount: number;
  chargePlan: "single" | "ten_pack" | string;
  packagePriceJpy: number | null;
  priceJpy: number | null;
  unitPriceJpy: number | null;
  totalJpy: number | null;
  status: "completed" | string;
  invoiceStatus: "unbilled" | "billed" | string;
  createdAt: Date | null;
};

export type KnowledgeSearchEventRecord = {
  id: string;
  companyId: string | null;
  userId: string | null;
  query: string;
  resultCount: number | null;
  usedAi: boolean;
  createdAt: Date | null;
};

export type SystemErrorRecord = {
  id: string;
  companyId: string | null;
  userId: string | null;
  kind: "OpenAI" | "Firebase" | "Storage" | "Cloud Run" | "Auth" | "API" | string;
  message: string;
  severity: "info" | "warning" | "critical" | string;
  status: "open" | "investigating" | "resolved" | string;
  occurredAt: Date | null;
  source: string | null;
};

export type AudioProcessingJobRecord = {
  id: string;
  companyId: string | null;
  userId: string | null;
  meetingId: string | null;
  fileName: string | null;
  audioDurationSec: number | null;
  status: "waiting" | "uploading" | "transcribing" | "analyzing" | "completed" | "failed" | string;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  updatedAt: Date | null;
};

export function subscribeToCompanies(
  callback: (companies: CompanyRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();

  return onSnapshot(
    query(collection(firestore, "companies")),
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapCompany)
          .sort((left, right) => left.companyName.localeCompare(right.companyName, "ja")),
      ),
    onError,
  );
}

export async function createCompany(input: {
  companyName: string;
  plan: CompanyPlan;
  status: CompanyStatus;
  monthlyTranscriptionQuota?: number | null;
  monthlyRoleplayQuota?: number | null;
}) {
  const { firestore } = assertFirebaseClient();
  const companyRef = doc(collection(firestore, "companies"));
  const defaultQuota = defaultMonthlyAiQuotas[input.plan];

  await setDoc(companyRef, {
    companyName: input.companyName,
    plan: input.plan,
    status: input.status,
    monthlyTranscriptionQuota: input.monthlyTranscriptionQuota ?? defaultQuota,
    monthlyRoleplayQuota: input.monthlyRoleplayQuota ?? defaultQuota,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  writeAdminAuditLogSafely({
    action: "company.create",
    targetType: "company",
    targetId: companyRef.id,
    companyId: companyRef.id,
    metadata: {
      companyName: input.companyName,
      plan: input.plan,
      status: input.status,
      monthlyTranscriptionQuota: input.monthlyTranscriptionQuota ?? defaultQuota,
      monthlyRoleplayQuota: input.monthlyRoleplayQuota ?? defaultQuota,
    },
  });

  return companyRef.id;
}

export async function updateCompany(
  companyId: string,
  input: Partial<Pick<CompanyRecord, "companyName" | "plan" | "status" | "monthlyTranscriptionQuota" | "monthlyRoleplayQuota" | "monthlyFee" | "billingCurrency" | "contractStartDate">>,
) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "companies", companyId), {
    ...input,
    updatedAt: serverTimestamp(),
  });

  writeAdminAuditLogSafely({
    action: "company.update",
    targetType: "company",
    targetId: companyId,
    companyId,
    metadata: input,
  });
}

export function subscribeToFeatureFlags(
  callback: (flags: FeatureFlagRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();

  return onSnapshot(
    collection(firestore, "featureFlags"),
    (snapshot) => callback(snapshot.docs.map(mapFeatureFlag)),
    onError,
  );
}

export async function updateCompanyFeatureFlags(
  companyId: string,
  input: Partial<Omit<FeatureFlagRecord, "id" | "companyId" | "updatedAt">>,
) {
  const { firestore } = assertFirebaseClient();

  await setDoc(
    doc(firestore, "featureFlags", companyId),
    {
      companyId,
      ...input,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  writeAdminAuditLogSafely({
    action: "feature_flags.update",
    targetType: "featureFlags",
    targetId: companyId,
    companyId,
    metadata: input,
  });
}

export function subscribeToAnnouncements(
  callback: (announcements: AnnouncementRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();

  return onSnapshot(
    query(collection(firestore, "announcements"), orderBy("updatedAt", "desc")),
    (snapshot) => callback(snapshot.docs.map(mapAnnouncement)),
    onError,
  );
}

export async function createAnnouncement(input: Omit<AnnouncementRecord, "id" | "createdAt" | "updatedAt">) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "announcements"), {
    ...input,
    startsAt: input.startsAt ? Timestamp.fromDate(input.startsAt) : null,
    endsAt: input.endsAt ? Timestamp.fromDate(input.endsAt) : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).then((announcementRef) => {
    writeAdminAuditLogSafely({
      action: "announcement.create",
      targetType: "announcement",
      targetId: announcementRef.id,
      metadata: {
        title: input.title,
        target: input.target,
        status: input.status,
        kind: input.kind,
      },
    });
  });
}

export async function updateAnnouncement(
  announcementId: string,
  input: Partial<Omit<AnnouncementRecord, "id" | "createdAt" | "updatedAt">>,
) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "announcements", announcementId), {
    ...input,
    ...(input.startsAt !== undefined ? { startsAt: input.startsAt ? Timestamp.fromDate(input.startsAt) : null } : {}),
    ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? Timestamp.fromDate(input.endsAt) : null } : {}),
    updatedAt: serverTimestamp(),
  });

  writeAdminAuditLogSafely({
    action: "announcement.update",
    targetType: "announcement",
    targetId: announcementId,
    metadata: input,
  });
}

export function subscribeToAiPrompts(
  callback: (prompts: AiPromptRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();

  return onSnapshot(
    query(collection(firestore, "aiPrompts"), orderBy("updatedAt", "desc")),
    (snapshot) => callback(snapshot.docs.map(mapAiPrompt)),
    onError,
  );
}

export function subscribeToAiUsageLogs(
  callback: (logs: AiUsageLogRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();

  return onSnapshot(
    collection(firestore, "aiUsageLogs"),
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapAiUsageLog)
          .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

export function subscribeToAiChargeEvents(
  callback: (events: AiChargeEventRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();

  return onSnapshot(
    collection(firestore, "aiChargeEvents"),
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapAiChargeEvent)
          .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

export function subscribeToKnowledgeSearchEvents(
  callback: (events: KnowledgeSearchEventRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();

  return onSnapshot(
    collection(firestore, "knowledgeSearchEvents"),
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapKnowledgeSearchEvent)
          .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

export function subscribeToSystemErrors(
  callback: (errors: SystemErrorRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();

  return onSnapshot(
    collection(firestore, "systemErrors"),
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapSystemError)
          .sort((left, right) => (right.occurredAt?.getTime() ?? 0) - (left.occurredAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

export function subscribeToAudioProcessingJobs(
  callback: (jobs: AudioProcessingJobRecord[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();

  return onSnapshot(
    collection(firestore, "audioProcessingJobs"),
    (snapshot) =>
      callback(
        snapshot.docs
          .map(mapAudioProcessingJob)
          .sort((left, right) => (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0)),
      ),
    onError,
  );
}

export async function saveAiPrompt(input: Omit<AiPromptRecord, "id" | "updatedAt"> & { id?: string }) {
  const { firestore } = assertFirebaseClient();
  const promptRef = input.id ? doc(firestore, "aiPrompts", input.id) : doc(collection(firestore, "aiPrompts"));

  await setDoc(
    promptRef,
    {
      promptType: input.promptType,
      title: input.title,
      body: input.body,
      version: input.version,
      isActive: input.isActive,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  writeAdminAuditLogSafely({
    action: input.id ? "ai_prompt.update" : "ai_prompt.create",
    targetType: "aiPrompt",
    targetId: promptRef.id,
    metadata: {
      promptType: input.promptType,
      title: input.title,
      version: input.version,
      isActive: input.isActive,
    },
  });

  return promptRef.id;
}

export async function updateUserByOwner(
  uid: string,
  input: Partial<{
    role: UserRole;
    status: UserStatus;
    companyId: string;
    name: string;
  }>,
) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "users", uid), {
    ...input,
    updatedAt: serverTimestamp(),
  });

  writeAdminAuditLogSafely({
    action: "user.update",
    targetType: "user",
    targetId: uid,
    companyId: input.companyId ?? null,
    metadata: input,
  });
}

function mapCompany(snapshot: QueryDocumentSnapshot): CompanyRecord {
  const data = snapshot.data();
  const plan: CompanyPlan =
    data.plan === "pro" || data.plan === "enterprise" || data.plan === "standard"
      ? data.plan
      : "standard";
  const status =
    data.status === "inactive" || data.status === "suspended" ? data.status : "active";

  return {
    id: snapshot.id,
    companyName: readString(data.companyName, "未設定の会社"),
    plan,
    status,
    monthlyTranscriptionQuota: readQuota(data.monthlyTranscriptionQuota, defaultMonthlyAiQuotas[plan]),
    monthlyRoleplayQuota: readQuota(data.monthlyRoleplayQuota, defaultMonthlyAiQuotas[plan]),
    monthlyFee: readNullableNumber(data.monthlyFee),
    billingCurrency: "JPY",
    contractStartDate: readDate(data.contractStartDate) ?? readDate(data.createdAt),
    createdAt: readDate(data.createdAt),
    updatedAt: readDate(data.updatedAt),
  };
}

function mapFeatureFlag(snapshot: QueryDocumentSnapshot): FeatureFlagRecord {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    companyId: readString(data.companyId, snapshot.id),
    aiAnalysis: readBoolean(data.aiAnalysis),
    aiRoleplay: readBoolean(data.aiRoleplay),
    knowledgeSearch: readBoolean(data.knowledgeSearch),
    adminDashboard: readBoolean(data.adminDashboard),
    newUi: readBoolean(data.newUi),
    betaFeatures: readBoolean(data.betaFeatures),
    updatedAt: readDate(data.updatedAt),
  };
}

function mapAnnouncement(snapshot: QueryDocumentSnapshot): AnnouncementRecord {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    title: readString(data.title, "無題のお知らせ"),
    body: readString(data.body),
    target: data.target === "admins" || data.target === "sales" ? data.target : "all",
    status: data.status === "published" ? "published" : "draft",
    startsAt: readDate(data.startsAt),
    endsAt: readDate(data.endsAt),
    kind: data.kind === "maintenance" || data.kind === "feature" ? data.kind : "notice",
    createdAt: readDate(data.createdAt),
    updatedAt: readDate(data.updatedAt),
  };
}

function mapAiPrompt(snapshot: QueryDocumentSnapshot): AiPromptRecord {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    promptType: readString(data.promptType),
    title: readString(data.title, "無題のプロンプト"),
    body: readString(data.body),
    version: readString(data.version, "v1"),
    isActive: readBoolean(data.isActive),
    updatedAt: readDate(data.updatedAt),
  };
}

function mapAiUsageLog(snapshot: QueryDocumentSnapshot): AiUsageLogRecord {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    userId: readNullableString(data.userId),
    feature: readString(data.feature),
    model: readNullableString(data.model),
    inputTokens: readNullableNumber(data.inputTokens),
    outputTokens: readNullableNumber(data.outputTokens),
    audioDurationSec: readNullableNumber(data.audioDurationSec),
    estimatedCostUsd: readNullableNumber(data.estimatedCostUsd),
    status: readString(data.status),
    errorMessage: readNullableString(data.errorMessage),
    createdAt: readDate(data.createdAt),
  };
}

function mapAiChargeEvent(snapshot: QueryDocumentSnapshot): AiChargeEventRecord {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    companyName: readString(data.companyName, "未設定の会社"),
    userId: readNullableString(data.userId),
    userName: readString(data.userName, "未設定"),
    userEmail: readString(data.userEmail),
    amount: readNullableNumber(data.amount) ?? 0,
    chargePlan: readString(data.chargePlan),
    packagePriceJpy: readNullableNumber(data.packagePriceJpy),
    priceJpy: readNullableNumber(data.priceJpy),
    unitPriceJpy: readNullableNumber(data.unitPriceJpy),
    totalJpy: readNullableNumber(data.totalJpy),
    status: readString(data.status, "completed"),
    invoiceStatus: readString(data.invoiceStatus, "unbilled"),
    createdAt: readDate(data.createdAt),
  };
}

function mapKnowledgeSearchEvent(snapshot: QueryDocumentSnapshot): KnowledgeSearchEventRecord {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    userId: readNullableString(data.userId),
    query: readString(data.query),
    resultCount: readNullableNumber(data.resultCount),
    usedAi: readBoolean(data.usedAi),
    createdAt: readDate(data.createdAt),
  };
}

function mapSystemError(snapshot: QueryDocumentSnapshot): SystemErrorRecord {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    userId: readNullableString(data.userId),
    kind: readString(data.kind, "API"),
    message: readString(data.message),
    severity: readString(data.severity, "warning"),
    status: readString(data.status, "open"),
    occurredAt: readDate(data.occurredAt),
    source: readNullableString(data.source),
  };
}

function mapAudioProcessingJob(snapshot: QueryDocumentSnapshot): AudioProcessingJobRecord {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    companyId: readNullableString(data.companyId),
    userId: readNullableString(data.userId),
    meetingId: readNullableString(data.meetingId),
    fileName: readNullableString(data.fileName),
    audioDurationSec: readNullableNumber(data.audioDurationSec),
    status: readString(data.status, "waiting"),
    startedAt: readDate(data.startedAt),
    completedAt: readDate(data.completedAt),
    errorMessage: readNullableString(data.errorMessage),
    retryCount: readNullableNumber(data.retryCount) ?? 0,
    updatedAt: readDate(data.updatedAt),
  };
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : null;
}

function readNullableNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function readBoolean(value: unknown) {
  return value === true;
}

function readQuota(value: unknown, fallback: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

export const defaultMonthlyAiQuotas: Record<CompanyPlan, number | null> = {
  standard: 15,
  pro: 30,
  enterprise: null,
};
