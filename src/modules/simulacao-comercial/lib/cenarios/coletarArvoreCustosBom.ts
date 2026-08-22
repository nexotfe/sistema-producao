// Coleta a árvore de matéria-prima/terceiros/transporte de um BOM,
// recursivamente através de subconjuntos - o lado de CUSTO que
// carregarBaseCenarios.ts não cobre (ela só resolve a árvore de
// OPERAÇÕES produtivas). Espelha a mesma regra de escolha de BOM
// ("ativo" preferido, senão o mais recente) já usada em
// calcular_custo_bom_interno/buscarDadosOrcamento.ts - nunca uma
// terceira regra de seleção.
//
// Preserva IDENTIDADE (bom_id, bom_itens.id, materia_prima_id,
// bom_servicos_terceiros.id, bom_transportes.id), não só valores
// agregados - é isso que torna a assinatura sensível a uma troca de
// componente que mantenha o custo total igual.
//
// Detecção de ciclo: caminho de bom_id da raiz até o nó atual, num Set
// por chamada de coletarArvoreCustosBom (nunca compartilhado entre
// itens diferentes do projeto - dois itens podem legitimamente usar o
// mesmo subconjunto). Um bom_id reaparecendo no próprio caminho lança
// CicloBomDetectadoError explícito, nunca só para de descer (silencioso).
import type { SupabaseClient } from "@supabase/supabase-js";

export class CicloBomDetectadoError extends Error {
  constructor(readonly caminhoBomIds: readonly string[], readonly bomIdRepetido: string) {
    super(
      `Ciclo de BOM detectado: bom_id="${bomIdRepetido}" já aparece no caminho [${caminhoBomIds.join(" -> ")}]. Referência circular entre subconjuntos.`,
    );
    this.name = "CicloBomDetectadoError";
  }
}

export interface MateriaPrimaNaArvore {
  bomItemId: string;
  materiaPrimaId: string;
  quantidade: string;
  unidade: string;
  custoReferencia: string | null;
}

export interface TerceiroNaArvore {
  id: string;
  ordem: number;
  custoEstimado: string;
}

export interface TransporteNaArvore {
  id: string;
  ordem: number;
  custoEstimado: string;
}

export interface SubconjuntoNaArvore {
  bomItemId: string;
  quantidade: string;
  no: NoArvoreCustos;
}

export interface NoArvoreCustos {
  bomId: string;
  bomVersao: string;
  materiais: MateriaPrimaNaArvore[];
  subconjuntos: SubconjuntoNaArvore[];
  terceiros: TerceiroNaArvore[];
  transportes: TransporteNaArvore[];
}

type BomRow = { id: string; produto_id: string; versao: string; status: string; created_at: string };

async function resolverBomAtivo(
  client: SupabaseClient,
  empresaId: string,
  produtoId: string,
): Promise<BomRow | null> {
  const { data, error } = await client
    .from("boms")
    .select("id,produto_id,versao,status,created_at")
    .eq("empresa_id", empresaId)
    .eq("produto_id", produtoId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erro ao consultar boms para produto_id=${produtoId}: ${error.message}`);
  }

  const linhas = (data ?? []) as BomRow[];
  return linhas.find((bom) => bom.status === "ativo") ?? linhas[0] ?? null;
}

async function coletarNo(
  client: SupabaseClient,
  empresaId: string,
  bom: BomRow,
  caminhoBomIds: readonly string[],
): Promise<NoArvoreCustos> {
  if (caminhoBomIds.includes(bom.id)) {
    throw new CicloBomDetectadoError(caminhoBomIds, bom.id);
  }
  const caminhoAtual = [...caminhoBomIds, bom.id];

  const { data: itensData, error: erroItens } = await client
    .from("bom_itens")
    .select("id,componente_tipo,materia_prima_id,componente_produto_id,quantidade,unidade")
    .eq("empresa_id", empresaId)
    .eq("bom_id", bom.id)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("id", { ascending: true });

  if (erroItens) {
    throw new Error(`Erro ao consultar bom_itens para bom_id=${bom.id}: ${erroItens.message}`);
  }

  type BomItemRow = {
    id: string;
    componente_tipo: string;
    materia_prima_id: string | null;
    componente_produto_id: string | null;
    quantidade: number;
    unidade: string;
  };

  const itens = (itensData ?? []) as BomItemRow[];
  const itensMateriaPrima = itens.filter((item) => item.componente_tipo === "materia_prima");
  const itensSubconjunto = itens.filter((item) => item.componente_tipo === "subconjunto");

  const materiaPrimaIds = itensMateriaPrima
    .map((item) => item.materia_prima_id)
    .filter((id): id is string => id !== null);

  const custoReferenciaPorId = new Map<string, string | null>();
  if (materiaPrimaIds.length > 0) {
    const { data: materiasData, error: erroMaterias } = await client
      .from("materias_primas")
      .select("id,custo_referencia")
      .in("id", materiaPrimaIds);

    if (erroMaterias) {
      throw new Error(`Erro ao consultar materias_primas para bom_id=${bom.id}: ${erroMaterias.message}`);
    }

    for (const linha of (materiasData ?? []) as { id: string; custo_referencia: number | string | null }[]) {
      custoReferenciaPorId.set(linha.id, linha.custo_referencia === null ? null : String(linha.custo_referencia));
    }
  }

  const materiais: MateriaPrimaNaArvore[] = itensMateriaPrima
    .filter((item): item is BomItemRow & { materia_prima_id: string } => item.materia_prima_id !== null)
    .map((item) => ({
      bomItemId: item.id,
      materiaPrimaId: item.materia_prima_id,
      quantidade: String(item.quantidade),
      unidade: item.unidade,
      custoReferencia: custoReferenciaPorId.get(item.materia_prima_id) ?? null,
    }))
    .sort((a, b) => a.bomItemId.localeCompare(b.bomItemId));

  const subconjuntos: SubconjuntoNaArvore[] = [];
  for (const item of itensSubconjunto) {
    if (!item.componente_produto_id) continue;
    const bomFilho = await resolverBomAtivo(client, empresaId, item.componente_produto_id);
    if (!bomFilho) continue;
    const no = await coletarNo(client, empresaId, bomFilho, caminhoAtual);
    subconjuntos.push({ bomItemId: item.id, quantidade: String(item.quantidade), no });
  }
  subconjuntos.sort((a, b) => a.bomItemId.localeCompare(b.bomItemId));

  const { data: terceirosData, error: erroTerceiros } = await client
    .from("bom_servicos_terceiros")
    .select("id,ordem,custo_estimado")
    .eq("empresa_id", empresaId)
    .eq("bom_id", bom.id)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("id", { ascending: true });

  if (erroTerceiros) {
    throw new Error(`Erro ao consultar bom_servicos_terceiros para bom_id=${bom.id}: ${erroTerceiros.message}`);
  }

  const terceiros: TerceiroNaArvore[] = ((terceirosData ?? []) as { id: string; ordem: number; custo_estimado: number | string | null }[])
    .map((linha) => ({ id: linha.id, ordem: linha.ordem, custoEstimado: String(linha.custo_estimado ?? 0) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const { data: transportesData, error: erroTransportes } = await client
    .from("bom_transportes")
    .select("id,ordem,custo_estimado")
    .eq("empresa_id", empresaId)
    .eq("bom_id", bom.id)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("id", { ascending: true });

  if (erroTransportes) {
    throw new Error(`Erro ao consultar bom_transportes para bom_id=${bom.id}: ${erroTransportes.message}`);
  }

  const transportes: TransporteNaArvore[] = ((transportesData ?? []) as { id: string; ordem: number; custo_estimado: number | string | null }[])
    .map((linha) => ({ id: linha.id, ordem: linha.ordem, custoEstimado: String(linha.custo_estimado ?? 0) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { bomId: bom.id, bomVersao: bom.versao, materiais, subconjuntos, terceiros, transportes };
}

/**
 * Resolve o BOM ativo (ou mais recente) do produto e coleta sua árvore
 * de custos completa, recursivamente. Retorna `null` quando o produto
 * não tem nenhum BOM - mesmo critério "sem estrutura" já usado no resto
 * do projeto (contribui 0 no custo, nunca erro).
 */
export async function coletarArvoreCustosBom(
  client: SupabaseClient,
  empresaId: string,
  produtoId: string,
): Promise<NoArvoreCustos | null> {
  const bom = await resolverBomAtivo(client, empresaId, produtoId);
  if (!bom) return null;
  return coletarNo(client, empresaId, bom, []);
}
