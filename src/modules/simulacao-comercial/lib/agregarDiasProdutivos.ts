// Agregador de dias produtivos numa janela - estende resolverDiaProdutivo
// (Etapa 1) para um intervalo, sem duplicar a regra de precedência do
// calendário. Chama resolverDiaProdutivo dia a dia; a lógica de
// Calendário Operacional / Calendário Oficial / Eventos da Empresa
// continua existindo em um único lugar.
"use client";

import {
  resolverDiaProdutivo,
  type ResultadoDiaProdutivo,
} from "@/modules/calendario/lib/resolverDiaProdutivo";

export interface ResultadoJanelaProdutiva {
  diasProdutivos: number;
  detalhes: Array<{ data: string; resultado: ResultadoDiaProdutivo }>;
}

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function validarData(data: string, rotulo: string): void {
  if (!REGEX_DATA_ISO.test(data)) {
    throw new TypeError(
      `Data inválida em ${rotulo}: "${data}". Esperado o formato YYYY-MM-DD.`,
    );
  }
}

function proximoDiaIso(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const proximo = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return proximo.toISOString().slice(0, 10);
}

/**
 * Conta dias produtivos entre dataInicio e dataFim (ambos inclusos).
 * Processa os dias em ordem cronológica, sequencialmente (não
 * Promise.all) - mesma ordem sempre, sem depender de paralelismo não
 * determinístico.
 */
export async function contarDiasProdutivosNaJanela(
  empresaId: string,
  dataInicio: string,
  dataFim: string,
): Promise<ResultadoJanelaProdutiva> {
  validarData(dataInicio, "dataInicio");
  validarData(dataFim, "dataFim");

  if (dataFim < dataInicio) {
    throw new RangeError(
      `dataFim (${dataFim}) não pode ser anterior a dataInicio (${dataInicio}).`,
    );
  }

  const detalhes: Array<{ data: string; resultado: ResultadoDiaProdutivo }> = [];
  let diasProdutivos = 0;
  let dataAtual = dataInicio;

  while (dataAtual <= dataFim) {
    const resultado = await resolverDiaProdutivo(empresaId, dataAtual);
    detalhes.push({ data: dataAtual, resultado });

    if (resultado.produtivo) {
      diasProdutivos += 1;
    }

    dataAtual = proximoDiaIso(dataAtual);
  }

  return { diasProdutivos, detalhes };
}
