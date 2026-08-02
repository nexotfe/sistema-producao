// Desloca uma data por N dias produtivos (PAD-008 v2.0, secao 17.2).
// Sem "use client" - recebe o client Supabase por parametro, mesmo
// padrao de resolverDiaProdutivo/contarDiasProdutivosNaJanela.
//
// Correção de performance (N+1): antes, cada dia civil examinado disparava
// uma chamada de rede a resolverDiaProdutivo (até 4 consultas). Agora o
// calendário do intervalo é carregado em lote via carregarContextoCalendario
// (contextoCalendario.ts) e os dias são resolvidos em memória
// (resolverDiaProdutivoComContexto) - mesma regra, mesmo resultado, sem
// round-trip por dia. `opcoes.contexto` permite reaproveitar um contexto já
// carregado por quem chama (ex.: prepararJanelaComercial, que compartilha
// um único contexto entre as três datas da janela comercial); se ausente
// ou insuficiente, esta função busca o que faltar sozinha.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  carregarContextoCalendario,
  estimarJanelaCivil,
  resolverDiaProdutivoComContexto,
  type ContextoCalendario,
} from "./contextoCalendario";
import { LimiteDeslocamentoDiasProdutivosExcedidoError } from "./errors";

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Defesa tecnica, nao regra de negocio: nenhum deslocamento de negocio
// real (MAX_MARGEM_SEGURANCA_DIAS = 3650, ver validarPayloadAprovacao.ts)
// precisa de mais dias civis que isto para achar dias produtivos
// suficientes, mesmo num calendario incomum. Existe so para transformar
// um calendario mal configurado (zero dias produtivos) em um erro
// controlado, nunca num loop sem fim.
export const MAX_DIAS_CIVIS_EXAMINADOS = 10000;

function validarData(data: string, rotulo: string): void {
  if (!REGEX_DATA_ISO.test(data)) {
    throw new TypeError(
      `Data inválida em ${rotulo}: "${data}". Esperado o formato YYYY-MM-DD.`,
    );
  }

  // Regex sozinho aceita "2026-02-31", mes 13, dia 0 etc. - precisa
  // confirmar que a data normalizada pelo Date.UTC bate exatamente com
  // o que foi informado (mesmo padrao de resolverDiaProdutivo.ts e
  // validarPayloadAprovacao.ts - nao duplicar de forma divergente).
  const [ano, mes, dia] = data.split("-").map(Number);
  const dataUtc = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    dataUtc.getUTCFullYear() !== ano ||
    dataUtc.getUTCMonth() !== mes - 1 ||
    dataUtc.getUTCDate() !== dia
  ) {
    throw new TypeError(
      `Data inválida em ${rotulo}: "${data}" não corresponde a uma data civil real.`,
    );
  }
}

function proximoDiaIso(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const proximo = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return proximo.toISOString().slice(0, 10);
}

function diaAnteriorIso(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const anterior = new Date(Date.UTC(ano, mes - 1, dia - 1));
  return anterior.toISOString().slice(0, 10);
}

function somarDiasCivis(data: string, quantidade: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const resultado = new Date(Date.UTC(ano, mes - 1, dia + quantidade));
  return resultado.toISOString().slice(0, 10);
}

export interface OpcoesDeslocamento {
  /**
   * Contexto de calendário já carregado (ex.: por prepararJanelaComercial,
   * compartilhado entre as três datas da janela comercial) - evita
   * recarregar quando já cobre o intervalo necessário. Se ausente, ou se
   * o deslocamento sair da área coberta, o que faltar é buscado
   * normalmente (mesmo resultado, só sem o atalho).
   */
  contexto?: ContextoCalendario;
}

/**
 * Desloca `dataBase` por `deslocamento` dias produtivos, respeitando o
 * Calendário Operacional vigente da empresa (mesma precedência de
 * resolverDiaProdutivo, sem duplicar a regra).
 *
 * Contrato fechado (PAD-008 v2.0, seção 17.2): `dataBase` nunca é
 * contada como um dos dias deslocados. Deslocamento positivo começa a
 * contar no primeiro dia produtivo POSTERIOR a `dataBase`; negativo,
 * no primeiro dia produtivo ANTERIOR. Deslocamento zero devolve a
 * própria `dataBase`, sem consultar o calendário.
 *
 * Lança `LimiteDeslocamentoDiasProdutivosExcedidoError` (erro de
 * domínio controlado, não uma exceção crua nem loop sem fim) se
 * MAX_DIAS_CIVIS_EXAMINADOS dias civis forem percorridos sem achar
 * dias produtivos suficientes - sinal de calendário mal configurado
 * (ex.: nenhum dia da semana marcado como produtivo).
 */
export async function deslocarDiasProdutivos(
  client: SupabaseClient,
  empresaId: string,
  dataBase: string,
  deslocamento: number,
  opcoes: OpcoesDeslocamento = {},
): Promise<string> {
  validarData(dataBase, "dataBase");

  if (!Number.isInteger(deslocamento)) {
    throw new TypeError(
      `deslocamento deve ser um número inteiro: ${deslocamento}`,
    );
  }

  if (deslocamento === 0) {
    return dataBase;
  }

  const direcaoPositiva = deslocamento > 0;
  const proximaData = direcaoPositiva ? proximoDiaIso : diaAnteriorIso;
  const quantidadeAlvo = Math.abs(deslocamento);

  let contextoAtual = opcoes.contexto;
  let tamanhoProximaJanela = estimarJanelaCivil(quantidadeAlvo, MAX_DIAS_CIVIS_EXAMINADOS);

  let dataAtual = dataBase;
  let diasProdutivosContados = 0;
  let diasCivisExaminados = 0;

  while (diasProdutivosContados < quantidadeAlvo) {
    if (diasCivisExaminados >= MAX_DIAS_CIVIS_EXAMINADOS) {
      throw new LimiteDeslocamentoDiasProdutivosExcedidoError(
        empresaId,
        dataBase,
        deslocamento,
        diasCivisExaminados,
      );
    }

    dataAtual = proximaData(dataAtual);
    diasCivisExaminados += 1;

    const foraDoContexto =
      !contextoAtual || dataAtual < contextoAtual.dataInicio || dataAtual > contextoAtual.dataFim;

    if (foraDoContexto) {
      const orcamentoRestante = MAX_DIAS_CIVIS_EXAMINADOS - diasCivisExaminados + 1;
      const tamanho = Math.max(Math.min(tamanhoProximaJanela, orcamentoRestante), 1);
      const [inicio, fim] = direcaoPositiva
        ? [dataAtual, somarDiasCivis(dataAtual, tamanho - 1)]
        : [somarDiasCivis(dataAtual, -(tamanho - 1)), dataAtual];

      contextoAtual = await carregarContextoCalendario(client, empresaId, inicio, fim);
      tamanhoProximaJanela = Math.min(tamanhoProximaJanela * 2, MAX_DIAS_CIVIS_EXAMINADOS);
    }

    const { produtivo } = resolverDiaProdutivoComContexto(contextoAtual as ContextoCalendario, dataAtual);

    if (produtivo) {
      diasProdutivosContados += 1;
    }
  }

  return dataAtual;
}
