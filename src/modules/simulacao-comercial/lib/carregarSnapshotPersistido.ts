// Fase 2 do rollout da Entrega 2 (leitura dupla, PAD-008 v2.0 §19): lê
// um snapshot JÁ APROVADO (simulacao_comercial_itens +, quando
// versao_resultado_motor=2, simulacao_comercial_item_distribuicoes) e
// monta uma visão hierárquica para exibição - igual em espírito a
// prepararResultadoParaExibicao.ts, mas para dado PERSISTIDO, não para
// o resultado em memória de uma simulação recém-executada.
//
// Nunca consulta recursos_produtivos.produtividade/capacidade_horas_dia
// de novo - só a base CONGELADA no momento da aprovação. Para
// snapshots legados (versao_resultado_motor=1), produtividade e horas
// de máquina são DERIVADAS dos próprios valores já persistidos
// (capacidade_efetiva ÷ capacidade_bruta), nunca de uma nova consulta.
// Saldo progressivo (antes/depois) não existe no modelo legado -
// permanece null, não inventado.
//
// Não confia cegamente no que está persistido: valida a consistência
// estrutural de cada item (versão 1 não pode ter filhos; versão 2 tem
// que fechar soma(alocações) + déficit = necessário; versão 2 sem
// filhos só é válido em déficit total) - lança SnapshotInconsistenteError
// (erro de domínio controlado) se algo não bater, em vez de exibir um
// dado silenciosamente errado.
import type { SupabaseClient } from "@supabase/supabase-js";
import { numerosIguais } from "./constantesNumericas";
import { SnapshotInconsistenteError } from "./errors";

export interface DistribuicaoSnapshotExibicao {
  recursoNome: string;
  origem: "ORIGINAL" | "COMPATIBILIDADE";
  capacidadeBrutaPeriodo: number;
  /** null quando não é possível derivar (capacidadeBrutaPeriodo = 0), o que não deveria ocorrer na prática. */
  produtividadeConsiderada: number | null;
  capacidadeEfetiva: number;
  comprometidoInicial: number;
  capacidadeDisponivelInicial: number;
  /** null para snapshots legados (versao_resultado_motor=1) - o modelo antigo não tinha saldo progressivo por alocação, só um valor único por recurso. */
  capacidadeDisponivelAntes: number | null;
  horasPadraoAlocadas: number;
  /** null para snapshots legados quando a produtividade não pôde ser derivada. */
  horasMaquinaEstimadas: number | null;
  /** null para snapshots legados - ver capacidadeDisponivelAntes. */
  capacidadeDisponivelDepois: number | null;
}

export interface OperacaoSnapshotExibicao {
  bomOperacaoId: string;
  operacaoDescricao: string;
  recursoOriginalNome: string;
  necessario: number;
  deficit: number;
  /** 1 = legado (sintetizado dos 5 campos escalares), 2 = novo (tabela filha). */
  versaoResultadoMotor: 1 | 2;
  /** 0..N - vazio quando a operação está em déficit total, nos dois formatos. */
  distribuicoes: DistribuicaoSnapshotExibicao[];
}

type ItemRow = {
  id: string;
  bom_operacao_id: string;
  recurso_original_id: string;
  versao_resultado_motor: 1 | 2;
  necessario: number;
  deficit: number;
  recurso_considerado_id: string | null;
  motivo_consideracao: "ORIGINAL" | "COMPATIBILIDADE" | null;
  capacidade_bruta: number | null;
  capacidade_efetiva: number | null;
  comprometido: number | null;
  livre: number | null;
};

type DistribuicaoRow = {
  simulacao_comercial_item_id: string;
  recurso_id: string;
  origem: "ORIGINAL" | "COMPATIBILIDADE";
  ordem_consideracao: number;
  capacidade_bruta_periodo: number;
  produtividade_considerada: number;
  capacidade_efetiva: number;
  comprometido_inicial: number;
  capacidade_disponivel_inicial: number;
  capacidade_disponivel_antes: number;
  horas_padrao_alocadas: number;
  horas_maquina_estimadas: number;
  capacidade_disponivel_depois: number;
};

type RecursoRow = { id: string; nome: string; codigo: string };
type OperacaoRow = { id: string; descricao: string; ordem: number };

function formatarRecurso(recurso: RecursoRow | undefined, recursoId: string): string {
  return recurso ? `${recurso.codigo} — ${recurso.nome}` : recursoId;
}

/**
 * Valida a consistência estrutural de um item contra suas linhas
 * filhas. Lança SnapshotInconsistenteError (nunca retorna um booleano
 * silencioso) - a leitura de um snapshot não deve exibir um resultado
 * que não bate com as invariantes que a própria RPC v4 já deveria ter
 * garantido na escrita.
 */
function validarConsistenciaItem(
  item: ItemRow,
  filhos: DistribuicaoRow[],
  simulacaoComercialId: string,
): void {
  if (item.versao_resultado_motor === 1) {
    if (filhos.length > 0) {
      throw new SnapshotInconsistenteError(
        simulacaoComercialId,
        item.bom_operacao_id,
        `item versao_resultado_motor=1 (legado) possui ${filhos.length} linha(s) em simulacao_comercial_item_distribuicoes - formato legado não deveria ter filhos`,
      );
    }
    return;
  }

  // versao_resultado_motor === 2
  if (filhos.length === 0) {
    if (!numerosIguais(item.deficit, item.necessario)) {
      throw new SnapshotInconsistenteError(
        simulacaoComercialId,
        item.bom_operacao_id,
        `item versao_resultado_motor=2 sem nenhuma distribuição filha, mas déficit (${item.deficit}) difere de necessário (${item.necessario}) - sem filhos só é válido em déficit total`,
      );
    }
    return;
  }

  const somaAlocada = filhos.reduce((acc, filho) => acc + filho.horas_padrao_alocadas, 0);
  if (!numerosIguais(somaAlocada + item.deficit, item.necessario)) {
    throw new SnapshotInconsistenteError(
      simulacaoComercialId,
      item.bom_operacao_id,
      `soma das distribuições (${somaAlocada}) + déficit (${item.deficit}) diferente de necessário (${item.necessario})`,
    );
  }
}

/**
 * Monta a distribuição sintética de um item LEGADO (versao_resultado_motor=1)
 * a partir dos 5 campos escalares congelados na aprovação. Produtividade
 * e horas de máquina são derivadas desses mesmos valores (nunca de uma
 * nova consulta a recursos_produtivos) - `livre` no modelo antigo já
 * era o valor líquido (capacidade_efetiva - comprometido, com piso 0),
 * a mesma fórmula de capacidadeDisponivelInicial de hoje.
 */
function sintetizarDistribuicaoLegado(
  item: ItemRow,
  recursoPorId: Map<string, RecursoRow>,
): DistribuicaoSnapshotExibicao[] {
  if (item.recurso_considerado_id === null) {
    return [];
  }

  const capacidadeBruta = item.capacidade_bruta ?? 0;
  const capacidadeEfetiva = item.capacidade_efetiva ?? 0;
  const produtividadeDerivada = capacidadeBruta > 0 ? capacidadeEfetiva / capacidadeBruta : null;

  return [
    {
      recursoNome: formatarRecurso(recursoPorId.get(item.recurso_considerado_id), item.recurso_considerado_id),
      origem: item.motivo_consideracao as "ORIGINAL" | "COMPATIBILIDADE",
      capacidadeBrutaPeriodo: capacidadeBruta,
      produtividadeConsiderada: produtividadeDerivada,
      capacidadeEfetiva,
      comprometidoInicial: item.comprometido ?? 0,
      // "livre" no modelo legado já era o valor líquido - mesma
      // fórmula de capacidadeDisponivelInicial (max(0, efetiva -
      // comprometido)). Não é "capacidade_disponivel" (esse era o
      // valor bruto, redundante com capacidade_efetiva no modelo antigo).
      capacidadeDisponivelInicial: item.livre ?? 0,
      capacidadeDisponivelAntes: null,
      horasPadraoAlocadas: item.necessario,
      // Comparação explícita com null - produtividadeDerivada=0 (se
      // algum dia ocorrer) não deve ser tratado como "não derivável"
      // por truthiness (0 é falsy em JS, mas é um valor válido aqui).
      horasMaquinaEstimadas: produtividadeDerivada !== null ? item.necessario / produtividadeDerivada : null,
      capacidadeDisponivelDepois: null,
    },
  ];
}

export async function carregarSnapshotPersistido(
  client: SupabaseClient,
  simulacaoComercialId: string,
): Promise<OperacaoSnapshotExibicao[]> {
  const { data: itensData, error: erroItens } = await client
    .from("simulacao_comercial_itens")
    .select(
      "id,bom_operacao_id,recurso_original_id,versao_resultado_motor,necessario,deficit,recurso_considerado_id,motivo_consideracao,capacidade_bruta,capacidade_efetiva,comprometido,livre",
    )
    .eq("simulacao_comercial_id", simulacaoComercialId);

  if (erroItens) {
    throw new Error(`Erro ao consultar simulacao_comercial_itens do snapshot: ${erroItens.message}`);
  }

  const itens = (itensData ?? []) as ItemRow[];
  if (itens.length === 0) {
    return [];
  }

  // Consulta os filhos de TODOS os itens (não só versao=2) - é isso que
  // permite validar que um item legado (versao=1) de fato não tem
  // nenhuma linha filha, em vez de simplesmente nunca perguntar.
  // Ordenado por ordem_consideracao: mesma ordem em que o núcleo
  // decidiu as alocações (0 para ORIGINAL, prioridade cadastrada para
  // COMPATIBILIDADE) - sem isso, a ordem de exibição de um snapshot com
  // 2+ recursos não teria garantia de estabilidade entre execuções.
  const { data: distribuicoesData, error: erroDistribuicoes } = await client
    .from("simulacao_comercial_item_distribuicoes")
    .select(
      "simulacao_comercial_item_id,recurso_id,origem,ordem_consideracao,capacidade_bruta_periodo,produtividade_considerada,capacidade_efetiva,comprometido_inicial,capacidade_disponivel_inicial,capacidade_disponivel_antes,horas_padrao_alocadas,horas_maquina_estimadas,capacidade_disponivel_depois",
    )
    .in(
      "simulacao_comercial_item_id",
      itens.map((item) => item.id),
    )
    .order("ordem_consideracao", { ascending: true });

  if (erroDistribuicoes) {
    throw new Error(
      `Erro ao consultar simulacao_comercial_item_distribuicoes do snapshot: ${erroDistribuicoes.message}`,
    );
  }

  const distribuicoesPorItem = new Map<string, DistribuicaoRow[]>();
  for (const distribuicao of (distribuicoesData ?? []) as DistribuicaoRow[]) {
    const lista = distribuicoesPorItem.get(distribuicao.simulacao_comercial_item_id) ?? [];
    lista.push(distribuicao);
    distribuicoesPorItem.set(distribuicao.simulacao_comercial_item_id, lista);
  }

  // Valida ANTES de montar qualquer coisa para exibição - uma
  // inconsistência estrutural interrompe a leitura inteira do
  // snapshot, não é silenciosamente ignorada numa única operação.
  for (const item of itens) {
    validarConsistenciaItem(item, distribuicoesPorItem.get(item.id) ?? [], simulacaoComercialId);
  }

  const recursoIds = Array.from(
    new Set(
      itens.flatMap((item) => {
        const ids = [item.recurso_original_id];
        if (item.recurso_considerado_id) ids.push(item.recurso_considerado_id);
        for (const distribuicao of distribuicoesPorItem.get(item.id) ?? []) {
          ids.push(distribuicao.recurso_id);
        }
        return ids;
      }),
    ),
  );

  const { data: recursosData, error: erroRecursos } = await client
    .from("recursos_produtivos")
    .select("id,nome,codigo")
    .in("id", recursoIds.length > 0 ? recursoIds : [""]);

  if (erroRecursos) {
    throw new Error(`Erro ao consultar recursos_produtivos do snapshot: ${erroRecursos.message}`);
  }

  const recursoPorId = new Map<string, RecursoRow>(
    (recursosData ?? []).map((recurso) => [recurso.id, recurso as RecursoRow]),
  );

  const { data: operacoesData, error: erroOperacoes } = await client
    .from("bom_operacoes")
    .select("id,descricao,ordem")
    .in("id", itens.map((item) => item.bom_operacao_id));

  if (erroOperacoes) {
    throw new Error(`Erro ao consultar bom_operacoes do snapshot: ${erroOperacoes.message}`);
  }

  const operacaoPorId = new Map<string, OperacaoRow>(
    (operacoesData ?? []).map((operacao) => [(operacao as OperacaoRow).id, operacao as OperacaoRow]),
  );

  const resultado = itens.map((item) => {
    const distribuicoes: DistribuicaoSnapshotExibicao[] =
      item.versao_resultado_motor === 2
        ? (distribuicoesPorItem.get(item.id) ?? []).map((distribuicao) => ({
            recursoNome: formatarRecurso(recursoPorId.get(distribuicao.recurso_id), distribuicao.recurso_id),
            origem: distribuicao.origem,
            capacidadeBrutaPeriodo: distribuicao.capacidade_bruta_periodo,
            produtividadeConsiderada: distribuicao.produtividade_considerada,
            capacidadeEfetiva: distribuicao.capacidade_efetiva,
            comprometidoInicial: distribuicao.comprometido_inicial,
            capacidadeDisponivelInicial: distribuicao.capacidade_disponivel_inicial,
            capacidadeDisponivelAntes: distribuicao.capacidade_disponivel_antes,
            horasPadraoAlocadas: distribuicao.horas_padrao_alocadas,
            horasMaquinaEstimadas: distribuicao.horas_maquina_estimadas,
            capacidadeDisponivelDepois: distribuicao.capacidade_disponivel_depois,
          }))
        : sintetizarDistribuicaoLegado(item, recursoPorId);

    return {
      bomOperacaoId: item.bom_operacao_id,
      operacaoDescricao: operacaoPorId.get(item.bom_operacao_id)?.descricao ?? item.bom_operacao_id,
      recursoOriginalNome: formatarRecurso(recursoPorId.get(item.recurso_original_id), item.recurso_original_id),
      necessario: item.necessario,
      deficit: item.deficit,
      versaoResultadoMotor: item.versao_resultado_motor,
      distribuicoes,
    };
  });

  // Ordem determinística: bom_operacoes.ordem é a ordem real de
  // negócio (posição no roteiro) - só não é globalmente única quando o
  // projeto tem múltiplos itens/BOMs (mesmo limite documentado em
  // prepararResultadoParaExibicao.ts). bomOperacaoId como desempate
  // garante determinismo total mesmo nesse caso, sem fingir uma ordem
  // de negócio que o schema não preserva para um snapshot já persistido.
  return resultado.sort((a, b) => {
    const ordemA = operacaoPorId.get(a.bomOperacaoId)?.ordem ?? 0;
    const ordemB = operacaoPorId.get(b.bomOperacaoId)?.ordem ?? 0;
    if (ordemA !== ordemB) return ordemA - ordemB;
    return a.bomOperacaoId.localeCompare(b.bomOperacaoId);
  });
}
