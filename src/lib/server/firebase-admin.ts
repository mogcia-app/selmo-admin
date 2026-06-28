import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

export function getAdminFirestore() {
  initializeAdminApp();
  return getFirestore();
}

export function getAdminAuth() {
  initializeAdminApp();
  return getAuth();
}

function initializeAdminApp() {
  if (!projectId) {
    throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID が未設定です。");
  }

  if (getApps().length === 0) {
    initializeApp({
      credential:
        clientEmail && privateKey
          ? cert({
              projectId,
              clientEmail,
              privateKey,
            })
          : applicationDefault(),
      projectId,
    });
  }
}
