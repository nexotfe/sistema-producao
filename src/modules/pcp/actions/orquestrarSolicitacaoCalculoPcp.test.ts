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
import type { ResultadoSupervisaoMotorPcp } from "../lib/motor/supervisorMotorPcp";
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
