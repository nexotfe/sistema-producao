// NEXOTFE — Etapa 41: primeira leitura real do Momento Y (Revisão 4),
// via client de SESSÃO (RLS/SECURITY DEFINER normal) - nunca service_role.
// Só consulta; não confirma, não reserva estoque, não gera requisição.
//
// Duas RPCs reais da Revisão 4
// (supabase/migrations/20261104120000_..._revisao4.sql):
// - empresa_atual_id(): resolve a empresa da sessão (sem parâmetro).
// - determinar_regime_momento_y_of(p_of_id, p_empresa_id): único ponto de
//   decisão do regime ('confirmado_momento_y' | 'legado' |
//   'pendente_momento_y') - SECURITY INVOKER, exige p_empresa_id explícito
//   (RLS do chamador ainda se aplica como segunda barreira).
// - sugerir_proposta_momento_y(p_of_id): fachada SECURITY DEFINER,
//   resolve empresa internamente via empresa_atual_id(), exige papel
//   pcp/admin. Só é chamada quando o regime é 'pendente_momento_y' - nos
//   outros dois regimes não há proposta pendente a mostrar, e chamá-la
//   numa OF não aprovada falha com "nao esta aprovada" (calcular_proposta_bom_of).
//
// propostaOriginal é devolvida EXATAMENTE como veio da RPC (mesmos nomes
// de campo, mesma ordem), para ser reenviada sem alteração como
// p_proposta_original numa futura confirmar_necessidades_momento_y -
// nunca reconstruída/renomeada aqui.
import type { SupabaseClient } from "@supabase/supabase-js";

export type RegimeMomentoYOf = "confirmado_momento_y" | "legado" | "pendente_momento_y";

/** Formato idêntico ao retornado por sugerir_proposta_momento_y - não renomear campos. */
export interface ItemPropostaMomentoY {
  readonly materia_prima_id: string;
  readonly quantidade_sugerida: number;
  readonly unidade: string;
  readonly descricao: string;
  readonly especificacao: string | null;
}

export interface LeituraMomentoYOf {
  readonly ofId: string;
  readonly regime: RegimeMomentoYOf;
  /** Vazio quando o regime não é 'pendente_momento_y' (nada pendente a propor). */
  readonly propostaOriginal: readonly ItemPropostaMomentoY[];
  /**
   * Etapa 44: interruptor por empresa (momento_y_ativo_para_empresa) -
   * puramente diagnóstico aqui. Não decide o regime (que é sempre do
   * backend) nem é usado para habilitar nenhuma ação de confirmação;
   * serve só para a interface explicar por que uma OF pendente ainda não
   * pode ser confirmada de fato quando este valor é false.
   */
  readonly interruptorAtivo: boolean;
}

export type ResultadoBuscaPropostaMomentoY =
  | { ok: true; leitura: LeituraMomentoYOf }
  | { ok: false; motivo: "empresa_nao_encontrada" }
  | { ok: false; motivo: "of_nao_encontrada" }
  | { ok: false; motivo: "of_nao_aprovada" }
  | { ok: false; motivo: "nao_autorizado" }
  | { ok: false; motivo: "erro_desconhecido" };

/**
 * Etapa 43: a mensagem tecnica completa (code/message/details/hint do
 * PostgREST) fica só neste log de servidor - nunca atravessa para o
 * retorno da Server Action/navegador. Mesmo padrão de
 * consultarFilaPrioridadesPcpAction.ts. Nunca logar token, cookie ou
 * dado pessoal - só os campos diagnosticos do erro em si.
 */
function logErroTecnicoMomentoY(
  origem: string,
  erro: { message: string; code?: string; details?: string; hint?: string },
): void {
  console.error(`buscarPropostaMomentoY: falha tecnica em ${origem}`, {
    code: erro.code,
    message: erro.message,
    details: erro.details,
    hint: erro.hint,
  });
}

export async function buscarPropostaMomentoY(
  client: SupabaseClient,
  ofId: string,
): Promise<ResultadoBuscaPropostaMomentoY> {
  const { data: empresaId, error: erroEmpresa } = await client.rpc("empresa_atual_id");
  if (erroEmpresa) {
    logErroTecnicoMomentoY("empresa_atual_id", erroEmpresa);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!empresaId) {
    return { ok: false, motivo: "empresa_nao_encontrada" };
  }

  const { data: interruptorAtivo, error: erroInterruptor } = await client.rpc("momento_y_ativo_para_empresa", {
    p_empresa_id: empresaId,
  });
  if (erroInterruptor) {
    logErroTecnicoMomentoY("momento_y_ativo_para_empresa", erroInterruptor);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const { data: regime, error: erroRegime } = await client.rpc("determinar_regime_momento_y_of", {
    p_of_id: ofId,
    p_empresa_id: empresaId,
  });
  if (erroRegime) {
    if (erroRegime.message.includes("nao encontrada")) {
      return { ok: false, motivo: "of_nao_encontrada" };
    }
    logErroTecnicoMomentoY("determinar_regime_momento_y_of", erroRegime);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  if (regime !== "pendente_momento_y") {
    return {
      ok: true,
      leitura: {
        ofId,
        regime: regime as RegimeMomentoYOf,
        propostaOriginal: [],
        interruptorAtivo: Boolean(interruptorAtivo),
      },
    };
  }

  const { data: propostaRows, error: erroProposta } = await client.rpc("sugerir_proposta_momento_y", {
    p_of_id: ofId,
  });
  if (erroProposta) {
    if (erroProposta.message.includes("papel funcional")) {
      return { ok: false, motivo: "nao_autorizado" };
    }
    if (erroProposta.message.includes("nao esta aprovada")) {
      return { ok: false, motivo: "of_nao_aprovada" };
    }
    if (erroProposta.message.includes("nao encontrada")) {
      return { ok: false, motivo: "of_nao_encontrada" };
    }
    logErroTecnicoMomentoY("sugerir_proposta_momento_y", erroProposta);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  return {
    ok: true,
    leitura: {
      ofId,
      regime: "pendente_momento_y",
      propostaOriginal: (propostaRows ?? []) as readonly ItemPropostaMomentoY[],
      interruptorAtivo: Boolean(interruptorAtivo),
    },
  };
}
