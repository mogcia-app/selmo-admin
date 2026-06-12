"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/features/auth/auth-provider";
import { canAccessSalesDomain } from "@/lib/firebase/auth";
import type { SalesDomain } from "@/types/domain";

type DashboardShellProps = {
  children: React.ReactNode;
  variant: "owner" | "admin" | "sales";
};

type NavItem = {
  href: string;
  label: string;
  num: string;
  domain?: SalesDomain;
  icon?: () => React.ReactNode;
};

const adminSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "01 — Coaching",
    items: [
      { href: "/admin/dashboard", label: "ダッシュボード", num: "01" },
      { href: "/admin/members", label: "営業メンバー", num: "02" },
      { href: "/admin/meetings", label: "商談レビュー", num: "03" },
    ],
  },
  {
    label: "02 — Enablement",
    items: [
      { href: "/admin/knowledge", label: "ナレッジ管理", num: "04" },
      { href: "/admin/roleplay", label: "ロープレ管理", num: "05" },
      { href: "/admin/products", label: "商材管理", num: "06" },
    ],
  },
  {
    label: "03 — System",
    items: [
      { href: "/meetings/upload", label: "音声アップロード", num: "07" },
      { href: "/admin/users", label: "ユーザー管理", num: "08" },
    ],
  },
];

const ownerSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "01 — Monitor",
    items: [
      { href: "/owner/dashboard", label: "運営ダッシュボード", num: "01" },
      { href: "/owner/usage", label: "利用量監視", num: "02" },
      { href: "/owner/costs", label: "AI原価監視", num: "03" },
      { href: "/owner/jobs", label: "音声ジョブ監視", num: "04" },
      { href: "/owner/errors", label: "エラー監視", num: "05" },
    ],
  },
  {
    label: "02 — Customer",
    items: [
      { href: "/owner/companies", label: "顧客管理", num: "06" },
      { href: "/owner/users", label: "ユーザー管理", num: "07" },
      { href: "/owner/billing", label: "利用量・請求", num: "08" },
      { href: "/owner/kpi", label: "サービスKPI", num: "09" },
    ],
  },
  {
    label: "03 — Ops",
    items: [
      { href: "/owner/prompts", label: "プロンプト管理", num: "10" },
      { href: "/owner/feature-flags", label: "機能フラグ管理", num: "11" },
      { href: "/owner/announcements", label: "お知らせ管理", num: "12" },
    ],
  },
  {
    label: "04 — Tenant App",
    items: [
      { href: "/admin/dashboard", label: "企業管理画面", num: "13" },
      { href: "/sales/dashboard", label: "営業画面", num: "14" },
    ],
  },
];

const salesSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "01 — Dashboard",
    items: [
      { href: "/sales/dashboard", label: "ダッシュボード", num: "01" },
      { href: "/meetings", label: "打ち合わせ一覧", num: "02", domain: "meeting", icon: ListIcon },
      { href: "/meetings/upload", label: "アップロード", num: "03", domain: "meeting", icon: UploadIcon },
      { href: "/sales/knowledge", label: "ナレッジ", num: "04", domain: "meeting", icon: ManualIcon },
      { href: "/sales/roleplay", label: "AIロープレ", num: "05", domain: "teleapo", icon: RoleplayIcon },
    ],
  },
];

export function DashboardShell({ children, variant }: DashboardShellProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const sections =
    variant === "owner"
      ? ownerSections
      : variant === "admin"
        ? adminSections
        : buildSalesSections(profile);
  const initials = (profile?.name ?? profile?.email ?? "S").slice(0, 1);
  const currentLabel =
    sections
      .flatMap((section) => section.items)
      .find((item) => isNavItemActive(pathname, item.href))?.label ?? "ダッシュボード";
  const nowLabel = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());

  return (
    <div
      className={`mx-auto grid min-h-screen max-w-[1680px] ${
        variant === "sales" ? "bg-[#f5f5f6] md:grid-cols-[228px_1fr]" : "md:grid-cols-[240px_1fr]"
      }`}
    >
      {variant === "sales" ? (
        <>
          <aside className="relative border-b border-[#eceef4] bg-white px-5 py-8 md:min-h-screen md:border-b-0 md:border-r">
            <div className="text-[13px] font-semibold tracking-[0.34em] text-[#171717]">
              selmo<span className="text-[#ffc400]">.</span>
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.24em] text-[#9aa1ad]">
              sales dashboard
            </div>

            <div className="mt-8 px-4 py-5">
              <Image
                src="/sels1.png"
                alt="selmo"
                width={170}
                height={130}
                className="mx-auto h-auto w-[112px] object-contain"
              />
            </div>

            <nav className="mt-7">
              <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a3aab5]">
                Navigation
              </div>
              <div className="space-y-2">
                {sections[0].items.map((item, index) => {
                  const isActive = isNavItemActive(pathname, item.href);
                  const Icon = item.icon ?? salesIconMap[index] ?? MenuDotIcon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center gap-3 rounded-[22px] px-4 py-3.5 text-[15px] font-medium transition ${
                        isActive
                          ? "bg-[linear-gradient(180deg,#fff2c8_0%,#ffe7a0_100%)] text-[#171717] shadow-[0_8px_18px_rgba(245,189,7,0.18)]"
                          : "text-[#616875] hover:bg-[#f7f7fa] hover:text-[#171717]"
                      }`}
                    >
                      <span
                        className={`transition ${
                          isActive
                            ? "text-[#f0b400]"
                            : "text-[#8d94a1] group-hover:text-[#171717]"
                        }`}
                      >
                        <Icon />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      <span
                        className={`text-[12px] transition ${
                          isActive ? "text-[#d79d00]" : "text-[#c6ccd5] group-hover:text-[#8d94a1]"
                        }`}
                      >
                        ›
                      </span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="mt-8 rounded-[24px] border border-[#e8ebf0] bg-white px-4 py-3.5 shadow-[0_10px_28px_rgba(245,189,7,0.08)] md:absolute md:bottom-6 md:left-5 md:right-5 md:mt-0">
              <div className="flex items-center gap-3">
                <Image
                  src="/sels1.png"
                  alt="avatar"
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-[#20242c]">
                    {profile?.name ?? "山田 太郎"}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[#7d8490]">
                    {profile?.role === "owner" ? "運営者" : profile?.role === "admin" ? "管理者" : "営業担当"}
                  </div>
                </div>
                <span className="text-[13px] text-[#9aa1ad]">⌄</span>
              </div>
            </div>
          </aside>

          <div className="min-w-0 bg-[#f5f5f6]">{children}</div>
        </>
      ) : (
        <>
      <aside className="relative border-b border-[#eceef4] bg-white px-5 py-8 md:min-h-screen md:border-b-0 md:border-r">
        <div className="text-[13px] font-semibold tracking-[0.34em] text-[#171717]">
          selmo<span className="text-[#ffc400]">.</span>
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.24em] text-[#9aa1ad]">
          {variant === "owner" ? "owner console" : "admin dashboard"}
        </div>

        <div className="mt-8 rounded-[8px] border border-[#f0e4bd] bg-[#fff9e8] px-4 py-5">
          <Image
            src="/sels1.png"
            alt="selmo"
            width={170}
            height={130}
            className="mx-auto h-auto w-[112px] object-contain"
          />
        </div>

        <nav className="mt-7 space-y-6">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a3aab5]">
                {section.label}
              </div>
              <div className="space-y-2">
                {section.items.map((item) => {
                  const isActive = isNavItemActive(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center justify-between gap-3 rounded-[8px] px-4 py-3 text-[13px] font-semibold transition ${
                        isActive
                          ? "bg-[#fff2c8] text-[#171717] shadow-[inset_3px_0_0_#ffc400]"
                          : "text-[#616875] hover:bg-[#fffdf4] hover:text-[#171717]"
                      }`}
                    >
                      <span>{item.label}</span>
                      <span
                        className={`text-[12px] ${
                          isActive ? "text-[#d79d00]" : "text-[#c6ccd5] group-hover:text-[#8d94a1]"
                        }`}
                      >
                        ›
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-8 rounded-[8px] border border-[#e8ebf0] bg-white px-4 py-3.5 shadow-[0_10px_28px_rgba(245,189,7,0.08)]">
          <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ffc400] text-[14px] font-bold text-[#171717]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-[#20242c]">
              {profile?.name ?? profile?.email ?? "Guest"}
            </div>
            <div className="mt-0.5 text-[12px] uppercase text-[#7d8490]">
              {profile?.role ?? variant}
            </div>
          </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 bg-[#fffdf7]">
        <header className="sticky top-0 z-10 flex flex-col gap-4 border-b border-[#eceef4] bg-white/95 px-6 py-[18px] backdrop-blur md:flex-row md:items-center md:justify-between md:px-10">
          <div className="flex items-center gap-[10px] text-[12px] font-bold text-[#8a909b]">
            <span>selmo<span className="text-[#ffc400]">.</span></span>
            <span className="text-[#d6dbe4]">/</span>
            <span className="text-[#171717]">{currentLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:gap-[14px]">
            <span className="rounded-[8px] bg-[#fff8e4] px-3 py-2 text-[11px] font-bold text-[#8a6500]">
              {nowLabel}
            </span>
            {variant === "owner" ? (
              <>
                <Link
                  href="/owner/companies"
                  className="rounded-[8px] border border-[#f0e4bd] bg-white px-4 py-[9px] text-[12.5px] font-bold text-[#343b48] transition hover:bg-[#fff8e4]"
                >
                  会社一覧
                </Link>
                <Link
                  href="/owner/users"
                  className="rounded-[8px] bg-[#ffc400] px-4 py-[9px] text-[12.5px] font-bold text-[#171717] transition hover:bg-[#f0ba00]"
                >
                  ユーザー管理
                </Link>
              </>
            ) : variant === "admin" ? (
              <>
                <button
                  type="button"
                  className="rounded-[14px] border border-[#f0e4bd] bg-white px-4 py-[9px] text-[12.5px] font-bold text-[#343b48] transition hover:bg-[#fff8e4]"
                >
                  CSV出力
                </button>
                <Link
                  href="/register"
                  className="rounded-[14px] bg-[#ffc400] px-4 py-[9px] text-[12.5px] font-bold text-[#171717] transition hover:bg-[#f0ba00]"
                >
                  ＋ ユーザー登録
                </Link>
              </>
            ) : canAccessSalesDomain(profile, "meeting") ? (
              <Link
                href="/meetings/upload"
                className="rounded-[14px] bg-[#ffc400] px-4 py-[9px] text-[12.5px] font-bold text-[#171717] transition hover:bg-[#f0ba00]"
              >
                ＋ 打ち合わせアップロード
              </Link>
            ) : null}
          </div>
        </header>

        {children}
      </div>
        </>
      )}
    </div>
  );
}

function isNavItemActive(pathname: string, href: string) {
  if (href === "/meetings") {
    return pathname === href;
  }

  if (href === "/meetings/upload") {
    return pathname === href;
  }

  if (href.includes("/meetings/")) {
    return pathname.startsWith("/meetings/") && pathname !== "/meetings/upload";
  }

  if (href.startsWith("/sales/")) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  if (href.startsWith("/owner/")) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return pathname === href;
}

function buildSalesSections(profile: ReturnType<typeof useAuth>["profile"]) {
  return salesSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.domain || canAccessSalesDomain(profile, item.domain)),
  }));
}

const salesIconMap = [
  HomeIcon,
  ListIcon,
  UploadIcon,
  ManualIcon,
  RoleplayIcon,
];

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5v9h11v-9" />
      <path d="M10 18.5v-5h4v5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M8 7h11M8 12h11M8 17h11" />
      <circle cx="4.5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M12 16V6" />
      <path d="m8 10 4-4 4 4" />
      <path d="M5 18.5h14" />
    </svg>
  );
}

function ManualIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16.5H7.8A2.8 2.8 0 0 0 5 22Z" />
      <path d="M5 5.5V22" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4.5" />
    </svg>
  );
}

function RoleplayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
      <path d="M7.5 12.5a4 4 0 1 1 8 0" />
      <path d="M5 19c.8-2.3 3.1-3.5 6.5-3.5S17.2 16.7 18 19" />
      <path d="M18.5 8.5h1.2a1.8 1.8 0 0 1 1.8 1.8v2.2a1.8 1.8 0 0 1-1.8 1.8h-1.2" />
      <path d="M5.5 8.5H4.3a1.8 1.8 0 0 0-1.8 1.8v2.2a1.8 1.8 0 0 0 1.8 1.8h1.2" />
      <path d="M12 3.5v2" />
    </svg>
  );
}

function MenuDotIcon() {
  return <span className="block h-2 w-2 rounded-full bg-current" />;
}
