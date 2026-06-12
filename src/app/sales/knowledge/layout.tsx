import { RouteGuard } from "@/features/auth/route-guard";

export default function SalesKnowledgeLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard allowedRoles={["sales", "admin"]} requiredSalesDomain="meeting">
      {children}
    </RouteGuard>
  );
}
