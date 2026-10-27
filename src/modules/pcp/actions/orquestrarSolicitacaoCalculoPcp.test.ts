// PCP-Etapa2N / Etapa 2O.8B-I6-B: testes do orquestrador de solicitação
// de recálculo independente, agora protegido por reserva exclusiva
// (contexto='solicitar_calculo') e executado via supervisor+Worker
// (dependências 100% falsas - a RPC real e o spawn real da Worker só
// são validados em sandbox/integração, ver relatório da I6-B).
import { describe, expect, it, vi } from "vitest";
import {
  orquestrarSolicitacaoCalculoPcp,
  type DependenciasSolicitacaoCalculoPcp,
  type PayloadSolicitacaoCalculoPcp,
} from "./orquestrarSolicitacaoCalculoPcp";
import type { ResultadoIniciarReservaPcp } from "./reservaExclusivaRecalculoPcp";
import type { EntradaMotorPcpSerializavel } from "../lib/motor/montarEntradaMotorPcp";
import { calcularLimiteEfetivoMs as calcularLimiteEfetivoMsReal, type ResultadoSupervisaoMotorPcp } from "../lib/motor/supervisorMotorPcp";
import {
  LIMITE_MOTOR_MS,
  MARGEM_FINALIZACAO_MS,
  LIMITE_MINIMO_VIAVEL_MS,
  MAX_DURATION_FUNCAO_MS,
} from "../lib/motor/orcamentoTempoMotorPcp";
import type { ResultadoOcorrenciaEscalonada } from "@/modules/simulacao-comercial/lib/cenarios/escalonadorConjunto";
import type { ChaveOcorrenciaPcp } from "../lib/motor/chaveOcorrenciaPcp";

const JANELA_PADRAO: PayloadSolicitacaoCalculoPcp = { dataInicial: "2026-11-02", dataFinal: "2026-11-06" };

const RESERVA_ADQUIRIDA_PADRAO: ResultadoIniciarReservaPcp = {
  execucaoId: "execucao-1",
  adquirida: true,
  motivo: "adquirida",
  responsavelAtualNome: "Usuário Um",
};

type ResultadoMotorMap = Map<string, ResultadoOcorrenciaEscalonada<ChaveOcorrenciaPcp>>;

function entradaSerializavelNormal(): EntradaMotorPcpSerializavel {
  return {
    ocorrencias: [
      { chave: { opId: "op-1" }, projetoId: "projeto-1", necessarioHorasPadrao: 2, candidatoIdsPorPrioridade: ["recurso-1"], ehOrcamentoNovo: false, dataInicioJanela: "2026-11-02" },
    ],
    dependencias: [],
    candidatos: [{ recursoId: "recurso-1", capacidadeHorasDia: 8, produtividade: 1 }],
    datasGradeCompartilhada: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"],
    diasProdutivos: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"],
    posicaoPorProjeto: { "projeto-1": 1 },
    excluidas: [],
  };
}

function resultadoMotorNormal(): ResultadoMotorMap {
  return new Map([
    [
      "op-1",
      {
        chave: { opId: "op-1" },
        status: "concluida",
        dataInicioReal: "2026-11-02",
        dataFimReal: "2026-11-02",
        alocacoes: [{ recursoId: "recurso-1", data: "2026-11-02", natureza: "normal", contratacaoId: null, horasMaquina: 2, horasPadrao: 2 }],
        deficitResidualHorasPadrao: 0,
      },
    ],
  ]);
}

function criarDependenciasFalsas(
  overrides: Partial<{
    userId: string | null;
    autorizado: boolean;
    empresaId: string | null;
    limiteEfetivoMs: number | null;
    reserva: ResultadoIniciarReservaPcp;
    erroIniciarReserva: Error;
    versoes: number[]; // consumidas em ordem: antes, depois-da-montagem, depois-do-calculo
    entrada: EntradaMotorPcpSerializavel | Error;
    supervisao: ResultadoSupervisaoMotorPcp<ResultadoMotorMap>;
    finalizarRetorno: boolean;
    erroFinalizar: Error;
  }> = {},
) {
  const userId: string | null = "userId" in overrides ? (overrides.userId as string | null) : "usuario-1";
  const autorizado = overrides.autorizado ?? true;
  const empresaId: string | null = "empresaId" in overrides ? (overrides.empresaId as string | null) : "empresa-1";
  const limiteEfetivoMs: number | null = "limiteEfetivoMs" in overrides ? (overrides.limiteEfetivoMs as number | null) : 240_000;
  const reserva = overrides.reserva ?? RESERVA_ADQUIRIDA_PADRAO;
  const versoes = overrides.versoes ?? [5, 5, 5];
  const entrada = overrides.entrada ?? entradaSerializavelNormal();
  const supervisao: ResultadoSupervisaoMotorPcp<ResultadoMotorMap> =
    overrides.supervisao ?? { situacao: "concluido", resultado: resultadoMotorNormal(), tempoTotalMs: 10 };
  const finalizarRetorno = overrides.finalizarRetorno ?? true;

  let chamadaVersao = 0;

  const autenticar = vi.fn(async () => userId);
  const autorizar = vi.fn(async (_uid: string) => autorizado);
  const resolverEmpresa = vi.fn(async (_uid: string) => empresaId);
  const calcularLimiteEfetivoMs = vi.fn((_tempoJaConsumidoMs: number) => limiteEfetivoMs);
  const iniciarReserva = vi.fn(async (_empresaId: string, _uid: string) => {
    if (overrides.erroIniciarReserva) throw overrides.erroIniciarReserva;
    return reserva;
  });
  const finalizarReserva = vi.fn(async (_empresaId: string, _execucaoId: string, _situacao: "concluida" | "falhou") => {
    if (overrides.erroFinalizar) throw overrides.erroFinalizar;
    return finalizarRetorno;
  });
  const lerVersaoCapacidade = vi.fn(async (_empresaId: string) => {
    const valor = versoes[chamadaVersao] ?? versoes[versoes.length - 1] ?? null;
    chamadaVersao += 1;
    return valor;
  });
  const montarEntradaSerializavel = vi.fn(async (_uid: string, _datas: string[]) => {
    if (entrada instanceof Error) throw entrada;
    return entrada;
  });
  const executarCalculoSupervisionado = vi.fn(async (_entrada: EntradaMotorPcpSerializavel, _limiteEfetivoMs: number) => supervisao);

  const deps: DependenciasSolicitacaoCalculoPcp = {
    autenticar,
    autorizar,
    resolverEmpresa,
    calcularLimiteEfetivoMs,
    iniciarReserva,
    finalizarReserva,
    lerVersaoCapacidade,
    montarEntradaSerializavel,
    executarCalculoSupervisionado,
  };
  return {
    deps,
    autenticar,
    autorizar,
    resolverEmpresa,
    calcularLimiteEfetivoMs,
    iniciarReserva,
    finalizarReserva,
    lerVersaoCapacidade,
    montarEntradaSerializavel,
    executarCalculoSupervisionado,
  };
}

describe("orquestrarSolicitacaoCalculoPcp - autenticação e autorização (ordem e curto-circuito)", () => {
  it("usuário sem sessão: nao_autenticado, nunca chama autorizar/resolverEmpresa/iniciarReserva", async () => {
    const { deps, autorizar, resolverEmpresa, iniciarReserva } = criarDependenciasFalsas({ userId: null });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(autorizar).not.toHaveBeenCalled();
    expect(resolverEmpresa).not.toHaveBeenCalled();
    expect(iniciarReserva).not.toHaveBeenCalled();
  });

  it("usuário sem pcp.solicitar_calculo: nao_autorizado, nunca chama iniciarReserva", async () => {
    const { deps, iniciarReserva } = criarDependenciasFalsas({ autorizado: false });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado" });
    expect(iniciarReserva).not.toHaveBeenCalled();
  });

  it("empresa não resolvível: empresa_nao_resolvida, nunca chama iniciarReserva", async () => {
    const { deps, iniciarReserva } = criarDependenciasFalsas({ empresaId: null });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "empresa_nao_resolvida" });
    expect(iniciarReserva).not.toHaveBeenCalled();
  });
});

describe("orquestrarSolicitacaoCalculoPcp - janela", () => {
  it("janela com dataInicial posterior a dataFinal: janela_invalida, nunca chama iniciarReserva", async () => {
    const { deps, iniciarReserva } = criarDependenciasFalsas();

    const resultado = await orquestrarSolicitacaoCalculoPcp({ dataInicial: "2026-11-10", dataFinal: "2026-11-01" }, deps);

    expect(resultado).toEqual({ ok: false, motivo: "janela_invalida", detalhe: "dataInicial não pode ser posterior a dataFinal." });
    expect(iniciarReserva).not.toHaveBeenCalled();
  });

  it("janela em formato inválido: janela_invalida", async () => {
    const { deps } = criarDependenciasFalsas();

    const resultado = await orquestrarSolicitacaoCalculoPcp({ dataInicial: "02/11/2026", dataFinal: "2026-11-06" }, deps);

    expect(resultado).toMatchObject({ ok: false, motivo: "janela_invalida" });
  });
});

describe("orquestrarSolicitacaoCalculoPcp - orçamento de tempo (I6-B)", () => {
  it("sem margem segura para executar: retorna erro ANTES de tocar a reserva", async () => {
    const { deps, iniciarReserva } = criarDependenciasFalsas({ limiteEfetivoMs: null });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "sem_margem_segura_para_executar" });
    expect(iniciarReserva).not.toHaveBeenCalled();
  });
});

describe("orquestrarSolicitacaoCalculoPcp - reserva exclusiva (I6-B)", () => {
  it("reserva ocupada: reserva_ocupada com detalhe, nunca chama montarEntradaSerializavel", async () => {
    const { deps, montarEntradaSerializavel } = criarDependenciasFalsas({
      reserva: { execucaoId: "execucao-de-outro", adquirida: false, motivo: "ocupada", responsavelAtualNome: "Outro Usuário" },
    });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({
      ok: false,
      motivo: "reserva_ocupada",
      detalhe: { responsavelAtualNome: "Outro Usuário", situacao: "ocupada" },
    });
    expect(montarEntradaSerializavel).not.toHaveBeenCalled();
  });

  it("erro inesperado ao iniciar a reserva: falha_ao_iniciar_reserva", async () => {
    const { deps } = criarDependenciasFalsas({
      erroIniciarReserva: new Error("iniciar_recalculo_pcp: iniciado_por não possui a permissão pcp.solicitar_calculo exigida pelo contexto solicitar_calculo."),
    });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toMatchObject({ ok: false, motivo: "falha_ao_iniciar_reserva" });
  });
});

describe("orquestrarSolicitacaoCalculoPcp - versão de capacidade (consistência)", () => {
  it("versão indisponível ANTES do cálculo: versao_capacidade_indisponivel, libera a reserva como falhou", async () => {
    const { deps, finalizarReserva } = criarDependenciasFalsas({ versoes: [] });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "versao_capacidade_indisponivel" });
    expect(finalizarReserva).toHaveBeenCalledWith("empresa-1", RESERVA_ADQUIRIDA_PADRAO.execucaoId, "falhou");
  });

  it("versão mudou DURANTE a montagem da entrada: capacidade_mudou_durante_calculo, nunca executa o Motor", async () => {
    const { deps, executarCalculoSupervisionado } = criarDependenciasFalsas({ versoes: [5, 6, 6] });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "capacidade_mudou_durante_calculo" });
    expect(executarCalculoSupervisionado).not.toHaveBeenCalled();
  });

  it("versão mudou DURANTE a execução do Motor (depois de 'concluido'): capacidade_mudou_durante_calculo, resultado descartado", async () => {
    const { deps } = criarDependenciasFalsas({ versoes: [5, 5, 6] });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "capacidade_mudou_durante_calculo" });
  });
});

describe("orquestrarSolicitacaoCalculoPcp - execução supervisionada (I6-B)", () => {
  it("conclusão normal: ok=true com operações convertidas, liberacaoReserva.liberada=true, reserva finalizada como concluida", async () => {
    const { deps, finalizarReserva } = criarDependenciasFalsas();

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.operacoes).toHaveLength(1);
    expect(resultado.operacoes[0]).toMatchObject({ opId: "op-1", status: "concluida", deficitResidualHorasPadrao: 0 });
    expect(resultado.liberacaoReserva).toEqual({ liberada: true });
    expect(finalizarReserva).toHaveBeenCalledWith("empresa-1", RESERVA_ADQUIRIDA_PADRAO.execucaoId, "concluida");
  });

  it("interrompido pelo supervisor (limite de tempo): NUNCA reportado como sucesso, reserva finalizada como falhou", async () => {
    const { deps, finalizarReserva } = criarDependenciasFalsas({
      supervisao: { situacao: "interrompido_por_limite", tempoTotalMs: 240_000, via: "promise_terminate" },
    });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "interrompido_por_limite_de_tempo" });
    expect(finalizarReserva).toHaveBeenCalledWith("empresa-1", RESERVA_ADQUIRIDA_PADRAO.execucaoId, "falhou");
  });

  it("erro real na Worker: falha_na_worker com a mensagem real, nunca confundido com interrupção por limite", async () => {
    const { deps } = criarDependenciasFalsas({
      supervisao: { situacao: "erro_na_worker", mensagem: "Dependência referencia ocorrência inexistente.", tempoTotalMs: 5 },
    });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "falha_na_worker", detalhe: "Dependência referencia ocorrência inexistente." });
  });

  it("saída inesperada da Worker: falha_na_worker com o exitCode, nunca reportado como sucesso", async () => {
    const { deps } = criarDependenciasFalsas({
      supervisao: { situacao: "saida_inesperada", exitCode: 1, tempoTotalMs: 5 },
    });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.motivo).toBe("falha_na_worker");
  });

  it("falha ao montar a entrada serializável: falha_interna, reserva liberada como falhou", async () => {
    const { deps, finalizarReserva } = criarDependenciasFalsas({ entrada: new Error("falha simulada ao montar entrada") });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "falha_interna", detalhe: "falha simulada ao montar entrada" });
    expect(finalizarReserva).toHaveBeenCalledWith("empresa-1", RESERVA_ADQUIRIDA_PADRAO.execucaoId, "falhou");
  });
});

describe("orquestrarSolicitacaoCalculoPcp - finalização da reserva com tratamento explícito (I6-B)", () => {
  it("sucesso do cálculo mas finalizarReserva devolve false: ok:true preservado, liberacaoReserva.liberada=false com detalhe", async () => {
    const { deps } = criarDependenciasFalsas({ finalizarRetorno: false });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.operacoes).toHaveLength(1);
    expect(resultado.liberacaoReserva.liberada).toBe(false);
    if (resultado.liberacaoReserva.liberada) return;
    expect(resultado.liberacaoReserva.detalhe).toContain("finalizar_recalculo_pcp retornou false");
  });

  it("sucesso do cálculo mas finalizarReserva lança exceção: ok:true preservado, liberacaoReserva.liberada=false com o erro real", async () => {
    const { deps } = criarDependenciasFalsas({ erroFinalizar: new Error("finalizar_recalculo_pcp: timeout de rede") });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.liberacaoReserva).toEqual({ liberada: false, detalhe: "finalizar_recalculo_pcp: timeout de rede" });
  });
});

describe("orquestrarSolicitacaoCalculoPcp - ausência estrutural de escrita de programação oficial", () => {
  it("DependenciasSolicitacaoCalculoPcp não expõe nenhum método de persistência de programação oficial, nem de movimentação de prioridade", () => {
    const { deps } = criarDependenciasFalsas();
    const chaves = Object.keys(deps).sort();
    expect(chaves).toEqual([
      "autenticar",
      "autorizar",
      "calcularLimiteEfetivoMs",
      "executarCalculoSupervisionado",
      "finalizarReserva",
      "iniciarReserva",
      "lerVersaoCapacidade",
      "montarEntradaSerializavel",
      "resolverEmpresa",
    ]);
  });
});

// Achado #1/#3 da auditoria do PR #1: calcularLimiteEfetivoMs (função
// real de supervisorMotorPcp.ts) nunca tinha teste próprio - todo teste
// acima a mocka com um valor fixo, então um erro de sinal/off-by-one na
// fórmula passaria por toda a suíte sem ser detectado.
describe("calcularLimiteEfetivoMs (função real, orçamento de tempo)", () => {
  const PARAMS_PADRAO = {
    limiteMotorMs: LIMITE_MOTOR_MS,
    maxDurationFuncaoMs: MAX_DURATION_FUNCAO_MS,
    margemFinalizacaoMs: MARGEM_FINALIZACAO_MS,
    limiteMinimoViavelMs: LIMITE_MINIMO_VIAVEL_MS,
  };

  it("tempo já consumido pequeno: retorna o limite do Motor (240s), nunca a margem restante inteira (300s)", () => {
    const resultado = calcularLimiteEfetivoMsReal({ ...PARAMS_PADRAO, tempoJaConsumidoMs: 1_000 });
    expect(resultado).toBe(LIMITE_MOTOR_MS);
  });

  it("tempo já consumido alto: retorna a margem restante (já descontada a margem de finalização), menor que o limite do Motor", () => {
    // maxDuration=300s, consumido=200s, margemFinalizacao=10s -> restam 90s, abaixo dos 240s do Motor.
    const resultado = calcularLimiteEfetivoMsReal({ ...PARAMS_PADRAO, tempoJaConsumidoMs: 200_000 });
    expect(resultado).toBe(MAX_DURATION_FUNCAO_MS - 200_000 - MARGEM_FINALIZACAO_MS);
    expect(resultado).toBeLessThan(LIMITE_MOTOR_MS);
  });

  it("exatamente no limite mínimo viável: ainda retorna um valor (não nulo)", () => {
    const tempoJaConsumidoMs = MAX_DURATION_FUNCAO_MS - MARGEM_FINALIZACAO_MS - LIMITE_MINIMO_VIAVEL_MS;
    const resultado = calcularLimiteEfetivoMsReal({ ...PARAMS_PADRAO, tempoJaConsumidoMs });
    expect(resultado).toBe(LIMITE_MINIMO_VIAVEL_MS);
  });

  it("1ms abaixo do limite mínimo viável: null - o Motor não deve iniciar", () => {
    const tempoJaConsumidoMs = MAX_DURATION_FUNCAO_MS - MARGEM_FINALIZACAO_MS - LIMITE_MINIMO_VIAVEL_MS + 1;
    const resultado = calcularLimiteEfetivoMsReal({ ...PARAMS_PADRAO, tempoJaConsumidoMs });
    expect(resultado).toBeNull();
  });

  it("tempo já consumido excede o próprio maxDuration da função: null, nunca um número negativo", () => {
    const resultado = calcularLimiteEfetivoMsReal({ ...PARAMS_PADRAO, tempoJaConsumidoMs: MAX_DURATION_FUNCAO_MS + 5_000 });
    expect(resultado).toBeNull();
  });
});

// Achado #1 da auditoria do PR #1: calcularLimiteEfetivoMs era chamado
// ANTES de lerVersaoCapacidade/montarEntradaSerializavel dentro de
// executarCalculoMotorSupervisionado - o tempo real gasto por essas
// chamadas nunca entrava no orçamento entregue à Worker. Corrigido para
// ser chamado imediatamente antes de executarCalculoSupervisionado.
describe("orquestrarSolicitacaoCalculoPcp - orçamento de tempo recalculado após a preparação (achado #1)", () => {
  it("preparação demorada: o tempo consumido passado a calcularLimiteEfetivoMs reflete a demora real, nunca só o tempo até o início da função", async () => {
    const ATRASO_PREPARACAO_MS = 60;
    const { deps, calcularLimiteEfetivoMs, montarEntradaSerializavel } = criarDependenciasFalsas();
    montarEntradaSerializavel.mockImplementation(async (_uid: string, _datas: string[]) => {
      await new Promise((resolve) => setTimeout(resolve, ATRASO_PREPARACAO_MS));
      return entradaSerializavelNormal();
    });

    await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    // A pré-checagem (antes da reserva) e o recálculo (antes da Worker)
    // chamam a função - a ÚLTIMA chamada é a que importa para este
    // achado: precisa refletir o atraso real da preparação.
    const tempoPassadoNaUltimaChamada = calcularLimiteEfetivoMs.mock.calls.at(-1)?.[0] as number;
    expect(tempoPassadoNaUltimaChamada).toBeGreaterThanOrEqual(ATRASO_PREPARACAO_MS);
  });

  it("preparação consome a margem toda: sem_margem_segura_para_executar, Worker NUNCA chamada, reserva finalizada como falhou", async () => {
    const { deps, executarCalculoSupervisionado, finalizarReserva, calcularLimiteEfetivoMs } = criarDependenciasFalsas();
    // Primeira chamada (pré-checagem, antes da reserva) tem margem; a
    // segunda (recalculada após a preparação) não tem mais - simula
    // exatamente o cenário do achado #1: a preparação consumiu a
    // margem que existia no início.
    let chamada = 0;
    calcularLimiteEfetivoMs.mockImplementation(() => {
      chamada += 1;
      return chamada === 1 ? 240_000 : null;
    });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "sem_margem_segura_para_executar" });
    expect(executarCalculoSupervisionado).not.toHaveBeenCalled();
    expect(finalizarReserva).toHaveBeenCalledWith("empresa-1", RESERVA_ADQUIRIDA_PADRAO.execucaoId, "falhou");
  });
});
