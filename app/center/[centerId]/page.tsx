import CenterClient from "./ClientPage";

type PageParams = Promise<{ centerId: string }>;

type PageProps = {
  params: PageParams;
};

export default async function CenterPage({ params }: PageProps) {
  const { centerId } = await params;
  const decoded = decodeURIComponent(centerId);
  return <CenterClient centerId={decoded} />;
}
