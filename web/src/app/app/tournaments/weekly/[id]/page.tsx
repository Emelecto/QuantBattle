"use client";
import { useParams } from 'next/navigation';
import { ReturnTournament } from '@/components/research/ReturnTournament';

export default function WeeklyReturnPage() {
  const { id } = useParams<{ id: string }>();
  return <ReturnTournament id={id} />;
}
