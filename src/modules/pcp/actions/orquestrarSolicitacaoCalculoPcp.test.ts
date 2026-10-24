// PCP-Etapa2N: testes do orquestrador de solicitação de recálculo, com
// dependências 100% falsas (nenhum Supabase real) - exercitam o Motor
// REAL (escalonarConjuntoGenerico, importado por orquestrarSolicitacaoCalculoPcp.ts),
// nunca uma reimplementação da matemática de escalonamento.
//
// Objetivo desta etapa (ver pedido): comprovar que o fluxo consultivo
// (a) exige autenticação, (b) respeita autorização, (c) nunca escreve
// nada, (d) detecta mudança de capacidade durante o cálculo, (e) devolve
// um resultado fiel ao que o Motor calculou - sem reconstruir Motor/Assembler.
import { describe, expect, it, vi } from "vitest";
import {
  orquestrarSolicitacaoCalculoPcp,
  type DependenciasSolicitacaoCalculoPcp,
  type PayloadSolicitacaoCalculoPcp,
} from "./orquestrarSolicitacaoCalculoPcp";
import type { EntradaMotorPcp } from "../lib/motor/montarEntradaMotorPcp";
import type { CandidatoComCapacidadeDiaria, FaixaCapacidadeDia } from "@/modules/simulacao-comercial/lib/cenarios/alocarOperacaoDiaAdia";

const JANELA_PADRAO: PayloadSolicitacaoCalculoPcp = { dataInicial: "2026-11-02", dataFinal: "2026-11-06" };

/** Mesmo padrão de construirCandidatoPcp (montarEntradaMotorPcp.ts) - capacidade cheia em todo dia da grade recebida. */
function candidatoComCapacidade(id: string, horasDiaDisponiveis: number): CandidatoComCapacidadeDiaria {
  const restante = new Map<string, number>();
  return {
    id,
    produtividade: 1,
    faixasDoDia: (data): FaixaCapacidadeDia[] => {
      const horas = restante.has(data) ? restante.get(data)! : horasDiaDisponiveis;
      if (horas <= 0) return [];
      return [{ natureza: "normal", horasDisponiveis: horas, contratacaoId: null, elegibilidade: null }];
    },
    consumir: (data, _natureza, horasMaquina) => {
      const atual = restante.has(data) ? restante.get(data)! : horasDiaDisponiveis;
      restante.set(data, atual - horasMaquina);
    },
  };
}

/** 1 OP, 1 recurso com capacidade ampla - resolve como "concluida" dentro da janela padrão. */
function entradaMotorNormal(): EntradaMotorPcp {
  return {
    ocorrencias: [
      {
        chave: { opId: "op-1" },
        projetoId: "projeto-1",
        necessarioHorasPadrao: 2,
        candidatoIdsPorPrioridade: ["recurso-1"],
        ehOrcamentoNovo: false,
        dataInicioJanela: "2026-11-02",
      },
    ],
    dependencias: [],
    registroCandidatos: new Map([["recurso-1", candidatoComCapacidade("recurso-1", 8)]]),
    criterioPrioridadeDeNegocio: (ocorrencia) => (ocorrencia.projetoId === "projeto-1" ? 1 : 2),
    excluidas: [],
  };
}

function entradaMotorVazia(): EntradaMotorPcp {
  return {
    ocorrencias: [],
    dependencias: [],
    registroCandidatos: new Map(),
    criterioPrioridadeDeNegocio: () => 0,
    excluidas: [],
  };
}

/** necessarioHorasPadrao<=0 dispara RangeError dentro do próprio Motor (validarEntrada) - falha real do Motor, não simulada por fora dele. */
function entradaMotorInvalida(): EntradaMotorPcp {
  return {
    ocorrencias: [
      {
        chave: { opId: "op-invalida" },
        projetoId: "projeto-1",
        necessarioHorasPadrao: -1,
        candidatoIdsPorPrioridade: ["recurso-1"],
        ehOrcamentoNovo: false,
        dataInicioJanela: "2026-11-02",
      },
    ],
    dependencias: [],
    registroCandidatos: new Map([["recurso-1", candidatoComCapacidade("recurso-1", 8)]]),
    criterioPrioridadeDeNegocio: () => 1,
    excluidas: [],
  };
}

function criarDependenciasFalsas(
  overrides: Partial<{
    userId: string | null;
    autorizado: boolean;
    empresaId: string | null;
    versoes: number[]; // consumidas em ordem: 1ª chamada = antes, 2ª chamada = depois
    entrada: EntradaMotorPcp | Error;
  }> = {},
) {
  // "in" (nunca ??) - precisamos distinguir "não informado" (usa default)
  // de "explicitamente null" (simula ausência real), e null é absorvido
  // por ?? exatamente como undefined.
  const userId: string | null = "userId" in overrides ? (overrides.userId as string | null) : "usuario-1";
  const autorizado = overrides.autorizado ?? true;
  const empresaId: string | null = "empresaId" in overrides ? (overrides.empresaId as string | null) : "empresa-1";
  const versoes = overrides.versoes ?? [5, 5];
  const entrada = overrides.entrada ?? entradaMotorNormal();

  let chamadaVersao = 0;

  const autenticar = vi.fn(async () => userId);
  const autorizar = vi.fn(async (_uid: string) => autorizado);
  const resolverEmpresa = vi.fn(async (_uid: string) => empresaId);
  const lerVersaoCapacidade = vi.fn(async (_empresaId: string) => {
    const valor = versoes[chamadaVersao] ?? versoes[versoes.length - 1] ?? null;
    chamadaVersao += 1;
    return valor;
  });
  const montarEntrada = vi.fn(async (_uid: string, _datas: string[]) => {
    if (entrada instanceof Error) throw entrada;
    return entrada;
  });

  const deps: DependenciasSolicitacaoCalculoPcp = { autenticar, autorizar, resolverEmpresa, lerVersaoCapacidade, montarEntrada };
  return { deps, autenticar, autorizar, resolverEmpresa, lerVersaoCapacidade, montarEntrada };
}

describe("orquestrarSolicitacaoCalculoPcp - autenticação e autorização (ordem e curto-circuito)", () => {
  it("usuário sem sessão: retorna nao_autenticado e NUNCA chama autorizar/resolverEmpresa/lerVersaoCapacidade/montarEntrada", async () => {
    const { deps, autorizar, resolverEmpresa, lerVersaoCapacidade, montarEntrada } = criarDependenciasFalsas({ userId: null });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(autorizar).not.toHaveBeenCalled();
    expect(resolverEmpresa).not.toHaveBeenCalled();
    expect(lerVersaoCapacidade).not.toHaveBeenCalled();
    expect(montarEntrada).not.toHaveBeenCalled();
  });

  it("usuário autenticado mas sem a permissão pcp.solicitar_calculo: retorna nao_autorizado e NUNCA chama resolverEmpresa/lerVersaoCapacidade/montarEntrada", async () => {
    const { deps, autenticar, autorizar, resolverEmpresa, lerVersaoCapacidade, montarEntrada } = criarDependenciasFalsas({ autorizado: false });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado" });
    expect(autenticar).toHaveBeenCalledTimes(1);
    expect(autorizar).toHaveBeenCalledTimes(1);
    expect(resolverEmpresa).not.toHaveBeenCalled();
    expect(lerVersaoCapacidade).not.toHaveBeenCalled();
    expect(montarEntrada).not.toHaveBeenCalled();
  });

  it("usuário autorizado mas sem empresa resolvível: retorna empresa_nao_resolvida", async () => {
    const { deps, lerVersaoCapacidade, montarEntrada } = criarDependenciasFalsas({ empresaId: null });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "empresa_nao_resolvida" });
    expect(lerVersaoCapacidade).not.toHaveBeenCalled();
    expect(montarEntrada).not.toHaveBeenCalled();
  });

  it("usuário autorizado: autorizar recebe exatamente o userId devolvido por autenticar, nunca um valor do payload", async () => {
    const { deps, autorizar } = criarDependenciasFalsas({ userId: "usuario-especifico-xyz" });

    await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(autorizar).toHaveBeenCalledWith("usuario-especifico-xyz");
  });
});

describe("orquestrarSolicitacaoCalculoPcp - janela e validação de entrada", () => {
  it("janela com dataInicial posterior a dataFinal: janela_invalida, sem chamar lerVersaoCapacidade/montarEntrada", async () => {
    const { deps, lerVersaoCapacidade, montarEntrada } = criarDependenciasFalsas();

    const resultado = await orquestrarSolicitacaoCalculoPcp({ dataInicial: "2026-11-10", dataFinal: "2026-11-01" }, deps);

    expect(resultado).toEqual({
      ok: false,
      motivo: "janela_invalida",
      detalhe: "dataInicial não pode ser posterior a dataFinal.",
    });
    expect(lerVersaoCapacidade).not.toHaveBeenCalled();
    expect(montarEntrada).not.toHaveBeenCalled();
  });

  it("janela em formato inválido (não YYYY-MM-DD): janela_invalida", async () => {
    const { deps } = criarDependenciasFalsas();

    const resultado = await orquestrarSolicitacaoCalculoPcp({ dataInicial: "02/11/2026", dataFinal: "2026-11-06" }, deps);

    expect(resultado).toMatchObject({ ok: false, motivo: "janela_invalida" });
  });

  it("preservação das entradas: a janela devolvida é exatamente a recebida, mesmo com 1 único dia", async () => {
    const { deps } = criarDependenciasFalsas();

    const resultado = await orquestrarSolicitacaoCalculoPcp({ dataInicial: "2026-11-03", dataFinal: "2026-11-03" }, deps);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.janela).toEqual({ dataInicial: "2026-11-03", dataFinal: "2026-11-03" });
    }
  });
});

describe("orquestrarSolicitacaoCalculoPcp - versão de capacidade (consistência e concorrência)", () => {
  it("versão de capacidade indisponível ANTES do cálculo: versao_capacidade_indisponivel, sem chamar montarEntrada", async () => {
    const { deps, montarEntrada } = criarDependenciasFalsas({ versoes: [] });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "versao_capacidade_indisponivel" });
    expect(montarEntrada).not.toHaveBeenCalled();
  });

  it("versão estável durante o cálculo: ok=true e Motor executa normalmente", async () => {
    const { deps } = criarDependenciasFalsas({ versoes: [7, 7] });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.versaoCapacidadeUtilizada).toBe("7");
    }
  });

  it("versão de capacidade mudou DURANTE o cálculo (antes != depois): descarta o resultado, nunca executa como se nada tivesse mudado", async () => {
    const { deps, montarEntrada } = criarDependenciasFalsas({ versoes: [5, 6] });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "capacidade_mudou_durante_calculo" });
    // montarEntrada É chamado (é o que acontece DURANTE a janela de leitura) - só 1 vez, nunca re-tentado.
    expect(montarEntrada).toHaveBeenCalledTimes(1);
  });

  it("versão de capacidade indisponível DEPOIS do cálculo: versao_capacidade_indisponivel", async () => {
    const { deps } = criarDependenciasFalsas({ versoes: [5, null as unknown as number] });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "versao_capacidade_indisponivel" });
  });
});

describe("orquestrarSolicitacaoCalculoPcp - execução do Motor real e forma do resultado", () => {
  it("cálculo normal: 1 OP com capacidade suficiente resolve 'concluida', com alocações e déficit zero", async () => {
    const { deps } = criarDependenciasFalsas({ entrada: entradaMotorNormal() });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.operacoes).toHaveLength(1);
    const operacao = resultado.operacoes[0];
    expect(operacao.opId).toBe("op-1");
    expect(operacao.status).toBe("concluida");
    expect(operacao.deficitResidualHorasPadrao).toBe(0);
    expect(operacao.dataInicioReal).not.toBeNull();
    expect(operacao.dataFimReal).not.toBeNull();
    expect(Array.isArray(operacao.alocacoes)).toBe(true);
    expect(operacao.alocacoes.length).toBeGreaterThan(0);
    expect(resultado.excluidas).toEqual([]);
  });

  it("ausência de dados programáveis (nenhuma ocorrência montada): ok=true com operacoes=[] - nunca erro", async () => {
    const { deps } = criarDependenciasFalsas({ entrada: entradaMotorVazia() });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toMatchObject({ ok: true, operacoes: [], excluidas: [] });
  });

  it("falha controlada do Motor real (entrada estruturalmente inválida): falha_interna, com detalhe do erro, nunca lança para fora", async () => {
    const { deps } = criarDependenciasFalsas({ entrada: entradaMotorInvalida() });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.motivo).toBe("falha_interna");
    expect((resultado as { detalhe: string }).detalhe).toMatch(/necessarioHorasPadrao/);
  });

  it("falha ao montar a entrada do Motor (exceção de montarEntrada): falha_interna, nunca propaga a exceção crua", async () => {
    const { deps } = criarDependenciasFalsas({ entrada: new Error("falha simulada de montarEntradaMotorPcp") });

    const resultado = await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    expect(resultado).toEqual({ ok: false, motivo: "falha_interna", detalhe: "falha simulada de montarEntradaMotorPcp" });
  });
});

describe("orquestrarSolicitacaoCalculoPcp - ausência estrutural de escrita (evidência de CÓDIGO, não de execução)", () => {
  it("DependenciasSolicitacaoCalculoPcp não expõe nenhum método de escrita/persistência - só leitura e cálculo em memória", () => {
    // Evidência de código: o próprio contrato de dependências injetáveis
    // não tem (e nunca teve, por tipo) nenhum método capaz de escrever -
    // só autenticar/autorizar/resolverEmpresa/lerVersaoCapacidade/montarEntrada.
    const { deps } = criarDependenciasFalsas();
    const chaves = Object.keys(deps).sort();
    expect(chaves).toEqual(["autenticar", "autorizar", "lerVersaoCapacidade", "montarEntrada", "resolverEmpresa"]);
  });

  it("nenhuma dependência falsa precisou simular qualquer client de escrita (Supabase real nunca é construído aqui) - só funções puras/assíncronas triviais", async () => {
    const { deps, autenticar, autorizar, resolverEmpresa, lerVersaoCapacidade, montarEntrada } = criarDependenciasFalsas();

    await orquestrarSolicitacaoCalculoPcp(JANELA_PADRAO, deps);

    // Cada dependência foi chamada no máximo 1x por execução normal - nenhum padrão de retry/novo round-trip de escrita.
    for (const spy of [autenticar, autorizar, resolverEmpresa, montarEntrada]) {
      expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    }
    expect(lerVersaoCapacidade.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
