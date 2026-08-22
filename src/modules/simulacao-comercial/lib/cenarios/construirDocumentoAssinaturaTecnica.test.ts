import { describe, expect, it } from "vitest";
import {
  construirDocumentoAssinaturaTecnica,
  type DadosAssinaturaTecnica,
} from "./construirDocumentoAssinaturaTecnica";
import { calcularHashAssinaturaTecnica } from "./calcularHashAssinaturaTecnica";
import type { NoArvoreCustos } from "./coletarArvoreCustosBom";

function arvoreBase(): NoArvoreCustos {
  return {
    bomId: "bom-1",
    bomVersao: "A",
    materiais: [{ bomItemId: "item-mp-1", materiaPrimaId: "mp-1", quantidade: "2", unidade: "kg", custoReferencia: "10.50" }],
    subconjuntos: [],
    terceiros: [{ id: "terceiro-1", ordem: 1, custoEstimado: "100" }],
    transportes: [{ id: "transporte-1", ordem: 1, custoEstimado: "50" }],
  };
}

function dadosBase(): DadosAssinaturaTecnica {
  return {
    projetoId: "projeto-1",
    empresaId: "empresa-1",
    janela: { inicio: "2026-08-01", fim: "2026-08-20" },
    itens: [
      {
        projetoItemId: "item-1",
        produtoId: "produto-1",
        quantidade: "1",
        custoEditadoManualmente: false,
        custoManualValor: null,
        arvoreCustos: arvoreBase(),
      },
    ],
    base: {
      ocorrencias: [
        {
          ocorrencia: {
            chave: { projetoItemId: "item-1", produtoRaizId: "produto-1", caminhoBomItemIds: [], bomOperacaoId: "op-1" },
            bomOperacaoId: "op-1",
            bomId: "bom-1",
          },
          necessarioHorasPadrao: 10,
          recursoOriginalId: "recurso-A",
        },
      ],
      dependencias: [],
      recursoIds: ["recurso-A"],
      compatibilidades: { "recurso-A": [{ recursoId: "recurso-B", prioridade: 1 }] },
      capacidadeDiariaPorRecurso: { "recurso-A": 8 },
      valorHoraPorRecurso: { "recurso-A": 25.5 },
      convencoesHorasAdicionais: [
        {
          percentualSegundaSexta: 0.5,
          percentualSabado: 1,
          percentualDomingo: 1,
          percentualFeriado: 1,
          vigenteDesde: "2026-01-01",
          vigenteAte: null,
        },
      ],
      restricaoMaterialPorChave: { "item-1::produto-1::::op-1": "2026-08-01" },
    },
    calendario: {
      padraoSemanal: { segunda: true, terca: true, quarta: true, quinta: true, sexta: true, sabado: false, domingo: false },
      feriadosPorData: new Map([
        ["2026-08-10", [{ id: "feriado-1", data: "2026-08-10", abrangencia: "nacional" as const, uf_codigo: null, municipio_codigo: null, descricao: "Feriado" }]],
      ]),
      eventosPorData: new Map([
        ["2026-08-15", [{ id: "evento-1", data: "2026-08-15", tipo: "paralisacao" }]],
      ]),
    },
  };
}

async function hashDe(dados: DadosAssinaturaTecnica): Promise<string> {
  return calcularHashAssinaturaTecnica(construirDocumentoAssinaturaTecnica(dados));
}

describe("calcularHashAssinaturaTecnica - determinismo isomórfico", () => {
  it("o mesmo documento produz sempre o mesmo hash (chamado duas vezes)", async () => {
    const documento = construirDocumentoAssinaturaTecnica(dadosBase());
    const hash1 = await calcularHashAssinaturaTecnica(documento);
    const hash2 = await calcularHashAssinaturaTecnica(documento);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ordem de inserção diferente nos dados brutos produz o mesmo documento/hash (canonicalização ordena)", async () => {
    const dados = dadosBase();
    dados.itens.push({
      projetoItemId: "item-0",
      produtoId: "produto-0",
      quantidade: "1",
      custoEditadoManualmente: true,
      custoManualValor: "999",
      arvoreCustos: null,
    });

    const dadosInvertido = { ...dados, itens: [...dados.itens].reverse() };

    expect(await hashDe(dados)).toBe(await hashDe(dadosInvertido));
  });
});

describe("construirDocumentoAssinaturaTecnica - cada categoria muda o hash isoladamente", () => {
  it("quantidade de item", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.itens[0].quantidade = "2";
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });

  it("tempo/sequência de operação (necessarioHorasPadrao)", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.base.ocorrencias[0].necessarioHorasPadrao = 12;
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });

  it("recurso/valor-hora", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.base.valorHoraPorRecurso["recurso-A"] = 30;
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });

  it("matéria-prima (custo_referencia)", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.itens[0].arvoreCustos!.materiais[0].custoReferencia = "99.99";
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });

  it("terceirização", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.itens[0].arvoreCustos!.terceiros[0].custoEstimado = "200";
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });

  it("transporte/logística", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.itens[0].arvoreCustos!.transportes[0].custoEstimado = "75";
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });

  it("compatibilidade entre recursos", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.base.compatibilidades["recurso-A"] = [{ recursoId: "recurso-C", prioridade: 1 }];
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });

  it("convenção de horas adicionais", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.base.convencoesHorasAdicionais[0].percentualSabado = 2;
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });

  it("custo editado manualmente", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.itens[0].custoEditadoManualmente = true;
    alterado.itens[0].custoManualValor = "500";
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });

  it("padrão semanal (calendário operacional)", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.calendario.padraoSemanal!.sabado = true;
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });

  it("feriado DENTRO da janela muda o hash", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.calendario.feriadosPorData.set("2026-08-12", [
      { id: "feriado-novo", data: "2026-08-12", abrangencia: "nacional", uf_codigo: null, municipio_codigo: null, descricao: "Novo" },
    ]);
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });

  it("evento DENTRO da janela muda o hash", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.calendario.eventosPorData.set("2026-08-16", [{ id: "evento-novo", data: "2026-08-16", tipo: "recesso_coletivo" }]);
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });

  it("item/produto novo no projeto muda o hash", async () => {
    const base = dadosBase();
    const alterado = dadosBase();
    alterado.itens.push({
      projetoItemId: "item-2",
      produtoId: "produto-2",
      quantidade: "1",
      custoEditadoManualmente: false,
      custoManualValor: null,
      arvoreCustos: null,
    });
    expect(await hashDe(base)).not.toBe(await hashDe(alterado));
  });
});

describe("construirDocumentoAssinaturaTecnica - janela entra como metadado, filtragem é responsabilidade de quem busca os dados", () => {
  it("mudar só os limites de `janela` (sem tocar no calendário recebido) muda o hash - janela é parte assinada do documento", async () => {
    const base = dadosBase();
    const comOutraJanela = dadosBase();
    comOutraJanela.janela = { inicio: "2026-08-01", fim: "2026-08-05" };
    expect(await hashDe(base)).not.toBe(await hashDe(comOutraJanela));
  });

  it("este módulo não filtra calendário por conta própria - o conteúdo do Map recebido é o que entra no documento (filtragem real é de buscarDadosAssinaturaTecnica.ts, testada lá com a janela do 260007/entrega antecipada)", async () => {
    const comFeriado = dadosBase();
    const semFeriado = dadosBase();
    semFeriado.calendario.feriadosPorData = new Map();
    expect(await hashDe(comFeriado)).not.toBe(await hashDe(semFeriado));
  });
});
