import { redirect } from "next/navigation";
import { TournamentDetail } from "@/components/research/TournamentDetail";

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^stocks-oc-\d{4}-\d{2}-\d{2}$/.test(id)) redirect("/app/tournaments");
  return <TournamentDetail id={id} />;
}
