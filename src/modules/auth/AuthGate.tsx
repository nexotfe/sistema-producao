"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { UserMenu } from "@/modules/auth/UserMenu";
import { InactivityGuard } from "@/modules/auth/InactivityGuard";

const publicRoutes = new Set(["/"]);

// CORREÇÃO (achada em teste visual real, projeto 260011 - fluxo travava
// indefinidamente em "Verificando acesso...", repetido em Cenários e
// Proposta, sem erro nem aviso no console; só reload/navegação direta
// recuperava): supabase.auth.getSession() usa um lock interno
// (navigator.locks, GoTrueClient) para coordenar múltiplas abas/chamadas
// concorrentes - sob certas condições (efeito duplo do StrictMode em
// dev, aba fechada/navegada no meio de uma verificação anterior) esse
// lock pode nunca ser liberado dentro do MESMO contexto JS, travando
// getSession() para sempre sem lançar erro nenhum - exatamente o
// sintoma relatado (recupera só com reload = contexto JS novo = lock
// novo). Este componente nunca deve travar `checkingSession=true` para
// sempre esperando essa promise: um timeout limitado sempre leva a um
// dos 3 estados terminais exigidos (conteúdo autorizado, redirecionado
// para login, ou erro recuperável) - nunca carregamento infinito.
const TIMEOUT_VERIFICACAO_SESSAO_MS = 8000;
const MENSAGEM_ERRO_VERIFICACAO_SESSAO =
  "Não foi possível confirmar sua sessão. Isso pode acontecer após um período sem uso ou uma instabilidade momentânea - recarregue a página para tentar de novo.";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicRoute = publicRoutes.has(pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [erroVerificacao, setErroVerificacao] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function limparTimeout() {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    // Compartilhado entre o resultado do checkSession() inicial e todo
    // evento de onAuthStateChange - inclusive um evento que chega DEPOIS
    // do timeout já ter mostrado o erro (a promise original destravou
    // tarde) - nesse caso, o resultado real sempre substitui o erro
    // (auto-recuperação, nunca precisa de reload se a sessão real
    // chegar a tempo de qualquer jeito).
    function aplicarResultadoSessao(nextSession: Session | null) {
      if (!mounted) {
        return;
      }
      limparTimeout();
      setErroVerificacao(null);
      setSession(nextSession);
      setCheckingSession(false);

      if (nextSession && isPublicRoute) {
        router.replace("/central");
        return;
      }

      if (!nextSession && !isPublicRoute) {
        router.replace("/");
      }
    }

    async function checkSession() {
      timeoutId = setTimeout(() => {
        if (!mounted) {
          return;
        }
        timeoutId = null;
        setErroVerificacao(MENSAGEM_ERRO_VERIFICACAO_SESSAO);
        setCheckingSession(false);
      }, TIMEOUT_VERIFICACAO_SESSAO_MS);

      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        aplicarResultadoSessao(currentSession);
      } catch {
        if (!mounted) {
          return;
        }
        limparTimeout();
        setErroVerificacao(MENSAGEM_ERRO_VERIFICACAO_SESSAO);
        setCheckingSession(false);
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      aplicarResultadoSessao(nextSession);
    });

    return () => {
      mounted = false;
      limparTimeout();
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

  if (erroVerificacao && !isPublicRoute) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app-bg px-5 text-center">
        <p className="max-w-sm text-sm font-medium text-text-secondary">{erroVerificacao}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-10 items-center justify-center rounded-[10px] bg-action-primary px-[18px] text-[13.5px] font-semibold text-action-primary-text transition hover:bg-action-primary-hover"
        >
          Recarregar página
        </button>
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
