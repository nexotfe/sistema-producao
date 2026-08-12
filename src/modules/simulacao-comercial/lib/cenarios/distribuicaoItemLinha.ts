// DEC-007 §11 - Fase 6: representação de UMA linha de
// simulacao_comercial_item_distribuicoes - união discriminada por
// `origem`, espelhando exatamente as CHECK constraints da migration de
// schema (Fase 6), para que código TypeScript nunca consiga acessar um
// campo de capacidade sem antes estreitar o tipo por `origem`.
//
// Três formatos, não dois: a divisão relevante para "tem capacidade
// dia-a-dia" NÃO é a mesma divisão "recurso interno × externo":
// - ORIGINAL/COMPATIBILIDADE (recurso interno): capacidade sempre
//   presente, sem contratacaoId (custo de hora extra em recurso interno
//   é rastreado por DIA, em simulacao_comercial_item_distribuicao_dias -
//   nunca duplicado aqui).
// - RECURSO_TEMPORARIO (externo, mas ainda com capacidade dia-a-dia -
//   compete no escalonador como um candidato comum, produtividade
//   herdada): capacidade presente E contratacaoId presente.
// - TERCEIRIZADO (externo, SEM capacidade dia-a-dia - opera fora do
//   calendário produtivo interno, DEC-007 §10): datas calculadas fixas
//   em vez de capacidade; usar zero em vez de omitir os campos de
//   capacidade seria enganoso (0 = capacidade real nula; aqui o conceito
//   não se aplica).
import { validarDataIso, validarHorasFinitasNaoNegativas, validarProdutividade } from "./validacoes";

export interface CapacidadeDistribuicaoItem {
  capacidadeBrutaPeriodo: number;
  produtividadeConsiderada: number;
  capacidadeEfetiva: number;
  comprometidoInicial: number;
  capacidadeDisponivelInicial: number;
  capacidadeDisponivelAntes: number;
  horasPadraoAlocadas: number;
  horasMaquinaEstimadas: number;
  capacidadeDisponivelDepois: number;
}

export interface DistribuicaoItemInterna extends CapacidadeDistribuicaoItem {
  origem: "ORIGINAL" | "COMPATIBILIDADE";
  recursoId: string;
}

export interface DistribuicaoItemRecursoTemporario extends CapacidadeDistribuicaoItem {
  origem: "RECURSO_TEMPORARIO";
  recursoExternoTipo: "maquina_alugada" | "freelancer";
  recursoExternoNome: string;
  /** Recurso real de referência - produtividade herdada dele (DEC-007 §10), nunca digitada. */
  recursoExternoReferenciaId: string;
  contratacaoId: string;
  custo: number;
}

export interface DistribuicaoItemTerceirizada {
  origem: "TERCEIRIZADO";
  recursoExternoNome: string;
  contratacaoId: string;
  custo: number;
  dataInicioCalculada: string;
  dataFimCalculada: string;
}

export type DistribuicaoItemLinha = DistribuicaoItemInterna | DistribuicaoItemRecursoTemporario | DistribuicaoItemTerceirizada;

function validarCapacidade(c: CapacidadeDistribuicaoItem, rotulo: string): void {
  validarHorasFinitasNaoNegativas(c.capacidadeBrutaPeriodo, `${rotulo}.capacidadeBrutaPeriodo`);
  validarProdutividade(c.produtividadeConsiderada, `${rotulo}.produtividadeConsiderada`);
  validarHorasFinitasNaoNegativas(c.capacidadeEfetiva, `${rotulo}.capacidadeEfetiva`);
  validarHorasFinitasNaoNegativas(c.comprometidoInicial, `${rotulo}.comprometidoInicial`);
  validarHorasFinitasNaoNegativas(c.capacidadeDisponivelInicial, `${rotulo}.capacidadeDisponivelInicial`);
  validarHorasFinitasNaoNegativas(c.capacidadeDisponivelAntes, `${rotulo}.capacidadeDisponivelAntes`);
  if (!Number.isFinite(c.horasPadraoAlocadas) || c.horasPadraoAlocadas <= 0) {
    throw new RangeError(`${rotulo}.horasPadraoAlocadas precisa ser finito e > 0 - recebido: ${c.horasPadraoAlocadas}.`);
  }
  validarHorasFinitasNaoNegativas(c.horasMaquinaEstimadas, `${rotulo}.horasMaquinaEstimadas`);
  validarHorasFinitasNaoNegativas(c.capacidadeDisponivelDepois, `${rotulo}.capacidadeDisponivelDepois`);
}

function validarCusto(custo: number, rotulo: string): void {
  if (!Number.isFinite(custo) || custo < 0) {
    throw new RangeError(`${rotulo} precisa ser finito e não negativo - recebido: ${custo}.`);
  }
}

/**
 * Validação defensiva de UMA linha - mesmas invariantes da CHECK da
 * migration de schema (Fase 6), verificadas aqui ANTES de montar o
 * payload para a RPC de aprovação (mesmo espírito de todo o resto deste
 * conjunto: validar em TypeScript primeiro, banco como defesa em
 * profundidade, nunca o único lugar que valida).
 */
export function validarDistribuicaoItemLinha(linha: DistribuicaoItemLinha): void {
  switch (linha.origem) {
    case "ORIGINAL":
    case "COMPATIBILIDADE":
      validarCapacidade(linha, `DistribuicaoItemLinha(${linha.origem})`);
      return;
    case "RECURSO_TEMPORARIO":
      validarCapacidade(linha, "DistribuicaoItemLinha(RECURSO_TEMPORARIO)");
      validarCusto(linha.custo, "DistribuicaoItemLinha(RECURSO_TEMPORARIO).custo");
      return;
    case "TERCEIRIZADO":
      validarCusto(linha.custo, "DistribuicaoItemLinha(TERCEIRIZADO).custo");
      validarDataIso(linha.dataInicioCalculada, "DistribuicaoItemLinha(TERCEIRIZADO).dataInicioCalculada");
      validarDataIso(linha.dataFimCalculada, "DistribuicaoItemLinha(TERCEIRIZADO).dataFimCalculada");
      if (linha.dataFimCalculada < linha.dataInicioCalculada) {
        throw new RangeError(
          `DistribuicaoItemLinha(TERCEIRIZADO): dataFimCalculada ("${linha.dataFimCalculada}") não pode ser anterior a dataInicioCalculada ("${linha.dataInicioCalculada}").`,
        );
      }
      return;
    default: {
      const _exaustivo: never = linha;
      throw new RangeError(`DistribuicaoItemLinha: origem desconhecida - "${(_exaustivo as { origem: string }).origem}".`);
    }
  }
}

/**
 * Linha de `simulacao_comercial_item_distribuicao_dias` (DEC-007 §11) -
 * `contratacaoId` por DIA (não só na distribuição pai), espelhando
 * exatamente a invariante já validada em alocarOperacaoDiaAdia.ts
 * (validarFaixasDoDia, Fase 0): natureza="normal" ⟺ contratacaoId nulo.
 * Rastreia hora extra/fim de semana em recurso INTERNO por data
 * específica - o contratacaoId da distribuição pai representa o contrato
 * PRINCIPAL (recurso temporário/terceirização), nunca duplicado aqui sem
 * necessidade.
 */
export interface DistribuicaoDiaLinha {
  data: string;
  horasMaquina: number;
  horasPadrao: number;
  natureza: "normal" | "hora_extra" | "sabado" | "domingo" | "feriado";
  /** Não-nulo sse natureza !== "normal" - todo contratacaoId aqui precisa existir em ajuste_cenario.contratacoes (validado autoritativamente pela RPC v6, Fase 9 - não checável neste módulo puro nem por CHECK de banco, que não enxerga outra linha/coluna jsonb do pai). */
  contratacaoId: string | null;
}

export function validarDistribuicaoDiaLinha(linha: DistribuicaoDiaLinha): void {
  validarDataIso(linha.data, "DistribuicaoDiaLinha.data");
  if (!Number.isFinite(linha.horasMaquina) || linha.horasMaquina <= 0) {
    throw new RangeError(`DistribuicaoDiaLinha.horasMaquina precisa ser finito e > 0 - recebido: ${linha.horasMaquina}.`);
  }
  if (!Number.isFinite(linha.horasPadrao) || linha.horasPadrao <= 0) {
    throw new RangeError(`DistribuicaoDiaLinha.horasPadrao precisa ser finito e > 0 - recebido: ${linha.horasPadrao}.`);
  }
  if (linha.natureza === "normal") {
    if (linha.contratacaoId !== null) {
      throw new RangeError('DistribuicaoDiaLinha: natureza="normal" precisa ter contratacaoId nulo.');
    }
  } else if (linha.contratacaoId === null) {
    throw new RangeError(`DistribuicaoDiaLinha: natureza="${linha.natureza}" precisa ter contratacaoId preenchido.`);
  }
}
