import { Sidebar } from "@/components/dashboard/Sidebar";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import { CommandPalette } from "@/components/command-palette";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { AccountBoundary } from "@/components/dashboard/AccountBoundary";
import { AuthGuard } from "@/lib/AuthGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AccountBoundary>
        <div className="qb-app-shell">
          <Sidebar />
          <div className="qb-dash-main">
            <DashboardTopbar />
            {children}
            <MobileBottomNav />
            <CommandPalette />
          </div>
        </div>
      </AccountBoundary>
    </AuthGuard>
  );
}
