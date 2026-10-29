import { Sidebar } from "@/components/dashboard/Sidebar";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import { CommandPalette } from "@/components/command-palette";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { AccountBoundary } from "@/components/dashboard/AccountBoundary";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AccountBoundary><div className="qb-app-shell">
      <Sidebar />
      <div className="qb-dash-main">
        <DashboardTopbar />
        {children}
        <MobileBottomNav />
        <CommandPalette />
      </div>
    </div></AccountBoundary>
  );
}
