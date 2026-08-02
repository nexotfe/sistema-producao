// Agregador de dias produtivos numa janela - estende resolverDiaProdutivo
// (Etapa 1) para um intervalo, sem duplicar a regra de precedência do
// calendário. Sem "use client" - recebe o client Supabase por parâmetro.
//
// Correção de performance (N+1): antes, cada dia do intervalo disparava
// uma chamada de rede a resolverDiaProdutivo (até 4 consultas por dia).
// Como [dataInicio, dataFim] já é totalmente conhecido de antemão (ao
// contrário de deslocarDiasProdutivos, que não sabe onde vai parar), o
// calendário do intervalo inteiro é carregado em UMA lote só
// (carregarContextoCalendario) e cada dia é resolvido em memória
// (resolverDiaProdutivoComContexto) - mesma regra, mesmo resultado.
// `opcoes.contexto` permite reaproveitar um contexto já carregado por quem
// chama (ex.: prepararJanelaComercial, compartilhando o mesmo contexto
// das três datas da janela comercial com esta contagem final).
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  carregarContextoCalendario,
  resolverDiaProdutivoComContexto,
  type ContextoCalendario,
  type ResultadoDiaProdutivo,
} from "@/modules/calendario/lib/contextoCalendario";

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

export interface OpcoesContagem {
  /** Contexto de calendário já carregado, cobrindo pelo menos [dataInicio, dataFim] - evita recarregar. Se ausente ou insuficiente, esta função carrega o que faltar sozinha. */
  contexto?: ContextoCalendario;
}

/**
 * Conta dias produtivos entre dataInicio e dataFim (ambos inclusos).
 * Processa os dias em ordem cronológica, sempre a partir do mesmo
 * contexto de calendário (carregado em lote uma única vez, ou recebido
 * pronto) - mesma ordem determinística de sempre, sem depender de
 * paralelismo não determinístico.
 */
export async function contarDiasProdutivosNaJanela(
  client: SupabaseClient,
  empresaId: string,
  dataInicio: string,
  dataFim: string,
  opcoes: OpcoesContagem = {},
): Promise<ResultadoJanelaProdutiva> {
  validarData(dataInicio, "dataInicio");
  validarData(dataFim, "dataFim");

  if (dataFim < dataInicio) {
    throw new RangeError(
      `dataFim (${dataFim}) não pode ser anterior a dataInicio (${dataInicio}).`,
    );
  }

  const contextoCobreIntervalo =
    opcoes.contexto && opcoes.contexto.dataInicio <= dataInicio && opcoes.contexto.dataFim >= dataFim;

  const contexto = contextoCobreIntervalo
    ? (opcoes.contexto as ContextoCalendario)
    : await carregarContextoCalendario(client, empresaId, dataInicio, dataFim);

  const detalhes: Array<{ data: string; resultado: ResultadoDiaProdutivo }> = [];
  let diasProdutivos = 0;
  let dataAtual = dataInicio;

  while (dataAtual <= dataFim) {
    const resultado = resolverDiaProdutivoComContexto(contexto, dataAtual);
    detalhes.push({ data: dataAtual, resultado });

    if (resultado.produtivo) {
      diasProdutivos += 1;
    }

    dataAtual = proximoDiaIso(dataAtual);
  }

  return { diasProdutivos, detalhes };
}
