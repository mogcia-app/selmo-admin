import { RouteGuard } from "@/features/auth/route-guard";

export default function SalesRoleplayLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard allowedRoles={["sales", "admin"]} requiredSalesDomain="teleapo">
      {children}
    </RouteGuard>
  );
}
