"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { UserMenu } from "@/modules/auth/UserMenu";
import { InactivityGuard } from "@/modules/auth/InactivityGuard";

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
      <main className="flex min-h-screen items-center justify-center bg-app-bg px-5 text-slate-500">
        <p className="text-sm font-medium">Verificando acesso...</p>
      </main>
    );
  }

  if (!session && !isPublicRoute) {
    // O redirect real acontece no useEffect acima (router.replace("/")
    // ao receber sessao nula). Enquanto essa navegacao nao termina,
    // nunca renderizar branco - mesma tela neutra de "Verificando
    // acesso", para nao expor uma tela em branco na corrida entre
    // SIGNED_OUT e a navegacao (ex.: logout automatico por inatividade).
    return (
      <main className="flex min-h-screen items-center justify-center bg-app-bg px-5 text-slate-500">
        <p className="text-sm font-medium">Redirecionando...</p>
      </main>
    );
  }

  if (session && !isPublicRoute) {
    return (
      <InactivityGuard key={session.user.id} userId={session.user.id}>
        <UserMenu email={session.user.email} />
        {children}
      </InactivityGuard>
    );
  }

  return <>{children}</>;
}
