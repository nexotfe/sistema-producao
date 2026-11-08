// PCP — Etapa 51: interpretação do prazo de UMA OF a partir dos
// resultados já calculados e persistidos pelo Motor (pcp_programacoes /
// pcp_programacao_operacoes). Função pura, sem I/O, sem leitura de
// relógio (recebe `hoje` do chamador) — nunca duplica o cálculo de
// capacidade/alocações/dependências: só reaproveita
// decidirDesatualizacaoProgramacaoPcp, classificarDeficitOperacaoPcp e
// calcularTerminoOperacoesProgramadasPcp, já existentes e testados.
//
// Não decide ainda verde/amarelo/vermelho (Etapa 51 não autoriza) — só
// devolve um estado tipado, preservando os motivos técnicos de cada
// operação, para uma etapa futura decidir a cor com base nisso.
import {
  calcularTerminoOperacoesProgramadasPcp,
  type OperacaoParaAgregacaoPcp,
} from "./calcularTerminoIntegralProjetoPcp";
import {
  classificarDeficitOperacaoPcp,
  type ClassificacaoDeficitOperacaoPcp,
  type StatusOperacaoPcp,
} from "./classificarDeficitOperacaoPcp";
import { decidirDesatualizacaoProgramacaoPcp } from "./decidirDesatualizacaoProgramacaoPcp";

export interface OperacaoProgramadaPcp {
  readonly ofId: string;
  readonly opId: string;
  readonly status: StatusOperacaoPcp;
  readonly dataFimPrevista: string | null;
  readonly deficitResidual: number;
  readonly alocacoesLength: number;
}

export interface ProgramacaoVigenteParaPrazoPcp {
  readonly empresaCapacidadeVersaoOrigem: number;
  readonly versaoCapacidadeAtual: number;
  /** ISO YYYY-MM-DD — início/fim do horizonte que o Motor efetivamente calculou. */
  readonly janelaInicio: string;
  readonly janelaFim: string;
  /** Todas as operações da programação vigente — de todas as OFs, não só desta. O filtro por OF é feito aqui dentro. */
  readonly operacoes: readonly OperacaoProgramadaPcp[];
}

export interface OperacaoAvaliadaOfPcp {
  readonly opId: string;
  readonly classificacao: ClassificacaoDeficitOperacaoPcp;
  readonly dataFimPrevista: string | null;
}

// Etapa 53A — motivo da OF não ter nenhuma operação APLICÁVEL (nunca
// confundido com "todas resolvidas": aqui nenhum trabalho real foi
// concluído, simplesmente não existe ou nunca contou).
export type MotivoSemOperacaoAplicavelPcp = "sem_operacoes_cadastradas" | "somente_nao_aplicaveis";

export type InterpretacaoPrazoOfPcp =
  // A OF não tem nenhuma operação aplicável - nunca prova automática de conclusão (Etapa 53A, seção 2):
  // `motivo` preserva se nunca existiu nenhuma operação cadastrada ou se só existem não aplicáveis.
  | { readonly estado: "sem_operacoes_aplicaveis"; readonly motivo: MotivoSemOperacaoAplicavelPcp }
  // Todas as operações aplicáveis da OF já foram resolvidas de verdade (apontamento real de
  // 'finalizar', via a RPC oficial ops_resolvidas) - nunca depende de programação vigente para ser
  // reconhecido (Etapa 53A, seção 4). NÃO significa encerramento administrativo da OF (seção 5) -
  // estado_execucao/estado_aprovacao continuam fontes totalmente independentes, nunca lidas aqui.
  | { readonly estado: "todas_operacoes_resolvidas" }
  // Nenhuma programação vigente encontrada para a empresa (nunca calculada, ou nenhuma marcada vigente=true).
  | { readonly estado: "programacao_inexistente" }
  // Entrada relevante mudou (Y, dependências, fila, apontamentos) depois do cálculo — ver decidirDesatualizacaoProgramacaoPcp.
  | { readonly estado: "programacao_desatualizada" }
  // Versão de capacidade bate, mas o horizonte calculado já terminou (hoje > janelaFim) — não é "programação inválida"
  // em geral (pode continuar sendo histórico legítimo), só não serve como evidência de prazo prospectivo.
  | { readonly estado: "janela_incompativel_com_avaliacao" }
  // A OF tem operações necessárias que não aparecem no conjunto calculado (ainda não incluídas na programação vigente).
  | { readonly estado: "cobertura_insuficiente"; readonly opsAusentes: readonly string[] }
  // Pelo menos uma operação não está 'concluida' (bloqueada por déficit, por predecessora, ou déficit sem alocação
  // indistinguível) — o motivo técnico exato de CADA operação fica preservado em `operacoes`, nunca colapsado em um só.
  | { readonly estado: "operacoes_impedidas"; readonly operacoes: readonly OperacaoAvaliadaOfPcp[] }
  // Todas as operações necessárias estão 'concluida' (no sentido do Motor: com previsão calculada) — término é o
  // mais tardio entre elas (calcularTerminoOperacoesProgramadasPcp), respeitando paralelismo/dependências por construção
  // (o Motor já resolveu isso ao gerar dataFimPrevista de cada operação).
  | { readonly estado: "previsao_disponivel"; readonly terminoPrevisto: string | null; readonly operacoes: readonly OperacaoAvaliadaOfPcp[] };

export function classificarPrazoOfPcp(params: {
  readonly ofId: string;
  /** ids das operações aplicáveis (nao_aplicavel=false) e ainda PENDENTES (não resolvidas) desta OF. */
  readonly opsNecessariasDaOf: readonly string[];
  /** true se a OF tem ao menos 1 operação com nao_aplicavel=true (distingue "nunca teve operação" de "só tem não aplicável" - Etapa 53A, seção 2). */
  readonly existemOperacoesNaoAplicaveis: boolean;
  /** true se ao menos 1 operação aplicável desta OF já foi resolvida de verdade (ops_resolvidas). */
  readonly existemOperacoesResolvidas: boolean;
  readonly programacaoVigente: ProgramacaoVigenteParaPrazoPcp | null;
  /** ISO YYYY-MM-DD — "hoje" segundo o chamador; esta função nunca lê o relógio. */
  readonly hoje: string;
}): InterpretacaoPrazoOfPcp {
  const { ofId, opsNecessariasDaOf, existemOperacoesNaoAplicaveis, existemOperacoesResolvidas, programacaoVigente, hoje } = params;

  // Nenhuma operação aplicável PENDENTE - checado ANTES de qualquer coisa relacionada à
  // programação do Motor (Etapa 53A, seção 4): se não há trabalho pendente, a programação é
  // irrelevante para esta OF, nunca uma condição para reconhecer isso. Um conjunto vazio nunca é
  // prova automática de conclusão (seção 2) - por isso a origem exata é sempre preservada.
  if (opsNecessariasDaOf.length === 0) {
    if (existemOperacoesResolvidas) {
      return { estado: "todas_operacoes_resolvidas" };
    }
    if (existemOperacoesNaoAplicaveis) {
      return { estado: "sem_operacoes_aplicaveis", motivo: "somente_nao_aplicaveis" };
    }
    return { estado: "sem_operacoes_aplicaveis", motivo: "sem_operacoes_cadastradas" };
  }

  if (programacaoVigente === null) {
    return { estado: "programacao_inexistente" };
  }

  const desatualizacao = decidirDesatualizacaoProgramacaoPcp({
    versaoOrigem: programacaoVigente.empresaCapacidadeVersaoOrigem,
    versaoAtual: programacaoVigente.versaoCapacidadeAtual,
  });
  if (desatualizacao === "vigente_desatualizada") {
    return { estado: "programacao_desatualizada" };
  }

  // Janela encerrada (hoje > janelaFim): não invalida a programação em
  // si (pode continuar sendo histórico legítimo - ver comentário do
  // tipo), só não pode alimentar uma avaliação prospectiva de prazo.
  if (hoje > programacaoVigente.janelaFim) {
    return { estado: "janela_incompativel_com_avaliacao" };
  }

  const operacoesDaOf = programacaoVigente.operacoes.filter((o) => o.ofId === ofId);
  const opIdsPresentes = new Set(operacoesDaOf.map((o) => o.opId));
  const opsAusentes = opsNecessariasDaOf.filter((opId) => !opIdsPresentes.has(opId));
  if (opsAusentes.length > 0) {
    return { estado: "cobertura_insuficiente", opsAusentes };
  }

  const operacoesAvaliadas: OperacaoAvaliadaOfPcp[] = operacoesDaOf.map((o) => ({
    opId: o.opId,
    classificacao: classificarDeficitOperacaoPcp({
      status: o.status,
      alocacoesLength: o.alocacoesLength,
      deficitResidual: o.deficitResidual,
    }),
    dataFimPrevista: o.dataFimPrevista,
  }));

  const haImpedimento = operacoesAvaliadas.some((o) => o.classificacao !== "sem_deficit");
  if (haImpedimento) {
    return { estado: "operacoes_impedidas", operacoes: operacoesAvaliadas };
  }

  const operacoesParaAgregacao: OperacaoParaAgregacaoPcp[] = operacoesDaOf.map((o) => ({
    ofId: o.ofId,
    opId: o.opId,
    status: o.status,
    dataFimPrevista: o.dataFimPrevista,
  }));
  const terminoPrevisto = calcularTerminoOperacoesProgramadasPcp(operacoesParaAgregacao);
  return { estado: "previsao_disponivel", terminoPrevisto, operacoes: operacoesAvaliadas };
}
