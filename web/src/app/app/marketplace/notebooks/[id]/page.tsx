import { NotebookDetail } from "@/components/ml-learning/Library";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NotebookDetail id={id} />;
}
