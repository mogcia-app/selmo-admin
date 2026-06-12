export type UserRole = "owner" | "admin" | "sales";

export type SalesDomain = "meeting" | "teleapo";

export type EnabledSalesDomains = Record<SalesDomain, boolean>;

export type CompanyPlan = "standard" | "pro" | "enterprise";

export type CompanyStatus = "active" | "inactive" | "suspended";

export type UserStatus = "active" | "inactive";

export type MeetingOutcome = "considering" | "won" | "lost";

export type CustomerType = "new" | "existing";

export type ManualCheckStatus = "ok" | "needs_improvement" | "ng";

export type ProcessingStatus =
  | "uploading"
  | "uploaded"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed";
