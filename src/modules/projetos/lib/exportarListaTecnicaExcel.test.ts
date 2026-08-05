import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type {
  ItemAnalisado,
  MaterialConsolidado,
  ResultadoListaTecnicaProjeto,
} from "./gerarListaTecnicaProjeto";
import { preencherWorkbookListaTecnica } from "./exportarListaTecnicaExcel";

function item(overrides: Partial<ItemAnalisado> = {}): ItemAnalisado {
  return {
    projetoItemId: "item-1",
    produtoRaizId: "produto-1",
    produtoRaizCodigo: "P-001",
    quantidadeSolicitada: 2,
    tipoItem: "fabricacao",
    possuiMateriais: true,
    ...overrides,
  };
}

function material(overrides: Partial<MaterialConsolidado> = {}): MaterialConsolidado {
  return {
    materiaPrimaId: "mp-1",
    materiaPrimaCodigo: "CH1020",
    materiaPrimaDescricao: "Chapa aço 1020 - acabamento",
    unidadeBase: "kg",
    quantidadeTotal: 19.5678,
    origens: [
      {
        projetoItemId: "item-1",
        produtoRaizId: "produto-1",
        produtoRaizCodigo: "P-001",
        quantidadeSolicitada: 2,
        bomItemId: "bi-1",
        ordem: 1,
        quantidadeLinha: 9.78390001,
        unidadeLinha: "kg",
        quantidadeAcumuladaProduto: 2,
        quantidadeCalculadaOrigem: 19.5678,
        quantidadeConvertida: 19.5678,
        dimensoes: "100x200",
        profundidade: 0,
        caminhoIds: ["produto-1"],
        caminhoCodigos: ["P-001"],
        caminhoBomItemIds: ["bi-1"],
      },
    ],
    ...overrides,
  };
}

function resultadoBase(overrides: Partial<ResultadoListaTecnicaProjeto> = {}): ResultadoListaTecnicaProjeto {
  return {
    estado: "calculado",
    mensagem: null,
    itensAnalisados: [item()],
    materiais: [material()],
    ...overrides,
  };
}

describe("preencherWorkbookListaTecnica", () => {
  it("cria exatamente as 3 abas nos nomes esperados", () => {
    const workbook = new ExcelJS.Workbook();
    preencherWorkbookListaTecnica(workbook, resultadoBase());

    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      "Resumo consolidado",
      "Detalhamento por origem",
      "Itens analisados",
    ]);
  });

  it("Resumo consolidado: uma linha por material, quantidade como número real (sem arredondamento)", () => {
    const workbook = new ExcelJS.Workbook();
    preencherWorkbookListaTecnica(workbook, resultadoBase());

    const resumo = workbook.getWorksheet("Resumo consolidado")!;
    expect(resumo.rowCount).toBe(2); // header + 1 material
    const linha = resumo.getRow(2);
    expect(linha.getCell("codigo").value).toBe("CH1020");
    expect(linha.getCell("descricao").value).toBe("Chapa aço 1020 - acabamento");
    expect(linha.getCell("quantidadeTotal").value).toBe(19.5678);
    expect(typeof linha.getCell("quantidadeTotal").value).toBe("number");
    expect(linha.getCell("unidade").value).toBe("kg");
    expect(resumo.getColumn("quantidadeTotal").numFmt).toBe("#,##0.0000");
  });

  it("Detalhamento por origem: uma linha por origem, com código/descrição da matéria-prima repetidos e todas as quantidades numéricas", () => {
    const workbook = new ExcelJS.Workbook();
    preencherWorkbookListaTecnica(workbook, resultadoBase());

    const detalhamento = workbook.getWorksheet("Detalhamento por origem")!;
    expect(detalhamento.rowCount).toBe(2); // header + 1 origem
    const linha = detalhamento.getRow(2);
    expect(linha.getCell("codigoMateriaPrima").value).toBe("CH1020");
    expect(linha.getCell("descricaoMateriaPrima").value).toBe("Chapa aço 1020 - acabamento");
    expect(linha.getCell("produtoProjeto").value).toBe("P-001");
    expect(linha.getCell("quantidadeSolicitada").value).toBe(2);
    expect(linha.getCell("dimensao").value).toBe("100x200");
    expect(linha.getCell("quantidadeRoteiro").value).toBe(9.78390001);
    expect(typeof linha.getCell("quantidadeRoteiro").value).toBe("number");
    expect(linha.getCell("unidadeRoteiro").value).toBe("kg");
    expect(linha.getCell("multiplicadorAcumulado").value).toBe(2);
    expect(linha.getCell("quantidadeCalculadaOrigem").value).toBe(19.5678);
    expect(linha.getCell("quantidadeConvertida").value).toBe(19.5678);
    expect(linha.getCell("unidadeConsolidada").value).toBe("kg");
    expect(linha.getCell("caminhoCompleto").value).toBe("P-001");
    expect(linha.getCell("idItemProjeto").value).toBe("item-1");

    // ID técnico deve ser a última coluna
    expect(detalhamento.columns.at(-1)?.key).toBe("idItemProjeto");
  });

  it("dimensão nula vira travessão, não célula vazia/undefined", () => {
    const workbook = new ExcelJS.Workbook();
    const materialSemDimensao = material({
      origens: [{ ...material().origens[0], dimensoes: null }],
    });
    preencherWorkbookListaTecnica(workbook, resultadoBase({ materiais: [materialSemDimensao] }));

    const linha = workbook.getWorksheet("Detalhamento por origem")!.getRow(2);
    expect(linha.getCell("dimensao").value).toBe("—");
  });

  it("Itens analisados: lista todo item, inclusive mão de obra pura sem matéria-prima", () => {
    const workbook = new ExcelJS.Workbook();
    const itemMaoDeObra = item({
      projetoItemId: "item-servico",
      produtoRaizCodigo: "SERV-001",
      tipoItem: "servico",
      possuiMateriais: false,
    });
    preencherWorkbookListaTecnica(
      workbook,
      resultadoBase({ itensAnalisados: [item(), itemMaoDeObra], materiais: [] }),
    );

    const itens = workbook.getWorksheet("Itens analisados")!;
    expect(itens.rowCount).toBe(3); // header + 2 itens
    const linhaServico = itens.getRow(3);
    expect(linhaServico.getCell("produto").value).toBe("SERV-001");
    expect(linhaServico.getCell("possuiMateriais").value).toBe("Não");
  });

  it("resultado calculado sem materiais: Resumo e Detalhamento mostram a nota, mas Itens analisados continua populado", () => {
    const workbook = new ExcelJS.Workbook();
    preencherWorkbookListaTecnica(workbook, resultadoBase({ materiais: [] }));

    const resumo = workbook.getWorksheet("Resumo consolidado")!;
    expect(resumo.getRow(2).getCell(1).value).toBe("Nenhuma matéria-prima necessária.");
    expect(resumo.getRow(2).getCell(2).isMerged).toBe(true);

    const detalhamento = workbook.getWorksheet("Detalhamento por origem")!;
    expect(detalhamento.getRow(2).getCell(1).value).toBe("Nenhuma matéria-prima necessária.");
    expect(detalhamento.getRow(2).getCell(2).isMerged).toBe(true);

    const itens = workbook.getWorksheet("Itens analisados")!;
    expect(itens.rowCount).toBe(2); // header + 1 item, mesmo sem materiais
  });

  it("consolida múltiplas origens do mesmo material em linhas separadas na aba Detalhamento", () => {
    const workbook = new ExcelJS.Workbook();
    const materialDuasOrigens = material({
      origens: [
        material().origens[0],
        { ...material().origens[0], bomItemId: "bi-2", produtoRaizCodigo: "P-002", quantidadeConvertida: 5 },
      ],
    });
    preencherWorkbookListaTecnica(workbook, resultadoBase({ materiais: [materialDuasOrigens] }));

    const detalhamento = workbook.getWorksheet("Detalhamento por origem")!;
    expect(detalhamento.rowCount).toBe(3); // header + 2 origens
    expect(detalhamento.getRow(3).getCell("produtoProjeto").value).toBe("P-002");
  });
});
