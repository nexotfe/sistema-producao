// NEXOTFE — Etapa 58B: leitura das necessidades OFICIALMENTE
// confirmadas via Momento Y (regime "confirmado_momento_y") - nunca a
// proposta inicial (essa é buscarPropostaMomentoY.ts/propostaOriginal).
// Fonte: necessidades_of_material, filtrada por origem_logica='momento_y'
// (valor literal confirmado na migration da Revisão 4 - o outro valor
// possível, 'bom_expansao', é do fluxo LEGADO, nunca misturado aqui) e
// versao_atual=true (só a versão vigente, nunca uma superada). RLS já
// permite leitura a qualquer usuário autenticado do tenant
// (necessidades_of_material_select_tenant: empresa_id=empresa_atual_id()
// AND ativo=true) - nenhuma permissão adicional necessária para LER.
// Client de SESSÃO - nunca service_role. Só leitura, nunca grava.
//
// LIMITAÇÃO CONHECIDA (Etapa 58A/58B): nenhuma empresa real tem o
// interruptor do Momento Y ligado hoje, então nenhuma necessidade real
// com origem_logica='momento_y' existe ainda para testar - esta função
// está correta por construção e por leitura das regras da Revisão 4,
// mas não pôde ser validada com um resultado não-vazio real.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface NecessidadeConfirmadaOfPcp {
  readonly materiaPrimaId: string;
  readonly descricao: string | null;
  readonly especificacao: string | null;
  readonly unidade: string | null;
  readonly quantidadeNecessaria: number;
  readonly origemFornecimento: string | null;
  readonly observacaoTecnica: string | null;
}

export type RespostaNecessidadesConfirmadasOfPcp =
  | { readonly ok: true; readonly itens: readonly NecessidadeConfirmadaOfPcp[] }
  | { readonly ok: false; readonly motivo: "erro_desconhecido" };

function logErroTecnicoNecessidadesConfirmadas(origem: string, erro: { message: string; code?: string }): void {
  console.error(`buscarNecessidadesConfirmadasOfPcp: falha tecnica em ${origem}`, { code: erro.code, message: erro.message });
}

export async function buscarNecessidadesConfirmadasOfPcp(
  client: SupabaseClient,
  ofId: string,
): Promise<RespostaNecessidadesConfirmadasOfPcp> {
  const { data: necessidadesRows, error: erroNecessidades } = await client
    .from("necessidades_of_material")
    .select("materia_prima_id, quantidade_necessaria, origem_fornecimento, observacao_tecnica")
    .eq("of_id", ofId)
    .eq("origem_logica", "momento_y")
    .eq("versao_atual", true);

  if (erroNecessidades) {
    logErroTecnicoNecessidadesConfirmadas("necessidades_of_material", erroNecessidades);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const linhas = necessidadesRows ?? [];
  if (linhas.length === 0) {
    return { ok: true, itens: [] };
  }

  const materiaPrimaIds = Array.from(new Set(linhas.map((l) => l.materia_prima_id as string)));
  const { data: materiaisRows, error: erroMateriais } = await client
    .from("materias_primas")
    .select("id, descricao, material_especificacao, unidade")
    .in("id", materiaPrimaIds);

  if (erroMateriais) {
    logErroTecnicoNecessidadesConfirmadas("materias_primas", erroMateriais);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const materialPorId = new Map((materiaisRows ?? []).map((m) => [m.id as string, m]));

  const itens: NecessidadeConfirmadaOfPcp[] = linhas.map((linha) => {
    const material = materialPorId.get(linha.materia_prima_id as string);
    return {
      materiaPrimaId: linha.materia_prima_id as string,
      descricao: (material?.descricao as string | undefined) ?? null,
      especificacao: (material?.material_especificacao as string | undefined) ?? null,
      unidade: (material?.unidade as string | undefined) ?? null,
      quantidadeNecessaria: linha.quantidade_necessaria as number,
      origemFornecimento: linha.origem_fornecimento as string | null,
      observacaoTecnica: linha.observacao_tecnica as string | null,
    };
  });

  return { ok: true, itens };
}
