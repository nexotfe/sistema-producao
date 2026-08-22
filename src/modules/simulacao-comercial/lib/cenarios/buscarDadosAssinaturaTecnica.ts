// Monta DadosAssinaturaTecnica (entrada de construirDocumentoAssinaturaTecnica.ts)
// buscando tudo no banco - único ponto de I/O desta feature. Reaproveita
// carregarBaseCenarios.ts (ocorrências/dependências/recursos/
// compatibilidades/convenção - inalterada, nenhuma duplicação da
// resolução de grafo) e carregarContextoCalendario.ts (mesmo resolvedor
// real de feriados/eventos, mesmos filtros - nunca uma reimplementação
// paralela). O único dado que nenhum dos dois cobre é a árvore de
// custo (matéria-prima/terceiros/transporte), coletada por
// coletarArvoreCustosBom.ts.
//
// `janelaInicio`/`janelaFim` SEMPRE vêm de fora (nunca calculados aqui):
// na aprovação, da saída fresca do motor (disponibilidadeMaterial.original/
// saidaPrevisaoComercial.primeiraEntregaPossivel); na comparação
// posterior, dos MESMOS dois campos já congelados no snapshot do
// cenário vigente - nunca uma janela reconstruída (decisão do usuário:
// a entrega pode legitimamente ser ANTES da data solicitada, então
// [dataSolicitadaCliente, prazoProposto] não é a janela real).
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarBaseCenarios } from "./carregarBaseCenarios";
import { carregarContextoCalendario } from "@/modules/calendario/lib/contextoCalendario";
import { coletarArvoreCustosBom } from "./coletarArvoreCustosBom";
import type { DadosAssinaturaTecnica, ItemParaAssinatura } from "./construirDocumentoAssinaturaTecnica";

type ProjetoItemRow = {
  id: string;
  produto_id: string;
  quantidade: number;
  custo_congelado: number | string | null;
  custo_editado_manualmente: boolean;
};

async function buscarItensParaAssinatura(
  client: SupabaseClient,
  empresaId: string,
  projetoId: string,
): Promise<ItemParaAssinatura[]> {
  const { data, error } = await client
    .from("projeto_itens")
    .select("id,produto_id,quantidade,custo_congelado,custo_editado_manualmente")
    .eq("empresa_id", empresaId)
    .eq("projeto_id", projetoId)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Erro ao consultar projeto_itens (assinatura técnica) para projeto_id=${projetoId}: ${error.message}`);
  }

  const linhas = (data ?? []) as ProjetoItemRow[];

  return Promise.all(
    linhas.map(async (linha): Promise<ItemParaAssinatura> => {
      if (linha.custo_editado_manualmente) {
        return {
          projetoItemId: linha.id,
          produtoId: linha.produto_id,
          quantidade: String(linha.quantidade),
          custoEditadoManualmente: true,
          custoManualValor: linha.custo_congelado === null ? null : String(linha.custo_congelado),
          arvoreCustos: null,
        };
      }

      const arvoreCustos = await coletarArvoreCustosBom(client, empresaId, linha.produto_id);
      return {
        projetoItemId: linha.id,
        produtoId: linha.produto_id,
        quantidade: String(linha.quantidade),
        custoEditadoManualmente: false,
        custoManualValor: null,
        arvoreCustos,
      };
    }),
  );
}

export async function buscarDadosAssinaturaTecnica(
  client: SupabaseClient,
  empresaId: string,
  projetoId: string,
  janelaInicio: string,
  janelaFim: string,
): Promise<DadosAssinaturaTecnica> {
  const [itens, base, calendario] = await Promise.all([
    buscarItensParaAssinatura(client, empresaId, projetoId),
    carregarBaseCenarios(client, empresaId, projetoId, janelaInicio, janelaFim),
    carregarContextoCalendario(client, empresaId, janelaInicio, janelaFim),
  ]);

  return {
    projetoId,
    empresaId,
    janela: { inicio: janelaInicio, fim: janelaFim },
    itens,
    base: {
      ocorrencias: base.ocorrencias,
      dependencias: base.dependencias,
      recursoIds: base.recursoIds,
      compatibilidades: base.compatibilidades,
      capacidadeDiariaPorRecurso: base.capacidadeDiariaPorRecurso,
      valorHoraPorRecurso: base.valorHoraPorRecurso,
      convencoesHorasAdicionais: base.convencoesHorasAdicionais,
      restricaoMaterialPorChave: base.restricaoMaterialPorChave,
      // comprometidoInicialPorRecurso deliberadamente OMITIDO - reservas
      // de outros projetos, nunca "a base técnica deste projeto mudou"
      // (decisão do usuário, 2026-08-22).
    },
    calendario: {
      padraoSemanal: calendario.padraoSemanal,
      feriadosPorData: calendario.feriadosPorData,
      eventosPorData: calendario.eventosPorData,
    },
  };
}
