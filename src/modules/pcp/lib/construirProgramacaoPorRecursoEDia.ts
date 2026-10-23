// PCP-P8I-B5.4 (Etapa 2F): transformação PURA, sem I/O, da programação
// vigente já recuperada por buscarProgramacaoVigentePcp em uma estrutura
// de apresentação organizada por data e recurso produtivo real.
//
// Fonte única de verdade: o objeto ProgramacaoVigentePcp já buscado pelo
// chamador. Esta função nunca consulta banco, nunca recalcula o Motor,
// nunca lê projetos.prioridade de novo - a prioridade usada aqui é
// SEMPRE operacao.prioridadeUsada, exatamente o valor que o Motor usou
// no cálculo persistido (confirmado por leitura de montarEntradaMotorPcp:
// é pcp_fila_projetos.posicao, a posição explícita definida pelo PCP -
// nunca a categoria critica/alta/normal/baixa de projetos.prioridade,
// que é um conceito DIFERENTE e não necessariamente equivalente).
//
// numero_of/numeroOf aparece só como identificação (campo de exibição) -
// nunca participa de nenhuma comparação, ordenação ou decisão aqui.
//
// IMPORTANTE sobre ordenação: a ordem exata em que o Motor processou
// duas OPs no mesmo recurso e mesma data (fila de prontos, greedy,
// ver escalonadorConjunto.ts) não é persistida como um campo próprio -
// só o RESULTADO (quantas horas, em qual natureza) é gravado. A posição
// `ordemApresentacao` calculada aqui é uma ordenação ESTÁVEL DE
// APRESENTAÇÃO (prioridadeUsada, depois opId só para determinismo) -
// nunca deve ser lida ou comunicada como a sequência intra-dia
// oficialmente decidida pelo Motor. Nenhum horário de início/término é
// inventado - essa informação não existe em nenhuma camada do sistema
// hoje (granularidade real é dia × recurso × natureza de capacidade).
import type {
  AlocacaoProgramacaoVigentePcp,
  OperacaoProgramacaoVigentePcp,
  ProgramacaoVigentePcp,
} from "./buscarProgramacaoVigentePcp";

export interface ItemProgramacaoPorRecursoEDia {
  readonly opId: string;
  readonly codigoOperacional: string | null;
  readonly descricaoOperacao: string | null;
  readonly ofId: string;
  readonly numeroOf: string;
  readonly projetoId: string;
  readonly numeroProjeto: string;
  readonly nomeProjeto: string;
  readonly data: string;
  readonly recursoId: string;
  readonly nomeRecurso: string | null;
  readonly natureza: string;
  readonly horasMaquina: number;
  readonly horasPadrao: number;
  readonly statusCalculoMotor: OperacaoProgramacaoVigentePcp["statusCalculoMotor"];
  readonly prioridadeUsada: number;
  /**
   * Posição 1-based dentro do grupo (data, recurso), por ordenação
   * ESTÁVEL DE APRESENTAÇÃO (prioridadeUsada, depois opId) - nunca a
   * sequência intra-dia oficialmente decidida pelo Motor, que não está
   * persistida. Ver comentário do módulo.
   */
  readonly ordemApresentacao: number;
}

export interface GrupoProgramacaoPorRecursoEDia {
  readonly data: string;
  readonly recursoId: string;
  readonly nomeRecurso: string | null;
  readonly itens: readonly ItemProgramacaoPorRecursoEDia[];
}

export interface OperacaoSemAlocacaoProdutiva {
  readonly opId: string;
  readonly codigoOperacional: string | null;
  readonly descricaoOperacao: string | null;
  readonly ofId: string;
  readonly numeroOf: string;
  readonly projetoId: string;
  readonly numeroProjeto: string;
  readonly nomeProjeto: string;
  readonly statusCalculoMotor: OperacaoProgramacaoVigentePcp["statusCalculoMotor"];
  readonly prioridadeUsada: number;
  readonly deficitResidualHorasPadrao: number;
}

export interface ProgramacaoPorRecursoEDia {
  readonly programacaoId: string;
  readonly versaoSequencial: number;
  /** Etapa 2L.1 - propagados sem transformação a partir de ProgramacaoVigentePcp (dado já existente, só não propagado até aqui). */
  readonly nomeEmpresa: string;
  readonly janelaInicio: string;
  readonly janelaFim: string;
  /** Ordenados por data (asc), depois por nomeRecurso/recursoId (asc) - só ordem de listagem dos GRUPOS, nunca da execução. */
  readonly grupos: readonly GrupoProgramacaoPorRecursoEDia[];
  /**
   * OPs sem nenhuma alocação produtiva (bloqueada_por_deficit sem
   * alocações, ou bloqueada_por_predecessora) - preservadas explicitamente,
   * nunca omitidas da apresentação.
   */
  readonly operacoesSemAlocacao: readonly OperacaoSemAlocacaoProdutiva[];
}

function nomeOuNulo(nome: string | null | undefined): string | null {
  return nome && nome.length > 0 ? nome : null;
}

function compararItensParaApresentacao(
  a: { prioridadeUsada: number; opId: string },
  b: { prioridadeUsada: number; opId: string },
): number {
  if (a.prioridadeUsada !== b.prioridadeUsada) return a.prioridadeUsada - b.prioridadeUsada;
  return a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0;
}

/**
 * Transforma a programação vigente (já buscada) em grupos por data e
 * recurso real, com as OPs/alocações correspondentes, e separa OPs sem
 * alocação produtiva (bloqueadas) numa lista própria, sem descartá-las.
 *
 * null de entrada (ausência legítima de programação vigente) devolve
 * null - nunca lança, nunca inventa uma versão vazia.
 */
export function construirProgramacaoPorRecursoEDia(
  programacao: ProgramacaoVigentePcp | null,
): ProgramacaoPorRecursoEDia | null {
  if (programacao === null) return null;

  const gruposPorChave = new Map<string, { data: string; recursoId: string; nomeRecurso: string | null; itens: ItemProgramacaoPorRecursoEDia[] }>();
  const operacoesSemAlocacao: OperacaoSemAlocacaoProdutiva[] = [];

  for (const operacao of programacao.operacoes) {
    if (operacao.alocacoes.length === 0) {
      operacoesSemAlocacao.push({
        opId: operacao.opId,
        codigoOperacional: operacao.codigoOperacional,
        descricaoOperacao: operacao.descricaoOperacao,
        ofId: operacao.ofId,
        numeroOf: operacao.numeroOf,
        projetoId: operacao.projetoId,
        numeroProjeto: operacao.numeroProjeto,
        nomeProjeto: operacao.nomeProjeto,
        statusCalculoMotor: operacao.statusCalculoMotor,
        prioridadeUsada: operacao.prioridadeUsada,
        deficitResidualHorasPadrao: operacao.deficitResidualHorasPadrao,
      });
      continue;
    }

    for (const alocacao of operacao.alocacoes as readonly AlocacaoProgramacaoVigentePcp[]) {
      const chave = `${alocacao.data}__${alocacao.recursoId}`;
      if (!gruposPorChave.has(chave)) {
        gruposPorChave.set(chave, {
          data: alocacao.data,
          recursoId: alocacao.recursoId,
          nomeRecurso: nomeOuNulo(alocacao.nomeRecurso),
          itens: [],
        });
      }

      gruposPorChave.get(chave)!.itens.push({
        opId: operacao.opId,
        codigoOperacional: operacao.codigoOperacional,
        descricaoOperacao: operacao.descricaoOperacao,
        ofId: operacao.ofId,
        numeroOf: operacao.numeroOf,
        projetoId: operacao.projetoId,
        numeroProjeto: operacao.numeroProjeto,
        nomeProjeto: operacao.nomeProjeto,
        data: alocacao.data,
        recursoId: alocacao.recursoId,
        nomeRecurso: nomeOuNulo(alocacao.nomeRecurso),
        natureza: alocacao.natureza,
        horasMaquina: alocacao.horasMaquina,
        horasPadrao: alocacao.horasPadrao,
        statusCalculoMotor: operacao.statusCalculoMotor,
        prioridadeUsada: operacao.prioridadeUsada,
        ordemApresentacao: 0, // atribuída abaixo, depois de ordenar o grupo.
      });
    }
  }

  const grupos: GrupoProgramacaoPorRecursoEDia[] = Array.from(gruposPorChave.values())
    .map((grupo) => {
      const itensOrdenados = [...grupo.itens].sort(compararItensParaApresentacao);
      return {
        data: grupo.data,
        recursoId: grupo.recursoId,
        nomeRecurso: grupo.nomeRecurso,
        itens: itensOrdenados.map((item, index) => ({ ...item, ordemApresentacao: index + 1 })),
      };
    })
    .sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      const nomeA = a.nomeRecurso ?? a.recursoId;
      const nomeB = b.nomeRecurso ?? b.recursoId;
      return nomeA < nomeB ? -1 : nomeA > nomeB ? 1 : 0;
    });

  operacoesSemAlocacao.sort(compararItensParaApresentacao);

  return {
    programacaoId: programacao.programacaoId,
    versaoSequencial: programacao.versaoSequencial,
    nomeEmpresa: programacao.nomeEmpresa,
    janelaInicio: programacao.janelaInicio,
    janelaFim: programacao.janelaFim,
    grupos,
    operacoesSemAlocacao,
  };
}
