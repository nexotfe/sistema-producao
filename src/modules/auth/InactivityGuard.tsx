"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOutLocal } from "@/modules/auth/lib/signOutLocal";
import {
  buildInactivityStorageKey,
  isValidTimestamp,
  writeLastActivityAt,
} from "@/modules/auth/lib/inactivityStorage";
import { Button } from "@/modules/shared/ui/Button";

const DEFAULT_WARNING_AFTER_MS = 25 * 60 * 1000;
const DEFAULT_LOGOUT_AFTER_MS = 30 * 60 * 1000;
const WARNING_TICK_MS = 1_000;
const ACTIVITY_WRITE_THROTTLE_MS = 5_000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart"] as const;

type Phase = "active" | "warning" | "expired";

type InactivityGuardProps = {
  userId: string;
  children: React.ReactNode;
  // Overrides so - producao usa sempre os padroes (25min/30min) quando
  // omitidos. Existe pra permitir teste com limiares curtos sem
  // precisar editar a fonte na mao.
  warningAfterMs?: number;
  logoutAfterMs?: number;
};

// Protege o conteudo autenticado contra sessao esquecida aberta: avisa
// aos 25min de inatividade, desloga (scope local) aos 30min. Ao expirar,
// para de renderizar children imediatamente - nao espera o signOut
// terminar. Sincroniza entre abas via localStorage/evento "storage",
// com chave escopada por usuario (nunca le timestamp de sessao/usuario
// anterior). Reconcilia sempre pelo relogio real (Date.now(), nunca
// contagem de timer) em visibilitychange/focus/online - cobre o caso de
// aba suspensa que perdeu os ticks do intervalo.
//
// Agendamento: nao usa setInterval fixo. Cada checagem calcula o tempo
// exato ate o proximo limite relevante (aviso ou logout) e agenda um
// unico setTimeout para esse instante - nao existe intervalo "grosso"
// que possa pular um limite estreito (ex.: 25s/30s, so 5s de distancia).
//
// Navegacao pos-logout: nao e' responsabilidade deste componente. O
// AuthGate reage a SIGNED_OUT (via onAuthStateChange) e navega sozinho.
// Chamar router.replace aqui tambem criava uma corrida - o AuthGate
// podia desmontar este componente (sessao virou null) enquanto o
// signOut ainda estava em voo.
export function InactivityGuard({
  userId,
  children,
  warningAfterMs = DEFAULT_WARNING_AFTER_MS,
  logoutAfterMs = DEFAULT_LOGOUT_AFTER_MS,
}: InactivityGuardProps) {
  const [phase, setPhase] = useState<Phase>("active");
  const [remainingMs, setRemainingMs] = useState(logoutAfterMs - warningAfterMs);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  // Refs-espelho de valores usados dentro de closures estaveis
  // (scheduleCheck/handlers) sem precisar recria-las a cada mudanca -
  // sempre escritas dentro de efeitos, nunca durante o render (o
  // projeto trata "Cannot update ref during render" como erro de lint).
  const phaseRef = useRef<Phase>("active");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Inicializados com literal puro (0), nunca com Date.now() direto no
  // render ("Cannot call impure function during render" e' lint-error
  // aqui tambem) - o valor real e' gravado no efeito de mount, abaixo.
  const lastActivityAtRef = useRef(0);
  const lastWriteRef = useRef(0);
  const logoutAttemptedRef = useRef(false);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Verdadeiro enquanto o componente estiver montado - guarda contra
  // setState apos o AuthGate desmontar este componente (sessao virou
  // null) enquanto performLogout ainda estava com o signOut em voo.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const storageKey = buildInactivityStorageKey(userId);

  const performLogout = useCallback(async () => {
    logoutAttemptedRef.current = true;
    setLoggingOut(true);
    const { error } = await signOutLocal();

    if (!isMountedRef.current) {
      return;
    }

    setLoggingOut(false);

    if (error) {
      logoutAttemptedRef.current = false;
      setLogoutFailed(true);
      return;
    }

    setLogoutFailed(false);
  }, []);

  // Ref para a versao mais recente de performLogout/loggingOut - os
  // efeitos que disparam logout automatico nao devem re-executar so
  // porque a referencia de performLogout mudou entre renders. Escritas
  // sempre dentro de efeito, nunca no render.
  const performLogoutRef = useRef(performLogout);
  useEffect(() => {
    performLogoutRef.current = performLogout;
  }, [performLogout]);

  const loggingOutRef = useRef(loggingOut);
  useEffect(() => {
    loggingOutRef.current = loggingOut;
  }, [loggingOut]);

  // Ref para a versao mais recente de scheduleCheck - o proprio
  // scheduleCheck se reagenda recursivamente (setTimeout chamando a si
  // mesmo), e o lint do projeto trata referenciar o `const` da propria
  // funcao dentro do seu corpo como erro ("accessed before it is
  // declared", react-hooks/immutability) - chama via ref em vez disso.
  const scheduleCheckRef = useRef<() => void>(() => {});

  // Agenda o proximo check EXATAMENTE no proximo limite relevante -
  // nunca um intervalo periodico fixo. Sempre recalcula pelo relogio
  // real (Date.now() - ultima atividade), nunca confia em "o timer
  // disparou na hora certa": garante o comportamento correto tanto no
  // caso de aba suspensa (visibilitychange/focus/online chamam isto
  // direto) quanto no caso de limiares estreitos (aviso/logout a poucos
  // segundos um do outro).
  const scheduleCheck = useCallback(() => {
    if (timeoutIdRef.current !== null) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }

    if (phaseRef.current === "expired") {
      return;
    }

    const elapsed = Date.now() - lastActivityAtRef.current;

    if (elapsed >= logoutAfterMs) {
      setPhase("expired");
      return;
    }

    if (elapsed >= warningAfterMs) {
      setRemainingMs(logoutAfterMs - elapsed);
      setPhase("warning");
      // Tick de 1s para o contador visivel durante o aviso - nunca
      // agenda alem do instante exato do logout.
      const delay = Math.min(WARNING_TICK_MS, logoutAfterMs - elapsed);
      timeoutIdRef.current = setTimeout(() => scheduleCheckRef.current(), Math.max(delay, 0));
      return;
    }

    if (phaseRef.current === "warning") {
      setPhase("active");
    }
    // Ainda ativo - agenda exatamente para o instante do aviso, sem
    // ticks intermediarios desnecessarios.
    timeoutIdRef.current = setTimeout(
      () => scheduleCheckRef.current(),
      warningAfterMs - elapsed,
    );
  }, [warningAfterMs, logoutAfterMs]);

  useEffect(() => {
    scheduleCheckRef.current = scheduleCheck;
  }, [scheduleCheck]);

  const registerActivity = useCallback(
    (timestamp: number, options?: { forceWrite?: boolean }) => {
      lastActivityAtRef.current = timestamp;
      if (
        options?.forceWrite ||
        timestamp - lastWriteRef.current >= ACTIVITY_WRITE_THROTTLE_MS
      ) {
        lastWriteRef.current = timestamp;
        writeLastActivityAt(userId, timestamp);
      }
      scheduleCheck();
    },
    [userId, scheduleCheck],
  );

  // Mount = atividade. Nunca decide o estado inicial lendo um
  // timestamp que possa estar no storage de uma sessao/usuario
  // anterior - sempre grava um valor fresco. O `key={userId}` usado no
  // AuthGate ja forca remount quando o usuario muda (e `phase`/
  // `logoutFailed` ja nascem corretos via useState nesse remount - nao
  // ha necessidade de redefini-los aqui). Precisa rodar ANTES do efeito
  // que inicia o agendamento (abaixo), senao o primeiro scheduleCheck()
  // leria lastActivityAtRef ainda zerado.
  useEffect(() => {
    const now = Date.now();
    lastActivityAtRef.current = now;
    lastWriteRef.current = now;
    logoutAttemptedRef.current = false;
    writeLastActivityAt(userId, now);
  }, [userId]);

  // Atividade do usuario nesta aba.
  useEffect(() => {
    function handleActivity() {
      if (phaseRef.current === "expired") {
        return;
      }
      registerActivity(Date.now());
    }

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, handleActivity, { passive: true }),
    );
    return () => {
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, handleActivity),
      );
    };
  }, [registerActivity]);

  // Atividade sincronizada de outra aba (mesma chave escopada por
  // usuario). Todo valor recebido e' validado antes de usar - nunca
  // confia em dado vindo de storage sem checar.
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== storageKey || event.newValue === null) {
        return;
      }

      const now = Date.now();
      const parsed = Number(event.newValue);
      if (!isValidTimestamp(parsed, now)) {
        return;
      }

      if (parsed > lastActivityAtRef.current) {
        lastActivityAtRef.current = parsed;
        scheduleCheck();
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [storageKey, scheduleCheck]);

  // Reconciliacao imediata ao voltar de suspensao/offline/troca de
  // aba - nao espera o proximo timeout agendado. visibilitychange e'
  // evento de document, nao de window.
  useEffect(() => {
    document.addEventListener("visibilitychange", scheduleCheck);
    window.addEventListener("focus", scheduleCheck);
    window.addEventListener("online", scheduleCheck);
    return () => {
      document.removeEventListener("visibilitychange", scheduleCheck);
      window.removeEventListener("focus", scheduleCheck);
      window.removeEventListener("online", scheduleCheck);
    };
  }, [scheduleCheck]);

  // Inicia o agendamento. So roda de novo se scheduleCheck mudar de
  // identidade (warningAfterMs/logoutAfterMs mudou) - nao e' um
  // intervalo, e' o pontapé inicial de uma cadeia de setTimeout que se
  // reagenda sozinha.
  useEffect(() => {
    scheduleCheck();
    return () => {
      if (timeoutIdRef.current !== null) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
  }, [scheduleCheck]);

  // Dispara o logout automatico uma unica vez ao expirar. So depende de
  // `phase` - nao de performLogout, para nao re-disparar so porque a
  // referencia da funcao mudou entre renders.
  useEffect(() => {
    if (phase === "expired" && !logoutAttemptedRef.current) {
      performLogoutRef.current();
    }
  }, [phase]);

  // Tenta de novo automaticamente ao recuperar internet, se a ultima
  // tentativa falhou.
  useEffect(() => {
    if (!logoutFailed) {
      return;
    }
    function retry() {
      if (!loggingOutRef.current) {
        performLogoutRef.current();
      }
    }
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [logoutFailed]);

  if (phase === "expired") {
    if (logoutFailed) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app-bg px-5 text-center">
          <p className="text-sm font-medium text-status-danger-text">
            Não foi possível encerrar a sessão automaticamente. Tente novamente.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              if (!loggingOut) {
                performLogout();
              }
            }}
            disabled={loggingOut}
          >
            {loggingOut ? "Tentando..." : "Tentar sair novamente"}
          </Button>
        </main>
      );
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-app-bg px-5 text-slate-500">
        <p className="text-sm font-medium">Sessão encerrada por inatividade...</p>
      </main>
    );
  }

  return (
    <>
      {phase === "warning" ? (
        <InactivityWarningBanner
          remainingMs={remainingMs}
          onStayConnected={() => {
            registerActivity(Date.now(), { forceWrite: true });
          }}
        />
      ) : null}
      {children}
    </>
  );
}

function InactivityWarningBanner({
  remainingMs,
  onStayConnected,
}: {
  remainingMs: number;
  onStayConnected: () => void;
}) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formatted = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 border-b border-status-danger-border bg-status-danger-bg px-5 py-2 text-[13px] text-status-danger-text"
    >
      <span>Sua sessão será encerrada por inatividade em {formatted}.</span>
      <Button variant="secondary" onClick={onStayConnected}>
        Continuar conectado
      </Button>
    </div>
  );
}
