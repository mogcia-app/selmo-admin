# Firestore Collection Design

MVPでは「打ち合わせごとの原本」と「表示用の集計済みデータ」を分けて持ちます。
Firestoreは重い集計が得意ではないため、管理画面は `monthlyStats` や `userMonthlyStats` を参照する前提です。

## Collections

### `users/{userId}`

```ts
type UserDocument = {
  name: string;
  email: string;
  role: "admin" | "sales";
  status: "active" | "inactive";
  enabledSalesDomains?: {
    meeting: boolean;
    teleapo: boolean;
  };
  workExperienceYears?: number | null;
  workExperienceMonths?: number | null;
  workExperienceLocked?: boolean;
  teamId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `companies/{companyId}`

```ts
type CompanyDocument = {
  companyName: string;
  plan: "standard" | "pro" | "enterprise";
  status: "active" | "inactive" | "suspended";
  monthlyTranscriptionQuota: number; // デフォルト10
  monthlyRoleplayQuota: number; // デフォルト15
  uploadDurationLimitMinutes?: 60 | 120 | 180 | 240; // 未設定時は60分
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

AI利用回数の契約表示は `monthlyTranscriptionQuota + monthlyRoleplayQuota` です。上限判定は別々に行い、商談/テレアポ分析は今月作成された `meetings` 件数、AIロープレは今月作成された `roleplayResults` 件数で数えます。`null` は無制限扱いですが、通常運用では数値を保存します。

### `meetings/{meetingId}`

```ts
type MeetingDocument = {
  userId: string;
  uploadedBy: string;
  customerName: string;
  companyName?: string;
  productType: string;
  customerType: "new" | "existing";
  recordedAt: Timestamp;
  location?: string;
  status: "considering" | "won" | "lost";
  audioFilePath?: string;
  audioDeletedAt?: Timestamp | null;
  audioMimeType: "audio/mpeg" | "audio/wav";
  durationSec?: number;
  processingStatus:
    | "uploaded"
    | "transcribing"
    | "analyzing"
    | "completed"
    | "failed";
  reanalysisCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `meetings/{meetingId}/transcript/current`

```ts
type TranscriptDocument = {
  fullText: string;
  salesText: string;
  customerText: string;
  language: string;
  summaryExcerpt?: string;
  segments: Array<{
    speaker: "sales" | "customer" | "unknown";
    startSec: number;
    endSec: number;
    text: string;
  }>;
  createdAt: Timestamp;
};
```

### `meetings/{meetingId}/metrics/current`

```ts
type MeetingMetricsDocument = {
  durationSec: number;
  salesTalkRatio: number;
  customerTalkRatio: number;
  salesCharacterCount: number;
  customerCharacterCount: number;
  questionCount: number;
  silenceSec?: number;
  keywordCounts: Record<string, number>;
  anxietyKeywordCounts: Record<string, number>;
  closingKeywordCounts: Record<string, number>;
  outcome: "considering" | "won" | "lost";
  manualScore: number;
  createdAt: Timestamp;
};
```

### `meetings/{meetingId}/manualChecks/current`

```ts
type ManualCheckDocument = {
  checklistVersionId: string;
  score: number;
  items: Array<{
    key: string;
    label: string;
    status: "ok" | "needs_improvement" | "ng";
    evidence?: string;
  }>;
  passedItems: string[];
  failedItems: string[];
  createdAt: Timestamp;
};
```

### `meetings/{meetingId}/aiComments/current`

```ts
type AICommentDocument = {
  goodPoints: string[];
  improvementPoints: string[];
  nextActions: string[];
  managerSummary: string;
  weakPointSummary?: string;
  promptVersion: string;
  createdAt: Timestamp;
};
```

### `meetingOutcomeHistory/{historyId}`

```ts
type MeetingOutcomeHistoryDocument = {
  meetingId: string;
  previousStatus?: "considering" | "won" | "lost";
  newStatus: "considering" | "won" | "lost";
  changedBy: string;
  changedAt: Timestamp;
  dealAmount?: number;
};
```

### `monthlyStats/{month}`

ドキュメントID例: `2026-05`

```ts
type MonthlyStatsDocument = {
  month: string;
  totalMeetingCount: number;
  totalWonMeetingCount: number;
  totalLostMeetingCount: number;
  averageDurationSec: number;
  productWinRates: Record<string, number>;
  topKeywords: Array<{ word: string; count: number }>;
  updatedAt: Timestamp;
};
```

### `userMonthlyStats/{userId_month}`

ドキュメントID例: `user_123_2026-05`

```ts
type UserMonthlyStatsDocument = {
  userId: string;
  month: string;
  meetingCount: number;
  wonMeetingCount: number;
  lostMeetingCount: number;
  consideringMeetingCount: number;
  winRate: number;
  averageDurationSec: number;
  averageManualScore: number;
  averageSalesTalkRatio: number;
  topKeywords: Array<{ word: string; count: number }>;
  lostKeywords: Array<{ word: string; count: number }>;
  updatedAt: Timestamp;
};
```

### `aiChargeEvents/{eventId}`

AI回数のチャージが発生したタイミングで作成します。請求管理側はこのコレクションを会社別・月別に集計し、`invoiceStatus: "unbilled"` のイベントを請求対象として扱います。請求書発行後は `invoiceStatus` を `"billed"` に更新する想定です。

請求時は `amount` だけでなく、`chargePlan`、税抜パッケージ価格の `packagePriceJpy`、税込請求額の `totalJpy` を参照します。1回チャージは税抜6,500円、10回チャージは税抜65,000円です。

```ts
type AiChargeEventDocument = {
  companyId: string;
  companyName: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  chargePlan: "single" | "ten_pack";
  packagePriceJpy: number;
  priceJpy: number; // packagePriceJpy と同じ税抜金額
  unitPriceJpy: 6500;
  totalJpy: number;
  status: "completed";
  createdAt: Timestamp;
  invoiceStatus: "unbilled" | "billed";
};
```

### `loginEvents/{eventId}`

ログイン成功・失敗を記録します。成功時は `uid` とユーザー属性を入れ、失敗時は未認証のため `uid: null` と失敗理由を残します。

```ts
type LoginEventDocument = {
  uid: string | null;
  email: string;
  role: "owner" | "admin" | "sales" | null;
  companyId: string | null;
  status: "success" | "failed";
  reason: string | null;
  variant: "default" | "admin" | "owner" | null;
  createdAt: Timestamp;
};
```

### `adminAuditLogs/{logId}`

管理画面からの会社設定、ユーザー、勤務年数、機能フラグ、告知、プロンプト変更を記録します。

```ts
type AdminAuditLogDocument = {
  actorId: string;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  companyId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Timestamp;
};
```

### `manualChecklists/{checklistId}`

```ts
type ManualChecklistDocument = {
  name: string;
  version: string;
  isActive: boolean;
  items: Array<{
    key: string;
    label: string;
    description?: string;
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `knowledgeCategories/{categoryId}`

```ts
type KnowledgeCategoryDocument = {
  title: string;
  description: string;
  knowledgeCount: number;
  memoCount: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `knowledgeProducts/{productId}`

```ts
type KnowledgeProductDocument = {
  name: string;
  logoUrl?: string;
  logoStoragePath?: string;
  knowledgeCount: number;
  tabs: string[];
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `knowledgeItems/{knowledgeId}`

```ts
type KnowledgeItemDocument = {
  title: string;
  description: string;
  body: string;
  tabTitle: string;
  categoryId: string | null;
  productId: string | null;
  ownerId: string;
  scope: "personal" | "shared";
  kind: "knowledge" | "memo" | "qa";
  tags: string[];
  links: Array<{
    title: string;
    url: string;
    description: string;
  }>;
  attachments: Array<{
    id: string;
    name: string;
    url: string;
    storagePath: string;
    contentType: string;
    size: number;
    uploadedAt: Timestamp;
    uploadedBy: string;
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

作成フロー:

- 営業ユーザーは `scope: "personal"` のナレッジ、メモ、Q&Aを作成できます。
- 管理者は `scope: "shared"` の共有ナレッジを作成できます。
- `categoryId` または `productId` が指定された場合、作成トランザクション内で `knowledgeCategories` / `knowledgeProducts` の件数と `updatedAt` を更新します。
- 画面上の初期カテゴリ `how-to` はアプリ内の固定カテゴリです。Firestore 上にカテゴリドキュメントがないため、カウンター更新対象には含めません。
- HPや外部ページは `links` に保存します。
- PDFなどの添付ファイルは Firebase Storage の `knowledge/{userId}/{knowledgeId}/attachments/*` に保存し、Firestore には参照メタ情報のみ保存します。
- 商品別ページでは `knowledgeProducts.tabs` を商品共通のタブ一覧として表示し、各ナレッジの `tabTitle` が一致するタブへ自動で入ります。
- 共有ナレッジも同じ `productId` と `tabTitle` を持っていれば、商品ページの同じタブ内に表示されます。

### `users/{userId}/knowledgeSearchHistory/{historyId}`

```ts
type KnowledgeSearchHistoryDocument = {
  term: string;
  searchedAt: Timestamp;
};
```

### `roleplayScenarios/{scenarioId}`

```ts
type RoleplayScenarioDocument = {
  title: string;
  description: string;
  productId: string | null;
  productName: string;
  customerRole: string;
  customerProfile: string;
  goal: string;
  objections: string[];
  evaluationCriteria: string[];
  difficulty: "easy" | "normal" | "hard";
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### `roleplayResults/{resultId}`

```ts
type RoleplayResultDocument = {
  scenarioId: string;
  scenarioTitle: string;
  productName: string;
  userId: string;
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  messages: Array<{
    role: "customer" | "sales";
    content: string;
    createdAt: string;
  }>;
  createdAt: Timestamp;
};
```

## Indexing Guidance

- `meetings`: `userId + recordedAt desc`
- `meetings`: `processingStatus + createdAt desc`
- `meetings`: `status + recordedAt desc`
- `userMonthlyStats`: `userId + month desc`
- `knowledgeCategories`: `updatedAt desc`
- `knowledgeProducts`: `updatedAt desc`
- `knowledgeItems`: `scope`
- `knowledgeItems`: `ownerId`
- `users/{userId}/knowledgeSearchHistory`: `searchedAt desc`
- `roleplayScenarios`: クライアント側で `updatedAt desc` に整列
- `roleplayResults`: クライアント側で `createdAt desc` に整列
- `roleplayResults`: `userId`

## Retention Rule

- 音声本体は月30件超過時に最古の `audioFilePath` を削除
- `meetings` ドキュメント自体は削除しない
- `transcript`, `metrics`, `manualChecks`, `aiComments`, `meetingOutcomeHistory` は保持

## Async Processing Flow

1. Next.js で音声アップロード情報を登録
2. Storage に音声保存
3. `meetings.processingStatus = uploaded`
4. Cloud Run / Functions がジョブ取得
5. 文字起こし、数値分析、マニュアルチェック、AIコメント生成
6. 各サブコレクションを保存
7. `monthlyStats`, `userMonthlyStats` を更新
8. `meetings.processingStatus = completed`
