"use client";

import { firebaseAuth } from "@/lib/firebase/client";
import type { UserRole } from "@/types/domain";

export type CreateTenantUserInput = {
  companyId: string;
  role: Extract<UserRole, "admin" | "sales">;
  name: string;
  email: string;
  password: string;
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
  const data = (await response.json()) as { uid?: string; error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "ユーザー追加に失敗しました。");
  }

  if (!data.uid) {
    throw new Error("作成されたユーザーIDを取得できませんでした。");
  }

  return data.uid;
}
