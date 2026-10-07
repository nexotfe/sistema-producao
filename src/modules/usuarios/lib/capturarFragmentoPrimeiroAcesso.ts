// Captura + limpeza do fragmento do link de primeiro acesso (C2.4-I1A-4).
//
// Formato oficial: /primeiro-acesso#solicitacao=<uuid>&token=<token_hash>.
// Fragmentos nunca são enviados em nenhuma requisição HTTP ao servidor -
// não aparecem em access log, não aparecem em Referer - só o JS do
// browser os lê, depois que a página já carregou. Por isso solicitacao e
// token (este último, segredo bearer) vivem exclusivamente aqui.
//
// Só ESTRUTURA é validada (UUID bem formado, token não vazio dentro de um
// limite defensivo de tamanho) - nunca autenticidade. Autenticidade é
// responsabilidade do verifyOtp (fatia futura, fora deste módulo). O
// resultado público nunca expõe o motivo específico da falha - mesma
// filosofia de mensagem neutra já usada no resto do C2.4.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 512 é uma defesa de IMPLEMENTAÇÃO (margem de segurança arbitrária),
// NUNCA um contrato/regra de negócio do GoTrue ou do Supabase - os
// hashed_token observados na prática têm ~57 caracteres hex. Não
// interpretar este número como especificação de formato de token em
// nenhuma fatia futura.
const TAMANHO_MAXIMO_TOKEN_DEFESA_IMPLEMENTACAO = 512;

export type ResultadoCapturaFragmento =
  | { ok: true; solicitacaoId: string; token: string }
  | { ok: false };

function limparFragmentoDaUrl(): void {
  if (typeof window === "undefined" || !window.history?.replaceState) {
    return;
  }
  const urlSemFragmento = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", urlSemFragmento);
}

export function capturarFragmentoPrimeiroAcesso(): ResultadoCapturaFragmento {
  if (typeof window === "undefined") {
    return { ok: false };
  }

  const hashBruto = window.location.hash;

  // Limpeza acontece SEMPRE - sucesso ou falha -, imediatamente após ler
  // o valor bruto, antes de qualquer validação/rede/log.
  limparFragmentoDaUrl();

  const semCerquilha = hashBruto.startsWith("#") ? hashBruto.slice(1) : hashBruto;
  const parametros = new URLSearchParams(semCerquilha);

  const solicitacaoId = parametros.get("solicitacao");
  const token = parametros.get("token");

  if (!solicitacaoId || !UUID_REGEX.test(solicitacaoId)) {
    return { ok: false };
  }
  if (!token || token.length === 0 || token.length > TAMANHO_MAXIMO_TOKEN_DEFESA_IMPLEMENTACAO) {
    return { ok: false };
  }

  return { ok: true, solicitacaoId, token };
}
