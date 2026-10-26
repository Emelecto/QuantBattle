"use client";

import { usePathname } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Footer } from "@/components/Footer";

/** El header y el footer públicos no forman parte del dashboard autenticado. */
export function TopBarGate() {
  const pathname = usePathname();
  return pathname.startsWith("/app") ? null : <TopBar />;
}

export function FooterGate() {
  const pathname = usePathname();
  return pathname.startsWith("/app") ? null : <Footer landing={pathname === "/"} />;
}
