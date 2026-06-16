"use client";

import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";
import type { EnabledSalesDomains, SalesDomain, UserRole, UserStatus } from "@/types/domain";

export type AppUserProfile = {
  uid: string;
  email: string | null;
  authEmail: string | null;
  name: string | null;
  companyId: string | null;
  role: UserRole;
  status: UserStatus;
  enabledSalesDomains: EnabledSalesDomains;
  workExperienceYears: number | null;
  workExperienceMonths: number | null;
  workExperienceLocked: boolean;
  createdAt: Date | null;
  lastLoginAt: Date | null;
};

type RegisterUserInput = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  companyId?: string;
  companyName?: string;
};

export async function enableAuthPersistence(rememberMe = true) {
  const { firebaseAuth } = assertFirebaseClient();
  await setPersistence(
    firebaseAuth,
    rememberMe ? browserLocalPersistence : browserSessionPersistence,
  );
}

export async function signInWithEmail(email: string, password: string, rememberMe = true) {
  const { firebaseAuth, firestore } = assertFirebaseClient();
  await enableAuthPersistence(rememberMe);

  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  const profile = await fetchUserProfile(credential.user.uid);
  if (!profile) {
    await signOut(firebaseAuth);
    await recordLoginEventSafely({
      status: "failed",
      uid: credential.user.uid,
      email,
      role: null,
      companyId: null,
      reason: "profile_not_found",
    });
    throw new Error("auth/profile-not-found");
  }

  if (profile.status !== "active") {
    await signOut(firebaseAuth);
    await recordLoginEventSafely({
      status: "failed",
      uid: credential.user.uid,
      email,
      role: profile.role,
      companyId: profile.companyId,
      reason: "profile_inactive",
    });
    throw new Error("auth/profile-inactive");
  }

  void updateDoc(doc(firestore, "users", credential.user.uid), {
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch((error) => {
    console.warn("Failed to update last login timestamp.", error);
  });

  void recordLoginEventSafely({
    status: "success",
    uid: credential.user.uid,
    email,
    role: profile?.role ?? null,
    companyId: profile?.companyId ?? null,
  });

  return {
    credential,
    profile,
  };
}

export async function recordLoginFailure(input: {
  email: string;
  reason: string;
  variant: "default" | "admin" | "owner";
}) {
  await recordLoginEvent({
    status: "failed",
    uid: null,
    email: input.email,
    role: null,
    companyId: null,
    reason: input.reason,
    variant: input.variant,
  });
}

export async function registerUser({
  email,
  name,
  password,
  role,
  companyId,
  companyName,
}: RegisterUserInput) {
  const { firebaseAuth, firestore } = assertFirebaseClient();
  await enableAuthPersistence();

  const credential = await createUserWithEmailAndPassword(
    firebaseAuth,
    email,
    password,
  );
  const resolvedCompanyId = companyId || (role === "owner" ? "selmo-owner" : doc(collection(firestore, "companies")).id);

  if (!companyId && role !== "owner") {
    await setDoc(doc(firestore, "companies", resolvedCompanyId), {
      companyName: companyName?.trim() || name,
      plan: "standard",
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await setDoc(doc(firestore, "users", credential.user.uid), {
    uid: credential.user.uid,
    companyId: resolvedCompanyId,
    name,
    email,
    role,
    status: "active",
    enabledSalesDomains: {
      meeting: true,
      teleapo: true,
    },
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const profile = await fetchUserProfile(credential.user.uid);

  return {
    credential,
    profile,
  };
}

export async function signOutUser() {
  const { firebaseAuth } = assertFirebaseClient();
  await signOut(firebaseAuth);
}

export function subscribeToAuthState(
  callback: (payload: { user: User | null; profile: AppUserProfile | null }) => void,
) {
  const { firebaseAuth } = assertFirebaseClient();

  return onAuthStateChanged(firebaseAuth, async (user) => {
    if (!user) {
      callback({ user: null, profile: null });
      return;
    }

    const profile = await fetchUserProfile(user.uid);
    callback({ user, profile });
  });
}

export async function fetchUserProfile(uid: string): Promise<AppUserProfile | null> {
  const { firestore } = assertFirebaseClient();
  const userRef = doc(firestore, "users", uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as {
    email?: string;
    authEmail?: string;
    name?: string;
    companyId?: string;
    role?: UserRole;
    status?: UserStatus;
    workExperienceYears?: number;
    workExperienceMonths?: number;
    workExperienceLocked?: boolean;
    enabledSalesDomains?: Partial<EnabledSalesDomains>;
    createdAt?: { toDate?: () => Date };
    lastLoginAt?: { toDate?: () => Date };
  };

  if (!data.role) {
    return null;
  }

  return {
    uid,
    email: data.email ?? null,
    authEmail: data.authEmail ?? data.email ?? null,
    name: data.name ?? null,
    companyId: data.companyId ?? null,
    role: data.role,
    status: data.status ?? "active",
    enabledSalesDomains: readEnabledSalesDomains(data.enabledSalesDomains),
    workExperienceYears: readNullableNumber(data.workExperienceYears),
    workExperienceMonths: readNullableNumber(data.workExperienceMonths),
    workExperienceLocked: data.workExperienceLocked === true,
    createdAt: toDate(data.createdAt),
    lastLoginAt: toDate(data.lastLoginAt),
  };
}

export function subscribeToUserProfiles(
  callback: (profiles: AppUserProfile[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe {
  const { firestore } = assertFirebaseClient();

  return onSnapshot(
    collection(firestore, "users"),
    (snapshot) => {
      callback(
        snapshot.docs
          .map((userSnapshot) => {
            const data = userSnapshot.data() as {
              email?: string;
              authEmail?: string;
              name?: string;
              companyId?: string;
              role?: UserRole;
              status?: UserStatus;
              workExperienceYears?: number;
              workExperienceMonths?: number;
              workExperienceLocked?: boolean;
              enabledSalesDomains?: Partial<EnabledSalesDomains>;
              createdAt?: { toDate?: () => Date };
              lastLoginAt?: { toDate?: () => Date };
            };

            if (!data.role) return null;

            return {
              uid: userSnapshot.id,
              email: data.email ?? null,
              authEmail: data.authEmail ?? data.email ?? null,
              name: data.name ?? null,
              companyId: data.companyId ?? null,
              role: data.role,
              status: data.status ?? "active",
              enabledSalesDomains: readEnabledSalesDomains(data.enabledSalesDomains),
              workExperienceYears: readNullableNumber(data.workExperienceYears),
              workExperienceMonths: readNullableNumber(data.workExperienceMonths),
              workExperienceLocked: data.workExperienceLocked === true,
              createdAt: toDate(data.createdAt),
              lastLoginAt: toDate(data.lastLoginAt),
            };
          })
          .filter((profile): profile is AppUserProfile => Boolean(profile)),
      );
    },
    onError,
  );
}

function toDate(value: { toDate?: () => Date } | undefined) {
  return typeof value?.toDate === "function" ? value.toDate() : null;
}

function readNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readEnabledSalesDomains(value: unknown): EnabledSalesDomains {
  if (!value || typeof value !== "object") {
    return { meeting: true, teleapo: true };
  }

  const domains = value as Partial<Record<SalesDomain, unknown>>;

  return {
    meeting: typeof domains.meeting === "boolean" ? domains.meeting : true,
    teleapo: typeof domains.teleapo === "boolean" ? domains.teleapo : true,
  };
}

export function canAccessSalesDomain(profile: AppUserProfile | null, domain: SalesDomain) {
  if (!profile) return false;
  if (profile.role === "admin" || profile.role === "owner") return true;
  return profile.enabledSalesDomains[domain];
}

async function recordLoginEvent(input: {
  status: "success" | "failed";
  uid: string | null;
  email: string;
  role: UserRole | null;
  companyId: string | null;
  reason?: string;
  variant?: "default" | "admin" | "owner";
}) {
  const { firestore } = assertFirebaseClient();

  await addDoc(collection(firestore, "loginEvents"), {
    uid: input.uid,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    companyId: input.companyId,
    status: input.status,
    reason: input.reason ?? null,
    variant: input.variant ?? null,
    createdAt: serverTimestamp(),
  });
}

async function recordLoginEventSafely(input: Parameters<typeof recordLoginEvent>[0]) {
  try {
    await recordLoginEvent(input);
  } catch (error) {
    console.warn("Failed to record login event.", error);
  }
}
