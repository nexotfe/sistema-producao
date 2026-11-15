// PCP-B1-HORIZONTE: estimativa PURA (sem I/O) do horizonte de dias
// produtivos necessário para o recálculo decorrente de moverProjeto()
// cobrir todo o backlog elegível - usada só como PONTO DE PARTIDA da
// grade passada ao Motor (ampliarGradeProdutivaPcp.ts resolve a grade
// real de dias corridos a partir disto), NUNCA como garantia de que o
// backlog inteiro vai caber - a confirmação real só vem de rodar o
// Motor de verdade e verificar o resultado (ver moverPrioridadeProjetoPcpAction.ts).
//
// Dois números, sempre o MAIOR dos dois (nunca um substitui o outro):
// 1. Gargalo de recurso - carga acumulada (horas-máquina) de todas as
//    ocorrências cujo candidato PRIMÁRIO é aquele recurso, dividida
//    pela capacidade diária dele. Captura o caso de um único recurso
//    sobrecarregado.
// 2. Caminho crítico - maior soma de "dias próprios" ao longo de uma
//    cadeia de dependências (sequência de roteiro/consumo de
//    subconjunto), ignorando contenção de recurso entre operações
//    diferentes. Captura o caso de várias operações sequenciais em
//    recursos pouco carregados, que o gargalo de recurso sozinho não
//    vê (cada uma exige poucos dias no seu recurso, mas a cadeia inteira
//    exige muitos dias de calendário, uma depois da outra).
//
// Esta função NUNCA decide se o grafo é acíclico - isso é
// responsabilidade de escalonarConjuntoGenerico (validarEntrada) na
// execução REAL do Motor. Se um ciclo for encontrado aqui (não deveria,
// mas esta função roda ANTES da validação real), o caminho crítico é
// simplesmente ignorado (gargalo de recurso sozinho ainda é um ponto de
// partida válido) - esta função nunca lança por um problema que a
// execução real já vai reportar com mais contexto.
import { horasPadraoParaHorasMaquina } from "@/modules/simulacao-comercial/lib/cenarios/unidades";
import type { OcorrenciaEscalonavel } from "@/modules/simulacao-comercial/lib/cenarios/escalonadorConjunto";
import type { DependenciaOcorrencia } from "@/modules/simulacao-comercial/lib/cenarios/grafoPrecedencia";
import type { ChaveOcorrenciaPcp } from "./chaveOcorrenciaPcp";
import type { CandidatoMotorPcpSerializavel } from "./montarEntradaMotorPcp";

/** Margem de segurança explícita do PONTO DE PARTIDA - nunca garante que o backlog cabe, só reduz a chance da 1ª tentativa real do Motor já precisar de ampliação. */
const MARGEM_SEGURANCA_ESTIMATIVA_DIAS = 2;

export interface IngredientesParaEstimativaHorizontePcp {
  ocorrencias: OcorrenciaEscalonavel<ChaveOcorrenciaPcp>[];
  dependencias: DependenciaOcorrencia<ChaveOcorrenciaPcp>[];
  candidatos: CandidatoMotorPcpSerializavel[];
}

/**
 * Horas-máquina necessárias de uma ocorrência, usando o candidato
 * PRIMÁRIO (candidatoIdsPorPrioridade[0]) - a mesma convenção de
 * prioridade de recurso já usada por alocarOperacaoDiaAdia, mas aqui só
 * para estimar, nunca para alocar de verdade.
 */
function horasMaquinaPrimarias(
  ocorrencia: OcorrenciaEscalonavel<ChaveOcorrenciaPcp>,
  capacidadePorRecurso: ReadonlyMap<string, CandidatoMotorPcpSerializavel>,
): { recursoPrimarioId: string; horasMaquina: number; diasProprios: number; capacidadeZero: boolean } | null {
  const recursoPrimarioId = ocorrencia.candidatoIdsPorPrioridade[0];
  const candidato = recursoPrimarioId ? capacidadePorRecurso.get(recursoPrimarioId) : undefined;
  if (!recursoPrimarioId || !candidato) {
    // Defensivo: ocorrências entregues pelo assembler real sempre têm
    // candidato primário resolvido (recurso_vigente_ausente_ou_invalido
    // já exclui o resto antes de chegar aqui) - null só protege esta
    // estimativa contra uma entrada fabricada/futura inconsistente,
    // nunca derruba o recálculo por isso.
    return null;
  }
  const horasMaquina = horasPadraoParaHorasMaquina(ocorrencia.necessarioHorasPadrao, candidato.produtividade);
  const capacidadeZero = candidato.capacidadeHorasDia <= 0;
  // capacidadeZero: nenhum número de dias resolve isso (ampliar a grade
  // não ajuda um recurso sem capacidade nenhuma) - não entra na conta da
  // estimativa (contribui 0, nunca um valor mágico de dias); a execução
  // REAL do Motor é que vai reportar o déficit verdadeiro para esse
  // recurso, igual a qualquer outro déficit genuíno.
  const diasProprios = capacidadeZero ? 0 : horasMaquina / candidato.capacidadeHorasDia;
  return { recursoPrimarioId, horasMaquina, diasProprios, capacidadeZero };
}

function estimarGargaloPorRecurso(
  ocorrencias: OcorrenciaEscalonavel<ChaveOcorrenciaPcp>[],
  capacidadePorRecurso: ReadonlyMap<string, CandidatoMotorPcpSerializavel>,
): number {
  const horasMaquinaAcumuladasPorRecurso = new Map<string, number>();
  for (const ocorrencia of ocorrencias) {
    const resolvido = horasMaquinaPrimarias(ocorrencia, capacidadePorRecurso);
    if (!resolvido) continue;
    horasMaquinaAcumuladasPorRecurso.set(
      resolvido.recursoPrimarioId,
      (horasMaquinaAcumuladasPorRecurso.get(resolvido.recursoPrimarioId) ?? 0) + resolvido.horasMaquina,
    );
  }

  let gargaloMaximo = 0;
  for (const [recursoId, horasMaquinaAcumuladas] of horasMaquinaAcumuladasPorRecurso) {
    const candidato = capacidadePorRecurso.get(recursoId)!;
    // capacidadeHorasDia<=0: mesmo caso de horasMaquinaPrimarias - não
    // contribui (nenhum número de dias resolveria isso), a execução
    // real do Motor reporta o déficit verdadeiro.
    if (candidato.capacidadeHorasDia <= 0) continue;
    const dias = horasMaquinaAcumuladas / candidato.capacidadeHorasDia;
    if (dias > gargaloMaximo) gargaloMaximo = dias;
  }
  return gargaloMaximo;
}

/** Kahn com acumulação de peso - maior soma de diasProprios ao longo de qualquer cadeia predecessora->sucessora. Ciclo (não deveria existir aqui) é ignorado silenciosamente (retorna 0) - ver cabeçalho do módulo. */
function estimarCaminhoCritico(
  ocorrencias: OcorrenciaEscalonavel<ChaveOcorrenciaPcp>[],
  dependencias: DependenciaOcorrencia<ChaveOcorrenciaPcp>[],
  capacidadePorRecurso: ReadonlyMap<string, CandidatoMotorPcpSerializavel>,
): number {
  const diasPropriosPorOpId = new Map<string, number>();
  for (const ocorrencia of ocorrencias) {
    const resolvido = horasMaquinaPrimarias(ocorrencia, capacidadePorRecurso);
    diasPropriosPorOpId.set(ocorrencia.chave.opId, resolvido ? resolvido.diasProprios : 0);
  }

  const sucessorasPorPredecessora = new Map<string, string[]>();
  const grauEntrada = new Map<string, number>();
  for (const opId of diasPropriosPorOpId.keys()) grauEntrada.set(opId, 0);
  for (const dependencia of dependencias) {
    const predId = dependencia.predecessora.opId;
    const sucId = dependencia.sucessora.opId;
    if (!diasPropriosPorOpId.has(predId) || !diasPropriosPorOpId.has(sucId)) continue;
    if (!sucessorasPorPredecessora.has(predId)) sucessorasPorPredecessora.set(predId, []);
    sucessorasPorPredecessora.get(predId)!.push(sucId);
    grauEntrada.set(sucId, (grauEntrada.get(sucId) ?? 0) + 1);
  }

  const acumuladoPorOpId = new Map<string, number>();
  const fila: string[] = [];
  for (const [opId, grau] of grauEntrada) {
    if (grau === 0) {
      acumuladoPorOpId.set(opId, diasPropriosPorOpId.get(opId) ?? 0);
      fila.push(opId);
    }
  }

  let processados = 0;
  let maximo = 0;
  while (fila.length > 0) {
    const atual = fila.shift()!;
    processados += 1;
    const acumuladoAtual = acumuladoPorOpId.get(atual) ?? 0;
    if (acumuladoAtual > maximo) maximo = acumuladoAtual;
    for (const sucessora of sucessorasPorPredecessora.get(atual) ?? []) {
      const candidatoAcumulado = acumuladoAtual + (diasPropriosPorOpId.get(sucessora) ?? 0);
      acumuladoPorOpId.set(sucessora, Math.max(acumuladoPorOpId.get(sucessora) ?? 0, candidatoAcumulado));
      const novoGrau = (grauEntrada.get(sucessora) ?? 0) - 1;
      grauEntrada.set(sucessora, novoGrau);
      if (novoGrau === 0) fila.push(sucessora);
    }
  }

  // Ciclo (deixaria `processados` menor que o total de nós) - ver
  // cabeçalho do módulo: ignorado aqui, a validação real acontece na
  // execução de verdade do Motor.
  if (processados < diasPropriosPorOpId.size) return 0;

  return maximo;
}

/**
 * Dias PRODUTIVOS necessários, estimados (nunca garantidos) a partir do
 * backlog elegível real. `ampliarGradeProdutivaPcp.ts` converte isto em
 * dias CORRIDOS usando o calendário real da empresa.
 */
export function estimarDiasProdutivosNecessariosPcp(ingredientes: IngredientesParaEstimativaHorizontePcp): number {
  if (ingredientes.ocorrencias.length === 0) return 0;

  const capacidadePorRecurso = new Map(ingredientes.candidatos.map((c) => [c.recursoId, c]));

  const gargalo = estimarGargaloPorRecurso(ingredientes.ocorrencias, capacidadePorRecurso);
  const caminhoCritico = estimarCaminhoCritico(ingredientes.ocorrencias, ingredientes.dependencias, capacidadePorRecurso);

  const diasBrutos = Math.max(gargalo, caminhoCritico);
  return Math.ceil(diasBrutos) + MARGEM_SEGURANCA_ESTIMATIVA_DIAS;
}
