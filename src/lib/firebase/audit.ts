"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { assertFirebaseClient, firebaseAuth } from "@/lib/firebase/client";

type AdminAuditLogInput = {
  action: string;
  targetType: string;
  targetId: string;
  companyId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAdminAuditLog(input: AdminAuditLogInput) {
  const { firestore } = assertFirebaseClient();
  const actor = firebaseAuth?.currentUser;

  if (!actor) {
    return;
  }

  await addDoc(collection(firestore, "adminAuditLogs"), {
    actorId: actor.uid,
    actorEmail: actor.email ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    companyId: input.companyId ?? null,
    metadata: input.metadata ?? {},
    createdAt: serverTimestamp(),
  });
}

export function writeAdminAuditLogSafely(input: AdminAuditLogInput) {
  void writeAdminAuditLog(input).catch(() => {
    // Audit logging must not block the operation that already succeeded.
  });
}
