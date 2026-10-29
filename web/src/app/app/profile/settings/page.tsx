import { Suspense } from "react";
import { SettingsPage } from "./SettingsPage";

export default function SettingsRoute() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col">
          <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
            <div className="qb-skeleton-line w-48 h-8" />
            <div className="qb-skeleton-line w-72 h-4 mt-2" />
          </div>
        </main>
      }
    >
      <SettingsPage />
    </Suspense>
  );
}