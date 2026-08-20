// DEC-007 §6.2/Fase 8b (redesenho: regras semanais compactas) - expande
// uma regra semanal compacta ("segunda a sexta, 2h/dia", "sábado,
// 8,8h/dia") nas datas civis concretas dentro de um período, sem exigir
// preenchimento célula-a-célula. Substitui a grade recursos×datas -
// única fronteira de expansão para o motor (o resultado ainda vira
// CapacidadeExtraDia[]/DisponibilidadeDiaRecursoTemporario[] através de
// funções específicas, nunca uma fórmula de capacidade nova aqui).
//
// Permanece GENÉRICA (aceita qualquer [dataInicio, dataFim], podendo
// cruzar várias semanas) porque tem 2 consumidores com necessidades
// DIFERENTES: recurso temporário (disponibilidade por um período
// completo, várias semanas, deliberado) e regra de hora adicional de
// recurso interno (uma ÚNICA semana - ver `calcularJanelaEfetivaSemana`
// abaixo). A restrição "só 1 semana, nunca repete" é responsabilidade do
// CHAMADOR (construirDecisoesCapacidadeExtraDeRegras.ts/
// JanelaCapacidadeRecursos.tsx), que já calcula o [dataInicio, dataFim]
// de exatamente 7 dias (clampado à janela do cenário) antes de chamar
// esta função - nunca uma segunda regra de expansão aqui.
//
// Seleção por NATUREZA alvo, não por número de dia da semana bruto: uma
// data só entra na expansão se a natureza REALMENTE resolvida para ela
// (via `resolverNatureza`, que já aplica a precedência de feriado sobre
// dia da semana - derivarNaturezaDia.ts, inalterado) bater com um dos
// alvos marcados. Isso é o que garante, estruturalmente, que "feriado
// prevalece sobre a classificação normal do dia da semana" (regra
// explícita do usuário): uma quarta-feira que é feriado nunca é
// varrida por uma regra "segunda a sexta" (que só aceita natureza
// "normal") - só entra se o próprio alvo "feriado" estiver marcado.
import { diaDaSemanaCivil, type NaturezaDia } from "./derivarNaturezaDia";
import { validarDataIso } from "./validacoes";

/** 1=segunda .. 5=sexta (ISO-like, nunca 0/6 - sábado/domingo são alvos próprios, não dias úteis). */
export type DiaUtilSemana = 1 | 2 | 3 | 4 | 5;

export interface DiasRegraSemanal {
  /** Dias úteis em que a regra se aplica - só quando a data resolve para natureza="normal" (não é feriado). */
  diasUteis: readonly DiaUtilSemana[];
  /** Aplica em sábados que resolvem para natureza="sabado" (um sábado que é feriado não entra aqui). */
  sabado: boolean;
  /** Aplica em domingos que resolvem para natureza="domingo". */
  domingo: boolean;
  /** Aplica em QUALQUER data que resolva para natureza="feriado", independente do dia da semana em que caia. */
  feriado: boolean;
}

export interface DataExpandidaRegraSemanal {
  data: string;
  horas: number;
  natureza: NaturezaDia;
}

const DIAS_UTEIS_VALIDOS = new Set<DiaUtilSemana>([1, 2, 3, 4, 5]);

function somarDiasCivis(data: string, quantidade: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + quantidade)).toISOString().slice(0, 10);
}

function alvoBateComNatureza(dias: DiasRegraSemanal, natureza: NaturezaDia, diaSemana: number): boolean {
  switch (natureza) {
    case "normal":
      return dias.diasUteis.includes(diaSemana as DiaUtilSemana);
    case "sabado":
      return dias.sabado;
    case "domingo":
      return dias.domingo;
    case "feriado":
      return dias.feriado;
  }
}

/** Último dia (domingo) da semana que começa em `semanaInicio` - sempre exatamente 6 dias depois, nunca configurável separadamente. */
export function calcularSemanaFim(semanaInicio: string): string {
  validarDataIso(semanaInicio, "semanaInicio");
  return somarDiasCivis(semanaInicio, 6);
}

/**
 * Segunda-feira da semana civil que contém `dataIso` - usada para
 * "ancorar" qualquer data escolhida pelo usuário na segunda-feira da sua
 * semana (o usuário pode clicar em qualquer dia da semana desejada, o
 * sistema sempre resolve para a segunda).
 */
export function segundaDaSemana(dataIso: string): string {
  validarDataIso(dataIso, "dataIso");
  const diaSemana = diaDaSemanaCivil(dataIso);
  const deslocamento = diaSemana === 0 ? 6 : diaSemana - 1;
  return somarDiasCivis(dataIso, -deslocamento);
}

/**
 * Interseção entre a semana [semanaInicio, semanaInicio+6] de UMA regra
 * de hora adicional e a janela produtiva do cenário [janelaInicio,
 * janelaFim] - devolve o [dataInicio, dataFim] efetivo a passar para
 * `expandirRegraSemanal`, ou `null` quando a semana da regra não tem
 * NENHUMA interseção com a janela (a regra existiria, mas não produziria
 * nenhuma data - a UI deve avisar antes de deixar o usuário criar uma
 * regra assim, ver JanelaCapacidadeRecursos.tsx). Esta é a fronteira
 * ÚNICA que impede uma regra semanal de "vazar" para fora da sua própria
 * semana ou de se repetir automaticamente em semanas seguintes - nunca
 * duplicada em mais de um lugar (construirDecisoesCapacidadeExtraDeRegras.ts
 * e a validação da UI reaproveitam esta mesma função).
 */
export function calcularJanelaEfetivaSemana(params: {
  semanaInicio: string;
  janelaInicio: string;
  janelaFim: string;
}): { dataInicio: string; dataFim: string } | null {
  const { semanaInicio, janelaInicio, janelaFim } = params;
  validarDataIso(semanaInicio, "semanaInicio");
  const diaSemana = diaDaSemanaCivil(semanaInicio);
  if (diaSemana !== 1) {
    throw new RangeError(
      `semanaInicio="${semanaInicio}" precisa ser uma segunda-feira (recebido dia da semana civil ${diaSemana}, onde 1=segunda) - toda regra semanal cobre exatamente uma semana civil (segunda a domingo).`,
    );
  }
  validarDataIso(janelaInicio, "janelaInicio");
  validarDataIso(janelaFim, "janelaFim");
  if (janelaInicio > janelaFim) {
    throw new RangeError(`janelaInicio="${janelaInicio}" é posterior a janelaFim="${janelaFim}".`);
  }

  const semanaFim = calcularSemanaFim(semanaInicio);
  const dataInicio = semanaInicio > janelaInicio ? semanaInicio : janelaInicio;
  const dataFim = semanaFim < janelaFim ? semanaFim : janelaFim;

  if (dataInicio > dataFim) return null;
  return { dataInicio, dataFim };
}

export function expandirRegraSemanal(params: {
  dias: DiasRegraSemanal;
  horasPorDia: number;
  ativo: boolean;
  dataInicio: string;
  dataFim: string;
  resolverNatureza: (data: string) => NaturezaDia;
}): DataExpandidaRegraSemanal[] {
  const { dias, horasPorDia, ativo, dataInicio, dataFim, resolverNatureza } = params;

  if (!ativo) return [];

  validarDataIso(dataInicio, "dataInicio");
  validarDataIso(dataFim, "dataFim");
  if (dataInicio > dataFim) {
    throw new RangeError(`dataInicio="${dataInicio}" é posterior a dataFim="${dataFim}".`);
  }
  if (!Number.isFinite(horasPorDia) || horasPorDia <= 0) {
    throw new RangeError(`horasPorDia precisa ser finito e maior que zero - recebido: ${horasPorDia}.`);
  }
  for (const dia of dias.diasUteis) {
    if (!DIAS_UTEIS_VALIDOS.has(dia)) {
      throw new RangeError(`diasUteis só aceita 1 (segunda) a 5 (sexta) - recebido: ${dia}.`);
    }
  }
  if (dias.diasUteis.length === 0 && !dias.sabado && !dias.domingo && !dias.feriado) {
    throw new RangeError("Selecione ao menos um dia da semana, sábado, domingo ou feriado.");
  }

  const resultado: DataExpandidaRegraSemanal[] = [];
  let dataAtual = dataInicio;
  while (dataAtual <= dataFim) {
    const natureza = resolverNatureza(dataAtual);
    const diaSemana = diaDaSemanaCivil(dataAtual);
    if (alvoBateComNatureza(dias, natureza, diaSemana)) {
      resultado.push({ data: dataAtual, horas: horasPorDia, natureza });
    }
    dataAtual = somarDiasCivis(dataAtual, 1);
  }

  return resultado;
}
