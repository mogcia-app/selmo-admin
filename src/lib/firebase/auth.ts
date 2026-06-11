"use client";

import {
  createUserWithEmailAndPassword,
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type FirestoreError,
  type Unsubscribe,
} from "firebase/firestore";

import { assertFirebaseClient } from "@/lib/firebase/client";
import type { UserRole, UserStatus } from "@/types/domain";

export type AppUserProfile = {
  uid: string;
  email: string | null;
  name: string | null;
  companyId: string | null;
  role: UserRole;
  status: UserStatus;
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

export async function enableAuthPersistence() {
  const { firebaseAuth } = assertFirebaseClient();
  await setPersistence(firebaseAuth, browserLocalPersistence);
}

export async function signInWithEmail(email: string, password: string) {
  const { firebaseAuth, firestore } = assertFirebaseClient();
  await enableAuthPersistence();

  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  await setDoc(
    doc(firestore, "users", credential.user.uid),
    {
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  const profile = await fetchUserProfile(credential.user.uid);

  return {
    credential,
    profile,
  };
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
    name?: string;
    companyId?: string;
    role?: UserRole;
    status?: UserStatus;
    workExperienceYears?: number;
    workExperienceMonths?: number;
    workExperienceLocked?: boolean;
    createdAt?: { toDate?: () => Date };
    lastLoginAt?: { toDate?: () => Date };
  };

  if (!data.role) {
    return null;
  }

  return {
    uid,
    email: data.email ?? null,
    name: data.name ?? null,
    companyId: data.companyId ?? null,
    role: data.role,
    status: data.status ?? "active",
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
              name?: string;
              companyId?: string;
              role?: UserRole;
              status?: UserStatus;
              workExperienceYears?: number;
              workExperienceMonths?: number;
              workExperienceLocked?: boolean;
              createdAt?: { toDate?: () => Date };
              lastLoginAt?: { toDate?: () => Date };
            };

            if (!data.role) return null;

            return {
              uid: userSnapshot.id,
              email: data.email ?? null,
              name: data.name ?? null,
              companyId: data.companyId ?? null,
              role: data.role,
              status: data.status ?? "active",
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
