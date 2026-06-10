import { OwnerCompanyDetail } from "@/app/owner/_components/owner-console";

export default async function OwnerCompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  return <OwnerCompanyDetail companyId={companyId} />;
}
