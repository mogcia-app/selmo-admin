"use client";

import { useState } from "react";

import {
  EmptyState,
  PageHeader,
  PageShell,
  Panel,
  StatusBadge,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";
import { useAuth } from "@/features/auth/auth-provider";
import { createTenantUser, updateSalesWorkExperience } from "@/lib/firebase/user-management";

export default function AdminUsersPage() {
  const { profile } = useAuth();
  const { users, error } = useAdminInsights();
  const [dialogOpen, setDialogOpen] = useState(false);
  const admins = users.filter((user) => user.role === "admin");
  const sales = users.filter((user) => user.role === "sales");

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="ACCESS CONTROL"
          title="ユーザー管理"
          description="自社の管理者と営業マンを確認し、営業マンを追加します。"
          action={
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 py-3 text-[13px] font-black text-[#171717]"
            >
              営業マン追加
            </button>
          }
        />

        {error ? (
          <div className="mt-5 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-700">
            {error}
          </div>
        ) : null}

        <section className="mt-7 grid gap-5 xl:grid-cols-2">
          <Panel title="管理者">
            <UserTable users={admins} />
          </Panel>
          <Panel title="営業マン">
            <UserTable users={sales} />
          </Panel>
        </section>
      </div>

      {dialogOpen && profile?.companyId ? (
        <AdminSalesUserDialog
          companyId={profile.companyId}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </PageShell>
  );
}

function UserTable({
  users,
}: {
  users: Array<{
    uid: string;
    name: string | null;
    email: string | null;
    role: string;
    status: "active" | "inactive";
    workExperienceYears: number | null;
    workExperienceMonths: number | null;
    workExperienceLocked: boolean;
    lastLoginAt: Date | null;
  }>;
}) {
  if (users.length === 0) {
    return <EmptyState title="ユーザーはいません" body="追加するとここに表示されます。" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-[#eef1f5] text-left text-[12px] font-bold text-[#7a808c]">
            <th className="px-3 py-3">名前</th>
            <th className="px-3 py-3">メール</th>
            <th className="px-3 py-3">権限</th>
            <th className="px-3 py-3">勤務年数</th>
            <th className="px-3 py-3">状態</th>
            <th className="px-3 py-3">最終ログイン</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow key={user.uid} user={user} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({
  user,
}: {
  user: {
    uid: string;
    name: string | null;
    email: string | null;
    role: string;
    status: "active" | "inactive";
    workExperienceYears: number | null;
    workExperienceMonths: number | null;
    workExperienceLocked: boolean;
    lastLoginAt: Date | null;
  };
}) {
  const [years, setYears] = useState(user.workExperienceYears?.toString() ?? "");
  const [months, setMonths] = useState(user.workExperienceMonths?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    const parsed = parseWorkExperience(years, months);

    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      await updateSalesWorkExperience({
        uid: user.uid,
        years: parsed.value.years,
        months: parsed.value.months,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "勤務年数の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <tr className="border-b border-[#eef1f5] text-[13px] last:border-b-0">
      <td className="px-3 py-4 font-bold text-[#20242c]">{user.name ?? "未設定"}</td>
      <td className="px-3 py-4 text-[#596273]">{user.email ?? "未設定"}</td>
      <td className="px-3 py-4 text-[#596273]">{user.role}</td>
      <td className="px-3 py-4 text-[#596273]">
        {user.role !== "sales" ? (
          <span className="text-[#8a909b]">対象外</span>
        ) : user.workExperienceLocked ? (
          <span className="font-bold text-[#20242c]">{formatWorkExperience(user.workExperienceYears, user.workExperienceMonths)}</span>
        ) : (
          <div className="grid min-w-[210px] gap-1">
            <div className="flex items-center gap-2">
              <input
                value={years}
                onChange={(event) => {
                  setYears(event.target.value);
                  setError(null);
                }}
                inputMode="numeric"
                className="w-[68px] rounded-[10px] border border-[#dfe4ec] bg-white px-3 py-2 text-[13px] font-bold outline-none focus:border-[#c8941f]"
                aria-label={`${user.name ?? user.email ?? user.uid} 勤務年数 年`}
              />
              <span className="text-[12px] font-bold text-[#7a808c]">年</span>
              <input
                value={months}
                onChange={(event) => {
                  setMonths(event.target.value);
                  setError(null);
                }}
                inputMode="numeric"
                className="w-[60px] rounded-[10px] border border-[#dfe4ec] bg-white px-3 py-2 text-[13px] font-bold outline-none focus:border-[#c8941f]"
                aria-label={`${user.name ?? user.email ?? user.uid} 勤務年数 月`}
              />
              <span className="text-[12px] font-bold text-[#7a808c]">ヶ月</span>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="rounded-[10px] bg-[#20242c] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50"
              >
                {isSaving ? "保存中" : "保存"}
              </button>
            </div>
            {error ? <span className="text-[11px] font-bold text-red-700">{error}</span> : null}
          </div>
        )}
      </td>
      <td className="px-3 py-4">
        <StatusBadge tone={user.status === "active" ? "good" : "normal"} label={user.status} />
      </td>
      <td className="px-3 py-4 text-[#7a808c]">{formatDateTime(user.lastLoginAt)}</td>
    </tr>
  );
}

function AdminSalesUserDialog({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workExperienceYears, setWorkExperienceYears] = useState("");
  const [workExperienceMonths, setWorkExperienceMonths] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const workExperience = parseWorkExperience(workExperienceYears, workExperienceMonths);

    if (!workExperience.ok) {
      setError(workExperience.error);
      return;
    }

    setIsSaving(true);

    try {
      await createTenantUser({
        companyId,
        role: "sales",
        name,
        email,
        password,
        workExperienceYears: workExperience.value.years,
        workExperienceMonths: workExperience.value.months,
      });
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ユーザー追加に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/30 px-4 py-6">
      <section className="w-full max-w-[520px] rounded-[24px] border border-[#f0e4bd] bg-white shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#eef1f5] px-5 py-4">
          <div>
            <h2 className="text-[20px] font-black text-[#171717]">営業マン追加</h2>
            <p className="mt-1 text-[13px] text-[#7a808c]">自社に紐付く営業マンアカウントを作成します。</p>
          </div>
          <button type="button" onClick={onClose} className="text-[22px] leading-none text-[#8a909b]">×</button>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 p-5">
          <DialogField label="名前" value={name} onChange={setName} placeholder="山田 太郎" />
          <DialogField label="メールアドレス" value={email} onChange={setEmail} placeholder="taro@example.com" />
          <DialogField label="初期パスワード" value={password} onChange={setPassword} placeholder="6文字以上" type="password" />
          <div className="grid gap-3 sm:grid-cols-2">
            <DialogField label="勤務年数（年）" value={workExperienceYears} onChange={setWorkExperienceYears} placeholder="例: 3" type="number" />
            <DialogField label="勤務年数（月）" value={workExperienceMonths} onChange={setWorkExperienceMonths} placeholder="0〜11" type="number" />
          </div>
          {error ? <div className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-700">{error}</div> : null}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-[14px] border border-[#dfe4ec] bg-white px-4 py-3 text-[13px] font-bold text-[#343b48]">キャンセル</button>
            <button type="submit" disabled={isSaving} className="rounded-[14px] bg-[#ffc400] px-4 py-3 text-[13px] font-bold text-[#171717] disabled:opacity-50">
              {isSaving ? "追加中..." : "追加する"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DialogField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-bold text-[#343b48]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[14px] border border-[#dfe4ec] bg-white px-4 py-3 text-[14px] outline-none focus:border-[#c8941f]"
      />
    </label>
  );
}

function formatDateTime(date: Date | null) {
  if (!date) return "未登録";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function parseWorkExperience(yearsValue: string, monthsValue: string):
  | { ok: true; value: { years: number; months: number } }
  | { ok: false; error: string } {
  const years = parseNonNegativeInteger(yearsValue);
  const months = parseNonNegativeInteger(monthsValue);

  if (years === null) return { ok: false, error: "勤務年数（年）を入力してください。" };
  if (months === null) return { ok: false, error: "勤務年数（月）を入力してください。" };
  if (months > 11) return { ok: false, error: "勤務年数の月は0〜11で入力してください。" };

  return { ok: true, value: { years, months } };
}

function parseNonNegativeInteger(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function formatWorkExperience(years: number | null, months: number | null) {
  if (years === null || months === null) return "未設定";
  return `${years}年${months}ヶ月`;
}
