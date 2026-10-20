"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type AuthState = {
  user: User | null;
  /** Cliente de Supabase listo (null hasta montar en el navegador). */
  supabase: SupabaseClient | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

/**
 * Hook mínimo de sesión.
 *
 * - Construye el cliente de Supabase SOLO en el navegador (useEffect), para que
 *   el prerender de `next build` no ejecute `createBrowserClient` sin env vars.
 * - Escucha `onAuthStateChange` para mantener `user` sincronizado.
 * - Expone `signOut` para cerrar sesión.
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = createBrowserSupabaseClient();
    setSupabase(client);

    client.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) throw new Error("La sesión todavía no está disponible.");
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) throw error;
  }, [supabase]);

  return { user, supabase, loading, signOut };
}
