export const defaultMonthlyTranscriptionQuota = 10;

export const defaultMonthlyRoleplayQuota = 15;

export function getTotalMonthlyAiQuota(input: {
  monthlyTranscriptionQuota: number | null;
  monthlyRoleplayQuota: number | null;
}) {
  if (input.monthlyTranscriptionQuota === null || input.monthlyRoleplayQuota === null) {
    return null;
  }

  return input.monthlyTranscriptionQuota + input.monthlyRoleplayQuota;
}
