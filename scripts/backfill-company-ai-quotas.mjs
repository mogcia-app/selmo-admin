import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const defaultMonthlyTranscriptionQuota = 10;
const defaultMonthlyRoleplayQuota = 15;

loadDotEnvLocal();

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const shouldApply = process.argv.includes("--apply");

if (!projectId) {
  console.error("Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID.");
  process.exit(1);
}

if (getApps().length === 0) {
  const credential =
    clientEmail && privateKey
      ? cert({
          projectId,
          clientEmail,
          privateKey,
        })
      : applicationDefault();

  initializeApp({
    credential,
    projectId,
  });
}

const db = getFirestore();

async function main() {
  console.log(
    shouldApply
      ? "Backfilling company AI quotas in APPLY mode."
      : "Backfilling company AI quotas in DRY-RUN mode. No data will be written.",
  );

  const snapshot = await db.collection("companies").get();
  let checked = 0;
  let changed = 0;
  const changedCompanyIds = [];

  for (const companyDoc of snapshot.docs) {
    checked += 1;
    const data = companyDoc.data();
    const patch = {};

    if (typeof data.monthlyTranscriptionQuota !== "number") {
      patch.monthlyTranscriptionQuota = defaultMonthlyTranscriptionQuota;
    }

    if (typeof data.monthlyRoleplayQuota !== "number") {
      patch.monthlyRoleplayQuota = defaultMonthlyRoleplayQuota;
    }

    if (Object.keys(patch).length === 0) {
      continue;
    }

    changed += 1;
    changedCompanyIds.push(companyDoc.id);

    if (shouldApply) {
      await companyDoc.ref.update({
        ...patch,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  console.log("");
  console.log("Backfill summary");
  console.log(`- companies checked: ${checked}`);
  console.log(`- companies ${shouldApply ? "updated" : "to update"}: ${changed}`);
  if (changedCompanyIds.length > 0) {
    console.log(`- company ids: ${changedCompanyIds.join(", ")}`);
  }
}

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  let content = "";

  try {
    content = readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
