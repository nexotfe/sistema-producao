// PCP-Etapa2O.8B-I5 Parte 3: testes do orquestrador de movimento de
// prioridade, agora protegido por reserva exclusiva. Dependências
// 100% falsas - a RPC real (iniciar_recalculo_pcp/reordenar_fila_pcp/
// finalizar_recalculo_pcp) só é validada em sandbox (ver relatório da
// Parte 3). executarRecalculoConsultivo é sempre simulado aqui também,
// coerente com a ligação real (moverPrioridadeProjetoPcpAction.ts) -
// nenhum teste deste arquivo exercita o Motor real.
import { describe, expect, it, vi } from "vitest";
import {
  orquestrarMovimentoPrioridadePcp,
  type DependenciasMoverPrioridadePcp,
  type PayloadMoverPrioridadePcp,
  type ResultadoIniciarReservaPcp,
  type ResultadoRecalculoConsultivoPosMovimento,
} from "./orquestrarMovimentoPrioridadePcp";

const PAYLOAD_PADRAO: PayloadMoverPrioridadePcp = {
  projetoId: "projeto-e",
  vizinhoAnteriorProjetoId: null,
  vizinhoSeguinteProjetoId: "projeto-a",
  motivo: "antecipação solicitada pela diretoria",
  dataInicial: "2026-11-02",
  dataFinal: "2026-11-06",
};

const RESERVA_ADQUIRIDA_PADRAO: ResultadoIniciarReservaPcp = {
  execucaoId: "execucao-1",
  adquirida: true,
  motivo: "adquirida",
  responsavelAtualNome: "Usuário Um",
};

const RECALCULO_REAL_PADRAO: ResultadoRecalculoConsultivoPosMovimento = {
  ok: true,
  versaoCapacidadeUtilizada: "7",
  operacoes: [],
  excluidas: [],
};

function criarDependenciasFalsas(
  overrides: Partial<{
    userId: string | null;
    autorizado: boolean;
    empresaId: string | null;
    reserva: ResultadoIniciarReservaPcp;
    erroIniciarReserva: Error;
    posicaoNova: number;
    eventoHistoricoId: string;
    erroReordenacao: Error;
    recalculo: ResultadoRecalculoConsultivoPosMovimento;
    erroRecalculo: Error;
    finalizarRetorno: boolean;
    erroFinalizar: Error;
  }> = {},
) {
  const userId: string | null = "userId" in overrides ? (overrides.userId as string | null) : "usuario-1";
  const autorizado = overrides.autorizado ?? true;
  const empresaId: string | null = "empresaId" in overrides ? (overrides.empresaId as string | null) : "empresa-1";
  const reserva = overrides.reserva ?? RESERVA_ADQUIRIDA_PADRAO;
  const posicaoNova = overrides.posicaoNova ?? 500;
  const eventoHistoricoId = overrides.eventoHistoricoId ?? "evento-1";
  const recalculo = overrides.recalculo ?? RECALCULO_REAL_PADRAO;
  const finalizarRetorno = overrides.finalizarRetorno ?? true;

  const autenticar = vi.fn(async () => userId);
  const autorizar = vi.fn(async (_uid: string) => autorizado);
  const resolverEmpresa = vi.fn(async (_uid: string) => empresaId);
  const iniciarReserva = vi.fn(async (_empresaId: string, _uid: string) => {
    if (overrides.erroIniciarReserva) throw overrides.erroIniciarReserva;
    return reserva;
  });
  const reordenarFila = vi.fn(async (_params: unknown) => {
    if (overrides.erroReordenacao) throw overrides.erroReordenacao;
    return { posicaoNova, eventoHistoricoId };
  });
  const finalizarReserva = vi.fn(async (_empresaId: string, _execucaoId: string, _situacao: "concluida" | "falhou") => {
    if (overrides.erroFinalizar) throw overrides.erroFinalizar;
    return finalizarRetorno;
  });
  const executarRecalculoConsultivo = vi.fn(
    async (_uid: string, _empresaId: string, _dataInicial: string, _dataFinal: string, _inicioOrcamentoMs: number) => {
      if (overrides.erroRecalculo) throw overrides.erroRecalculo;
      return recalculo;
    },
  );

  const deps: DependenciasMoverPrioridadePcp = {
    autenticar,
    autorizar,
    resolverEmpresa,
    iniciarReserva,
    reordenarFila,
    finalizarReserva,
    executarRecalculoConsultivo,
  };
  return { deps, autenticar, autorizar, resolverEmpresa, iniciarReserva, reordenarFila, finalizarReserva, executarRecalculoConsultivo };
}

describe("orquestrarMovimentoPrioridadePcp - autenticação e autorização (curto-circuito)", () => {
  it("usuário sem sessão: nao_autenticado, nunca chama iniciarReserva nem reordenarFila", async () => {
    const { deps, autorizar, iniciarReserva, reordenarFila } = criarDependenciasFalsas({ userId: null });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(autorizar).not.toHaveBeenCalled();
    expect(iniciarReserva).not.toHaveBeenCalled();
    expect(reordenarFila).not.toHaveBeenCalled();
  });

  it("usuário sem pcp.alterar_prioridade: nao_autorizado, nunca chama iniciarReserva", async () => {
    const { deps, iniciarReserva } = criarDependenciasFalsas({ autorizado: false });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado" });
    expect(iniciarReserva).not.toHaveBeenCalled();
  });

  it("empresa não resolvível: empresa_nao_resolvida, nunca chama iniciarReserva", async () => {
    const { deps, iniciarReserva } = criarDependenciasFalsas({ empresaId: null });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "empresa_nao_resolvida" });
    expect(iniciarReserva).not.toHaveBeenCalled();
  });
});

describe("orquestrarMovimentoPrioridadePcp - validação de payload (nunca chega a adquirir reserva)", () => {
  it("sem nenhum vizinho: payload_invalido", async () => {
    const { deps, iniciarReserva } = criarDependenciasFalsas();

    const resultado = await orquestrarMovimentoPrioridadePcp(
      { ...PAYLOAD_PADRAO, vizinhoAnteriorProjetoId: null, vizinhoSeguinteProjetoId: null },
      deps,
    );

    expect(resultado).toMatchObject({ ok: false, motivo: "payload_invalido" });
    expect(iniciarReserva).not.toHaveBeenCalled();
  });

  it("vizinho igual ao próprio projeto: payload_invalido", async () => {
    const { deps } = criarDependenciasFalsas();

    const resultado = await orquestrarMovimentoPrioridadePcp(
      { ...PAYLOAD_PADRAO, vizinhoSeguinteProjetoId: PAYLOAD_PADRAO.projetoId },
      deps,
    );

    expect(resultado).toMatchObject({ ok: false, motivo: "payload_invalido" });
  });

  it("motivo vazio ou só espaços: payload_invalido", async () => {
    const { deps, iniciarReserva } = criarDependenciasFalsas();

    const resultado = await orquestrarMovimentoPrioridadePcp({ ...PAYLOAD_PADRAO, motivo: "   " }, deps);

    expect(resultado).toMatchObject({ ok: false, motivo: "payload_invalido" });
    expect(iniciarReserva).not.toHaveBeenCalled();
  });

  it("janela inválida (dataInicial > dataFinal): payload_invalido", async () => {
    const { deps } = criarDependenciasFalsas();

    const resultado = await orquestrarMovimentoPrioridadePcp(
      { ...PAYLOAD_PADRAO, dataInicial: "2026-12-01", dataFinal: "2026-11-01" },
      deps,
    );

    expect(resultado).toMatchObject({ ok: false, motivo: "payload_invalido" });
  });
});

describe("orquestrarMovimentoPrioridadePcp - reserva (Parte 3)", () => {
  it("reserva ocupada: reserva_ocupada com detalhe, NUNCA chama reordenarFila", async () => {
    const { deps, reordenarFila } = criarDependenciasFalsas({
      reserva: { execucaoId: "execucao-de-outro", adquirida: false, motivo: "ocupada", responsavelAtualNome: "Outro Usuário" },
    });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado).toEqual({
      ok: false,
      motivo: "reserva_ocupada",
      detalhe: { responsavelAtualNome: "Outro Usuário", situacao: "ocupada" },
    });
    expect(reordenarFila).not.toHaveBeenCalled();
  });

  it("reserva em recuperacao_pendente: reserva_ocupada reporta a situação exata, NUNCA chama reordenarFila", async () => {
    const { deps, reordenarFila } = criarDependenciasFalsas({
      reserva: { execucaoId: "execucao-antiga", adquirida: false, motivo: "recuperacao_pendente", responsavelAtualNome: "ADM A" },
    });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado).toMatchObject({ ok: false, motivo: "reserva_ocupada", detalhe: { situacao: "recuperacao_pendente" } });
    expect(reordenarFila).not.toHaveBeenCalled();
  });

  it("erro inesperado da RPC ao iniciar a reserva: falha_ao_iniciar_reserva, nunca chama reordenarFila", async () => {
    const { deps, reordenarFila } = criarDependenciasFalsas({
      erroIniciarReserva: new Error("iniciar_recalculo_pcp: iniciado_por não possui a permissão pcp.alterar_prioridade exigida pelo contexto alterar_prioridade."),
    });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado).toEqual({
      ok: false,
      motivo: "falha_ao_iniciar_reserva",
      detalhe: "iniciar_recalculo_pcp: iniciado_por não possui a permissão pcp.alterar_prioridade exigida pelo contexto alterar_prioridade.",
    });
    expect(reordenarFila).not.toHaveBeenCalled();
  });
});

describe("orquestrarMovimentoPrioridadePcp - identidade em toda a cadeia (ressalva 4)", () => {
  it("o MESMO userId autenticado é usado para adquirir a reserva E para mover a fila (movidoPor)", async () => {
    const { deps, iniciarReserva, reordenarFila } = criarDependenciasFalsas({ userId: "usuario-especifico" });

    await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(iniciarReserva).toHaveBeenCalledWith("empresa-1", "usuario-especifico");
    expect(reordenarFila).toHaveBeenCalledWith(
      expect.objectContaining({ movidoPor: "usuario-especifico", execucaoId: RESERVA_ADQUIRIDA_PADRAO.execucaoId, motivo: PAYLOAD_PADRAO.motivo }),
    );
  });
});

describe("orquestrarMovimentoPrioridadePcp - falha na reordenação (prioridade nunca muda)", () => {
  it("falha da RPC real: falha_reordenacao, libera a reserva como 'falhou', NUNCA chama executarRecalculoConsultivo", async () => {
    const { deps, finalizarReserva, executarRecalculoConsultivo } = criarDependenciasFalsas({
      erroReordenacao: new Error("reordenar_fila_pcp: vizinho anterior não está na fila da empresa."),
    });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado).toEqual({
      ok: false,
      motivo: "falha_reordenacao",
      detalhe: "reordenar_fila_pcp: vizinho anterior não está na fila da empresa.",
    });
    expect(finalizarReserva).toHaveBeenCalledWith("empresa-1", RESERVA_ADQUIRIDA_PADRAO.execucaoId, "falhou");
    expect(executarRecalculoConsultivo).not.toHaveBeenCalled();
  });

  it("falha na reordenação E falha ao liberar a reserva: ainda retorna falha_reordenacao (nunca esconde o motivo original)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps } = criarDependenciasFalsas({
      erroReordenacao: new Error("reordenar_fila_pcp: motivo é obrigatório."),
      erroFinalizar: new Error("finalizar_recalculo_pcp: timeout de rede"),
    });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "falha_reordenacao", detalhe: "reordenar_fila_pcp: motivo é obrigatório." });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe("orquestrarMovimentoPrioridadePcp - sucesso, validação automática e liberação (ressalvas 2 e 3)", () => {
  it("sucesso com recálculo real concluído (ok:true): situação final 'concluida', reserva liberada normalmente", async () => {
    const { deps, finalizarReserva, executarRecalculoConsultivo } = criarDependenciasFalsas();

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado).toEqual({
      ok: true,
      posicaoNova: 500,
      eventoHistoricoId: "evento-1",
      recalculo: RECALCULO_REAL_PADRAO,
      liberacaoReserva: { liberada: true },
    });
    expect(finalizarReserva).toHaveBeenCalledWith("empresa-1", RESERVA_ADQUIRIDA_PADRAO.execucaoId, "concluida");
    // Orçamento de tempo do recálculo inclui o tempo gasto desde o
    // início desta operação (auditoria I6-C, condição 3) - nunca
    // reiniciado no momento do recálculo.
    expect(executarRecalculoConsultivo.mock.calls[0]?.[4]).toBeTypeOf("number");
  });

  it("recálculo real devolve ok:false (ex.: interrompido pelo supervisor): situação final 'falhou', prioridade e histórico preservados", async () => {
    const { deps, finalizarReserva } = criarDependenciasFalsas({
      recalculo: { ok: false, motivo: "interrompido_por_limite_de_tempo" },
    });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.posicaoNova).toBe(500); // prioridade JÁ persistida, nunca desfeita por falha/interrupção do recálculo.
    expect(resultado.eventoHistoricoId).toBe("evento-1");
    expect(resultado.recalculo).toEqual({ ok: false, motivo: "interrompido_por_limite_de_tempo" });
    expect(finalizarReserva).toHaveBeenCalledWith("empresa-1", RESERVA_ADQUIRIDA_PADRAO.execucaoId, "falhou");
  });

  // Achado #1 da auditoria do PR #1: sem margem segura para o recálculo
  // (ex.: a preparação dos dados consumiu o orçamento de tempo) - a
  // movimentação de prioridade JÁ persistida (posição + Histórico)
  // nunca pode ser desfeita por isso; só o recálculo consultivo falha,
  // de forma explícita, nunca disfarçado como sucesso.
  it("sem margem segura para o recálculo: prioridade e justificativa preservadas, recálculo informado como falho, reserva finalizada como falhou", async () => {
    const { deps, finalizarReserva, reordenarFila } = criarDependenciasFalsas({
      recalculo: { ok: false, motivo: "sem_margem_segura_para_executar" },
    });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.posicaoNova).toBe(500);
    expect(resultado.eventoHistoricoId).toBe("evento-1");
    expect(resultado.recalculo).toEqual({ ok: false, motivo: "sem_margem_segura_para_executar" });
    expect(reordenarFila).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: PAYLOAD_PADRAO.motivo, projetoId: PAYLOAD_PADRAO.projetoId }),
    );
    expect(finalizarReserva).toHaveBeenCalledWith("empresa-1", RESERVA_ADQUIRIDA_PADRAO.execucaoId, "falhou");
  });

  it("sucesso mas executarRecalculoConsultivo lança exceção inesperada: situação final 'falhou' (nunca 'concluida' só por engano)", async () => {
    const { deps, finalizarReserva } = criarDependenciasFalsas({ erroRecalculo: new Error("falha inesperada no passo de recálculo") });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.posicaoNova).toBe(500); // prioridade JÁ persistida, nunca desfeita por falha do recálculo.
    expect(resultado.recalculo).toEqual({ ok: false, motivo: "falha_inesperada", detalhe: "falha inesperada no passo de recálculo" });
    expect(finalizarReserva).toHaveBeenCalledWith("empresa-1", RESERVA_ADQUIRIDA_PADRAO.execucaoId, "falhou");
  });

  it("sucesso mas finalizarReserva devolve false: ok:true preservado, liberacaoReserva.liberada é false com detalhe (nunca aparenta término normal)", async () => {
    const { deps } = criarDependenciasFalsas({ finalizarRetorno: false });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.posicaoNova).toBe(500);
    expect(resultado.eventoHistoricoId).toBe("evento-1");
    expect(resultado.liberacaoReserva.liberada).toBe(false);
    if (resultado.liberacaoReserva.liberada) return;
    expect(resultado.liberacaoReserva.detalhe).toContain("finalizar_recalculo_pcp retornou false");
  });

  it("sucesso mas finalizarReserva lança exceção: ok:true preservado, liberacaoReserva.liberada é false com o erro real", async () => {
    const { deps } = criarDependenciasFalsas({ erroFinalizar: new Error("finalizar_recalculo_pcp: timeout de rede") });

    const resultado = await orquestrarMovimentoPrioridadePcp(PAYLOAD_PADRAO, deps);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.liberacaoReserva).toEqual({ liberada: false, detalhe: "finalizar_recalculo_pcp: timeout de rede" });
  });
});

describe("orquestrarMovimentoPrioridadePcp - ausência de persistência oficial (preservado da Etapa 2O.3)", () => {
  it("DependenciasMoverPrioridadePcp não expõe nenhum método de persistência de programação oficial", () => {
    const { deps } = criarDependenciasFalsas();
    const chaves = Object.keys(deps).sort();
    expect(chaves).toEqual([
      "autenticar",
      "autorizar",
      "executarRecalculoConsultivo",
      "finalizarReserva",
      "iniciarReserva",
      "reordenarFila",
      "resolverEmpresa",
    ]);
  });
});
