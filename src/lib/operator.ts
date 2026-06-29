export const operatorEmail = "marina.ishida@mogcia.com";

export function isOperatorEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() === operatorEmail;
}

export function isOperatorProfile(profile: {
  authEmail?: string | null;
  email?: string | null;
} | null) {
  return Boolean(profile && (isOperatorEmail(profile.authEmail) || isOperatorEmail(profile.email)));
}
