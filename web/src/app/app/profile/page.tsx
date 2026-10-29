import { Suspense } from "react";
import { ProfilePage } from "./ProfilePage";

// Evita el prerender estático: la página depende de la sesión (Supabase auth)
// en el navegador. El prerender estático de Next 16 + client components con
// estado async puede producir un error de hidratación ("This page couldn't
// load"). Se fuerza render dinámico bajo demanda.
export const dynamic = "force-dynamic";

export default function ProfileRoute() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col">
          <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">
            <div className="qb-skeleton-line w-48 h-8" />
            <div className="qb-skeleton-line w-72 h-4 mt-2" />
            <div className="mt-8 grid gap-4 grid-cols-1 sm:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="qb-skeleton-card rounded-xl p-5 space-y-3">
                  <div className="qb-skeleton-line w-20" />
                  <div className="qb-skeleton-line w-32 h-8 mt-2" />
                </div>
              ))}
            </div>
          </div>
        </main>
      }
    >
      <ProfilePage />
    </Suspense>
  );
}