// Entrega 3 (Calculador Reverso) - Fase 2: única camada que liga o
// núcleo puro (estimarInicioNecessario.ts) ao calendário REAL. Todo o
// I/O desta funcionalidade mora aqui - o núcleo continua sem importar
// SupabaseClient.
//
// Custo de consultas: carregarContextoCalendario já é "até 4 consultas,
// independente do tamanho do intervalo" (correção de N+1 da Entrega 1,
// contextoCalendario.ts) - construirSequenciaDiasProdutivos paga esse
// custo UMA VEZ. contarDiasProdutivosEntre (usada só depois que D* já
// foi encontrado, no máximo 1 vez por execução) reaproveita o mesmo
// contexto quando ele já cobre o intervalo pedido - só dispara uma
// consulta nova quando a data de material cai fora de
// [floorDate, prazoInterno] (casos A/C da proposta). A busca binária em
// si (estimarInicioNecessario.ts) nunca recebe o client nem a função de
// contagem com I/O - não tem como consultar o banco.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  carregarContextoCalendario,
  resolverDiaProdutivoComContexto,
  type ContextoCalendario,
} from "@/modules/calendario/lib/contextoCalendario";
import { contarDiasProdutivosNaJanela } from "./agregarDiasProdutivos";
import {
  calcularEstimativaInicioNecessario,
  type ResultadoEstimativaInicioNecessario,
} from "./estimarInicioNecessario";
import type { BaseFixaMotor } from "./prepararEntradasMotor";

// Horizonte técnico defensivo da busca - NÃO é regra de negócio (mesmo
// espírito de MAX_DIAS_CIVIS_EXAMINADOS em deslocarDiasProdutivos.ts):
// só existe para transformar uma configuração de calendário/capacidade
// genuinamente inviável num estado controlado
// (horizonte_tecnico_excedido), nunca num laço sem fim.
export const MAX_DIAS_CIVIS_BUSCA_REVERSA = 10000;

function proximoDiaIso(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

function somarDiasCivis(data: string, quantidade: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + quantidade)).toISOString().slice(0, 10);
}

function diasCivisEntre(a: string, b: string): number {
  const [anoA, mesA, diaA] = a.split("-").map(Number);
  const [anoB, mesB, diaB] = b.split("-").map(Number);
  return Math.round((Date.UTC(anoB, mesB - 1, diaB) - Date.UTC(anoA, mesA - 1, diaA)) / 86400000);
}

/**
 * Constrói P - a sequência ordenada de TODOS os dias produtivos em
 * [floorDate, prazoInterno] - a partir do calendário real da empresa
 * (mesma precedência Operacional -> Oficial -> Eventos de sempre,
 * resolvida em memória depois de UM carregamento em lote). Base para a
 * busca binária de estimarInicioNecessario.ts.
 */
export async function construirSequenciaDiasProdutivos(
  client: SupabaseClient,
  empresaId: string,
  floorDate: string,
  prazoInterno: string,
): Promise<{ P: string[]; contexto: ContextoCalendario }> {
  const contexto = await carregarContextoCalendario(client, empresaId, floorDate, prazoInterno);

  const P: string[] = [];
  let dataAtual = floorDate;

  while (dataAtual <= prazoInterno) {
    if (resolverDiaProdutivoComContexto(contexto, dataAtual).produtivo) {
      P.push(dataAtual);
    }
    dataAtual = proximoDiaIso(dataAtual);
  }

  return { P, contexto };
}

/**
 * Adapta o contexto de calendário já carregado ao contrato assíncrono
 * `(a, b) => Promise<number>` exigido por distanciaProdutivaComSinal -
 * reaproveita contarDiasProdutivosNaJanela (agregarDiasProdutivos.ts)
 * inteiramente: se o contexto recebido já cobre [a, b], resolve em
 * memória, sem nenhuma consulta nova; se não cobrir (dataDisponibilidadeProducao
 * fora de [floorDate, prazoInterno] - casos A/C), a própria
 * contarDiasProdutivosNaJanela carrega um contexto novo cobrindo
 * exatamente o que falta.
 */
export function criarContarDiasProdutivosEntre(
  client: SupabaseClient,
  empresaId: string,
  contexto: ContextoCalendario,
): (dataInicioInclusive: string, dataFimInclusive: string) => Promise<number> {
  return async (dataInicioInclusive, dataFimInclusive) => {
    const { diasProdutivos } = await contarDiasProdutivosNaJanela(
      client,
      empresaId,
      dataInicioInclusive,
      dataFimInclusive,
      { contexto },
    );
    return diasProdutivos;
  };
}

/**
 * Entrega 3, Fase 3: separa a preparação do contexto (I/O, uma vez) da
 * classificação em si - permite que quem chama (a tela de Simulação)
 * reaproveite o MESMO contexto de calendário no preview normal
 * (simularCapacidadeProjetoComBaseFixa), evitando um segundo
 * carregamento: o intervalo [floorDate, prazoInterno] do calculador
 * reverso sempre contém [janelaInicio, janelaFim] do preview
 * (janelaInicio = dataDisponibilidadeProducao >= floorDate por
 * construção; janelaFim = prazoInterno).
 */
export async function prepararContextoCalculadorReverso(
  client: SupabaseClient,
  empresaId: string,
  prazoInterno: string,
): Promise<{ P: string[]; contexto: ContextoCalendario; floorDate: string; diasCivisExaminados: number }> {
  const floorDate = somarDiasCivis(prazoInterno, -MAX_DIAS_CIVIS_BUSCA_REVERSA);
  const { P, contexto } = await construirSequenciaDiasProdutivos(client, empresaId, floorDate, prazoInterno);

  return { P, contexto, floorDate, diasCivisExaminados: diasCivisEntre(floorDate, prazoInterno) };
}

/**
 * Classifica a partir de um contexto JÁ preparado (prepararContextoCalculadorReverso)
 * - não faz o carregamento inicial de novo. Usada tanto pelo caso comum
 * (preparar e classificar em sequência, ver calcularEstimativaInicioNecessarioComCalendarioReal)
 * quanto por quem compartilha o contexto com outra chamada na mesma
 * interação (a tela de Simulação, que também usa este contexto para o
 * preview normal).
 */
export function calcularEstimativaInicioNecessarioComContexto(
  client: SupabaseClient,
  empresaId: string,
  baseFixa: BaseFixaMotor,
  P: readonly string[],
  contexto: ContextoCalendario,
  prazoInterno: string,
  dataDisponibilidadeProducao: string,
  diasCivisExaminados: number,
): Promise<ResultadoEstimativaInicioNecessario> {
  const contarDiasProdutivosEntre = criarContarDiasProdutivosEntre(client, empresaId, contexto);

  return calcularEstimativaInicioNecessario(
    baseFixa,
    P,
    prazoInterno,
    dataDisponibilidadeProducao,
    contarDiasProdutivosEntre,
    diasCivisExaminados,
  );
}

/**
 * Ponto de entrada único e independente (quando não há contexto para
 * reaproveitar - ex.: um consumidor futuro que só precise da
 * estimativa, sem rodar o preview junto): monta P e delega para
 * calcularEstimativaInicioNecessarioComContexto - nenhuma lógica de
 * busca ou classificação duplicada.
 */
export async function calcularEstimativaInicioNecessarioComCalendarioReal(
  client: SupabaseClient,
  empresaId: string,
  baseFixa: BaseFixaMotor,
  prazoInterno: string,
  dataDisponibilidadeProducao: string,
): Promise<ResultadoEstimativaInicioNecessario> {
  const { P, contexto, diasCivisExaminados } = await prepararContextoCalculadorReverso(
    client,
    empresaId,
    prazoInterno,
  );

  return calcularEstimativaInicioNecessarioComContexto(
    client,
    empresaId,
    baseFixa,
    P,
    contexto,
    prazoInterno,
    dataDisponibilidadeProducao,
    diasCivisExaminados,
  );
}
