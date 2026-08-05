// Geração do Excel (3 abas) da Lista Técnica Consolidada do Projeto -
// roda inteiramente no navegador, a partir do `resultado` já carregado
// pelo modal (gerarListaTecnicaProjeto.ts) - nenhuma nova consulta ao
// banco. exceljs é carregado por importação dinâmica só quando o
// usuário clica em exportar, para não pesar o carregamento inicial da
// página. Documento técnico (conferência/base futura de Compras) - não
// gera requisição, cotação, reserva ou compromisso de estoque.
import type ExcelJS from "exceljs";
import type { ResultadoListaTecnicaProjeto } from "./gerarListaTecnicaProjeto";
import {
  assertListaTecnicaCalculada,
  nomeArquivoListaTecnica,
} from "./listaTecnicaExportacaoCompartilhada";

const FORMATO_QUANTIDADE = "#,##0.0000";
const MENSAGEM_SEM_MATERIAL = "Nenhuma matéria-prima necessária.";

function baixarArquivo(conteudo: BlobPart, tipoMime: string, nomeArquivo: string): void {
  const arquivo = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Preenche as 3 abas em um Workbook já construído - sem I/O, sem
 * download. Separado de `exportarListaTecnicaExcel` só para permitir
 * teste unitário direto do conteúdo das planilhas sem depender de
 * APIs de navegador (Blob/URL/document).
 */
export function preencherWorkbookListaTecnica(
  workbook: ExcelJS.Workbook,
  resultado: ResultadoListaTecnicaProjeto,
): void {
  const resumo = workbook.addWorksheet("Resumo consolidado");
  resumo.columns = [
    { header: "Código", key: "codigo", width: 18 },
    { header: "Descrição", key: "descricao", width: 40 },
    { header: "Quantidade total", key: "quantidadeTotal", width: 18 },
    { header: "Unidade", key: "unidade", width: 12 },
  ];
  resumo.getColumn("quantidadeTotal").numFmt = FORMATO_QUANTIDADE;

  if (resultado.materiais.length === 0) {
    resumo.addRow([MENSAGEM_SEM_MATERIAL]);
    resumo.mergeCells(2, 1, 2, 4);
  } else {
    for (const material of resultado.materiais) {
      resumo.addRow({
        codigo: material.materiaPrimaCodigo,
        descricao: material.materiaPrimaDescricao,
        quantidadeTotal: material.quantidadeTotal,
        unidade: material.unidadeBase,
      });
    }
  }

  const detalhamento = workbook.addWorksheet("Detalhamento por origem");
  detalhamento.columns = [
    { header: "Código da matéria-prima", key: "codigoMateriaPrima", width: 18 },
    { header: "Descrição da matéria-prima", key: "descricaoMateriaPrima", width: 34 },
    { header: "Produto do projeto", key: "produtoProjeto", width: 18 },
    { header: "Quantidade solicitada", key: "quantidadeSolicitada", width: 16 },
    { header: "Dimensão", key: "dimensao", width: 18 },
    { header: "Quantidade no roteiro", key: "quantidadeRoteiro", width: 16 },
    { header: "Unidade do roteiro", key: "unidadeRoteiro", width: 14 },
    { header: "Multiplicador acumulado", key: "multiplicadorAcumulado", width: 16 },
    { header: "Quantidade calculada na origem", key: "quantidadeCalculadaOrigem", width: 18 },
    { header: "Quantidade convertida", key: "quantidadeConvertida", width: 16 },
    { header: "Unidade consolidada", key: "unidadeConsolidada", width: 14 },
    { header: "Caminho completo", key: "caminhoCompleto", width: 40 },
    { header: "ID do item do projeto", key: "idItemProjeto", width: 30 },
  ];
  for (const chave of [
    "quantidadeSolicitada",
    "quantidadeRoteiro",
    "multiplicadorAcumulado",
    "quantidadeCalculadaOrigem",
    "quantidadeConvertida",
  ]) {
    detalhamento.getColumn(chave).numFmt = FORMATO_QUANTIDADE;
  }

  const totalOrigens = resultado.materiais.reduce((soma, material) => soma + material.origens.length, 0);
  if (totalOrigens === 0) {
    detalhamento.addRow([MENSAGEM_SEM_MATERIAL]);
    detalhamento.mergeCells(2, 1, 2, 13);
  } else {
    for (const material of resultado.materiais) {
      for (const origem of material.origens) {
        detalhamento.addRow({
          codigoMateriaPrima: material.materiaPrimaCodigo,
          descricaoMateriaPrima: material.materiaPrimaDescricao,
          produtoProjeto: origem.produtoRaizCodigo,
          quantidadeSolicitada: origem.quantidadeSolicitada,
          dimensao: origem.dimensoes ?? "—",
          quantidadeRoteiro: origem.quantidadeLinha,
          unidadeRoteiro: origem.unidadeLinha,
          multiplicadorAcumulado: origem.quantidadeAcumuladaProduto,
          quantidadeCalculadaOrigem: origem.quantidadeCalculadaOrigem,
          quantidadeConvertida: origem.quantidadeConvertida,
          unidadeConsolidada: material.unidadeBase,
          caminhoCompleto: origem.caminhoCodigos.join(" → "),
          idItemProjeto: origem.projetoItemId,
        });
      }
    }
  }

  const itens = workbook.addWorksheet("Itens analisados");
  itens.columns = [
    { header: "Produto", key: "produto", width: 18 },
    { header: "Tipo do item", key: "tipo", width: 18 },
    { header: "Quantidade solicitada", key: "quantidadeSolicitada", width: 18 },
    { header: "Possui matéria-prima", key: "possuiMateriais", width: 18 },
    { header: "ID do item do projeto", key: "idItemProjeto", width: 30 },
  ];
  itens.getColumn("quantidadeSolicitada").numFmt = FORMATO_QUANTIDADE;

  for (const item of resultado.itensAnalisados) {
    itens.addRow({
      produto: item.produtoRaizCodigo,
      tipo: item.tipoItem ?? "—",
      quantidadeSolicitada: item.quantidadeSolicitada,
      possuiMateriais: item.possuiMateriais ? "Sim" : "Não",
      idItemProjeto: item.projetoItemId,
    });
  }

}

export async function exportarListaTecnicaExcel(
  resultado: ResultadoListaTecnicaProjeto,
  numeroProjeto: string | null,
): Promise<void> {
  assertListaTecnicaCalculada(resultado);

  const ExcelJSRuntime = (await import("exceljs")).default;
  const workbook = new ExcelJSRuntime.Workbook();
  preencherWorkbookListaTecnica(workbook, resultado);

  const buffer = await workbook.xlsx.writeBuffer();
  baixarArquivo(
    buffer as unknown as BlobPart,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    nomeArquivoListaTecnica(numeroProjeto, "xlsx"),
  );
}
