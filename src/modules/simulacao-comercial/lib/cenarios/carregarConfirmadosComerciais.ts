// DEC-007 - previsão comercial por capacidade: carregador (o único ponto
// de I/O desta previsão para compromissos CONFIRMADOS) que traduz
// tabelas reais para `CompromissoGranular` e delega a agregação inteira
// para `selecionarFonteVencedora.ts`/`agregarCompromissosPorRecurso.ts`
// (nunca uma segunda soma/dedup reimplementada aqui) - exatamente o que
// o cabeçalho de compromissoCapacidade.ts já previa: "cada origem de
// dado tem seu próprio carregador... que traduz para este contrato".
//
// Sessão autenticada normal (nunca service_role) - `client` é recebido
// pronto (mesmo padrão de carregarBaseCenarios.ts), este módulo nunca
// constrói um cliente sozinho. `empresaId` é resolvido pelo CHAMADOR
// (sessão do usuário) e filtrado explicitamente em TODA consulta, mesmo
// já existindo RLS (`empresa_id = public.empresa_atual_id()`) em todas
// as tabelas abaixo - defesa em profundidade, nunca "a RLS já resolve".
//
// NUNCA chama `calcular_comprometido_v2`: essa RPC já É a agregação de
// compromissos confirmados (união v1/v2, mesmo filtro pedido_recebido) -
// chamá-la aqui JUNTO com a leitura granular própria deste módulo
// contaria a mesma capacidade 2 vezes. Este carregador lê os GRANULARES
// (simulacao_comercial_itens/_item_distribuicoes) diretamente, nunca o
// agregado da RPC.
//
// dataEntradaFila NUNCA vem de `simulacoes_comerciais.aprovado_em`
// (aprovação INTERNA do orçamentista - decisão de negócio, não
// confirmação do cliente, dito explicitamente no comentário de
// `calcular_comprometido_v2`, migration 202608020001) - vem da transição
// REAL registrada em `historico_situacao_comercial` (trigger, append-only).
//
// Dado insuficiente vira DIAGNÓSTICO e exclui o projeto/item da fila -
// NUNCA um valor completado por suposição (nem "hoje", nem aprovado_em,
// nem recurso adivinhado).
import type { SupabaseClient } from "@supabase/supabase-js";
import { selecionarFonteVencedora } from "./selecionarFonteVencedora";
import { agregarCompromissosPorRecurso } from "./agregarCompromissosPorRecurso";
import type { CompromissoCapacidade, CompromissoGranular } from "./compromissoCapacidade";
import { validarDataIso } from "./validacoes";

export interface DiagnosticoCarregamentoComercial {
  readonly empresaId: string;
  readonly projetoId: string;
  readonly motivo: string;
}

type ProjetoRow = { id: string };
type HistoricoRow = { projeto_id: string; created_at: string };
type SimulacaoRow = { id: string; projeto_id: string };
type ItemRow = {
  id: string;
  simulacao_comercial_id: string;
  necessario: number;
  deficit: number;
  versao_resultado_motor: number;
  recurso_considerado_id: string | null;
};
type DistribuicaoRow = { id: string; simulacao_comercial_item_id: string; recurso_id: string; horas_padrao_alocadas: number };

/**
 * `projetoExcluidoId` = o próprio orçamento novo sendo avaliado - nunca
 * disputa capacidade consigo mesmo na fila de confirmados.
 * `dataReferencia` = a data a partir da qual os confirmados podem
 * consumir capacidade nesta previsão (resolvida pelo CHAMADOR - janela
 * comercial/data de início do horizonte - fora de escopo deste módulo
 * decidir isso).
 */
export async function carregarConfirmadosComerciais(
  client: SupabaseClient,
  empresaId: string,
  projetoExcluidoId: string,
  dataReferencia: string,
): Promise<{ compromissos: readonly CompromissoCapacidade[]; diagnosticos: readonly DiagnosticoCarregamentoComercial[] }> {
  validarDataIso(dataReferencia, "dataReferencia");
  const diagnosticosCarregamento: DiagnosticoCarregamentoComercial[] = [];

  // --- 1. Projetos realmente em pedido_recebido, excluindo o próprio orçamento novo. ---
  const { data: projetosData, error: erroProjetos } = await client
    .from("projetos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("situacao_comercial", "pedido_recebido")
    .eq("ativo", true)
    .is("deleted_at", null)
    .neq("id", projetoExcluidoId);
  if (erroProjetos) {
    throw new Error(`Erro ao consultar projetos confirmados (empresa_id=${empresaId}): ${erroProjetos.message}`);
  }

  const projetoIds = ((projetosData ?? []) as ProjetoRow[]).map((p) => p.id);
  if (projetoIds.length === 0) {
    return { compromissos: [], diagnosticos: [] };
  }

  // --- 2. dataEntradaFila real - transição MAIS RECENTE para pedido_recebido (nunca aprovado_em, nunca fabricada). ---
  const { data: historicoData, error: erroHistorico } = await client
    .from("historico_situacao_comercial")
    .select("projeto_id,created_at")
    .eq("empresa_id", empresaId)
    .eq("situacao_nova", "pedido_recebido")
    .in("projeto_id", projetoIds);
  if (erroHistorico) {
    throw new Error(`Erro ao consultar historico_situacao_comercial: ${erroHistorico.message}`);
  }

  // `created_at` é timestamptz (hora incluída) - a comparação "mais
  // recente" usa o timestamp completo (ISO 8601 ordena corretamente como
  // string), mas o valor GUARDADO é truncado para data (YYYY-MM-DD): todo
  // o resto do motor (validarDataIso, compararParaFila) trabalha em
  // granularidade diária, nunca com hora.
  const timestampMaisRecentePorProjeto = new Map<string, string>();
  for (const linha of (historicoData ?? []) as HistoricoRow[]) {
    const atual = timestampMaisRecentePorProjeto.get(linha.projeto_id);
    if (!atual || linha.created_at > atual) timestampMaisRecentePorProjeto.set(linha.projeto_id, linha.created_at);
  }
  const dataEntradaFilaPorProjeto = new Map<string, string>(
    [...timestampMaisRecentePorProjeto.entries()].map(([projetoId, timestamp]) => [projetoId, timestamp.slice(0, 10)]),
  );

  // --- 3. Simulação vigente de cada projeto (1 lote, nunca 1 query por projeto). ---
  const { data: simulacoesData, error: erroSimulacoes } = await client
    .from("simulacoes_comerciais")
    .select("id,projeto_id")
    .eq("empresa_id", empresaId)
    .eq("vigente", true)
    .in("projeto_id", projetoIds);
  if (erroSimulacoes) {
    throw new Error(`Erro ao consultar simulacoes_comerciais vigentes: ${erroSimulacoes.message}`);
  }

  const simulacoes = (simulacoesData ?? []) as SimulacaoRow[];
  const simulacaoIdPorProjeto = new Map(simulacoes.map((s) => [s.projeto_id, s.id]));
  const projetoIdPorSimulacaoId = new Map(simulacoes.map((s) => [s.id, s.projeto_id]));

  for (const projetoId of projetoIds) {
    if (!simulacaoIdPorProjeto.has(projetoId)) {
      diagnosticosCarregamento.push({
        empresaId,
        projetoId,
        motivo: "Projeto em pedido_recebido sem simulação comercial vigente - excluído da fila de confirmados.",
      });
    } else if (!dataEntradaFilaPorProjeto.has(projetoId)) {
      diagnosticosCarregamento.push({
        empresaId,
        projetoId,
        motivo: "Projeto em pedido_recebido sem transição real registrada em historico_situacao_comercial - impossível determinar dataEntradaFila sem supor, excluído.",
      });
    }
  }

  const simulacaoIdsValidas = simulacoes.filter((s) => dataEntradaFilaPorProjeto.has(s.projeto_id)).map((s) => s.id);
  if (simulacaoIdsValidas.length === 0) {
    return { compromissos: [], diagnosticos: diagnosticosCarregamento };
  }

  // --- 4. Itens da simulação (1 por operação) - 1 lote. ---
  const { data: itensData, error: erroItens } = await client
    .from("simulacao_comercial_itens")
    .select("id,simulacao_comercial_id,necessario,deficit,versao_resultado_motor,recurso_considerado_id")
    .eq("empresa_id", empresaId)
    .in("simulacao_comercial_id", simulacaoIdsValidas);
  if (erroItens) {
    throw new Error(`Erro ao consultar simulacao_comercial_itens: ${erroItens.message}`);
  }

  const itens = (itensData ?? []) as ItemRow[];
  const itensV2Ids = itens.filter((i) => i.versao_resultado_motor === 2).map((i) => i.id);

  // --- 5. Distribuições (só existem para versao_resultado_motor=2) - 1 lote, só se houver itens v2. ---
  const { data: distribuicoesData, error: erroDistribuicoes } =
    itensV2Ids.length > 0
      ? await client
          .from("simulacao_comercial_item_distribuicoes")
          .select("id,simulacao_comercial_item_id,recurso_id,horas_padrao_alocadas")
          .eq("empresa_id", empresaId)
          .in("simulacao_comercial_item_id", itensV2Ids)
      : { data: [] as DistribuicaoRow[], error: null };
  if (erroDistribuicoes) {
    throw new Error(`Erro ao consultar simulacao_comercial_item_distribuicoes: ${erroDistribuicoes.message}`);
  }

  const distribuicoesPorItem = new Map<string, DistribuicaoRow[]>();
  for (const linha of (distribuicoesData ?? []) as DistribuicaoRow[]) {
    if (!distribuicoesPorItem.has(linha.simulacao_comercial_item_id)) distribuicoesPorItem.set(linha.simulacao_comercial_item_id, []);
    distribuicoesPorItem.get(linha.simulacao_comercial_item_id)!.push(linha);
  }

  // --- 6. Granulares - 1 por linha real de compromisso (item v1, ou distribuição v2) - a soma por
  // (projeto,recurso) é responsabilidade de agregarCompromissosPorRecurso() logo abaixo, nunca
  // reimplementada aqui (chaveTrabalho única por linha real evita a rejeição de duplicata de
  // selecionarFonteVencedora, sem precisar pré-agregar manualmente). ---
  const granulares: CompromissoGranular[] = [];
  for (const item of itens) {
    const projetoId = projetoIdPorSimulacaoId.get(item.simulacao_comercial_id);
    if (!projetoId || !dataEntradaFilaPorProjeto.has(projetoId)) continue; // já diagnosticado no passo 3.
    const dataEntradaFila = dataEntradaFilaPorProjeto.get(projetoId)!;

    if (item.versao_resultado_motor === 2) {
      const distribuicoes = distribuicoesPorItem.get(item.id) ?? [];
      if (distribuicoes.length === 0) {
        diagnosticosCarregamento.push({
          empresaId,
          projetoId,
          motivo: `Item de simulação ${item.id}: déficit total (0 linhas de distribuição) - nenhum recurso confirmado a atribuir, excluído.`,
        });
        continue;
      }
      for (const distribuicao of distribuicoes) {
        granulares.push({
          empresaId,
          projetoId,
          projetoItemId: null,
          chaveTrabalho: distribuicao.id,
          recursoId: distribuicao.recurso_id,
          horasRestantesPadrao: Number(distribuicao.horas_padrao_alocadas),
          disponivelAPartirDe: dataReferencia,
          dataEntradaFila,
          prioridade: 0,
          classeFila: "confirmado",
          origem: "snapshot_comercial",
        });
      }
    } else {
      if (!item.recurso_considerado_id) {
        diagnosticosCarregamento.push({
          empresaId,
          projetoId,
          motivo: `Item de simulação ${item.id}: déficit total (modelo legado, sem recurso considerado) - nenhum recurso confirmado a atribuir, excluído.`,
        });
        continue;
      }
      const horas = Number(item.necessario) - Number(item.deficit);
      if (horas <= 0) continue; // defensivo - os estados legados com recurso têm deficit=0 garantido por CHECK no banco.
      granulares.push({
        empresaId,
        projetoId,
        projetoItemId: null,
        chaveTrabalho: item.id,
        recursoId: item.recurso_considerado_id,
        horasRestantesPadrao: horas,
        disponivelAPartirDe: dataReferencia,
        dataEntradaFila,
        prioridade: 0,
        classeFila: "confirmado",
        origem: "snapshot_comercial",
      });
    }
  }

  // Nenhum adaptador PCP nesta rodada - sem coberturasIntegrais, todo granular é snapshot_comercial
  // e vence sem disputa; selecionarFonteVencedora/agregarCompromissosPorRecurso reaproveitados tal
  // como já testados, nunca uma segunda implementação de dedup/soma.
  const { vencedores, diagnosticos: diagnosticosSelecao } = selecionarFonteVencedora({ granulares, coberturasIntegrais: [] });
  const compromissos = agregarCompromissosPorRecurso(vencedores);

  return {
    compromissos,
    diagnosticos: [
      ...diagnosticosCarregamento,
      ...diagnosticosSelecao.map((d) => ({ empresaId: d.empresaId, projetoId: d.projetoId, motivo: `${d.motivo} (recursoId=${d.recursoId})` })),
    ],
  };
}
