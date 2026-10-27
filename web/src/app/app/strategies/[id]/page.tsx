import { ProjectDetail } from "@/components/ml-learning/ProjectDetail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectDetail id={id} />;
}
