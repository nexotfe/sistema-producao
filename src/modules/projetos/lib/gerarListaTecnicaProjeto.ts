// Camada fina sobre a RPC gerar_lista_tecnica_projeto (migration
// 202608040003) - toda a lógica de negócio (expansão recursiva de
// roteiros, validação por subárvore, natureza do projeto, consolidação
// entre itens) mora no banco; aqui só existe o contrato de chamada, o
// repasse fiel da mensagem de erro que a RPC já formula em português,
// e a consolidação de `materiais` (linhas por item) em grupos por
// materia_prima_id - sem arredondamento, responsabilidade exclusiva da
// camada de exibição.
//
// A RPC retorna um único objeto composto (não SETOF) - supabase-js
// entrega `data` como objeto direto, não como array de linhas.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ItemAnalisado = {
  projetoItemId: string;
  produtoRaizId: string;
  produtoRaizCodigo: string;
  quantidadeSolicitada: number;
  tipoItem: string | null;
  possuiMateriais: boolean;
};

export type OrigemMaterialConsolidado = {
  projetoItemId: string;
  produtoRaizId: string;
  produtoRaizCodigo: string;
  quantidadeSolicitada: number;
  bomItemId: string;
  ordem: number;
  quantidadeLinha: number;
  unidadeLinha: string;
  quantidadeAcumuladaProduto: number;
  quantidadeCalculadaOrigem: number;
  quantidadeConvertida: number;
  dimensoes: string | null;
  profundidade: number;
  caminhoIds: string[];
  caminhoCodigos: string[];
  caminhoBomItemIds: string[];
};

export type MaterialConsolidado = {
  materiaPrimaId: string;
  materiaPrimaCodigo: string;
  materiaPrimaDescricao: string;
  unidadeBase: string;
  /** Soma sem arredondamento - arredondar só na exibição. */
  quantidadeTotal: number;
  origens: OrigemMaterialConsolidado[];
};

export type ResultadoListaTecnicaProjeto = {
  estado: "calculado" | "nao_aplicavel_industrializacao";
  mensagem: string | null;
  itensAnalisados: ItemAnalisado[];
  materiais: MaterialConsolidado[];
};

type ItemAnalisadoRow = {
  projeto_item_id: string;
  produto_raiz_id: string;
  produto_raiz_codigo: string;
  quantidade_solicitada: number;
  tipo_item: string | null;
  possui_materiais: boolean;
};

type LinhaMaterialRow = {
  projeto_item_id: string;
  produto_raiz_id: string;
  produto_raiz_codigo: string;
  quantidade_solicitada: number;
  materia_prima_id: string;
  materia_prima_codigo: string;
  materia_prima_descricao: string;
  unidade_base: string;
  bom_item_id: string;
  ordem: number;
  quantidade_linha: number;
  unidade_linha: string;
  quantidade_acumulada_produto: number;
  quantidade_calculada_origem: number;
  quantidade_convertida: number;
  dimensoes: string | null;
  profundidade: number;
  caminho_ids: string[];
  caminho_codigos: string[];
  caminho_bom_item_ids: string[];
};

type ResultadoRpcRow = {
  estado: "calculado" | "nao_aplicavel_industrializacao";
  mensagem: string | null;
  itens_analisados: ItemAnalisadoRow[] | null;
  materiais: LinhaMaterialRow[] | null;
};

/**
 * Gera a lista técnica de materiais de um projeto, expandindo
 * recursivamente o roteiro de cada item ativo e consolidando as
 * matérias-primas entre todos os itens. Projetos de natureza
 * "industrialização" devolvem estado "nao_aplicavel_industrializacao"
 * (material fornecido pelo cliente) - não é um erro. Lança Error com a
 * mensagem exata da RPC em caso de bloqueio real (produto/item
 * inválido, roteiro ausente ou incompleto, matéria-prima
 * indisponível, unidade incompatível, ciclo, profundidade máxima,
 * natureza de projeto nula/desconhecida).
 */
export async function gerarListaTecnicaProjeto(
  client: SupabaseClient,
  projetoId: string,
): Promise<ResultadoListaTecnicaProjeto> {
  const { data, error } = await client.rpc("gerar_lista_tecnica_projeto", {
    p_projeto_id: projetoId,
  });

  if (error) {
    throw new Error(error.message || "Não foi possível gerar a lista técnica do projeto.");
  }

  if (!data) {
    throw new Error("A geração da lista técnica não retornou resultado.");
  }

  const bruto = data as ResultadoRpcRow;

  const itensAnalisados: ItemAnalisado[] = (bruto.itens_analisados ?? []).map((item) => ({
    projetoItemId: item.projeto_item_id,
    produtoRaizId: item.produto_raiz_id,
    produtoRaizCodigo: item.produto_raiz_codigo,
    quantidadeSolicitada: Number(item.quantidade_solicitada),
    tipoItem: item.tipo_item,
    possuiMateriais: item.possui_materiais,
  }));

  const porMaterial = new Map<string, MaterialConsolidado>();

  for (const linha of bruto.materiais ?? []) {
    const origem: OrigemMaterialConsolidado = {
      projetoItemId: linha.projeto_item_id,
      produtoRaizId: linha.produto_raiz_id,
      produtoRaizCodigo: linha.produto_raiz_codigo,
      quantidadeSolicitada: Number(linha.quantidade_solicitada),
      bomItemId: linha.bom_item_id,
      ordem: linha.ordem,
      quantidadeLinha: Number(linha.quantidade_linha),
      unidadeLinha: linha.unidade_linha,
      quantidadeAcumuladaProduto: Number(linha.quantidade_acumulada_produto),
      quantidadeCalculadaOrigem: Number(linha.quantidade_calculada_origem),
      quantidadeConvertida: Number(linha.quantidade_convertida),
      dimensoes: linha.dimensoes,
      profundidade: linha.profundidade,
      caminhoIds: linha.caminho_ids,
      caminhoCodigos: linha.caminho_codigos,
      caminhoBomItemIds: linha.caminho_bom_item_ids,
    };

    const existente = porMaterial.get(linha.materia_prima_id);
    if (existente) {
      existente.quantidadeTotal += origem.quantidadeConvertida;
      existente.origens.push(origem);
    } else {
      porMaterial.set(linha.materia_prima_id, {
        materiaPrimaId: linha.materia_prima_id,
        materiaPrimaCodigo: linha.materia_prima_codigo,
        materiaPrimaDescricao: linha.materia_prima_descricao,
        unidadeBase: linha.unidade_base,
        quantidadeTotal: origem.quantidadeConvertida,
        origens: [origem],
      });
    }
  }

  const materiais = Array.from(porMaterial.values()).sort((a, b) => {
    const porCodigo = a.materiaPrimaCodigo.localeCompare(b.materiaPrimaCodigo);
    if (porCodigo !== 0) return porCodigo;
    return a.materiaPrimaId.localeCompare(b.materiaPrimaId);
  });

  return {
    estado: bruto.estado,
    mensagem: bruto.mensagem,
    itensAnalisados,
    materiais,
  };
}
