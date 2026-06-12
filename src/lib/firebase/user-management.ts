"use client";

import { doc, serverTimestamp, updateDoc } from "firebase/firestore";

import { writeAdminAuditLogSafely } from "@/lib/firebase/audit";
import { assertFirebaseClient, firebaseAuth } from "@/lib/firebase/client";
import type { EnabledSalesDomains, UserRole } from "@/types/domain";

export type CreateTenantUserInput = {
  companyId: string;
  role: Extract<UserRole, "admin" | "sales">;
  name: string;
  email: string;
  password: string;
  enabledSalesDomains?: EnabledSalesDomains;
  workExperienceYears?: number | null;
  workExperienceMonths?: number | null;
};

export async function createTenantUser(input: CreateTenantUserInput) {
  const token = await firebaseAuth?.currentUser?.getIdToken();

  if (!token) {
    throw new Error("ログイン情報を確認できませんでした。");
  }

  const response = await fetch("/api/users/create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as { uid?: string; authEmail?: string; error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "ユーザー追加に失敗しました。");
  }

  if (!data.uid) {
    throw new Error("作成されたユーザーIDを取得できませんでした。");
  }

  writeAdminAuditLogSafely({
    action: "user.create",
    targetType: "user",
    targetId: data.uid,
    companyId: input.companyId,
    metadata: {
      role: input.role,
      email: input.email,
      authEmail: data.authEmail ?? input.email,
      name: input.name,
      enabledSalesDomains: input.enabledSalesDomains ?? null,
      workExperienceYears: input.workExperienceYears ?? null,
      workExperienceMonths: input.workExperienceMonths ?? null,
    },
  });

  return data.uid;
}

export async function updateSalesWorkExperience(input: {
  uid: string;
  companyId?: string | null;
  years: number;
  months: number;
}) {
  const { firestore } = assertFirebaseClient();

  await updateDoc(doc(firestore, "users", input.uid), {
    workExperienceYears: input.years,
    workExperienceMonths: input.months,
    workExperienceLocked: true,
    updatedAt: serverTimestamp(),
  });

  writeAdminAuditLogSafely({
    action: "user.work_experience.update",
    targetType: "user",
    targetId: input.uid,
    companyId: input.companyId ?? null,
    metadata: {
      workExperienceYears: input.years,
      workExperienceMonths: input.months,
    },
  });
}
