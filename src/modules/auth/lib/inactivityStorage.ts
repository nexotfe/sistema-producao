const KEY_PREFIX = "nexotfe:inactivity:lastActivityAt:";

// Tolerancia de relogio entre abas/maquinas - um valor um pouco no
// futuro e aceitavel; muito adiante indica dado corrompido ou
// adulterado (ex.: editado manualmente no DevTools) e deve ser
// descartado, nunca usado para decidir o estado da sessao.
const MAX_CLOCK_SKEW_MS = 60_000;

// Chave escopada por usuario - um timestamp de uma sessao anterior
// (mesmo usuario, ou outro usuario no mesmo navegador) nunca deve ser
// lido como se fosse desta sessao.
export function buildInactivityStorageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function isValidTimestamp(value: unknown, now: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= now + MAX_CLOCK_SKEW_MS
  );
}

export function writeLastActivityAt(userId: string, timestamp: number): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(buildInactivityStorageKey(userId), String(timestamp));
}
