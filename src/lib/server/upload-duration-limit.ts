import { getAdminFirestore } from "@/lib/server/firebase-admin";
import {
  getUploadDurationLimitErrorMessage,
  isWithinUploadDurationLimit,
  normalizeUploadDurationLimitMinutes,
} from "@/lib/upload-duration-limit";

export class UploadDurationLimitExceededError extends Error {
  constructor(public readonly limitMinutes: number) {
    super(getUploadDurationLimitErrorMessage(limitMinutes));
    this.name = "UploadDurationLimitExceededError";
  }
}

export async function assertMeetingUploadDurationLimit(input: {
  companyId: string | null;
  audioDurationSec: number | null | undefined;
}) {
  const limitMinutes = await readCompanyUploadDurationLimitMinutes(input.companyId);

  if (!isWithinUploadDurationLimit(input.audioDurationSec, limitMinutes)) {
    throw new UploadDurationLimitExceededError(limitMinutes);
  }
}

async function readCompanyUploadDurationLimitMinutes(companyId: string | null) {
  if (!companyId) {
    return normalizeUploadDurationLimitMinutes(null);
  }

  const snapshot = await getAdminFirestore().collection("companies").doc(companyId).get();
  const data = snapshot.data() ?? {};
  return normalizeUploadDurationLimitMinutes(data.uploadDurationLimitMinutes);
}
