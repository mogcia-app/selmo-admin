"use client";

import { FirebaseError } from "firebase/app";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { subscribeToUserProfiles, type AppUserProfile } from "@/lib/firebase/auth";
import { subscribeToAllKnowledgeItems, type KnowledgeItem } from "@/lib/firebase/knowledge";
import { subscribeToMeetings, type MeetingRecord } from "@/lib/firebase/meetings";
import {
  createAnnouncement,
  createCompany,
  defaultMonthlyAiQuotas,
  saveAiPrompt,
  subscribeToAiChargeEvents,
  subscribeToAiUsageLogs,
  subscribeToAiPrompts,
  subscribeToAnnouncements,
  subscribeToAudioProcessingJobs,
  subscribeToCompanies,
  subscribeToFeatureFlags,
  subscribeToKnowledgeSearchEvents,
  subscribeToSystemErrors,
  updateCompany,
  updateAnnouncement,
  updateCompanyFeatureFlags,
  updateUserByOwner,
  type AiChargeEventRecord,
  type AiPromptRecord,
  type AiUsageLogRecord,
  type AnnouncementRecord,
  type AudioProcessingJobRecord,
  type CompanyRecord,
  type FeatureFlagRecord,
  type KnowledgeSearchEventRecord,
  type SystemErrorRecord,
} from "@/lib/firebase/owner";
import { subscribeToRoleplayResults, type RoleplayResult } from "@/lib/firebase/roleplay";
import { createTenantUser, updateSalesWorkExperience } from "@/lib/firebase/user-management";
import type { CompanyPlan, CompanyStatus, UserRole, UserStatus } from "@/types/domain";

type OwnerData = {
  companies: CompanyRecord[];
  users: AppUserProfile[];
  meetings: MeetingRecord[];
  knowledgeItems: KnowledgeItem[];
  roleplayResults: RoleplayResult[];
  featureFlags: FeatureFlagRecord[];
  announcements: AnnouncementRecord[];
  aiPrompts: AiPromptRecord[];
  aiUsageLogs: AiUsageLogRecord[];
  aiChargeEvents: AiChargeEventRecord[];
  knowledgeSearchEvents: KnowledgeSearchEventRecord[];
  systemErrors: SystemErrorRecord[];
  audioProcessingJobs: AudioProcessingJobRecord[];
  error: string | null;
};

export function OwnerDashboard() {
  const data = useOwnerData();
  const rows = useCompanyUsageRows(data);
  const service = buildServiceMetrics(data, rows);

  return (
    <OwnerPageShell>
      <OwnerHeader
        eyebrow="Owner Console"
        title="運営ダッシュボード"
        description="導入企業ごとの利用状況と運用上の確認ポイントを俯瞰します。"
      />
      <ErrorBanner message={data.error} />
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Metric label="全会社数" value={`${data.companies.length}社`} note="companies コレクション" />
        <Metric label="アクティブ会社数" value={`${data.companies.filter((company) => company.status === "active").length}社`} note="status: active" />
        <Metric label="総ユーザー数" value={`${data.users.length}名`} note="users コレクション" />
        <Metric label="今月の音声アップロード数" value={`${service.monthlyAudioUploads}件`} note="recordedAt が今月の商談" />
        <Metric label="今月のAI概算原価" value={formatUsd(service.monthlyAiCostUsd)} note="Firestore利用量から概算" />
        <Metric label="概算粗利" value={service.grossProfitLabel} note="月額料金登録後に精緻化" muted={service.grossProfitLabel === "集計準備中"} />
      </div>
      <Panel title="会社別サマリー" actionLabel="会社管理へ" href="/owner/companies">
        <UsageTable rows={rows.slice(0, 8)} />
      </Panel>
    </OwnerPageShell>
  );
}

export function OwnerCompanies() {
  const data = useOwnerData();
  const rows = useCompanyUsageRows(data);
  const [companyName, setCompanyName] = useState("");
  const [plan, setPlan] = useState<CompanyPlan>("standard");
  const [status, setStatus] = useState<CompanyStatus>("active");
  const [monthlyAiQuota, setMonthlyAiQuota] = useState("15");
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = companyName.trim();
    if (!trimmedName) return;
    setIsSaving(true);
    try {
      const parsedMonthlyAiQuota = plan === "enterprise" ? parseQuota(monthlyAiQuota) : defaultMonthlyAiQuotas[plan];
      await createCompany({
        companyName: trimmedName,
        plan,
        status,
        monthlyTranscriptionQuota: parsedMonthlyAiQuota,
        monthlyRoleplayQuota: parsedMonthlyAiQuota,
      });
      setCompanyName("");
      setPlan("standard");
      setStatus("active");
      setMonthlyAiQuota("15");
      setDialogOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <OwnerPageShell>
      <OwnerHeader
        eyebrow="Tenant Management"
        title="会社管理"
        description="導入会社の追加、ステータス変更、プラン変更を行います。"
        action={
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="rounded-[8px] bg-[#ffc400] px-4 py-3 text-[13px] font-bold text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.18)] transition hover:bg-[#f0ba00]"
          >
            新規追加
          </button>
        }
      />
      <ErrorBanner message={data.error} />
      <section className="mt-7">
        <Panel title="会社一覧">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
              <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
                <th className="px-3 py-3">会社</th>
                <th className="px-3 py-3">プラン</th>
                <th className="px-3 py-3">AI回数</th>
                <th className="px-3 py-3">月額料金</th>
                <th className="px-3 py-3">契約開始日</th>
                <th className="px-3 py-3">ステータス</th>
                <th className="px-3 py-3">ユーザー</th>
                <th className="px-3 py-3">最終利用日</th>
                <th className="px-3 py-3">商談</th>
                <th className="px-3 py-3">操作</th>
              </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <CompanyRow key={row.company.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
      {dialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/30 px-4 py-6 backdrop-blur-[2px]">
          <section className="w-full max-w-[520px] rounded-[8px] border border-[#f0e4bd] bg-white shadow-[0_24px_70px_rgba(245,189,7,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#eef1f5] px-5 py-4">
              <div>
                <h2 className="text-[20px] font-black text-[#171717]">会社追加</h2>
                <p className="mt-1 text-[13px] text-[#7a808c]">新しい導入会社を作成します。</p>
              </div>
              <button type="button" onClick={() => setDialogOpen(false)} className="text-[22px] leading-none text-[#8a909b]">×</button>
            </div>
            <form onSubmit={handleCreate} className="grid gap-4 p-5">
              <Field label="会社名" value={companyName} onChange={setCompanyName} placeholder="株式会社サンプル" />
              <Select
                label="プラン"
                value={plan}
                onChange={(value) => {
                  const nextPlan = value as CompanyPlan;
                  setPlan(nextPlan);
                  const defaultQuota = defaultMonthlyAiQuotas[nextPlan];
                  setMonthlyAiQuota(defaultQuota === null ? "" : String(defaultQuota));
                }}
                options={planOptions}
              />
              <Field
                label="月間AI回数"
                value={monthlyAiQuota}
                onChange={setMonthlyAiQuota}
                placeholder={plan === "enterprise" ? "例: 100" : String(defaultMonthlyAiQuotas[plan] ?? "")}
                type="number"
                disabled={plan !== "enterprise"}
              />
              <Select label="ステータス" value={status} onChange={(value) => setStatus(value as CompanyStatus)} options={companyStatusOptions} />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setDialogOpen(false)} className="rounded-[8px] border border-[#eadfbc] bg-white px-4 py-3 text-[13px] font-bold text-[#343b48] transition hover:bg-[#fff8e4]">
                  キャンセル
                </button>
                <button className="rounded-[8px] bg-[#ffc400] px-4 py-3 text-[13px] font-bold text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.18)] transition hover:bg-[#f0ba00] disabled:opacity-50" disabled={isSaving}>
                  {isSaving ? "追加中..." : "会社を追加"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </OwnerPageShell>
  );
}

export function OwnerCompanyDetail({ companyId }: { companyId: string }) {
  const data = useOwnerData();
  const rows = useCompanyUsageRows(data);
  const row = rows.find((item) => item.company.id === companyId);
  const [addingRole, setAddingRole] = useState<"admin" | "sales" | null>(null);

  if (!row) {
    return (
      <OwnerPageShell>
        <OwnerHeader eyebrow="Tenant Detail" title="会社詳細" description="会社情報を読み込んでいます。" />
        <Empty message="該当する会社が見つかりません。" />
      </OwnerPageShell>
    );
  }

  const admins = data.users.filter((user) => user.companyId === companyId && user.role === "admin");
  const sales = data.users.filter((user) => user.companyId === companyId && user.role === "sales");

  return (
    <OwnerPageShell>
      <OwnerHeader
        eyebrow="Tenant Detail"
        title={row.company.companyName}
        description="会社別の管理者、営業マン、利用状況を確認します。"
        action={<LinkButton href="/owner/companies">会社一覧へ</LinkButton>}
      />
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="契約プラン" value={formatPlan(row.company.plan)} note="companies.plan" />
        <Metric label="文字起こし上限" value={formatQuota(row.company.monthlyTranscriptionQuota)} note="月間回数" />
        <Metric label="ロープレ上限" value={formatQuota(row.company.monthlyRoleplayQuota)} note="月間回数" />
        <Metric label="契約ステータス" value={row.company.status} note="companies.status" />
        <Metric label="管理者数" value={`${admins.length}名`} note="role: admin" />
        <Metric label="営業マン数" value={`${sales.length}名`} note="role: sales" />
        <Metric label="今月の音声分析件数" value={`${row.monthlyAudioAnalyses}件`} note="今月の処理完了/分析済み商談" />
        <Metric label="月間原価見積もり" value={formatUsd(row.monthlyAiCostUsd)} note="Firestore利用量から概算" />
      </div>
      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="契約内容">
          <KeyValueList
            items={[
              ["会社名", row.company.companyName],
              ["契約プラン", formatPlan(row.company.plan)],
              ["文字起こし上限", formatQuota(row.company.monthlyTranscriptionQuota)],
              ["ロープレ上限", formatQuota(row.company.monthlyRoleplayQuota)],
              ["月額料金", formatYenOrPending(row.company.monthlyFee)],
              ["契約開始日", formatDate(row.company.contractStartDate)],
              ["契約ステータス", row.company.status],
              ["登録ユーザー数", `${row.userCount}名`],
              ["最終利用日", formatDateTime(row.lastUsedAt)],
            ]}
          />
        </Panel>
        <Panel title="今月の利用状況">
          <KeyValueList
            items={[
              ["音声分析件数", `${row.monthlyAudioAnalyses}件`],
              ["音声文字起こし枠", `${row.monthlyTranscriptionUses} / ${formatQuota(row.company.monthlyTranscriptionQuota)}`],
              ["音声分析時間", formatMinutes(row.monthlyAudioDurationSec)],
              ["ロープレ回数", `${row.monthlyRoleplayUses} / ${formatQuota(row.company.monthlyRoleplayQuota)}`],
              ["ナレッジ検索回数", `${row.monthlyKnowledgeSearchCount}回`],
              ["Storage使用量", formatBytes(row.storageBytes)],
              ["AI利用量", `${row.monthlyAiEvents}回`],
              ["概算原価", formatUsd(row.monthlyAiCostUsd)],
            ]}
          />
        </Panel>
      </section>
      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel
          title="管理者一覧"
          action={
            <button type="button" onClick={() => setAddingRole("admin")} className="rounded-[8px] bg-[#fff2c8] px-3 py-1.5 text-[13px] font-bold text-[#8a6500] transition hover:bg-[#ffe7a0]">
              管理者を追加
            </button>
          }
        >
          <UserList users={admins} />
        </Panel>
        <Panel
          title="営業マン一覧"
          action={
            <button type="button" onClick={() => setAddingRole("sales")} className="rounded-[8px] bg-[#fff2c8] px-3 py-1.5 text-[13px] font-bold text-[#8a6500] transition hover:bg-[#ffe7a0]">
              営業マンを追加
            </button>
          }
        >
          <UserList users={sales} />
        </Panel>
      </section>
      <section className="mt-5 grid gap-4 md:grid-cols-3">
        <Metric label="ナレッジ数" value={`${row.knowledgeCount}件`} note="knowledgeItems" />
        <Metric label="ロープレ利用状況" value={`${row.roleplayCount}回`} note="roleplayResults" />
        <Metric label="Storage使用量" value={formatBytes(row.storageBytes)} note="audioSizeBytes 合計" />
      </section>
      {addingRole ? (
        <TenantUserDialog
          companies={data.companies}
          fixedCompanyId={companyId}
          initialRole={addingRole}
          allowedRoles={["admin", "sales"]}
          onClose={() => setAddingRole(null)}
        />
      ) : null}
    </OwnerPageShell>
  );
}

export function OwnerUsers() {
  const data = useOwnerData();
  const [companyFilter, setCompanyFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const visibleUsers = companyFilter === "all" ? data.users : data.users.filter((user) => user.companyId === companyFilter);

  return (
    <OwnerPageShell>
      <OwnerHeader
        eyebrow="Identity"
        title="全ユーザー一覧"
        description="会社別フィルター、role変更、アカウント停止を行います。"
        action={<button type="button" onClick={() => setDialogOpen(true)} className="rounded-[8px] bg-[#ffc400] px-4 py-3 text-[13px] font-bold text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.18)] transition hover:bg-[#f0ba00]">ユーザー追加</button>}
      />
      <ErrorBanner message={data.error} />
      <Panel title="ユーザー管理">
        <div className="mb-4 max-w-[320px]">
          <Select
            label="会社フィルター"
            value={companyFilter}
            onChange={setCompanyFilter}
            options={[
              { value: "all", label: "すべての会社" },
              ...data.companies.map((company) => ({ value: company.id, label: company.companyName })),
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
                <th className="px-3 py-3">ユーザー</th>
                <th className="px-3 py-3">会社</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">勤務年数</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">最終ログイン</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <UserAdminRow key={user.uid} user={user} companies={data.companies} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {dialogOpen ? (
        <TenantUserDialog
          companies={data.companies}
          fixedCompanyId={companyFilter === "all" ? undefined : companyFilter}
          initialRole="sales"
          allowedRoles={["admin", "sales"]}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </OwnerPageShell>
  );
}

export function OwnerBilling() {
  const data = useOwnerData();
  const rows = useCompanyUsageRows(data);
  const chargeRows = buildAiChargeBillingRows(data);
  const chargeSummary = summarizeAiChargeBillingRows(chargeRows);

  return (
    <OwnerPageShell>
      <OwnerHeader
        eyebrow="Billing"
        title="利用量・請求"
        description="会社別の音声分数、OpenAI推定費用、Storage使用量、粗利見込みを確認します。"
      />
      <ErrorBanner message={data.error} />
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="未請求チャージ会社数" value={`${chargeSummary.companyCount}社`} note="invoiceStatus: unbilled" muted={chargeSummary.companyCount === 0} />
        <Metric label="未請求チャージ回数" value={`${chargeSummary.amount}回`} note="aiChargeEvents.amount" muted={chargeSummary.amount === 0} />
        <Metric label="翌月請求予定額" value={formatYen(chargeSummary.totalJpy)} note="totalJpy 税込合計" muted={chargeSummary.totalJpy === 0} />
        <Metric label="未請求イベント数" value={`${chargeSummary.eventCount}件`} note="チャージ履歴" muted={chargeSummary.eventCount === 0} />
      </div>
      <Panel title="AIチャージ請求確認">
        <AiChargeBillingTable rows={chargeRows} />
      </Panel>
      <Panel title="会社別の利用量">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
                <th className="px-3 py-3">会社</th>
                <th className="px-3 py-3">音声分数</th>
                <th className="px-3 py-3">OpenAI推定費用</th>
                <th className="px-3 py-3">Storage使用量</th>
                <th className="px-3 py-3">粗利見込み</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.company.id} className="border-b border-[#eef1f5] text-[13px]">
                  <td className="px-3 py-4 font-bold text-[#20242c]">{row.company.companyName}</td>
                  <td className="px-3 py-4 text-[#343b48]">{formatMinutes(row.audioDurationSec)}</td>
                  <td className="px-3 py-4 text-[#343b48]">{formatUsd(row.monthlyAiCostUsd)}</td>
                  <td className="px-3 py-4 text-[#343b48]">{formatBytes(row.storageBytes)}</td>
                  <td className="px-3 py-4">{row.company.monthlyFee ? formatYen(row.company.monthlyFee) : <Placeholder />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </OwnerPageShell>
  );
}

export function OwnerUsage() {
  const data = useOwnerData();
  const rows = useCompanyUsageRows(data);
  const [companyFilter, setCompanyFilter] = useState("all");
  const scopedRows = companyFilter === "all" ? rows : rows.filter((row) => row.company.id === companyFilter);
  const userRows = buildUserUsageRows(data, companyFilter);
  const total = summarizeRows(scopedRows);
  const riskRows = rows.filter((row) =>
    [row.transcriptionUsageRate, row.roleplayUsageRate].some((rate) => rate !== null && rate >= 80),
  );

  return (
    <OwnerPageShell>
      <OwnerHeader eyebrow="Usage Monitoring" title="利用量監視" description="全体・会社別・ユーザー別の今月利用量と上限超過リスクを確認します。" />
      <ErrorBanner message={data.error} />
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="今月の音声アップロード件数" value={`${total.monthlyAudioUploads}件`} note="audioFileNameあり" />
        <Metric label="今月の音声分析件数" value={`${total.monthlyAudioAnalyses}件`} note="処理完了/分析済み" />
        <Metric label="今月の音声合計時間" value={formatMinutes(total.monthlyAudioDurationSec)} note="audioDurationSec 合計" />
        <Metric label="今月のAI分析回数" value={`${total.monthlyAiEvents}回`} note="分析ステータスから概算" />
        <Metric label="今月のロープレ回数" value={`${total.monthlyRoleplayCount}回`} note="roleplayResults" />
        <Metric label="今月のナレッジ検索回数" value={`${total.monthlyKnowledgeSearchCount}回`} note="knowledgeSearchEvents" />
        <Metric label="今月のStorage使用量" value={formatBytes(total.storageBytes)} note="音声ファイルサイズ合計" />
        <Metric label="上限超過リスク" value={`${riskRows.length}社`} note="利用率80%以上" muted={riskRows.length === 0} />
      </div>
      <Panel title="会社別利用量">
        <div className="mb-4 max-w-[320px]">
          <Select
            label="会社フィルター"
            value={companyFilter}
            onChange={setCompanyFilter}
            options={[{ value: "all", label: "すべての会社" }, ...data.companies.map((company) => ({ value: company.id, label: company.companyName }))]}
          />
        </div>
        <UsageMonitoringTable rows={scopedRows} />
      </Panel>
      <Panel title="ユーザー別利用量">
        <UserUsageTable rows={userRows} />
      </Panel>
      <Panel title="上限超過リスクのある会社">
        {riskRows.length ? <UsageMonitoringTable rows={riskRows} compact /> : <Empty message="現時点で上限超過リスクのある会社はありません。" />}
      </Panel>
    </OwnerPageShell>
  );
}

export function OwnerCosts() {
  const data = useOwnerData();
  const rows = useCompanyUsageRows(data);
  const userRows = buildUserUsageRows(data, "all");
  const todayCost = estimateAiCostUsd({
    meetings: data.meetings.filter((meeting) => isToday(meeting.recordedAt)),
    roleplayResults: data.roleplayResults.filter((result) => isToday(result.createdAt)),
    aiUsageLogs: data.aiUsageLogs.filter((log) => isToday(log.createdAt)),
  });
  const monthCost = estimateAiCostUsd({
    meetings: data.meetings.filter((meeting) => isCurrentMonth(meeting.recordedAt)),
    roleplayResults: data.roleplayResults.filter((result) => isCurrentMonth(result.createdAt)),
    aiUsageLogs: data.aiUsageLogs.filter((log) => isCurrentMonth(log.createdAt)),
  });

  return (
    <OwnerPageShell>
      <OwnerHeader eyebrow="AI Cost" title="AI原価監視" description="OpenAIなどAI利用に関する概算原価を、Firestoreの利用量から推定します。" />
      <ErrorBanner message={data.error} />
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="本日のAI概算原価" value={formatUsd(todayCost.total)} note="本日分の利用量から概算" />
        <Metric label="今月のAI概算原価" value={formatUsd(monthCost.total)} note="今月分の利用量から概算" />
        <Metric label="音声文字起こし原価" value={formatUsd(monthCost.transcription)} note="音声分数 x 暫定係数" />
        <Metric label="AI要約・分析原価" value={formatUsd(monthCost.analysis)} note="分析回数 x 暫定係数" />
        <Metric label="AIロープレ原価" value={formatUsd(monthCost.roleplay)} note="ロープレ回数 x 暫定係数" />
        <Metric label="ナレッジ検索原価" value={formatUsd(monthCost.knowledgeSearch)} note="aiUsageLogs: knowledge_search" />
        <Metric label="売上に対する原価率" value={formatCostRate(data.companies, monthCost.total)} note="MRR / AI原価" muted={formatCostRate(data.companies, monthCost.total) === "集計準備中"} />
        <Metric label="Storage原価" value="集計準備中" note="Cloud Storage課金ログ連携後に表示" muted />
      </div>
      <Panel title="会社別AI概算原価">
        <CostCompanyTable rows={rows} />
      </Panel>
      <Panel title="ユーザー別AI概算原価">
        <CostUserTable rows={userRows} />
      </Panel>
    </OwnerPageShell>
  );
}

export function OwnerJobs() {
  const data = useOwnerData();
  const jobs = buildAudioJobs(data);
  const counts = countBy(jobs, (job) => job.status);

  return (
    <OwnerPageShell>
      <OwnerHeader eyebrow="Audio Jobs" title="音声処理ジョブ監視" description="音声アップロードから文字起こし・AI分析までの処理状況を確認します。" />
      <ErrorBanner message={data.error} />
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="処理中" value={`${counts.running ?? 0}件`} note="running/analyzing/transcribing" />
        <Metric label="完了" value={`${counts.completed ?? 0}件`} note="completed" />
        <Metric label="エラー" value={`${counts.failed ?? 0}件`} note="failed/error" muted={(counts.failed ?? 0) === 0} />
        <Metric label="待機中" value={`${counts.waiting ?? 0}件`} note="uploaded/idle" />
        <Metric label="文字起こし中" value={`${counts.transcribing ?? 0}件`} note="transcriptionProbeStatus" />
        <Metric label="AI分析中" value={`${counts.analyzing ?? 0}件`} note="aiSummaryStatus" />
      </div>
      <Panel title="失敗したジョブ">
        <JobTable jobs={jobs.filter((job) => job.status === "failed")} failedOnly />
      </Panel>
      <Panel title="全ジョブ">
        <JobTable jobs={jobs} />
      </Panel>
    </OwnerPageShell>
  );
}

export function OwnerErrors() {
  const data = useOwnerData();
  const errors = buildOperationalErrors(data);
  const criticalCount = errors.filter((error) => error.severity === "critical").length;

  return (
    <OwnerPageShell>
      <OwnerHeader eyebrow="Error Monitoring" title="エラー監視" description="OpenAI、Firebase、Storage、APIなどの運用エラーを確認します。" />
      <ErrorBanner message={data.error} />
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="OpenAIエラー" value={`${errors.filter((error) => error.kind === "OpenAI").length}件`} note="AI処理エラー" />
        <Metric label="Storageエラー" value={`${errors.filter((error) => error.kind === "Storage").length}件`} note="音声ファイル関連" />
        <Metric label="APIエラー" value={`${errors.filter((error) => error.kind === "API").length}件`} note="処理API関連" />
        <Metric label="認証エラー" value={`${errors.filter((error) => error.kind === "Auth").length}件`} note="systemErrors" />
        <Metric label="重要度高" value={`${criticalCount}件`} note="critical" muted={criticalCount === 0} />
      </div>
      <Panel title="エラー一覧">
        <ErrorTable errors={errors} />
      </Panel>
    </OwnerPageShell>
  );
}

export function OwnerPrompts() {
  const data = useOwnerData();

  return (
    <OwnerPageShell>
      <OwnerHeader eyebrow="Prompt Ops" title="プロンプト管理" description="AI分析・ロープレ・ナレッジ検索で使用するプロンプトの管理導線です。" />
      <Panel title="プロンプト一覧">
        <PromptTable prompts={data.aiPrompts} />
      </Panel>
    </OwnerPageShell>
  );
}

export function OwnerFeatureFlags() {
  const data = useOwnerData();

  return (
    <OwnerPageShell>
      <OwnerHeader eyebrow="Feature Flags" title="機能フラグ管理" description="会社単位で機能のON/OFFを確認します。初期実装では読み取り導線を優先しています。" />
      <Panel title="会社別フラグ">
        <FeatureFlagTable companies={data.companies} flags={data.featureFlags} />
      </Panel>
    </OwnerPageShell>
  );
}

export function OwnerAnnouncements() {
  const data = useOwnerData();

  return (
    <OwnerPageShell>
      <OwnerHeader eyebrow="Announcements" title="お知らせ管理" description="ユーザー向けのお知らせ、メンテナンス告知、新機能告知の管理導線です。" />
      <Panel title="お知らせ作成">
        <AnnouncementForm />
      </Panel>
      <Panel title="お知らせ一覧">
        <AnnouncementTable announcements={data.announcements} />
      </Panel>
    </OwnerPageShell>
  );
}

export function OwnerKpi() {
  const data = useOwnerData();
  const rows = useCompanyUsageRows(data);
  const service = buildServiceMetrics(data, rows);

  return (
    <OwnerPageShell>
      <OwnerHeader eyebrow="Service KPI" title="サービスKPI" description="selmo.全体の状態を確認します。" />
      <ErrorBanner message={data.error} />
      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="契約社数" value={`${data.companies.filter((company) => company.status === "active").length}社`} note="active companies" />
        <Metric label="登録ユーザー数" value={`${data.users.length}名`} note="users" />
        <Metric label="有効ユーザー数" value={`${data.users.filter((user) => user.status === "active").length}名`} note="status: active" />
        <Metric label="MRR" value={service.mrrLabel} note="monthlyFee 登録済みのみ" muted={service.mrrLabel === "集計準備中"} />
        <Metric label="今月の音声分析件数" value={`${service.monthlyAudioAnalyses}件`} note="meetings" />
        <Metric label="今月の音声合計時間" value={formatMinutes(service.monthlyAudioDurationSec)} note="audioDurationSec" />
        <Metric label="今月のロープレ回数" value={`${service.monthlyRoleplayCount}回`} note="roleplayResults" />
        <Metric label="今月のナレッジ検索回数" value={`${service.monthlyKnowledgeSearchCount}回`} note="knowledgeSearchEvents" />
        <Metric label="今月のAI概算原価" value={formatUsd(service.monthlyAiCostUsd)} note="利用量から概算" />
        <Metric label="概算粗利" value={service.grossProfitLabel} note="売上と原価の同一通貨化後に精緻化" muted={service.grossProfitLabel === "集計準備中"} />
      </div>
    </OwnerPageShell>
  );
}

function useOwnerData(): OwnerData {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [roleplayResults, setRoleplayResults] = useState<RoleplayResult[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagRecord[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [aiPrompts, setAiPrompts] = useState<AiPromptRecord[]>([]);
  const [aiUsageLogs, setAiUsageLogs] = useState<AiUsageLogRecord[]>([]);
  const [aiChargeEvents, setAiChargeEvents] = useState<AiChargeEventRecord[]>([]);
  const [knowledgeSearchEvents, setKnowledgeSearchEvents] = useState<KnowledgeSearchEventRecord[]>([]);
  const [systemErrors, setSystemErrors] = useState<SystemErrorRecord[]>([]);
  const [audioProcessingJobs, setAudioProcessingJobs] = useState<AudioProcessingJobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (nextError: FirebaseError) => setError(nextError.message);
    const unsubscribers = [
      subscribeToCompanies(setCompanies, handleError),
      subscribeToUserProfiles(setUsers, handleError),
      subscribeToMeetings({ role: "owner", userId: "owner" }, setMeetings, handleError),
      subscribeToAllKnowledgeItems(setKnowledgeItems, handleError),
      subscribeToRoleplayResults({ userId: "owner", isOwner: true }, setRoleplayResults, handleError),
      subscribeToFeatureFlags(setFeatureFlags, handleError),
      subscribeToAnnouncements(setAnnouncements, handleError),
      subscribeToAiPrompts(setAiPrompts, handleError),
      subscribeToAiUsageLogs(setAiUsageLogs, handleError),
      subscribeToAiChargeEvents(setAiChargeEvents, handleError),
      subscribeToKnowledgeSearchEvents(setKnowledgeSearchEvents, handleError),
      subscribeToSystemErrors(setSystemErrors, handleError),
      subscribeToAudioProcessingJobs(setAudioProcessingJobs, handleError),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  return {
    companies,
    users,
    meetings,
    knowledgeItems,
    roleplayResults,
    featureFlags,
    announcements,
    aiPrompts,
    aiUsageLogs,
    aiChargeEvents,
    knowledgeSearchEvents,
    systemErrors,
    audioProcessingJobs,
    error,
  };
}

function useCompanyUsageRows(data: OwnerData) {
  return useMemo(
    () =>
      data.companies.map((company) => {
        const companyUsers = data.users.filter((user) => user.companyId === company.id);
        const companyMeetings = data.meetings.filter((meeting) => meeting.companyId === company.id);
        const companyRoleplayResults = data.roleplayResults.filter((result) => result.companyId === company.id);
        const companyAiUsageLogs = data.aiUsageLogs.filter((log) => log.companyId === company.id);
        const companyKnowledgeSearchEvents = data.knowledgeSearchEvents.filter((event) => event.companyId === company.id);
        const monthlyMeetings = companyMeetings.filter((meeting) => isCurrentMonth(meeting.recordedAt));
        const monthlyRoleplayResults = companyRoleplayResults.filter((result) => isCurrentMonth(result.createdAt));
        const monthlyAiUsageLogs = companyAiUsageLogs.filter((log) => isCurrentMonth(log.createdAt));
        const monthlyTranscriptionUses = countSuccessfulAiUsage(monthlyAiUsageLogs, "transcription");
        const monthlyRoleplayUses =
          countSuccessfulAiUsage(monthlyAiUsageLogs, "roleplay") || monthlyRoleplayResults.length;
        const monthlyKnowledgeSearchEvents = companyKnowledgeSearchEvents.filter((event) => isCurrentMonth(event.createdAt));
        const lastUsedAt = getLatestDate([
          ...companyMeetings.map((meeting) => meeting.recordedAt),
          ...companyRoleplayResults.map((result) => result.createdAt),
          ...companyUsers.map((user) => user.lastLoginAt),
        ]);
        const monthlyAiCost = estimateAiCostUsd({
          meetings: monthlyMeetings,
          roleplayResults: monthlyRoleplayResults,
          aiUsageLogs: monthlyAiUsageLogs,
        });
        const monthlyAudioDurationSec = monthlyMeetings.reduce((sum, meeting) => sum + (meeting.audioDurationSec ?? 0), 0);
        const audioLimitMinutes = planLimits[company.plan].audioMinutes;
        const audioUsageRate =
          audioLimitMinutes === null ? null : Math.round((monthlyAudioDurationSec / 60 / audioLimitMinutes) * 100);
        const transcriptionUsageRate = calculateUsageRate(monthlyTranscriptionUses, company.monthlyTranscriptionQuota);
        const roleplayUsageRate = calculateUsageRate(monthlyRoleplayUses, company.monthlyRoleplayQuota);

        return {
          company,
          userCount: companyUsers.length,
          adminCount: companyUsers.filter((user) => user.role === "admin").length,
          salesCount: companyUsers.filter((user) => user.role === "sales").length,
          meetingCount: companyMeetings.length,
          knowledgeCount: data.knowledgeItems.filter((item) => item.companyId === company.id).length,
          roleplayCount: companyRoleplayResults.length,
          audioDurationSec: companyMeetings.reduce((sum, meeting) => sum + (meeting.audioDurationSec ?? 0), 0),
          storageBytes: companyMeetings.reduce((sum, meeting) => sum + (meeting.audioDeletedAt ? 0 : meeting.audioSizeBytes ?? 0), 0),
          lastUsedAt,
          monthlyAudioUploads: monthlyMeetings.filter((meeting) => Boolean(meeting.audioFileName)).length,
          monthlyAudioAnalyses: monthlyMeetings.filter(isAudioAnalysisCompleted).length,
          monthlyAudioDurationSec,
          monthlyAiEvents: monthlyAiUsageLogs.length || monthlyMeetings.reduce((sum, meeting) => sum + countMeetingAiEvents(meeting), 0),
          monthlyRoleplayCount: monthlyRoleplayResults.length,
          monthlyTranscriptionUses,
          monthlyRoleplayUses,
          monthlyKnowledgeSearchCount: monthlyKnowledgeSearchEvents.length,
          monthlyAiCostUsd: monthlyAiCost.total,
          monthlyAiCostBreakdown: monthlyAiCost,
          audioLimitMinutes,
          audioUsageRate,
          transcriptionUsageRate,
          roleplayUsageRate,
        };
      }),
    [data.aiUsageLogs, data.companies, data.knowledgeItems, data.knowledgeSearchEvents, data.meetings, data.roleplayResults, data.users],
  );
}

function CompanyRow({ row }: { row: ReturnType<typeof useCompanyUsageRows>[number] }) {
  const [plan, setPlan] = useState<CompanyPlan>(row.company.plan);
  const [status, setStatus] = useState<CompanyStatus>(row.company.status);
  const [monthlyTranscriptionQuota, setMonthlyTranscriptionQuota] = useState(row.company.monthlyTranscriptionQuota?.toString() ?? "");
  const [monthlyRoleplayQuota, setMonthlyRoleplayQuota] = useState(row.company.monthlyRoleplayQuota?.toString() ?? "");
  const [monthlyFee, setMonthlyFee] = useState(row.company.monthlyFee?.toString() ?? "");
  const [contractStartDate, setContractStartDate] = useState(formatDateInput(row.company.contractStartDate));

  useEffect(() => {
    setPlan(row.company.plan);
    setStatus(row.company.status);
    setMonthlyTranscriptionQuota(row.company.monthlyTranscriptionQuota?.toString() ?? "");
    setMonthlyRoleplayQuota(row.company.monthlyRoleplayQuota?.toString() ?? "");
    setMonthlyFee(row.company.monthlyFee?.toString() ?? "");
    setContractStartDate(formatDateInput(row.company.contractStartDate));
  }, [row.company.contractStartDate, row.company.monthlyFee, row.company.monthlyRoleplayQuota, row.company.monthlyTranscriptionQuota, row.company.plan, row.company.status]);

  async function persist(input: Parameters<typeof updateCompany>[1]) {
    await updateCompany(row.company.id, input);
  }

  return (
    <tr className="border-b border-[#eef1f5] text-[13px]">
      <td className="px-3 py-4">
        <Link href={`/owner/companies/${row.company.id}`} className="font-bold text-[#20242c] hover:text-[#c8941f]">
          {row.company.companyName}
        </Link>
        <div className="mt-1 text-[11px] text-[#8a909b]">{row.company.id}</div>
      </td>
      <td className="px-3 py-4">
        <InlineSelect
          value={plan}
          onChange={(value) => {
            const nextPlan = value as CompanyPlan;
            const defaultQuota = defaultMonthlyAiQuotas[nextPlan];
            setPlan(nextPlan);
            if (defaultQuota !== null) {
              setMonthlyTranscriptionQuota(String(defaultQuota));
              setMonthlyRoleplayQuota(String(defaultQuota));
            }
            void persist({
              plan: nextPlan,
              ...(defaultQuota !== null
                ? { monthlyTranscriptionQuota: defaultQuota, monthlyRoleplayQuota: defaultQuota }
                : {}),
            });
          }}
          options={planOptions}
        />
      </td>
      <td className="px-3 py-4 text-[#343b48]">
        <div className="flex min-w-[220px] gap-2">
          <input
            value={monthlyTranscriptionQuota}
            onChange={(event) => setMonthlyTranscriptionQuota(event.target.value)}
            onBlur={() => void persist({ monthlyTranscriptionQuota: parseQuota(monthlyTranscriptionQuota) })}
            inputMode="numeric"
            placeholder="文字起こし"
            className="w-[104px] rounded-[8px] border border-[#eadfbc] bg-[#fffefa] px-3 py-2 text-[13px] font-bold outline-none focus:border-[#ffc400]"
            aria-label={`${row.company.companyName} 文字起こし月間上限`}
          />
          <input
            value={monthlyRoleplayQuota}
            onChange={(event) => setMonthlyRoleplayQuota(event.target.value)}
            onBlur={() => void persist({ monthlyRoleplayQuota: parseQuota(monthlyRoleplayQuota) })}
            inputMode="numeric"
            placeholder="ロープレ"
            className="w-[104px] rounded-[8px] border border-[#eadfbc] bg-[#fffefa] px-3 py-2 text-[13px] font-bold outline-none focus:border-[#ffc400]"
            aria-label={`${row.company.companyName} ロープレ月間上限`}
          />
        </div>
        <div className="mt-1 text-[11px] text-[#8a909b]">文字起こし / ロープレ</div>
      </td>
      <td className="px-3 py-4 text-[#343b48]">
        <input
          value={monthlyFee}
          onChange={(event) => setMonthlyFee(event.target.value)}
          onBlur={() => void persist({ monthlyFee: parseMonthlyFee(monthlyFee) })}
          inputMode="numeric"
          placeholder="未設定"
          className="w-[120px] rounded-[8px] border border-[#eadfbc] bg-[#fffefa] px-3 py-2 text-[13px] font-bold outline-none focus:border-[#ffc400]"
        />
      </td>
      <td className="px-3 py-4 text-[#343b48]">
        <input
          type="date"
          value={contractStartDate}
          onChange={(event) => {
            setContractStartDate(event.target.value);
            void persist({ contractStartDate: parseDateInput(event.target.value) });
          }}
          className="w-[150px] rounded-[8px] border border-[#eadfbc] bg-[#fffefa] px-3 py-2 text-[13px] font-bold outline-none focus:border-[#ffc400]"
        />
      </td>
      <td className="px-3 py-4">
        <InlineSelect
          value={status}
          onChange={(value) => {
            const nextStatus = value as CompanyStatus;
            setStatus(nextStatus);
            void persist({ status: nextStatus });
          }}
          options={companyStatusOptions}
        />
      </td>
      <td className="px-3 py-4 text-[#343b48]">{row.userCount}名</td>
      <td className="px-3 py-4 text-[#343b48]">{formatDateTime(row.lastUsedAt)}</td>
      <td className="px-3 py-4 text-[#343b48]">{row.meetingCount}件</td>
      <td className="px-3 py-4">
        <Link href={`/owner/companies/${row.company.id}`} className="rounded-[8px] bg-[#fff2c8] px-3 py-1.5 font-bold text-[#8a6500] transition hover:bg-[#ffe7a0]">詳細</Link>
      </td>
    </tr>
  );
}

function UserAdminRow({ user, companies }: { user: AppUserProfile; companies: CompanyRecord[] }) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [experienceYears, setExperienceYears] = useState(user.workExperienceYears?.toString() ?? "");
  const [experienceMonths, setExperienceMonths] = useState(user.workExperienceMonths?.toString() ?? "");
  const [experienceError, setExperienceError] = useState<string | null>(null);
  const [isSavingExperience, setIsSavingExperience] = useState(false);
  const company = companies.find((item) => item.id === user.companyId);

  useEffect(() => {
    setRole(user.role);
    setStatus(user.status);
    setExperienceYears(user.workExperienceYears?.toString() ?? "");
    setExperienceMonths(user.workExperienceMonths?.toString() ?? "");
  }, [user.role, user.status, user.workExperienceMonths, user.workExperienceYears]);

  async function saveExperience() {
    const parsed = parseWorkExperience(experienceYears, experienceMonths);

    if (!parsed.ok) {
      setExperienceError(parsed.error);
      return;
    }

    setExperienceError(null);
    setIsSavingExperience(true);

    try {
      await updateSalesWorkExperience({
        uid: user.uid,
        companyId: user.companyId,
        years: parsed.value.years,
        months: parsed.value.months,
      });
    } catch (error) {
      setExperienceError(error instanceof Error ? error.message : "勤務年数の保存に失敗しました。");
    } finally {
      setIsSavingExperience(false);
    }
  }

  return (
    <tr className="border-b border-[#eef1f5] text-[13px]">
      <td className="px-3 py-4">
        <div className="font-bold text-[#20242c]">{user.name ?? "未設定"}</div>
        <div className="mt-1 text-[12px] text-[#7a808c]">{user.email ?? "メール未設定"}</div>
      </td>
      <td className="px-3 py-4 text-[#343b48]">{company?.companyName ?? user.companyId ?? "未紐付け"}</td>
      <td className="px-3 py-4">
        <InlineSelect
          value={role}
          onChange={(value) => {
            const nextRole = value as UserRole;
            setRole(nextRole);
            void updateUserByOwner(user.uid, { role: nextRole });
          }}
          options={roleOptions}
        />
      </td>
      <td className="px-3 py-4 text-[#343b48]">
        {user.role !== "sales" ? (
          <span className="text-[#8a909b]">対象外</span>
        ) : user.workExperienceLocked ? (
          <span className="font-bold text-[#20242c]">{formatWorkExperience(user.workExperienceYears, user.workExperienceMonths)}</span>
        ) : (
          <div className="grid min-w-[210px] gap-1">
            <div className="flex items-center gap-2">
              <input
                value={experienceYears}
                onChange={(event) => {
                  setExperienceYears(event.target.value);
                  setExperienceError(null);
                }}
                inputMode="numeric"
                className="w-[72px] rounded-[8px] border border-[#eadfbc] bg-[#fffefa] px-3 py-2 text-[13px] font-bold outline-none focus:border-[#ffc400]"
                aria-label={`${user.name ?? user.email ?? user.uid} 勤務年数 年`}
              />
              <span className="text-[12px] font-bold text-[#7a808c]">年</span>
              <input
                value={experienceMonths}
                onChange={(event) => {
                  setExperienceMonths(event.target.value);
                  setExperienceError(null);
                }}
                inputMode="numeric"
                className="w-[64px] rounded-[8px] border border-[#eadfbc] bg-[#fffefa] px-3 py-2 text-[13px] font-bold outline-none focus:border-[#ffc400]"
                aria-label={`${user.name ?? user.email ?? user.uid} 勤務年数 月`}
              />
              <span className="text-[12px] font-bold text-[#7a808c]">ヶ月</span>
              <button
                type="button"
                onClick={() => void saveExperience()}
                disabled={isSavingExperience}
                className="rounded-[8px] bg-[#20242c] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50"
              >
                {isSavingExperience ? "保存中" : "保存"}
              </button>
            </div>
            {experienceError ? <span className="text-[11px] font-bold text-red-700">{experienceError}</span> : null}
          </div>
        )}
      </td>
      <td className="px-3 py-4">
        <InlineSelect
          value={status}
          onChange={(value) => {
            const nextStatus = value as UserStatus;
            setStatus(nextStatus);
            void updateUserByOwner(user.uid, { status: nextStatus });
          }}
          options={userStatusOptions}
        />
      </td>
      <td className="px-3 py-4 text-[#7a808c]">{formatDateTime(user.lastLoginAt)}</td>
    </tr>
  );
}

function UsageTable({ rows }: { rows: ReturnType<typeof useCompanyUsageRows> }) {
  if (rows.length === 0) return <Empty message="会社データはまだありません。" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
            <th className="px-3 py-3">会社</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">User</th>
            <th className="px-3 py-3">Meetings</th>
            <th className="px-3 py-3">Knowledge</th>
            <th className="px-3 py-3">Roleplay</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.company.id} className="border-b border-[#eef1f5] text-[13px]">
              <td className="px-3 py-4 font-bold text-[#20242c]">{row.company.companyName}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.company.status}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.userCount}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.meetingCount}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.knowledgeCount}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.roleplayCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsageMonitoringTable({ rows, compact = false }: { rows: ReturnType<typeof useCompanyUsageRows>; compact?: boolean }) {
  if (rows.length === 0) return <Empty message="利用量データはまだありません。" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
            <th className="px-3 py-3">会社</th>
            <th className="px-3 py-3">プラン</th>
            <th className="px-3 py-3">文字起こし枠</th>
            <th className="px-3 py-3">音声時間</th>
            <th className="px-3 py-3">AI分析</th>
            <th className="px-3 py-3">ロープレ枠</th>
            <th className="px-3 py-3">Storage</th>
            <th className="px-3 py-3">文字起こし率</th>
            <th className="px-3 py-3">ロープレ率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.company.id} className="border-b border-[#eef1f5] text-[13px]">
              <td className="px-3 py-4 font-bold text-[#20242c]">{row.company.companyName}</td>
              <td className="px-3 py-4 text-[#343b48]">{formatPlan(row.company.plan)}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.monthlyTranscriptionUses} / {formatQuota(row.company.monthlyTranscriptionQuota)}</td>
              <td className="px-3 py-4 text-[#343b48]">{formatMinutes(row.monthlyAudioDurationSec)}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.monthlyAiEvents}回</td>
              <td className="px-3 py-4 text-[#343b48]">{row.monthlyRoleplayUses} / {formatQuota(row.company.monthlyRoleplayQuota)}</td>
              <td className="px-3 py-4 text-[#343b48]">{formatBytes(row.storageBytes)}</td>
              <td className="px-3 py-4">
                {row.transcriptionUsageRate === null ? (
                  <span className="font-bold text-[#8a909b]">無制限</span>
                ) : (
                  <UsageRate rate={row.transcriptionUsageRate} />
                )}
              </td>
              <td className="px-3 py-4">
                {row.roleplayUsageRate === null ? (
                  <span className="font-bold text-[#8a909b]">無制限</span>
                ) : (
                  <UsageRate rate={row.roleplayUsageRate} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {compact ? <p className="mt-3 text-[12px] text-[#7a808c]">利用率は今月の文字起こし・ロープレ回数を会社別上限で割った概算です。</p> : null}
    </div>
  );
}

function UserUsageTable({ rows }: { rows: UserUsageRow[] }) {
  if (rows.length === 0) return <Empty message="ユーザー別利用量はまだありません。" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
            <th className="px-3 py-3">ユーザー</th>
            <th className="px-3 py-3">会社</th>
            <th className="px-3 py-3">音声アップロード</th>
            <th className="px-3 py-3">音声分析</th>
            <th className="px-3 py-3">音声時間</th>
            <th className="px-3 py-3">AI分析</th>
            <th className="px-3 py-3">ロープレ</th>
            <th className="px-3 py-3">ナレッジ検索</th>
            <th className="px-3 py-3">概算原価</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.user.uid} className="border-b border-[#eef1f5] text-[13px]">
              <td className="px-3 py-4">
                <div className="font-bold text-[#20242c]">{row.user.name ?? "未設定"}</div>
                <div className="mt-1 text-[12px] text-[#7a808c]">{row.user.email ?? row.user.uid}</div>
              </td>
              <td className="px-3 py-4 text-[#343b48]">{row.companyName}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.monthlyAudioUploads}件</td>
              <td className="px-3 py-4 text-[#343b48]">{row.monthlyAudioAnalyses}件</td>
              <td className="px-3 py-4 text-[#343b48]">{formatMinutes(row.monthlyAudioDurationSec)}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.monthlyAiEvents}回</td>
              <td className="px-3 py-4 text-[#343b48]">{row.monthlyRoleplayCount}回</td>
              <td className="px-3 py-4 text-[#343b48]">{row.monthlyKnowledgeSearchCount}回</td>
              <td className="px-3 py-4 text-[#343b48]">{formatUsd(row.monthlyAiCostUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CostCompanyTable({ rows }: { rows: ReturnType<typeof useCompanyUsageRows> }) {
  if (rows.length === 0) return <Empty message="会社別原価データはまだありません。" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
            <th className="px-3 py-3">会社</th>
            <th className="px-3 py-3">月額料金</th>
            <th className="px-3 py-3">文字起こし</th>
            <th className="px-3 py-3">AI要約/分析</th>
            <th className="px-3 py-3">AIロープレ</th>
            <th className="px-3 py-3">ナレッジ検索</th>
            <th className="px-3 py-3">合計</th>
            <th className="px-3 py-3">原価率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const breakdown = buildCostBreakdownForRow(row);
            return (
              <tr key={row.company.id} className="border-b border-[#eef1f5] text-[13px]">
                <td className="px-3 py-4 font-bold text-[#20242c]">{row.company.companyName}</td>
                <td className="px-3 py-4 text-[#343b48]">{formatYenOrPending(row.company.monthlyFee)}</td>
                <td className="px-3 py-4 text-[#343b48]">{formatUsd(breakdown.transcription)}</td>
                <td className="px-3 py-4 text-[#343b48]">{formatUsd(breakdown.analysis)}</td>
                <td className="px-3 py-4 text-[#343b48]">{formatUsd(breakdown.roleplay)}</td>
                <td className="px-3 py-4 text-[#343b48]">{formatUsd(breakdown.knowledgeSearch)}</td>
                <td className="px-3 py-4 font-bold text-[#20242c]">{formatUsd(row.monthlyAiCostUsd)}</td>
                <td className="px-3 py-4"><Placeholder /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type AiChargeBillingRow = {
  key: string;
  companyName: string;
  chargeMonth: string;
  billingMonth: string;
  amount: number;
  packagePriceJpy: number;
  totalJpy: number;
  eventCount: number;
  plans: string[];
  latestChargedAt: Date | null;
};

function AiChargeBillingTable({ rows }: { rows: AiChargeBillingRow[] }) {
  if (rows.length === 0) return <Empty message="未請求のAIチャージはありません。" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
            <th className="px-3 py-3">翌月請求月</th>
            <th className="px-3 py-3">会社</th>
            <th className="px-3 py-3">チャージ月</th>
            <th className="px-3 py-3">プラン</th>
            <th className="px-3 py-3">チャージ回数</th>
            <th className="px-3 py-3">税抜金額</th>
            <th className="px-3 py-3">税込請求額</th>
            <th className="px-3 py-3">イベント数</th>
            <th className="px-3 py-3">最終チャージ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-[#eef1f5] text-[13px]">
              <td className="px-3 py-4 font-bold text-[#20242c]">{row.billingMonth}</td>
              <td className="px-3 py-4 font-bold text-[#20242c]">{row.companyName}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.chargeMonth}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.plans.join(" / ")}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.amount}回</td>
              <td className="px-3 py-4 text-[#343b48]">{formatYen(row.packagePriceJpy)}</td>
              <td className="px-3 py-4 font-bold text-[#20242c]">{formatYen(row.totalJpy)}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.eventCount}件</td>
              <td className="px-3 py-4 text-[#343b48]">{formatDateTime(row.latestChargedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CostUserTable({ rows }: { rows: UserUsageRow[] }) {
  if (rows.length === 0) return <Empty message="ユーザー別原価データはまだありません。" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
            <th className="px-3 py-3">ユーザー</th>
            <th className="px-3 py-3">会社</th>
            <th className="px-3 py-3">音声文字起こし</th>
            <th className="px-3 py-3">AI分析</th>
            <th className="px-3 py-3">ロープレ</th>
            <th className="px-3 py-3">ナレッジ検索</th>
            <th className="px-3 py-3">合計</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.user.uid} className="border-b border-[#eef1f5] text-[13px]">
              <td className="px-3 py-4 font-bold text-[#20242c]">{row.user.name ?? row.user.email ?? row.user.uid}</td>
              <td className="px-3 py-4 text-[#343b48]">{row.companyName}</td>
              <td className="px-3 py-4 text-[#343b48]">{formatUsd(row.cost.transcription)}</td>
              <td className="px-3 py-4 text-[#343b48]">{formatUsd(row.cost.analysis)}</td>
              <td className="px-3 py-4 text-[#343b48]">{formatUsd(row.cost.roleplay)}</td>
              <td className="px-3 py-4 text-[#343b48]">{formatUsd(row.cost.knowledgeSearch)}</td>
              <td className="px-3 py-4 font-bold text-[#20242c]">{formatUsd(row.monthlyAiCostUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JobTable({ jobs, failedOnly = false }: { jobs: AudioJobRow[]; failedOnly?: boolean }) {
  if (jobs.length === 0) return <Empty message={failedOnly ? "失敗したジョブはありません。" : "音声処理ジョブはまだありません。"} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] border-collapse">
        <thead>
          <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
            <th className="px-3 py-3">状態</th>
            <th className="px-3 py-3">会社</th>
            <th className="px-3 py-3">ユーザー</th>
            <th className="px-3 py-3">ファイル名</th>
            <th className="px-3 py-3">音声時間</th>
            <th className="px-3 py-3">開始時刻</th>
            <th className="px-3 py-3">完了時刻</th>
            <th className="px-3 py-3">エラー内容</th>
            <th className="px-3 py-3">再実行</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-[#eef1f5] text-[13px]">
              <td className="px-3 py-4"><StatusPill status={job.statusLabel} tone={job.status === "failed" ? "danger" : job.status === "completed" ? "success" : "warning"} /></td>
              <td className="px-3 py-4 font-bold text-[#20242c]">{job.companyName}</td>
              <td className="px-3 py-4 text-[#343b48]">{job.userName}</td>
              <td className="px-3 py-4 text-[#343b48]">{job.fileName}</td>
              <td className="px-3 py-4 text-[#343b48]">{formatMinutes(job.audioDurationSec)}</td>
              <td className="px-3 py-4 text-[#343b48]">{formatDateTime(job.startedAt)}</td>
              <td className="px-3 py-4 text-[#343b48]">{formatDateTime(job.completedAt)}</td>
              <td className="px-3 py-4 text-[#9b2c2c]">{job.errorMessage || "なし"}</td>
              <td className="px-3 py-4"><Placeholder /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorTable({ errors }: { errors: OperationalErrorRow[] }) {
  if (errors.length === 0) return <Empty message="現在検出できるエラーはありません。" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] border-collapse">
        <thead>
          <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
            <th className="px-3 py-3">種別</th>
            <th className="px-3 py-3">発生日時</th>
            <th className="px-3 py-3">発生会社</th>
            <th className="px-3 py-3">発生ユーザー</th>
            <th className="px-3 py-3">エラー内容</th>
            <th className="px-3 py-3">重要度</th>
            <th className="px-3 py-3">対応ステータス</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((error) => (
            <tr key={error.id} className="border-b border-[#eef1f5] text-[13px]">
              <td className="px-3 py-4 font-bold text-[#20242c]">{error.kind}</td>
              <td className="px-3 py-4 text-[#343b48]">{formatDateTime(error.occurredAt)}</td>
              <td className="px-3 py-4 text-[#343b48]">{error.companyName}</td>
              <td className="px-3 py-4 text-[#343b48]">{error.userName}</td>
              <td className="px-3 py-4 text-[#9b2c2c]">{error.message}</td>
              <td className="px-3 py-4"><StatusPill status={error.severity} tone={error.severity === "critical" ? "danger" : error.severity === "info" ? "success" : "warning"} /></td>
              <td className="px-3 py-4"><StatusPill status={formatErrorStatus(error.status)} tone={error.status === "resolved" ? "success" : "warning"} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PromptTable({ prompts }: { prompts: AiPromptRecord[] }) {
  const [promptType, setPromptType] = useState(promptTargets[0]);
  const [title, setTitle] = useState(promptTargets[0]);
  const [version, setVersion] = useState("v1");
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setIsSaving(true);
    try {
      await saveAiPrompt({ id: editingId ?? undefined, promptType, title, version, body, isActive });
      setEditingId(null);
      setPromptType(promptTargets[0]);
      setTitle(promptTargets[0]);
      setVersion("v1");
      setBody("");
      setIsActive(true);
    } finally {
      setIsSaving(false);
    }
  }

  function startEdit(prompt: AiPromptRecord) {
    setEditingId(prompt.id);
    setPromptType(prompt.promptType || promptTargets[0]);
    setTitle(prompt.title);
    setVersion(prompt.version);
    setBody(prompt.body);
    setIsActive(prompt.isActive);
  }

  return (
    <div className="grid gap-5">
      <form onSubmit={handleSubmit} className="grid gap-4 rounded-[8px] border border-[#f0e4bd] bg-[#fffdf7] p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Select
            label="プロンプト種別"
            value={promptType}
            onChange={(value) => {
              setPromptType(value);
              if (!editingId) setTitle(value);
            }}
            options={promptTargets.map((target) => ({ value: target, label: target }))}
          />
          <Field label="タイトル" value={title} onChange={setTitle} placeholder="商談分析プロンプト" />
          <Field label="バージョン" value={version} onChange={setVersion} placeholder="v1" />
        </div>
        <Textarea label="プロンプト本文" value={body} onChange={setBody} placeholder="ここにプロンプト本文を入力" />
        <label className="flex items-center gap-2 text-[13px] font-bold text-[#343b48]">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          有効にする
        </label>
        <div className="flex justify-end gap-3">
          {editingId ? (
            <button type="button" onClick={() => setEditingId(null)} className="rounded-[8px] border border-[#eadfbc] bg-white px-4 py-3 text-[13px] font-bold text-[#343b48]">
              新規作成に戻る
            </button>
          ) : null}
          <button type="submit" disabled={isSaving || !body.trim()} className="rounded-[8px] bg-[#ffc400] px-4 py-3 text-[13px] font-bold text-[#171717] disabled:opacity-50">
            {isSaving ? "保存中..." : editingId ? "更新する" : "保存する"}
          </button>
        </div>
      </form>
      {prompts.length === 0 ? (
        <Empty message="保存済みプロンプトはまだありません。" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
                <th className="px-3 py-3">プロンプト種別</th>
                <th className="px-3 py-3">タイトル</th>
                <th className="px-3 py-3">バージョン</th>
                <th className="px-3 py-3">状態</th>
                <th className="px-3 py-3">更新日</th>
                <th className="px-3 py-3">編集</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((prompt) => (
                <tr key={prompt.id} className="border-b border-[#eef1f5] text-[13px]">
                  <td className="px-3 py-4 font-bold text-[#20242c]">{prompt.promptType || "未分類"}</td>
                  <td className="px-3 py-4 text-[#343b48]">{prompt.title}</td>
                  <td className="px-3 py-4 text-[#343b48]">{prompt.version}</td>
                  <td className="px-3 py-4"><StatusPill status={prompt.isActive ? "有効" : "無効"} tone={prompt.isActive ? "success" : "warning"} /></td>
                  <td className="px-3 py-4 text-[#343b48]">{formatDateTime(prompt.updatedAt)}</td>
                  <td className="px-3 py-4">
                    <button type="button" onClick={() => startEdit(prompt)} className="rounded-[8px] bg-[#fff2c8] px-3 py-1.5 font-bold text-[#8a6500]">編集</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FeatureFlagTable({ companies, flags }: { companies: CompanyRecord[]; flags: FeatureFlagRecord[] }) {
  if (companies.length === 0) return <Empty message="会社データはまだありません。" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
            <th className="px-3 py-3">会社</th>
            {featureFlagTargets.map((target) => (
              <th key={target} className="px-3 py-3">{target}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => {
            const flag = flags.find((item) => item.companyId === company.id);

            return (
              <tr key={company.id} className="border-b border-[#eef1f5] text-[13px]">
                <td className="px-3 py-4 font-bold text-[#20242c]">{company.companyName}</td>
                {featureFlagKeys.map((item) => (
                  <td key={item.key} className="px-3 py-4">
                    <input
                      type="checkbox"
                      checked={flag?.[item.key] ?? false}
                      onChange={(event) => void updateCompanyFeatureFlags(company.id, { [item.key]: event.target.checked })}
                      aria-label={`${company.companyName} ${item.label}`}
                      className="h-4 w-4 accent-[#ffc400]"
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AnnouncementForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<AnnouncementRecord["target"]>("all");
  const [kind, setKind] = useState<AnnouncementRecord["kind"]>("notice");
  const [status, setStatus] = useState<AnnouncementRecord["status"]>("draft");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setIsSaving(true);
    try {
      await createAnnouncement({
        title,
        body,
        target,
        kind,
        status,
        startsAt: parseDateInput(startsAt),
        endsAt: parseDateInput(endsAt),
      });
      setTitle("");
      setBody("");
      setTarget("all");
      setKind("notice");
      setStatus("draft");
      setStartsAt("");
      setEndsAt("");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="タイトル" value={title} onChange={setTitle} placeholder="メンテナンスのお知らせ" />
        <Select label="表示対象" value={target} onChange={(value) => setTarget(value as AnnouncementRecord["target"])} options={announcementTargetOptions} />
      </div>
      <Textarea label="本文" value={body} onChange={setBody} placeholder="お知らせ本文を入力" />
      <div className="grid gap-4 md:grid-cols-4">
        <Select label="種別" value={kind} onChange={(value) => setKind(value as AnnouncementRecord["kind"])} options={announcementKindOptions} />
        <Select label="公開状態" value={status} onChange={(value) => setStatus(value as AnnouncementRecord["status"])} options={announcementStatusOptions} />
        <DateField label="表示開始日" value={startsAt} onChange={setStartsAt} />
        <DateField label="表示終了日" value={endsAt} onChange={setEndsAt} />
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={isSaving || !title.trim() || !body.trim()} className="rounded-[8px] bg-[#ffc400] px-4 py-3 text-[13px] font-bold text-[#171717] disabled:opacity-50">
          {isSaving ? "作成中..." : "お知らせを作成"}
        </button>
      </div>
    </form>
  );
}

function AnnouncementTable({ announcements }: { announcements: AnnouncementRecord[] }) {
  if (announcements.length === 0) return <Empty message="お知らせはまだありません。" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr className="border-b border-[#e6e9ef] text-left text-[12px] font-bold text-[#7a808c]">
            <th className="px-3 py-3">タイトル</th>
            <th className="px-3 py-3">種別</th>
            <th className="px-3 py-3">対象</th>
            <th className="px-3 py-3">表示期間</th>
            <th className="px-3 py-3">状態</th>
            <th className="px-3 py-3">更新</th>
          </tr>
        </thead>
        <tbody>
          {announcements.map((announcement) => (
            <tr key={announcement.id} className="border-b border-[#eef1f5] text-[13px]">
              <td className="px-3 py-4">
                <div className="font-bold text-[#20242c]">{announcement.title}</div>
                <div className="mt-1 max-w-[360px] truncate text-[12px] text-[#7a808c]">{announcement.body}</div>
              </td>
              <td className="px-3 py-4 text-[#343b48]">{announcementKindOptions.find((item) => item.value === announcement.kind)?.label}</td>
              <td className="px-3 py-4 text-[#343b48]">{announcementTargetOptions.find((item) => item.value === announcement.target)?.label}</td>
              <td className="px-3 py-4 text-[#343b48]">{formatDate(announcement.startsAt)} - {formatDate(announcement.endsAt)}</td>
              <td className="px-3 py-4">
                <InlineSelect
                  value={announcement.status}
                  onChange={(value) => void updateAnnouncement(announcement.id, { status: value as AnnouncementRecord["status"] })}
                  options={announcementStatusOptions}
                />
              </td>
              <td className="px-3 py-4 text-[#343b48]">{formatDateTime(announcement.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyValueList({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid gap-3">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 border-b border-[#eef1f5] pb-3 last:border-b-0 last:pb-0">
          <dt className="text-[13px] font-bold text-[#7a808c]">{label}</dt>
          <dd className="text-right text-[13px] font-bold text-[#20242c]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function UsageRate({ rate }: { rate: number }) {
  const tone = rate >= 100 ? "bg-red-50 text-red-700" : rate >= 80 ? "bg-[#fff2c8] text-[#8a6500]" : "bg-emerald-50 text-emerald-700";
  return <span className={`rounded-full px-3 py-1.5 text-[12px] font-black ${tone}`}>{rate}%</span>;
}

function StatusPill({ status, tone }: { status: string; tone: "success" | "warning" | "danger" }) {
  const className =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "bg-red-50 text-red-700"
        : "bg-[#fff2c8] text-[#8a6500]";

  return <span className={`rounded-full px-3 py-1.5 text-[12px] font-black ${className}`}>{status}</span>;
}

function UserList({ users }: { users: AppUserProfile[] }) {
  if (users.length === 0) return <Empty message="該当ユーザーはまだいません。" />;

  return (
    <div className="grid gap-3">
      {users.map((user) => (
        <div key={user.uid} className="border-b border-[#eef1f5] pb-3 last:border-b-0 last:pb-0">
          <div className="font-bold text-[#20242c]">{user.name ?? "未設定"}</div>
          <div className="mt-1 text-[12px] text-[#7a808c]">{user.email ?? "メール未設定"}</div>
        </div>
      ))}
    </div>
  );
}

function TenantUserDialog({
  allowedRoles,
  companies,
  fixedCompanyId,
  initialRole,
  onClose,
}: {
  allowedRoles: Array<"admin" | "sales">;
  companies: CompanyRecord[];
  fixedCompanyId?: string;
  initialRole: "admin" | "sales";
  onClose: () => void;
}) {
  const [companyId, setCompanyId] = useState(fixedCompanyId ?? companies[0]?.id ?? "");
  const [role, setRole] = useState<"admin" | "sales">(initialRole);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workExperienceYears, setWorkExperienceYears] = useState("");
  const [workExperienceMonths, setWorkExperienceMonths] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (fixedCompanyId) {
      setCompanyId(fixedCompanyId);
    }
  }, [fixedCompanyId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const workExperience = role === "sales" ? parseWorkExperience(workExperienceYears, workExperienceMonths) : null;

    if (workExperience && !workExperience.ok) {
      setError(workExperience.error);
      return;
    }

    setIsSaving(true);

    try {
      await createTenantUser({
        companyId,
        role,
        name,
        email,
        password,
        workExperienceYears: workExperience?.ok ? workExperience.value.years : null,
        workExperienceMonths: workExperience?.ok ? workExperience.value.months : null,
      });
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ユーザー追加に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/30 px-4 py-6 backdrop-blur-[2px]">
      <section className="w-full max-w-[520px] rounded-[8px] border border-[#f0e4bd] bg-white shadow-[0_24px_70px_rgba(245,189,7,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#eef1f5] px-5 py-4">
          <div>
            <h2 className="text-[20px] font-black text-[#171717]">ユーザー追加</h2>
            <p className="mt-1 text-[13px] text-[#7a808c]">既存会社に管理者または営業マンを紐付けます。</p>
          </div>
          <button type="button" onClick={onClose} className="text-[22px] leading-none text-[#8a909b]">×</button>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 p-5">
          <Select
            label="会社"
            value={companyId}
            onChange={setCompanyId}
            options={companies.map((company) => ({ value: company.id, label: company.companyName }))}
            disabled={Boolean(fixedCompanyId)}
          />
          <Select
            label="権限"
            value={role}
            onChange={(value) => setRole(value as "admin" | "sales")}
            options={allowedRoles.map((item) => ({ value: item, label: item === "admin" ? "管理者" : "営業マン" }))}
          />
          <Field label="名前" value={name} onChange={setName} placeholder="山田 太郎" />
          <Field label="メールアドレス" value={email} onChange={setEmail} placeholder="taro@example.com" />
          <Field label="初期パスワード" value={password} onChange={setPassword} placeholder="6文字以上" type="password" />
          {role === "sales" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="勤務年数（年）" value={workExperienceYears} onChange={setWorkExperienceYears} placeholder="例: 3" type="number" />
              <Field label="勤務年数（月）" value={workExperienceMonths} onChange={setWorkExperienceMonths} placeholder="0〜11" type="number" />
            </div>
          ) : null}
          {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-700">{error}</div> : null}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-[8px] border border-[#eadfbc] bg-white px-4 py-3 text-[13px] font-bold text-[#343b48] transition hover:bg-[#fff8e4]">キャンセル</button>
            <button type="submit" disabled={isSaving || !companyId} className="rounded-[8px] bg-[#ffc400] px-4 py-3 text-[13px] font-bold text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.18)] transition hover:bg-[#f0ba00] disabled:opacity-50">
              {isSaving ? "追加中..." : "追加する"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function OwnerPageShell({ children }: { children: React.ReactNode }) {
  return (
    <main data-owner-console className="min-h-screen bg-[#fffdf7] px-4 py-6 text-[#20242c] sm:px-6 md:px-10">
      <div className="mx-auto max-w-[1320px]">{children}</div>
    </main>
  );
}

function OwnerHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-[8px] border border-[#f0e4bd] bg-white px-5 py-5 shadow-[0_12px_34px_rgba(245,189,7,0.08)] md:px-6">
      <div className="absolute inset-x-0 top-0 h-1 bg-[#ffc400]" />
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-[8px] bg-[#fff7dd] sm:flex">
            <Image src="/sels1.png" alt="selmo" width={48} height={38} className="h-auto w-10 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="inline-flex rounded-[8px] bg-[#fff2c8] px-3 py-1 text-[12px] font-black text-[#8a6500]">{eyebrow}</p>
            <h1 className="mt-2 text-[28px] font-black text-[#171717] md:text-[32px]">{title}</h1>
            <p className="mt-2 max-w-[760px] text-[14px] leading-7 text-[#596273]">{description}</p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

function Panel({
  title,
  actionLabel,
  action,
  href,
  children,
}: {
  title: string;
  actionLabel?: string;
  action?: React.ReactNode;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-[8px] border border-[#ece5d2] bg-white shadow-[0_10px_28px_rgba(31,28,20,0.05)]">
      <div className="flex items-center justify-between gap-4 border-b border-[#eef1f5] bg-[#fffefa] px-5 py-4">
        <h2 className="text-[17px] font-black text-[#171717]">{title}</h2>
        {action ?? (actionLabel && href ? <Link href={href} className="rounded-[8px] bg-[#fff2c8] px-3 py-1.5 text-[13px] font-bold text-[#8a6500] transition hover:bg-[#ffe7a0]">{actionLabel}</Link> : null)}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Metric({ label, value, note, muted = false }: { label: string; value: string; note: string; muted?: boolean }) {
  return (
    <article className="rounded-[8px] border border-[#ece5d2] bg-white px-5 py-5 shadow-[0_10px_28px_rgba(31,28,20,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-bold text-[#343b48]">{label}</div>
        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#ffc400]" />
      </div>
      <div className={`mt-2 text-[28px] font-black ${muted ? "text-[#8a909b]" : "text-[#171717]"}`}>{value}</div>
      <div className="mt-2 border-t border-[#f1efe8] pt-2 text-[12px] text-[#7a808c]">{note}</div>
    </article>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", disabled = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-bold text-[#343b48]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-[8px] border border-[#eadfbc] bg-[#fffefa] px-4 py-3 text-[14px] outline-none transition placeholder:text-[#b0a894] focus:border-[#ffc400] focus:bg-white focus:shadow-[0_0_0_3px_rgba(255,196,0,0.16)] disabled:bg-[#f8f6ef] disabled:text-[#8a909b]"
      />
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-bold text-[#343b48]">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[8px] border border-[#eadfbc] bg-[#fffefa] px-4 py-3 text-[14px] outline-none transition focus:border-[#ffc400] focus:bg-white focus:shadow-[0_0_0_3px_rgba(255,196,0,0.16)]"
      />
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-bold text-[#343b48]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={6}
        className="w-full resize-y rounded-[8px] border border-[#eadfbc] bg-[#fffefa] px-4 py-3 text-[14px] leading-7 outline-none transition placeholder:text-[#b0a894] focus:border-[#ffc400] focus:bg-white focus:shadow-[0_0_0_3px_rgba(255,196,0,0.16)]"
      />
    </label>
  );
}

function Select({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-bold text-[#343b48]">{label}</span>
      <InlineSelect value={value} onChange={onChange} options={options} full disabled={disabled} />
    </label>
  );
}

function InlineSelect({ value, onChange, options, full = false, disabled = false }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; full?: boolean; disabled?: boolean }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={`${full ? "w-full" : "min-w-[120px]"} rounded-[8px] border border-[#eadfbc] bg-[#fffefa] px-3 py-2 text-[13px] font-bold text-[#343b48] outline-none transition focus:border-[#ffc400] focus:bg-white focus:shadow-[0_0_0_3px_rgba(255,196,0,0.16)] disabled:bg-[#f8f6ef] disabled:text-[#8a909b]`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="rounded-[8px] border border-[#eadfbc] bg-white px-4 py-3 text-[13px] font-bold text-[#343b48] transition hover:bg-[#fff8e4]">{children}</Link>;
}

function Placeholder() {
  return <span className="font-bold text-[#8a909b]">集計準備中</span>;
}

function Empty({ message }: { message: string }) {
  return <div className="rounded-[8px] border border-dashed border-[#eadfbc] bg-[#fffdf7] px-5 py-8 text-center text-[13px] font-bold text-[#8a909b]">{message}</div>;
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="mt-5 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-700">{message}</div>;
}

function isCurrentMonth(date: Date | null) {
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function isToday(date: Date | null) {
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function isAudioAnalysisCompleted(meeting: MeetingRecord) {
  return (
    meeting.processingStatus === "completed" ||
    meeting.aiSummaryStatus === "completed" ||
    meeting.conversationLogStatus === "completed" ||
    meeting.transcriptBlockStatus === "completed"
  );
}

function countMeetingAiEvents(meeting: MeetingRecord) {
  return [
    meeting.transcriptionProbeStatus,
    meeting.transcriptBlockStatus,
    meeting.conversationLogStatus,
    meeting.aiSummaryStatus,
  ].filter((status) => status === "completed").length;
}

function countSuccessfulAiUsage(logs: AiUsageLogRecord[], feature: string) {
  return logs.filter((log) => log.feature === feature && log.status !== "failed").length;
}

function calculateUsageRate(used: number, limit: number | null) {
  if (limit === null || limit <= 0) return null;
  return Math.round((used / limit) * 100);
}

function estimateAiCostUsd(input: { meetings: MeetingRecord[]; roleplayResults: RoleplayResult[]; aiUsageLogs?: AiUsageLogRecord[] }) {
  const logs = input.aiUsageLogs ?? [];
  if (logs.length > 0) {
    const sum = (features: string[]) =>
      logs
        .filter((log) => features.includes(log.feature))
        .reduce((total, log) => total + (log.estimatedCostUsd ?? 0), 0);
    const transcription = sum(["transcription"]);
    const analysis = sum(["transcript_blocks", "summary", "conversation_analysis", "analysis"]);
    const roleplay = sum(["roleplay"]);
    const knowledgeSearch = sum(["knowledge_search"]);

    return {
      transcription,
      analysis,
      roleplay,
      knowledgeSearch,
      total: transcription + analysis + roleplay + knowledgeSearch,
    };
  }

  const audioMinutes = input.meetings.reduce((sum, meeting) => sum + (meeting.audioDurationSec ?? 0) / 60, 0);
  const analysisEvents = input.meetings.reduce((sum, meeting) => sum + countMeetingAiEvents(meeting), 0);
  const transcription = audioMinutes * costCoefficients.transcriptionUsdPerMinute;
  const analysis = analysisEvents * costCoefficients.analysisUsdPerEvent;
  const roleplay = input.roleplayResults.length * costCoefficients.roleplayUsdPerSession;

  return {
    transcription,
    analysis,
    roleplay,
    knowledgeSearch: 0,
    total: transcription + analysis + roleplay,
  };
}

function getLatestDate(dates: Array<Date | null>) {
  const timestamps = dates
    .filter((date): date is Date => Boolean(date))
    .map((date) => date.getTime());

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

function summarizeRows(rows: ReturnType<typeof useCompanyUsageRows>) {
  return rows.reduce(
    (summary, row) => ({
      monthlyAudioUploads: summary.monthlyAudioUploads + row.monthlyAudioUploads,
      monthlyAudioAnalyses: summary.monthlyAudioAnalyses + row.monthlyAudioAnalyses,
      monthlyAudioDurationSec: summary.monthlyAudioDurationSec + row.monthlyAudioDurationSec,
      monthlyAiEvents: summary.monthlyAiEvents + row.monthlyAiEvents,
      monthlyRoleplayCount: summary.monthlyRoleplayCount + row.monthlyRoleplayCount,
      monthlyKnowledgeSearchCount: summary.monthlyKnowledgeSearchCount + row.monthlyKnowledgeSearchCount,
      storageBytes: summary.storageBytes + row.storageBytes,
    }),
    {
      monthlyAudioUploads: 0,
      monthlyAudioAnalyses: 0,
      monthlyAudioDurationSec: 0,
      monthlyAiEvents: 0,
      monthlyRoleplayCount: 0,
      monthlyKnowledgeSearchCount: 0,
      storageBytes: 0,
    },
  );
}

function buildServiceMetrics(data: OwnerData, rows: ReturnType<typeof useCompanyUsageRows>) {
  const totals = summarizeRows(rows);
  const mrr = data.companies.reduce((sum, company) => sum + (company.monthlyFee ?? 0), 0);
  const monthlyAiCostUsd = rows.reduce((sum, row) => sum + row.monthlyAiCostUsd, 0);
  const monthlyAiCostJpy = monthlyAiCostUsd * costCoefficients.usdJpyRate;
  const grossProfit = mrr > 0 ? mrr - monthlyAiCostJpy : null;

  return {
    ...totals,
    monthlyAiCostUsd,
    mrrLabel: mrr > 0 ? formatYen(mrr) : "集計準備中",
    grossProfitLabel: grossProfit === null ? "集計準備中" : formatYen(grossProfit),
  };
}

type UserUsageRow = {
  user: AppUserProfile;
  companyName: string;
  monthlyAudioUploads: number;
  monthlyAudioAnalyses: number;
  monthlyAudioDurationSec: number;
  monthlyAiEvents: number;
  monthlyRoleplayCount: number;
  monthlyKnowledgeSearchCount: number;
  monthlyAiCostUsd: number;
  cost: ReturnType<typeof estimateAiCostUsd>;
};

function buildUserUsageRows(data: OwnerData, companyFilter: string): UserUsageRow[] {
  const users = companyFilter === "all" ? data.users : data.users.filter((user) => user.companyId === companyFilter);

  return users.map((user) => {
    const company = data.companies.find((item) => item.id === user.companyId);
    const meetings = data.meetings.filter((meeting) => meeting.userId === user.uid && isCurrentMonth(meeting.recordedAt));
    const roleplayResults = data.roleplayResults.filter((result) => result.userId === user.uid && isCurrentMonth(result.createdAt));
    const aiUsageLogs = data.aiUsageLogs.filter((log) => log.userId === user.uid && isCurrentMonth(log.createdAt));
    const knowledgeSearchEvents = data.knowledgeSearchEvents.filter((event) => event.userId === user.uid && isCurrentMonth(event.createdAt));
    const cost = estimateAiCostUsd({ meetings, roleplayResults, aiUsageLogs });

    return {
      user,
      companyName: company?.companyName ?? user.companyId ?? "未紐付け",
      monthlyAudioUploads: meetings.filter((meeting) => Boolean(meeting.audioFileName)).length,
      monthlyAudioAnalyses: meetings.filter(isAudioAnalysisCompleted).length,
      monthlyAudioDurationSec: meetings.reduce((sum, meeting) => sum + (meeting.audioDurationSec ?? 0), 0),
      monthlyAiEvents: aiUsageLogs.length || meetings.reduce((sum, meeting) => sum + countMeetingAiEvents(meeting), 0),
      monthlyRoleplayCount: roleplayResults.length,
      monthlyKnowledgeSearchCount: knowledgeSearchEvents.length,
      monthlyAiCostUsd: cost.total,
      cost,
    };
  });
}

function buildAiChargeBillingRows(data: OwnerData): AiChargeBillingRow[] {
  const groups = new Map<string, AiChargeBillingRow>();

  data.aiChargeEvents
    .filter((event) => event.invoiceStatus === "unbilled")
    .forEach((event) => {
      const company = data.companies.find((item) => item.id === event.companyId);
      const chargeMonth = formatYearMonth(event.createdAt);
      const billingMonth = formatNextYearMonth(event.createdAt);
      const companyName = company?.companyName ?? event.companyName ?? event.companyId ?? "未紐付け";
      const key = `${event.companyId ?? companyName}_${chargeMonth}`;
      const packagePriceJpy = event.packagePriceJpy ?? event.priceJpy ?? (event.amount * (event.unitPriceJpy ?? 6500));
      const totalJpy = event.totalJpy ?? Math.round(packagePriceJpy * 1.1);
      const planLabel = formatChargePlan(event.chargePlan);
      const current = groups.get(key);

      if (current) {
        current.amount += event.amount;
        current.packagePriceJpy += packagePriceJpy;
        current.totalJpy += totalJpy;
        current.eventCount += 1;
        current.latestChargedAt = getLatestDate([current.latestChargedAt, event.createdAt]);
        if (!current.plans.includes(planLabel)) current.plans.push(planLabel);
        return;
      }

      groups.set(key, {
        key,
        companyName,
        chargeMonth,
        billingMonth,
        amount: event.amount,
        packagePriceJpy,
        totalJpy,
        eventCount: 1,
        plans: [planLabel],
        latestChargedAt: event.createdAt,
      });
    });

  return Array.from(groups.values()).sort((left, right) => {
    if (left.billingMonth !== right.billingMonth) return left.billingMonth.localeCompare(right.billingMonth);
    return left.companyName.localeCompare(right.companyName, "ja");
  });
}

function summarizeAiChargeBillingRows(rows: AiChargeBillingRow[]) {
  return {
    companyCount: new Set(rows.map((row) => row.companyName)).size,
    amount: rows.reduce((sum, row) => sum + row.amount, 0),
    totalJpy: rows.reduce((sum, row) => sum + row.totalJpy, 0),
    eventCount: rows.reduce((sum, row) => sum + row.eventCount, 0),
  };
}

type AudioJobStatus = "waiting" | "transcribing" | "analyzing" | "running" | "completed" | "failed";

type AudioJobRow = {
  id: string;
  status: AudioJobStatus;
  statusLabel: string;
  companyName: string;
  userName: string;
  fileName: string;
  audioDurationSec: number;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
};

function buildAudioJobs(data: OwnerData): AudioJobRow[] {
  if (data.audioProcessingJobs.length > 0) {
    return data.audioProcessingJobs.map((job) => {
      const company = data.companies.find((item) => item.id === job.companyId);
      const user = data.users.find((item) => item.uid === job.userId);
      const status = normalizeAudioJobStatus(job.status);

      return {
        id: job.id,
        status,
        statusLabel: jobStatusLabels[status],
        companyName: company?.companyName ?? job.companyId ?? "未紐付け",
        userName: user?.name ?? user?.email ?? job.userId ?? "未設定",
        fileName: job.fileName ?? "ファイル名未設定",
        audioDurationSec: job.audioDurationSec ?? 0,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        errorMessage: job.errorMessage,
      };
    });
  }

  return data.meetings
    .filter((meeting) => Boolean(meeting.audioFileName))
    .map((meeting) => {
      const company = data.companies.find((item) => item.id === meeting.companyId);
      const user = data.users.find((item) => item.uid === meeting.userId);
      const errorMessage = getMeetingErrorMessage(meeting);
      const status = resolveAudioJobStatus(meeting, errorMessage);

      return {
        id: meeting.id,
        status,
        statusLabel: jobStatusLabels[status],
        companyName: company?.companyName ?? meeting.companyId ?? "未紐付け",
        userName: user?.name ?? user?.email ?? meeting.userId,
        fileName: meeting.audioFileName ?? "ファイル名未設定",
        audioDurationSec: meeting.audioDurationSec ?? 0,
        startedAt: meeting.recordedAt,
        completedAt: getLatestDate([
          meeting.aiSummaryTestedAt ?? null,
          meeting.conversationLogTestedAt ?? null,
          meeting.transcriptBlockTestedAt ?? null,
          meeting.transcriptionProbeTestedAt ?? null,
        ]),
        errorMessage,
      };
    });
}

function normalizeAudioJobStatus(status: string): AudioJobStatus {
  if (status === "failed") return "failed";
  if (status === "completed") return "completed";
  if (status === "transcribing") return "transcribing";
  if (status === "analyzing") return "analyzing";
  if (status === "uploading") return "running";
  return "waiting";
}

function resolveAudioJobStatus(meeting: MeetingRecord, errorMessage: string | null): AudioJobStatus {
  if (errorMessage || meeting.processingStatus === "failed") return "failed";
  if (meeting.aiSummaryStatus === "running" || meeting.processingStatus === "analyzing") return "analyzing";
  if (meeting.transcriptionProbeStatus === "running" || meeting.processingStatus === "transcribing") return "transcribing";
  if (meeting.processingStatus === "uploading") return "running";
  if (isAudioAnalysisCompleted(meeting)) return "completed";
  return "waiting";
}

function getMeetingErrorMessage(meeting: MeetingRecord) {
  return (
    meeting.aiSummaryError ??
    meeting.conversationLogError ??
    meeting.transcriptBlockError ??
    meeting.transcriptionProbeError ??
    null
  );
}

type OperationalErrorRow = {
  id: string;
  kind: "OpenAI" | "Storage" | "Firebase" | "Cloud Run" | "Auth" | "API" | string;
  occurredAt: Date | null;
  companyName: string;
  userName: string;
  message: string;
  severity: "info" | "warning" | "critical" | string;
  status: string;
};

function buildOperationalErrors(data: OwnerData): OperationalErrorRow[] {
  if (data.systemErrors.length > 0) {
    return data.systemErrors.map((error) => {
      const company = data.companies.find((item) => item.id === error.companyId);
      const user = data.users.find((item) => item.uid === error.userId);

      return {
        id: error.id,
        kind: error.kind,
        occurredAt: error.occurredAt,
        companyName: company?.companyName ?? error.companyId ?? "未紐付け",
        userName: user?.name ?? user?.email ?? error.userId ?? "未設定",
        message: error.message,
        severity: error.severity,
        status: error.status,
      };
    });
  }

  return data.meetings.flatMap((meeting) => {
    const company = data.companies.find((item) => item.id === meeting.companyId);
    const user = data.users.find((item) => item.uid === meeting.userId);
    const base = {
      companyName: company?.companyName ?? meeting.companyId ?? "未紐付け",
      userName: user?.name ?? user?.email ?? meeting.userId,
    };
    const rows: OperationalErrorRow[] = [];

    if (meeting.transcriptionProbeError) {
      rows.push({
        id: `${meeting.id}-transcription`,
        kind: classifyError(meeting.transcriptionProbeError),
        occurredAt: meeting.transcriptionProbeTestedAt ?? meeting.recordedAt,
        message: meeting.transcriptionProbeError,
        severity: "critical",
        status: "open",
        ...base,
      });
    }

    if (meeting.transcriptBlockError) {
      rows.push({
        id: `${meeting.id}-blocks`,
        kind: classifyError(meeting.transcriptBlockError),
        occurredAt: meeting.transcriptBlockTestedAt ?? meeting.recordedAt,
        message: meeting.transcriptBlockError,
        severity: "warning",
        status: "open",
        ...base,
      });
    }

    if (meeting.conversationLogError) {
      rows.push({
        id: `${meeting.id}-conversation`,
        kind: classifyError(meeting.conversationLogError),
        occurredAt: meeting.conversationLogTestedAt ?? meeting.recordedAt,
        message: meeting.conversationLogError,
        severity: "warning",
        status: "open",
        ...base,
      });
    }

    if (meeting.aiSummaryError) {
      rows.push({
        id: `${meeting.id}-summary`,
        kind: classifyError(meeting.aiSummaryError),
        occurredAt: meeting.aiSummaryTestedAt ?? meeting.recordedAt,
        message: meeting.aiSummaryError,
        severity: "warning",
        status: "open",
        ...base,
      });
    }

    return rows;
  });
}

function classifyError(message: string): OperationalErrorRow["kind"] {
  const lower = message.toLowerCase();
  if (lower.includes("openai") || lower.includes("api key") || lower.includes("token")) return "OpenAI";
  if (lower.includes("storage") || lower.includes("音声ファイル") || lower.includes("download")) return "Storage";
  if (lower.includes("firebase") || lower.includes("firestore")) return "Firebase";
  if (lower.includes("cloud run")) return "Cloud Run";
  if (lower.includes("auth") || lower.includes("認証")) return "Auth";
  return "API";
}

function countBy<T, K extends string>(items: T[], getKey: (item: T) => K) {
  return items.reduce<Record<K, number>>((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {} as Record<K, number>);
}

function buildCostBreakdownForRow(row: ReturnType<typeof useCompanyUsageRows>[number]) {
  return row.monthlyAiCostBreakdown;
}

function formatDateTime(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDate(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatYearMonth(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit" }).format(date);
}

function formatNextYearMonth(date: Date | null) {
  if (!date) return "未登録";
  return formatYearMonth(new Date(date.getFullYear(), date.getMonth() + 1, 1));
}

function formatDateInput(date: Date | null) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMonthlyFee(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseQuota(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function parseWorkExperience(yearsValue: string, monthsValue: string):
  | { ok: true; value: { years: number; months: number } }
  | { ok: false; error: string } {
  const years = parseQuota(yearsValue);
  const months = parseQuota(monthsValue);

  if (years === null) return { ok: false, error: "勤務年数（年）を入力してください。" };
  if (months === null) return { ok: false, error: "勤務年数（月）を入力してください。" };
  if (months > 11) return { ok: false, error: "勤務年数の月は0〜11で入力してください。" };

  return { ok: true, value: { years, months } };
}

function formatMinutes(durationSec: number) {
  if (!durationSec) return "0分";
  return `${Math.round(durationSec / 60)}分`;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function formatYen(value: number) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
}

function formatYenOrPending(value: number | null) {
  return value === null ? "集計準備中" : formatYen(value);
}

function formatCostRate(companies: CompanyRecord[], monthlyAiCostUsd: number) {
  const mrr = companies.reduce((sum, company) => sum + (company.monthlyFee ?? 0), 0);
  if (!mrr) return "集計準備中";
  const aiCostJpy = monthlyAiCostUsd * costCoefficients.usdJpyRate;
  return `${Math.round((aiCostJpy / mrr) * 1000) / 10}%`;
}

function formatErrorStatus(status: string) {
  if (status === "resolved") return "対応済み";
  if (status === "investigating") return "調査中";
  if (status === "open") return "未対応";
  return status || "未対応";
}

function formatPlan(plan: CompanyPlan) {
  return planOptions.find((option) => option.value === plan)?.label ?? plan;
}

function formatQuota(value: number | null) {
  return value === null ? "要相談" : `${value}回`;
}

function formatWorkExperience(years: number | null, months: number | null) {
  if (years === null || months === null) return "未設定";
  return `${years}年${months}ヶ月`;
}

function formatChargePlan(plan: string) {
  if (plan === "single") return "1回チャージ";
  if (plan === "ten_pack") return "10回チャージ";
  return plan || "未設定";
}

const costCoefficients = {
  transcriptionUsdPerMinute: 0.006,
  analysisUsdPerEvent: 0.01,
  roleplayUsdPerSession: 0.02,
  usdJpyRate: 150,
};

const planLimits: Record<CompanyPlan, { audioMinutes: number | null; users: number | null }> = {
  standard: { audioMinutes: 300, users: 10 },
  pro: { audioMinutes: 1500, users: 30 },
  enterprise: { audioMinutes: null, users: null },
};

const jobStatusLabels: Record<AudioJobStatus, string> = {
  waiting: "待機中",
  transcribing: "文字起こし中",
  analyzing: "AI分析中",
  running: "処理中",
  completed: "完了",
  failed: "エラー",
};

const promptTargets = [
  "商談分析プロンプト",
  "AI要約プロンプト",
  "改善提案プロンプト",
  "ロープレ顧客返答プロンプト",
  "ロープレ採点プロンプト",
  "ナレッジ検索プロンプト",
];

const featureFlagKeys: Array<{ key: keyof Omit<FeatureFlagRecord, "id" | "companyId" | "updatedAt">; label: string }> = [
  { key: "aiAnalysis", label: "AI分析" },
  { key: "aiRoleplay", label: "AIロープレ" },
  { key: "knowledgeSearch", label: "ナレッジ検索" },
  { key: "adminDashboard", label: "管理者ダッシュボード" },
  { key: "newUi", label: "新UI" },
  { key: "betaFeatures", label: "β機能" },
];

const featureFlagTargets = featureFlagKeys.map((item) => item.label);

const announcementTargetOptions = [
  { value: "all", label: "全ユーザー" },
  { value: "admins", label: "管理者" },
  { value: "sales", label: "営業マン" },
];

const announcementKindOptions = [
  { value: "notice", label: "通常告知" },
  { value: "maintenance", label: "メンテナンス告知" },
  { value: "feature", label: "新機能告知" },
];

const announcementStatusOptions = [
  { value: "draft", label: "非公開" },
  { value: "published", label: "公開" },
];

const planOptions = [
  { value: "standard", label: "Standard" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

const companyStatusOptions = [
  { value: "active", label: "active" },
  { value: "inactive", label: "inactive" },
  { value: "suspended", label: "suspended" },
];

const roleOptions = [
  { value: "owner", label: "owner" },
  { value: "admin", label: "admin" },
  { value: "sales", label: "sales" },
];

const userStatusOptions = [
  { value: "active", label: "active" },
  { value: "inactive", label: "inactive" },
];
