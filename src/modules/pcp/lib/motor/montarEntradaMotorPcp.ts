// PCP-P8D: assembler somente-leitura da entrada real do Motor B para o
// PCP. NÃO chama o escalonador - devolve só a "fotografia" montada
// (ocorrências/dependências/candidatos/prioridade/exclusões) para
// inspeção antes de qualquer execução. Sem escrita no banco, sem UI.
//
// Fontes de capacidade (ver achado do P8D): Comercial NÃO tem fonte real
// de calendário - "capacidade normal" lá é o mesmo valor em toda data
// civil, sem exceção (derivarNaturezaDia.ts). Nunca copiado aqui. O PCP
// usa, em vez disso, 3 blocos reais e já em uso fora do Comercial:
// resolverDiaProdutivo/carregarContextoCalendario (calendário real da
// empresa, em lote), recursos_produtivos.capacidade_horas_dia (bruta) e
// calcular_produtividade_efetiva (RPC). Limitações explícitas do v1: sem
// indisponibilidade por recurso/manutenção, sem capacidade extraordinária
// no PCP - sábado/domingo/feriado só têm capacidade normal se
// resolverDiaProdutivo disser que são produtivos.
//
// Contrato de CandidatoComCapacidadeDiaria (confirmado por leitura de
// alocarOperacaoDiaAdia.ts antes de codificar, sem ambiguidade):
// faixasDoDia devolve horas de MÁQUINA brutas (sem multiplicar por
// produtividade) - é o alocador que converte horas-padrão<->horas-máquina
// usando candidato.produtividade internamente. Este assembler nunca
// multiplica capacidade x produtividade por conta própria.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  escalonarConjuntoGenerico,
  type CriterioPrioridadeDeNegocio,
  type OcorrenciaEscalonavel,
} from "@/modules/simulacao-comercial/lib/cenarios/escalonadorConjunto";
import type { DependenciaOcorrencia } from "@/modules/simulacao-comercial/lib/cenarios/grafoPrecedencia";
import type { CandidatoComCapacidadeDiaria, FaixaCapacidadeDia } from "@/modules/simulacao-comercial/lib/cenarios/alocarOperacaoDiaAdia";
import { capacidadesDiariasDosRecursos, produtividadeEfetivaDoRecurso } from "@/modules/simulacao-comercial/lib/prepararEntradasMotor";
import { carregarContextoCalendario, resolverDiaProdutivoComContexto } from "@/modules/calendario/lib/contextoCalendario";
import { chaveOcorrenciaPcpParaString, type ChaveOcorrenciaPcp } from "./chaveOcorrenciaPcp";

export type MotivoExclusaoOpPcp =
  | "iniciada_sem_saldo_estimado"
  | "bloqueada_por_antecessora_com_dados_insuficientes"
  | "recurso_vigente_ausente_ou_invalido";

export interface OpExcluidaPcp {
  opId: string;
  motivo: MotivoExclusaoOpPcp;
}

export interface EntradaMotorPcp {
  ocorrencias: OcorrenciaEscalonavel<ChaveOcorrenciaPcp>[];
  dependencias: DependenciaOcorrencia<ChaveOcorrenciaPcp>[];
  registroCandidatos: ReadonlyMap<string, CandidatoComCapacidadeDiaria>;
  criterioPrioridadeDeNegocio: CriterioPrioridadeDeNegocio<ChaveOcorrenciaPcp>;
  /** Nunca inclui OPs já resolvidas (não é erro, só não participam) - só as 3 razões acima, com motivo explícito. */
  excluidas: OpExcluidaPcp[];
}

/**
 * Etapa 2O.8B-I6-A: ingrediente plano de um candidato - os 4 valores que
 * construirCandidatoPcp usa para fechar faixasDoDia/consumir. Nunca
 * carrega o fechamento em si (não atravessa workerData).
 */
export interface CandidatoMotorPcpSerializavel {
  recursoId: string;
  capacidadeHorasDia: number;
  produtividade: number;
}

/**
 * Etapa 2O.8B-I6-A: forma 100% serializável (JSON-safe, sem funções nem
 * Map/Set) de EntradaMotorPcp - o que atravessa `workerData` para dentro
 * da Worker Thread. `registroCandidatos` e `criterioPrioridadeDeNegocio`
 * nunca são serializáveis diretamente (são fechamentos) - por isso saem
 * daqui como `candidatos` (ingredientes planos) e `posicaoPorProjeto`
 * (mapa plano), reconstruídos do outro lado por
 * reconstruirEntradaMotorPcpDeSerializavel usando a MESMA
 * construirCandidatoPcp - nunca uma segunda implementação da lógica de
 * capacidade.
 */
export interface EntradaMotorPcpSerializavel {
  ocorrencias: OcorrenciaEscalonavel<ChaveOcorrenciaPcp>[];
  dependencias: DependenciaOcorrencia<ChaveOcorrenciaPcp>[];
  candidatos: CandidatoMotorPcpSerializavel[];
  datasGradeCompartilhada: string[];
  diasProdutivos: string[];
  posicaoPorProjeto: Record<string, number>;
  excluidas: OpExcluidaPcp[];
}

interface FilaRow {
  projeto_id: string;
  posicao: number;
}

interface OfRow {
  id: string;
  projeto_id: string;
  quantidade_planejada: number;
  estado_aprovacao: string;
  estado_execucao: string;
}

interface OpRow {
  id: string;
  of_id: string;
  nao_aplicavel: boolean;
  recurso_vigente_id: string | null;
  tempo_vigente_minutos: number | null;
  tempo_restante_estimado_minutos: number | null;
  recurso_restante_estimado_id: string | null;
  resolvida: boolean;
  tem_inicio_real: boolean;
}

interface DependenciaRow {
  op_origem_id: string;
  op_dependente_id: string;
}

interface SnapshotMotorPcp {
  fila: FilaRow[];
  ofs: OfRow[];
  ops: OpRow[];
  dependencias: DependenciaRow[];
}

/**
 * PCP-P8D.3/DEC-P8-04: dados operacionais brutos vêm de UMA chamada a
 * carregar_estado_motor_pcp (SECURITY DEFINER, service_role-only) - não
 * mais de scan direto das 3 tabelas centrais, que service_role nunca
 * teve SELECT (de propósito, desde o P6E). A RPC resolve a empresa pelo
 * próprio p_solicitado_por (nunca confia em empresa_id solto) e já
 * resolve resolvida/tem_inicio_real em lote (1 round-trip, não 2×N -
 * elimina os round-trips de rede; ainda há N avaliações internas no
 * banco, dívida de escala já registrada no P8D.1/P8D.3, não resolvida
 * aqui). Elegibilidade de OF/OP, propagação de dados insuficientes,
 * recurso/capacidade/prioridade continuam exclusivamente neste módulo -
 * a RPC nunca decide nada disso (duas fontes de verdade, nunca).
 */
async function carregarSnapshotPcp(client: SupabaseClient, pSolicitadoPor: string): Promise<SnapshotMotorPcp> {
  const { data, error } = await client.rpc("carregar_estado_motor_pcp", { p_solicitado_por: pSolicitadoPor });
  if (error) throw new Error(`montarEntradaMotorPcp: erro em carregar_estado_motor_pcp: ${error.message}`);
  const snapshot = data as SnapshotMotorPcp;
  return {
    fila: snapshot.fila ?? [],
    ofs: snapshot.ofs ?? [],
    ops: snapshot.ops ?? [],
    dependencias: snapshot.dependencias ?? [],
  };
}

/** Compatibilidades cadastradas de um recurso, ordenadas por prioridade (menor = preferida primeiro) - mesma ordem usada pelo Comercial. */
async function carregarCompatibilidades(client: SupabaseClient, recursoIds: string[]): Promise<Map<string, string[]>> {
  const resultado = new Map<string, string[]>(recursoIds.map((id) => [id, []]));
  if (recursoIds.length === 0) return resultado;

  const { data, error } = await client
    .from("recurso_produtivo_compatibilidades")
    .select("recurso_origem_id,recurso_destino_id,prioridade")
    .in("recurso_origem_id", recursoIds)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("prioridade", { ascending: true });

  if (error) throw new Error(`montarEntradaMotorPcp: erro ao consultar recurso_produtivo_compatibilidades: ${error.message}`);

  for (const linha of data ?? []) {
    resultado.get(linha.recurso_origem_id)?.push(linha.recurso_destino_id);
  }
  return resultado;
}

/**
 * Candidato real do PCP: faixasDoDia devolve horas-MÁQUINA brutas
 * (capacidade_horas_dia do recurso) em dias produtivos pelo calendário
 * real da empresa, 0 nos demais - nunca multiplicado por produtividade
 * aqui (ver cabeçalho do módulo). v1 só tem faixa "normal" (sem
 * indisponibilidade por recurso, sem extra/hora-extra no PCP).
 */
function construirCandidatoPcp(params: {
  recursoId: string;
  capacidadeHorasDia: number;
  produtividade: number;
  datasGradeCompartilhada: string[];
  diasProdutivos: ReadonlySet<string>;
}): CandidatoComCapacidadeDiaria {
  const { recursoId, capacidadeHorasDia, produtividade, datasGradeCompartilhada, diasProdutivos } = params;
  const restantePorData = new Map(datasGradeCompartilhada.map((data) => [data, diasProdutivos.has(data) ? capacidadeHorasDia : 0]));

  return {
    id: recursoId,
    produtividade,
    faixasDoDia: (data): FaixaCapacidadeDia[] => {
      const horasDisponiveis = restantePorData.get(data) ?? 0;
      if (horasDisponiveis <= 0) return [];
      return [{ natureza: "normal", horasDisponiveis, contratacaoId: null, elegibilidade: null }];
    },
    consumir: (data, _natureza, horasMaquina) => {
      restantePorData.set(data, (restantePorData.get(data) ?? 0) - horasMaquina);
    },
  };
}

/** Fecho transitivo de sucessoras (diretas e indiretas) de um conjunto de OPs, dado o grafo de dependências. */
function sucessorasTransitivas(opIds: ReadonlySet<string>, dependencias: DependenciaRow[]): Set<string> {
  const diretasPorOrigem = new Map<string, string[]>();
  for (const dep of dependencias) {
    if (!diretasPorOrigem.has(dep.op_origem_id)) diretasPorOrigem.set(dep.op_origem_id, []);
    diretasPorOrigem.get(dep.op_origem_id)!.push(dep.op_dependente_id);
  }

  const alcancaveis = new Set<string>();
  const pilha = [...opIds];
  while (pilha.length > 0) {
    const atual = pilha.pop()!;
    for (const sucessora of diretasPorOrigem.get(atual) ?? []) {
      if (!alcancaveis.has(sucessora)) {
        alcancaveis.add(sucessora);
        pilha.push(sucessora);
      }
    }
  }
  return alcancaveis;
}

/**
 * Etapa 2O.8B-I6-A: ingredientes planos (JSON-safe) da entrada do
 * Motor - tudo que é dado bruto, nunca fechamento. Única implementação
 * de toda a busca/regra de negócio (passos 0-11) - tanto
 * montarEntradaMotorPcp (fechamentos, uso direto síncrono existente)
 * quanto montarEntradaMotorPcpSerializavel (ingredientes planos, para
 * atravessar workerData) chamam ESTA MESMA função internamente, nunca
 * duas implementações da mesma busca.
 */
interface IngredientesMotorPcp {
  ocorrencias: OcorrenciaEscalonavel<ChaveOcorrenciaPcp>[];
  dependencias: DependenciaOcorrencia<ChaveOcorrenciaPcp>[];
  excluidas: OpExcluidaPcp[];
  posicaoPorProjeto: Map<string, number>;
  candidatosIngredientes: CandidatoMotorPcpSerializavel[];
  datasGradeCompartilhada: string[];
  diasProdutivos: Set<string>;
}

async function montarIngredientesMotorPcp(
  client: SupabaseClient,
  pSolicitadoPor: string,
  datasGradeCompartilhada: string[],
): Promise<IngredientesMotorPcp> {
  if (datasGradeCompartilhada.length === 0) {
    throw new RangeError("montarEntradaMotorPcp: datasGradeCompartilhada não pode ser vazia - a janela é responsabilidade explícita do chamador.");
  }

  // 0. Empresa resolvida pelo ator (nunca por parâmetro solto) - mesma
  // garantia já aplicada dentro de carregar_estado_motor_pcp; resolvida
  // de novo aqui porque as consultas de recurso/calendário abaixo
  // continuam fora da RPC (recursos_produtivos/recurso_produtivo_compatibilidades
  // já são legíveis direto por service_role, sem RPC necessária).
  const { data: usuario, error: erroUsuario } = await client.from("usuarios").select("empresa_id").eq("id", pSolicitadoPor).maybeSingle();
  if (erroUsuario) throw new Error(`montarEntradaMotorPcp: erro ao consultar usuarios: ${erroUsuario.message}`);
  if (!usuario) throw new RangeError(`montarEntradaMotorPcp: solicitado_por ${pSolicitadoPor} não é um usuário válido.`);
  const empresaId = usuario.empresa_id as string;

  // 1. Snapshot bruto em lote (fila + OFs cujo projeto está na fila +
  // OPs dessas OFs + dependências + resolvida/tem_inicio_real).
  const snapshot = await carregarSnapshotPcp(client, pSolicitadoPor);

  const posicaoPorProjeto = new Map<string, number>(snapshot.fila.map((r) => [r.projeto_id, r.posicao]));
  if (posicaoPorProjeto.size === 0) {
    return { ocorrencias: [], dependencias: [], excluidas: [], posicaoPorProjeto, candidatosIngredientes: [], datasGradeCompartilhada, diasProdutivos: new Set() };
  }

  // 2. OFs elegíveis - a RPC já restringe a "projeto na fila"; aqui
  // aplica-se a regra de elegibilidade de negócio (nunca na RPC, para
  // nunca manter a mesma regra em 2 lugares).
  const ofsElegiveis = snapshot.ofs.filter(
    (of) => of.estado_aprovacao === "aprovada" && (of.estado_execucao === "liberada" || of.estado_execucao === "em_producao"),
  );
  const projetoPorOf = new Map(ofsElegiveis.map((of) => [of.id, of.projeto_id]));
  const quantidadePorOf = new Map(ofsElegiveis.map((of) => [of.id, of.quantidade_planejada]));

  if (ofsElegiveis.length === 0) {
    return { ocorrencias: [], dependencias: [], excluidas: [], posicaoPorProjeto, candidatosIngredientes: [], datasGradeCompartilhada, diasProdutivos: new Set() };
  }

  // 3. OPs elegíveis (nao_aplicavel=false) das OFs elegíveis.
  const idsOfElegiveis = new Set(projetoPorOf.keys());
  const opsBrutas = snapshot.ops.filter((op) => idsOfElegiveis.has(op.of_id) && !op.nao_aplicavel);
  if (opsBrutas.length === 0) {
    return { ocorrencias: [], dependencias: [], excluidas: [], posicaoPorProjeto, candidatosIngredientes: [], datasGradeCompartilhada, diasProdutivos: new Set() };
  }

  // 4. Dependências restritas às OPs carregadas (ambos os lados).
  const idsOpsCarregadas = new Set(opsBrutas.map((op) => op.id));
  const dependenciasBrutas = snapshot.dependencias.filter(
    (d) => idsOpsCarregadas.has(d.op_origem_id) && idsOpsCarregadas.has(d.op_dependente_id),
  );

  // 5. Classificação por OP: resolvida (fora, sem ser "exclusão"), dados
  // insuficientes (iniciada sem saldo), ou candidata a entrar.
  const excluidas: OpExcluidaPcp[] = [];
  const opsResolvidas = new Set<string>();
  const opsDadosInsuficientesDiretos = new Set<string>();
  const opsCandidatas = opsBrutas.filter((op) => {
    if (op.resolvida) {
      opsResolvidas.add(op.id);
      return false; // não é exclusão - só já terminou.
    }
    if (op.tem_inicio_real && op.tempo_restante_estimado_minutos === null) {
      opsDadosInsuficientesDiretos.add(op.id);
      excluidas.push({ opId: op.id, motivo: "iniciada_sem_saldo_estimado" });
      return false;
    }
    return true;
  });

  // 7. Propagação: sucessoras (diretas/indiretas) de uma OP com dados
  // insuficientes também ficam de fora - mas uma predecessora RESOLVIDA
  // nunca bloqueia (já cumpriu seu papel).
  const sucessorasBloqueadas = sucessorasTransitivas(opsDadosInsuficientesDiretos, dependenciasBrutas);
  for (const opId of sucessorasBloqueadas) {
    if (!opsDadosInsuficientesDiretos.has(opId) && !opsResolvidas.has(opId)) {
      excluidas.push({ opId, motivo: "bloqueada_por_antecessora_com_dados_insuficientes" });
    }
  }

  const opsFinal = opsCandidatas.filter((op) => !sucessorasBloqueadas.has(op.id));
  const idsOpsFinal = new Set(opsFinal.map((op) => op.id));

  // 8. Dependências entregues ao Motor: só entre ocorrências
  // efetivamente presentes no conjunto final (nunca apontando para uma
  // OP resolvida ou excluída).
  const dependencias: DependenciaOcorrencia<ChaveOcorrenciaPcp>[] = dependenciasBrutas
    .filter((d) => idsOpsFinal.has(d.op_origem_id) && idsOpsFinal.has(d.op_dependente_id))
    .map((d) => ({
      predecessora: { opId: d.op_origem_id },
      sucessora: { opId: d.op_dependente_id },
      tipo: "sequencia_roteiro" as const,
    }));

  // 9. Recurso primário por OP (DEC-P8-02) - ausente/inválido é
  // insuficiência de dados explícita, nunca candidatoIdsPorPrioridade=[] silencioso.
  const opsComRecurso: { op: OpRow; recursoPrimario: string }[] = [];
  for (const op of opsFinal) {
    const recursoPrimario = op.recurso_restante_estimado_id ?? op.recurso_vigente_id;
    if (!recursoPrimario) {
      excluidas.push({ opId: op.id, motivo: "recurso_vigente_ausente_ou_invalido" });
      continue;
    }
    opsComRecurso.push({ op, recursoPrimario });
  }

  // 10. Capacidade/produtividade/compatibilidades dos recursos primários,
  // em lote (nunca 1 consulta por OP).
  const recursosPrimarios = Array.from(new Set(opsComRecurso.map((e) => e.recursoPrimario)));
  const compatibilidadesPorRecurso = await carregarCompatibilidades(client, recursosPrimarios);
  const todosRecursosNecessarios = Array.from(
    new Set([...recursosPrimarios, ...Array.from(compatibilidadesPorRecurso.values()).flat()]),
  );

  let capacidadePorRecurso: Record<string, number>;
  try {
    capacidadePorRecurso = await capacidadesDiariasDosRecursos(client, todosRecursosNecessarios);
  } catch {
    // Recurso sem capacidade cadastrada em lote - refeito individualmente
    // para isolar QUAL recurso falhou (nunca derruba o lote inteiro por 1 recurso mal cadastrado).
    capacidadePorRecurso = {};
    for (const recursoId of todosRecursosNecessarios) {
      try {
        capacidadePorRecurso = { ...capacidadePorRecurso, ...(await capacidadesDiariasDosRecursos(client, [recursoId])) };
      } catch {
        // tratado abaixo, ao montar registroCandidatos (recurso ausente/inválido).
      }
    }
  }

  const produtividadePorRecurso = new Map<string, number>(
    await Promise.all(
      todosRecursosNecessarios.map(async (id) => [id, await produtividadeEfetivaDoRecurso(client, id)] as const),
    ),
  );

  // 11. Calendário real da empresa, em LOTE (janela explícita recebida
  // do chamador - nunca consultado dia a dia por recurso).
  const dataInicio = datasGradeCompartilhada[0];
  const dataFim = datasGradeCompartilhada[datasGradeCompartilhada.length - 1];
  const contextoCalendario = await carregarContextoCalendario(client, empresaId, dataInicio, dataFim);
  const diasProdutivos = new Set(
    datasGradeCompartilhada.filter((data) => resolverDiaProdutivoComContexto(contextoCalendario, data).produtivo),
  );

  // 12. Ingredientes planos dos candidatos - só para recursos com
  // capacidade cadastrada válida. Nunca constrói o fechamento aqui
  // (isso fica para quem consumir - montarEntradaMotorPcp ou a Worker).
  const recursosComCapacidadeValida = new Set<string>();
  const candidatosIngredientes: CandidatoMotorPcpSerializavel[] = [];
  for (const recursoId of todosRecursosNecessarios) {
    const capacidadeHorasDia = capacidadePorRecurso[recursoId];
    if (capacidadeHorasDia === undefined) continue; // sem capacidade cadastrada - tratado abaixo por OP.
    recursosComCapacidadeValida.add(recursoId);
    candidatosIngredientes.push({
      recursoId,
      capacidadeHorasDia,
      produtividade: produtividadePorRecurso.get(recursoId) ?? 1,
    });
  }

  // 13. Monta as ocorrências finais - recurso primário sem capacidade
  // cadastrada válida também é insuficiência de dados explícita.
  const ocorrencias: OcorrenciaEscalonavel<ChaveOcorrenciaPcp>[] = [];
  for (const { op, recursoPrimario } of opsComRecurso) {
    if (!recursosComCapacidadeValida.has(recursoPrimario)) {
      excluidas.push({ opId: op.id, motivo: "recurso_vigente_ausente_ou_invalido" });
      continue;
    }

    const candidatoIdsPorPrioridade = [
      recursoPrimario,
      ...(compatibilidadesPorRecurso.get(recursoPrimario) ?? []).filter((id) => recursosComCapacidadeValida.has(id)),
    ];

    const quantidadePlanejada = quantidadePorOf.get(op.of_id) ?? 0;
    const necessarioHorasPadrao = op.tem_inicio_real
      ? (op.tempo_restante_estimado_minutos as number) / 60 // total restante - DEC-P8-02, nunca multiplicado por quantidade de novo.
      : ((op.tempo_vigente_minutos ?? 0) / 60) * quantidadePlanejada; // por peça x quantidade da OF.

    ocorrencias.push({
      chave: { opId: op.id },
      projetoId: projetoPorOf.get(op.of_id)!,
      necessarioHorasPadrao,
      candidatoIdsPorPrioridade,
      ehOrcamentoNovo: false, // conceito exclusivo do Comercial - nunca se aplica ao PCP.
      dataInicioJanela: dataInicio,
    });
  }

  return { ocorrencias, dependencias, excluidas, posicaoPorProjeto, candidatosIngredientes, datasGradeCompartilhada, diasProdutivos };
}

/** Construção dos fechamentos (registroCandidatos/criterioPrioridadeDeNegocio) a partir dos ingredientes planos - única implementação, reutilizada pelos dois caminhos (uso direto síncrono e reconstrução dentro da Worker). */
function construirFechamentosMotorPcp(ingredientes: IngredientesMotorPcp): Pick<EntradaMotorPcp, "registroCandidatos" | "criterioPrioridadeDeNegocio"> {
  const registroCandidatos = new Map<string, CandidatoComCapacidadeDiaria>();
  for (const candidato of ingredientes.candidatosIngredientes) {
    registroCandidatos.set(
      candidato.recursoId,
      construirCandidatoPcp({
        recursoId: candidato.recursoId,
        capacidadeHorasDia: candidato.capacidadeHorasDia,
        produtividade: candidato.produtividade,
        datasGradeCompartilhada: ingredientes.datasGradeCompartilhada,
        diasProdutivos: ingredientes.diasProdutivos,
      }),
    );
  }
  const criterioPrioridadeDeNegocio: CriterioPrioridadeDeNegocio<ChaveOcorrenciaPcp> = (ocorrencia) =>
    ingredientes.posicaoPorProjeto.get(ocorrencia.projetoId) ?? Number.POSITIVE_INFINITY;
  return { registroCandidatos, criterioPrioridadeDeNegocio };
}

/**
 * Uso direto síncrono (callers existentes, comportamento IDÊNTICO ao
 * anterior a esta refatoração - nenhuma mudança de comportamento).
 */
export async function montarEntradaMotorPcp(
  client: SupabaseClient,
  pSolicitadoPor: string,
  datasGradeCompartilhada: string[],
): Promise<EntradaMotorPcp> {
  const ingredientes = await montarIngredientesMotorPcp(client, pSolicitadoPor, datasGradeCompartilhada);
  const { registroCandidatos, criterioPrioridadeDeNegocio } = construirFechamentosMotorPcp(ingredientes);
  return {
    ocorrencias: ingredientes.ocorrencias,
    dependencias: ingredientes.dependencias,
    registroCandidatos,
    criterioPrioridadeDeNegocio,
    excluidas: ingredientes.excluidas,
  };
}

/**
 * Etapa 2O.8B-I6-A: forma 100% serializável - para atravessar
 * `workerData` rumo à Worker Thread. O outro lado reconstrói com
 * reconstruirEntradaMotorPcpDeSerializavel, usando a MESMA
 * construirFechamentosMotorPcp (via reconstruirEntradaMotorPcpDeSerializavel)
 * - nunca uma segunda implementação da lógica de capacidade/prioridade.
 */
export async function montarEntradaMotorPcpSerializavel(
  client: SupabaseClient,
  pSolicitadoPor: string,
  datasGradeCompartilhada: string[],
): Promise<EntradaMotorPcpSerializavel> {
  const ingredientes = await montarIngredientesMotorPcp(client, pSolicitadoPor, datasGradeCompartilhada);
  return {
    ocorrencias: ingredientes.ocorrencias,
    dependencias: ingredientes.dependencias,
    candidatos: ingredientes.candidatosIngredientes,
    datasGradeCompartilhada: ingredientes.datasGradeCompartilhada,
    diasProdutivos: Array.from(ingredientes.diasProdutivos),
    posicaoPorProjeto: Object.fromEntries(ingredientes.posicaoPorProjeto),
    excluidas: ingredientes.excluidas,
  };
}

/**
 * Etapa 2O.8B-I6-A: reconstrói EntradaMotorPcp a partir da forma
 * serializável - chamada DENTRO da Worker Thread, depois de receber
 * `workerData`. Pura, sem I/O - reaproveita construirCandidatoPcp
 * (mesma função usada no caminho síncrono) para os fechamentos de
 * capacidade; nunca duplica essa lógica.
 */
export function reconstruirEntradaMotorPcpDeSerializavel(serializavel: EntradaMotorPcpSerializavel): EntradaMotorPcp {
  const ingredientes: IngredientesMotorPcp = {
    ocorrencias: serializavel.ocorrencias,
    dependencias: serializavel.dependencias,
    excluidas: serializavel.excluidas,
    posicaoPorProjeto: new Map(Object.entries(serializavel.posicaoPorProjeto)),
    candidatosIngredientes: serializavel.candidatos,
    datasGradeCompartilhada: serializavel.datasGradeCompartilhada,
    diasProdutivos: new Set(serializavel.diasProdutivos),
  };
  const { registroCandidatos, criterioPrioridadeDeNegocio } = construirFechamentosMotorPcp(ingredientes);
  return {
    ocorrencias: ingredientes.ocorrencias,
    dependencias: ingredientes.dependencias,
    registroCandidatos,
    criterioPrioridadeDeNegocio,
    excluidas: ingredientes.excluidas,
  };
}

// Reexportado só para quem for inspecionar a fotografia chamar o Motor
// manualmente depois (P8D não chama) - nunca usado internamente aqui.
// construirCandidatoPcp exportado para a Worker Thread (I6-A) poder
// reconstruir os MESMOS fechamentos de capacidade - nunca uma segunda
// implementação.
export { escalonarConjuntoGenerico, chaveOcorrenciaPcpParaString, construirCandidatoPcp };
