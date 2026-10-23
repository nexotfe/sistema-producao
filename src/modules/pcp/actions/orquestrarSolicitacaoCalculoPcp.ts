// Orquestrador da solicitação de cálculo de programação do PCP
// (PCP-P8I-B4) - mesmo princípio estrutural de
// orquestrarAprovacaoCenarioComercial.ts: extraído sem "use server"
// para ter dependências injetadas, testável sem sessão real do
// Supabase.
//
// CONTRATO DE SEGURANÇA: autorização (usuario_tem_permissao,
// 'pcp.solicitar_calculo') é verificada ANTES de qualquer leitura
// operacional ou execução do Motor - `naoAutenticado`/`naoAutorizado`
// retornam imediatamente, sem chamar `resolverEmpresa`, `lerVersao`
// nem `montarEntrada`. empresaId é SEMPRE resolvido aqui a partir do
// userId validado por `autenticar` (auth.getUser(), nunca
// auth.getSession()) - nunca aceito de `paramsRecebidos`.
//
// CONTRATO DE CONSISTÊNCIA (PCP-P8I-B4, ajuste final pedido pelo
// usuário): a versão de empresa_capacidade_versoes é lida ANTES e
// DEPOIS de montarEntradaMotorPcp; se divergir, o cálculo é
// descartado (o Motor não roda) - isto detecta mudança de capacidade
// durante a janela de leitura, mas NÃO é uma trava transacional real
// (essa garantia mais forte, com pg_advisory_xact_lock + SELECT FOR
// UPDATE, existe apenas dentro de persistir_programacao_pcp, para a
// futura etapa de aprovação/persistência - nunca aqui, porque esta
// Server Action não grava nada).
//
// CONTRATO DE CONFIABILIDADE DO RESULTADO: o objeto devolvido ao
// navegador é EXCLUSIVAMENTE para análise/exibição. Uma futura Server
// Action de aprovação NUNCA deve aceitar este resultado como entrada -
// ela precisa recalcular do zero no servidor, com a MESMA disciplina
// de versão, exatamente como aprovarCenarioComercialAction.ts já faz
// para o Comercial (nunca confia no que o navegador exibiu).
//
// Janela do Motor (datasGradeCompartilhada): decisão do usuário em
// PCP-P8I-B4 - configurável por quem solicita (dataInicial/dataFinal),
// nunca um horizonte fixo nem "maior data de entrega da fila" como
// regra embutida. Uma operação cuja janela de início cai fora do
// intervalo pedido não é um erro: o Motor (escalonadorConjunto.ts)
// naturalmente a devolve com status "bloqueada_por_deficit" e déficit
// residual igual à necessidade completa - comportamento já existente,
// nenhuma matemática nova precisa ser introduzida aqui para isso.
import {
  escalonarConjuntoGenerico,
  chaveOcorrenciaPcpParaString,
  type EntradaMotorPcp,
} from "../lib/motor/montarEntradaMotorPcp";
import type { ResultadoOcorrenciaEscalonada } from "@/modules/simulacao-comercial/lib/cenarios/escalonadorConjunto";
import type { ChaveOcorrenciaPcp } from "../lib/motor/chaveOcorrenciaPcp";

export interface PayloadSolicitacaoCalculoPcp {
  dataInicial: string;
  dataFinal: string;
}

export interface OperacaoCalculadaPcp {
  opId: string;
  status: ResultadoOcorrenciaEscalonada<ChaveOcorrenciaPcp>["status"];
  dataInicioReal: string | null;
  dataFimReal: string | null;
  alocacoes: ResultadoOcorrenciaEscalonada<ChaveOcorrenciaPcp>["alocacoes"];
  deficitResidualHorasPadrao: number;
}

export interface DependenciasSolicitacaoCalculoPcp {
  /** auth.getUser() no client de sessão - null se não autenticado. */
  autenticar: () => Promise<string | null>;
  /** usuario_tem_permissao(userId, 'pcp.solicitar_calculo') no client service_role. */
  autorizar: (userId: string) => Promise<boolean>;
  /** Resolve empresa_id a partir do userId JÁ validado - nunca do payload. */
  resolverEmpresa: (userId: string) => Promise<string | null>;
  /** Lê empresa_capacidade_versoes.versao da empresa - null se ausente/erro. Vem como JS number (JSON.parse do PostgREST) - nunca bigint real, por isso nunca excede Number.MAX_SAFE_INTEGER nesta coluna. */
  lerVersaoCapacidade: (empresaId: string) => Promise<number | null>;
  montarEntrada: (userId: string, datasGradeCompartilhada: string[]) => Promise<EntradaMotorPcp>;
}

export type ResultadoSolicitacaoCalculoPcp =
  | {
      ok: true;
      versaoCapacidadeUtilizada: string;
      janela: { dataInicial: string; dataFinal: string };
      operacoes: OperacaoCalculadaPcp[];
      excluidas: EntradaMotorPcp["excluidas"];
    }
  | { ok: false; motivo: "nao_autenticado" }
  | { ok: false; motivo: "nao_autorizado" }
  | { ok: false; motivo: "empresa_nao_resolvida" }
  | { ok: false; motivo: "janela_invalida"; detalhe: string }
  /** Leitura de versão (antes ou depois) ausente/com erro - nunca tratado como licença para continuar. */
  | { ok: false; motivo: "versao_capacidade_indisponivel" }
  /** Versão mudou entre a leitura inicial e a final - capacidade foi alterada durante o cálculo; cálculo descartado, Motor não executou. */
  | { ok: false; motivo: "capacidade_mudou_durante_calculo" }
  | { ok: false; motivo: "falha_interna"; detalhe: string };

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function validarJanela(dataInicial: string, dataFinal: string): string | null {
  if (!REGEX_DATA_ISO.test(dataInicial) || !REGEX_DATA_ISO.test(dataFinal)) {
    return "dataInicial/dataFinal devem estar no formato YYYY-MM-DD.";
  }
  if (dataInicial > dataFinal) {
    return "dataInicial não pode ser posterior a dataFinal.";
  }
  return null;
}

/** Todos os dias corridos entre dataInicial e dataFinal, inclusive - a grade do Motor nunca é restrita a dias produtivos (ver comentário de montarEntradaMotorPcp.ts: capacidade extra pode existir em fim de semana/feriado). */
function construirGradeDeDiasCorridos(dataInicial: string, dataFinal: string): string[] {
  const grade: string[] = [];
  let atual = new Date(`${dataInicial}T00:00:00Z`);
  const fim = new Date(`${dataFinal}T00:00:00Z`);
  while (atual.getTime() <= fim.getTime()) {
    grade.push(atual.toISOString().slice(0, 10));
    atual = new Date(atual.getTime() + 24 * 60 * 60 * 1000);
  }
  return grade;
}

export async function orquestrarSolicitacaoCalculoPcp(
  paramsRecebidos: PayloadSolicitacaoCalculoPcp,
  deps: DependenciasSolicitacaoCalculoPcp,
): Promise<ResultadoSolicitacaoCalculoPcp> {
  const userId = await deps.autenticar();
  if (!userId) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  const autorizado = await deps.autorizar(userId);
  if (!autorizado) {
    return { ok: false, motivo: "nao_autorizado" };
  }

  const empresaId = await deps.resolverEmpresa(userId);
  if (!empresaId) {
    return { ok: false, motivo: "empresa_nao_resolvida" };
  }

  const erroJanela = validarJanela(paramsRecebidos.dataInicial, paramsRecebidos.dataFinal);
  if (erroJanela) {
    return { ok: false, motivo: "janela_invalida", detalhe: erroJanela };
  }

  const datasGradeCompartilhada = construirGradeDeDiasCorridos(paramsRecebidos.dataInicial, paramsRecebidos.dataFinal);

  const versaoAntes = await deps.lerVersaoCapacidade(empresaId);
  if (versaoAntes === null) {
    return { ok: false, motivo: "versao_capacidade_indisponivel" };
  }

  let entrada: EntradaMotorPcp;
  try {
    entrada = await deps.montarEntrada(userId, datasGradeCompartilhada);
  } catch (erro) {
    return { ok: false, motivo: "falha_interna", detalhe: erro instanceof Error ? erro.message : String(erro) };
  }

  const versaoDepois = await deps.lerVersaoCapacidade(empresaId);
  if (versaoDepois === null) {
    return { ok: false, motivo: "versao_capacidade_indisponivel" };
  }

  if (versaoAntes !== versaoDepois) {
    return { ok: false, motivo: "capacidade_mudou_durante_calculo" };
  }

  let resultadoMotor: Map<string, ResultadoOcorrenciaEscalonada<ChaveOcorrenciaPcp>>;
  try {
    resultadoMotor = escalonarConjuntoGenerico<ChaveOcorrenciaPcp>({
      ocorrencias: entrada.ocorrencias,
      dependencias: entrada.dependencias,
      registroCandidatos: entrada.registroCandidatos,
      datasGradeCompartilhada,
      criterioPrioridadeDeNegocio: entrada.criterioPrioridadeDeNegocio,
      serializarChave: chaveOcorrenciaPcpParaString,
    });
  } catch (erro) {
    return { ok: false, motivo: "falha_interna", detalhe: erro instanceof Error ? erro.message : String(erro) };
  }

  // O Map do Motor não é diretamente serializável (bare Map -> "{}" em
  // JSON) - conversão explícita exigida (PCP-P8I-B4).
  const operacoes: OperacaoCalculadaPcp[] = Array.from(resultadoMotor.values()).map((resultado) => ({
    opId: resultado.chave.opId,
    status: resultado.status,
    dataInicioReal: resultado.dataInicioReal,
    dataFimReal: resultado.dataFimReal,
    alocacoes: resultado.alocacoes,
    deficitResidualHorasPadrao: resultado.deficitResidualHorasPadrao,
  }));

  return {
    ok: true,
    versaoCapacidadeUtilizada: String(versaoAntes),
    janela: { dataInicial: paramsRecebidos.dataInicial, dataFinal: paramsRecebidos.dataFinal },
    operacoes,
    excluidas: entrada.excluidas,
  };
}
