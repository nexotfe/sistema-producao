// Documento canônico da "base técnica" de um projeto - entrada de
// calcularHashAssinaturaTecnica.ts. Puro (sem I/O): quem monta os dados
// de entrada é buscarDadosAssinaturaTecnica.ts (impuro), nunca esta
// função - mesma separação "motor sem I/O, decisões resolvidas pelo
// chamador" já usada no resto do projeto.
//
// Regras de canonicalização (decisão do usuário, 2026-08-22):
// - todo decimal passa por normalizarDecimalCanonico (nunca number bruto
//   - evita ponto flutuante divergir entre navegador/servidor/duas
//   leituras do mesmo valor numeric do Postgres);
// - toda ordenação tem desempate final por ID (nunca depende de ordem
//   de retorno do banco);
// - todo campo ausente vira null explícito, nunca chave omitida;
// - versao:1 dentro do próprio documento (não como prefixo do hash -
//   o hash armazenado fica hex puro, mais fácil de validar por
//   constraint).
//
// Deliberadamente EXCLUÍDO (decisão do usuário): comprometidoInicialPorRecurso
// (reservas de OUTROS projetos - ambiente operacional variável, nunca
// "a base técnica deste projeto mudou"). capacidadeDiariaPorRecurso
// ENTRA (propriedade do próprio recurso, não de terceiros).
import type { BaseCenarios } from "./carregarBaseCenarios";
import { chaveOcorrenciaParaString } from "./chaveOcorrencia";
import type { ContextoCalendario } from "@/modules/calendario/lib/contextoCalendario";
import type { NoArvoreCustos } from "./coletarArvoreCustosBom";
import { normalizarDecimalCanonico } from "./normalizarDecimalCanonico";

export interface ItemParaAssinatura {
  projetoItemId: string;
  produtoId: string;
  quantidade: string;
  custoEditadoManualmente: boolean;
  /** Valor manual congelado, quando custoEditadoManualmente=true; null caso contrário. */
  custoManualValor: string | null;
  /** null quando custoEditadoManualmente=true (a árvore por baixo do manual não é rastreada) ou quando o produto não tem BOM. */
  arvoreCustos: NoArvoreCustos | null;
}

export interface DadosAssinaturaTecnica {
  projetoId: string;
  empresaId: string;
  /** Início/fim da janela produtiva REAL avaliada pelo motor - vem do snapshot do cenário (disponibilidadeMaterial.original / saidaPrevisaoComercial.primeiraEntregaPossivel), nunca reconstruída. */
  janela: { inicio: string; fim: string };
  itens: ItemParaAssinatura[];
  base: Pick<
    BaseCenarios,
    | "ocorrencias"
    | "dependencias"
    | "recursoIds"
    | "compatibilidades"
    | "capacidadeDiariaPorRecurso"
    | "valorHoraPorRecurso"
    | "convencoesHorasAdicionais"
    | "restricaoMaterialPorChave"
  >;
  calendario: Pick<ContextoCalendario, "padraoSemanal" | "feriadosPorData" | "eventosPorData">;
}

export interface DocumentoAssinaturaTecnica {
  versao: 1;
  projetoId: string;
  empresaId: string;
  janela: { inicio: string; fim: string };
  itens: {
    projetoItemId: string;
    produtoId: string;
    quantidade: string;
    custoEditadoManualmente: boolean;
    custoManualValor: string | null;
    arvoreCustos: DocumentoNoArvoreCustos | null;
  }[];
  ocorrencias: {
    chave: string;
    bomOperacaoId: string;
    bomId: string;
    necessarioHorasPadrao: string;
    recursoOriginalId: string;
  }[];
  dependencias: { predecessora: string; sucessora: string; tipo: string }[];
  recursos: {
    recursoId: string;
    valorHora: string | null;
    capacidadeDiaria: string | null;
    compatibilidades: { recursoId: string; prioridade: number }[];
  }[];
  convencoesHorasAdicionais: {
    percentualSegundaSexta: string;
    percentualSabado: string;
    percentualDomingo: string;
    percentualFeriado: string;
    vigenteDesde: string;
    vigenteAte: string | null;
  }[];
  restricaoMaterialPorChave: { chave: string; data: string }[];
  calendario: {
    padraoSemanal: {
      segunda: boolean;
      terca: boolean;
      quarta: boolean;
      quinta: boolean;
      sexta: boolean;
      sabado: boolean;
      domingo: boolean;
    } | null;
    feriadosOficiais: { id: string; data: string; abrangencia: string; ufCodigo: string | null; municipioCodigo: string | null }[];
    eventosEmpresa: { id: string; data: string; tipo: string }[];
  };
}

interface DocumentoNoArvoreCustos {
  bomId: string;
  bomVersao: string;
  materiais: { bomItemId: string; materiaPrimaId: string; quantidade: string; unidade: string; custoReferencia: string | null }[];
  subconjuntos: { bomItemId: string; quantidade: string; no: DocumentoNoArvoreCustos }[];
  terceiros: { id: string; ordem: number; custoEstimado: string }[];
  transportes: { id: string; ordem: number; custoEstimado: string }[];
}

function canonicalizarArvoreCustos(no: NoArvoreCustos): DocumentoNoArvoreCustos {
  return {
    bomId: no.bomId,
    bomVersao: no.bomVersao,
    materiais: [...no.materiais]
      .sort((a, b) => a.bomItemId.localeCompare(b.bomItemId))
      .map((item) => ({
        bomItemId: item.bomItemId,
        materiaPrimaId: item.materiaPrimaId,
        quantidade: normalizarDecimalCanonico(item.quantidade),
        unidade: item.unidade,
        custoReferencia: item.custoReferencia === null ? null : normalizarDecimalCanonico(item.custoReferencia),
      })),
    subconjuntos: [...no.subconjuntos]
      .sort((a, b) => a.bomItemId.localeCompare(b.bomItemId))
      .map((sub) => ({
        bomItemId: sub.bomItemId,
        quantidade: normalizarDecimalCanonico(sub.quantidade),
        no: canonicalizarArvoreCustos(sub.no),
      })),
    terceiros: [...no.terceiros]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((t) => ({ id: t.id, ordem: t.ordem, custoEstimado: normalizarDecimalCanonico(t.custoEstimado) })),
    transportes: [...no.transportes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((t) => ({ id: t.id, ordem: t.ordem, custoEstimado: normalizarDecimalCanonico(t.custoEstimado) })),
  };
}

export function construirDocumentoAssinaturaTecnica(
  dados: DadosAssinaturaTecnica,
): DocumentoAssinaturaTecnica {
  const itens = [...dados.itens]
    .sort((a, b) => a.projetoItemId.localeCompare(b.projetoItemId))
    .map((item) => ({
      projetoItemId: item.projetoItemId,
      produtoId: item.produtoId,
      quantidade: normalizarDecimalCanonico(item.quantidade),
      custoEditadoManualmente: item.custoEditadoManualmente,
      custoManualValor: item.custoManualValor === null ? null : normalizarDecimalCanonico(item.custoManualValor),
      arvoreCustos: item.arvoreCustos === null ? null : canonicalizarArvoreCustos(item.arvoreCustos),
    }));

  const ocorrencias = [...dados.base.ocorrencias]
    .map((o) => ({
      chave: chaveOcorrenciaParaString(o.ocorrencia.chave),
      bomOperacaoId: o.ocorrencia.bomOperacaoId,
      bomId: o.ocorrencia.bomId,
      necessarioHorasPadrao: normalizarDecimalCanonico(o.necessarioHorasPadrao),
      recursoOriginalId: o.recursoOriginalId,
    }))
    .sort((a, b) => a.chave.localeCompare(b.chave) || a.bomOperacaoId.localeCompare(b.bomOperacaoId));

  const dependencias = [...dados.base.dependencias]
    .map((d) => ({
      predecessora: chaveOcorrenciaParaString(d.predecessora),
      sucessora: chaveOcorrenciaParaString(d.sucessora),
      tipo: d.tipo,
    }))
    .sort(
      (a, b) =>
        a.predecessora.localeCompare(b.predecessora) ||
        a.sucessora.localeCompare(b.sucessora) ||
        a.tipo.localeCompare(b.tipo),
    );

  const recursos = [...dados.base.recursoIds]
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((recursoId) => ({
      recursoId,
      valorHora:
        dados.base.valorHoraPorRecurso[recursoId] === undefined
          ? null
          : normalizarDecimalCanonico(dados.base.valorHoraPorRecurso[recursoId]),
      capacidadeDiaria:
        dados.base.capacidadeDiariaPorRecurso[recursoId] === undefined
          ? null
          : normalizarDecimalCanonico(dados.base.capacidadeDiariaPorRecurso[recursoId]),
      compatibilidades: [...(dados.base.compatibilidades[recursoId] ?? [])]
        .map((c) => ({ recursoId: c.recursoId, prioridade: c.prioridade }))
        .sort((a, b) => a.recursoId.localeCompare(b.recursoId)),
    }));

  const convencoesHorasAdicionais = [...dados.base.convencoesHorasAdicionais]
    .map((c) => ({
      percentualSegundaSexta: normalizarDecimalCanonico(c.percentualSegundaSexta),
      percentualSabado: normalizarDecimalCanonico(c.percentualSabado),
      percentualDomingo: normalizarDecimalCanonico(c.percentualDomingo),
      percentualFeriado: normalizarDecimalCanonico(c.percentualFeriado),
      vigenteDesde: c.vigenteDesde,
      vigenteAte: c.vigenteAte,
    }))
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde) || (a.vigenteAte ?? "").localeCompare(b.vigenteAte ?? ""));

  const restricaoMaterialPorChave = Object.entries(dados.base.restricaoMaterialPorChave)
    .map(([chave, data]) => ({ chave, data }))
    .sort((a, b) => a.chave.localeCompare(b.chave));

  const feriadosOficiais = Array.from(dados.calendario.feriadosPorData.values())
    .flat()
    .map((f) => ({
      id: f.id,
      data: f.data,
      abrangencia: f.abrangencia,
      ufCodigo: f.uf_codigo,
      municipioCodigo: f.municipio_codigo,
    }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

  const eventosEmpresa = Array.from(dados.calendario.eventosPorData.values())
    .flat()
    .map((e) => ({ id: e.id, data: e.data, tipo: e.tipo }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

  return {
    versao: 1,
    projetoId: dados.projetoId,
    empresaId: dados.empresaId,
    janela: { inicio: dados.janela.inicio, fim: dados.janela.fim },
    itens,
    ocorrencias,
    dependencias,
    recursos,
    convencoesHorasAdicionais,
    restricaoMaterialPorChave,
    calendario: {
      padraoSemanal: dados.calendario.padraoSemanal ?? null,
      feriadosOficiais,
      eventosEmpresa,
    },
  };
}
