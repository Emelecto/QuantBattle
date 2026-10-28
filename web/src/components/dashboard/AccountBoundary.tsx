"use client";

import { Fragment, type ReactNode } from "react";
import { useAuth } from "@/lib/useAuth";

/** Remount account-dependent UI on session changes, including public guest pages. */
export function AccountBoundary({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <Fragment key={user?.id ?? "guest"}>{children}</Fragment>;
}
