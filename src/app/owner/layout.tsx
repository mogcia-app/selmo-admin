"use client";

import { usePathname } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { RouteGuard } from "@/features/auth/route-guard";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/owner/login") {
    return <>{children}</>;
  }

  return (
    <RouteGuard requireOperator>
      <DashboardShell variant="owner">{children}</DashboardShell>
    </RouteGuard>
  );
}
