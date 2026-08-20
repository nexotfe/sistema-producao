// DEC-007 §6.2/Fase 8b (redesenho: diagnóstico de leitura em "Ver
// detalhes") - resolve nomes legíveis (recurso, operação) para os IDs
// que já aparecem em ResumoCenarioParaExibicao.diagnosticos. Consulta em
// LOTE (2 SELECTs, nunca 1 por ID - sem N+1), somente leitura, nunca
// altera nada no motor/cálculo. Falha de rede/consulta nunca apaga o
// cenário já calculado: devolve mapas vazios, e quem exibe cai no
// fallback (mostra o ID cru) - nunca lança, nunca bloqueia o resto da
// tela.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface NomesDiagnostico {
  readonly recursos: Readonly<Record<string, string>>;
  readonly operacoes: Readonly<Record<string, string>>;
}

const NOMES_VAZIO: NomesDiagnostico = Object.freeze({ recursos: {}, operacoes: {} });

export async function carregarNomesDiagnostico(
  client: SupabaseClient,
  params: { recursoIds: readonly string[]; bomOperacaoIds: readonly string[] },
): Promise<NomesDiagnostico> {
  if (params.recursoIds.length === 0 && params.bomOperacaoIds.length === 0) {
    return NOMES_VAZIO;
  }

  try {
    const [recursosResp, operacoesResp] = await Promise.all([
      params.recursoIds.length > 0
        ? client.from("recursos_produtivos").select("id,codigo,nome").in("id", params.recursoIds)
        : Promise.resolve({ data: [] as { id: string; codigo: string | null; nome: string }[], error: null }),
      params.bomOperacaoIds.length > 0
        ? client.from("bom_operacoes").select("id,descricao").in("id", params.bomOperacaoIds)
        : Promise.resolve({ data: [] as { id: string; descricao: string | null }[], error: null }),
    ]);

    if (recursosResp.error || operacoesResp.error) {
      return NOMES_VAZIO;
    }

    const recursos: Record<string, string> = {};
    for (const linha of (recursosResp.data ?? []) as { id: string; codigo: string | null; nome: string }[]) {
      recursos[linha.id] = [linha.codigo, linha.nome].filter(Boolean).join(" - ");
    }

    const operacoes: Record<string, string> = {};
    for (const linha of (operacoesResp.data ?? []) as { id: string; descricao: string | null }[]) {
      if (linha.descricao) {
        operacoes[linha.id] = linha.descricao;
      }
    }

    return { recursos: Object.freeze(recursos), operacoes: Object.freeze(operacoes) };
  } catch {
    return NOMES_VAZIO;
  }
}
