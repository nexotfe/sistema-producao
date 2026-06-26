"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

const publicRoutes = new Set(["/"]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute = publicRoutes.has(pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      setSession(currentSession);
      setCheckingSession(false);

      if (currentSession && isPublicRoute) {
        router.replace("/central");
        return;
      }

      if (!currentSession && !isPublicRoute) {
        router.replace("/");
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCheckingSession(false);

      if (nextSession && isPublicRoute) {
        router.replace("/central");
        return;
      }

      if (!nextSession && !isPublicRoute) {
        router.replace("/");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isPublicRoute, router]);

  if (checkingSession && !isPublicRoute) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f8] px-5 text-slate-500">
        <p className="text-sm font-medium">Verificando acesso...</p>
      </main>
    );
  }

  if (!session && !isPublicRoute) {
    return null;
  }

  return <>{children}</>;
}
