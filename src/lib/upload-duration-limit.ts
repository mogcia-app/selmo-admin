export const uploadDurationLimitOptions = [60, 120, 180, 240] as const;

export type UploadDurationLimitMinutes = (typeof uploadDurationLimitOptions)[number];

export const defaultUploadDurationLimitMinutes: UploadDurationLimitMinutes = 60;

export const uploadDurationGraceMinutes = 3;

export function getEffectiveUploadDurationLimitSec(limitMinutes: number | null | undefined) {
  return (normalizeUploadDurationLimitMinutes(limitMinutes) + uploadDurationGraceMinutes) * 60;
}

export function normalizeUploadDurationLimitMinutes(
  limitMinutes: unknown,
): UploadDurationLimitMinutes {
  return uploadDurationLimitOptions.includes(limitMinutes as UploadDurationLimitMinutes)
    ? (limitMinutes as UploadDurationLimitMinutes)
    : defaultUploadDurationLimitMinutes;
}

export function isWithinUploadDurationLimit(
  durationSec: number | null | undefined,
  limitMinutes: number | null | undefined,
) {
  return (
    typeof durationSec === "number" &&
    Number.isFinite(durationSec) &&
    durationSec <= getEffectiveUploadDurationLimitSec(limitMinutes)
  );
}

export function getUploadDurationLimitErrorMessage(limitMinutes: number | null | undefined) {
  return `この会社でアップロードできる音声は1ファイル${normalizeUploadDurationLimitMinutes(limitMinutes)}分までです`;
}
