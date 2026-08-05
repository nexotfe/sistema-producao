// Testes das correções 4 e 5 da auditoria da Entrega 1.
//
// NÍVEL DESTE TESTE: orquestração com dependências injetadas (mocks em
// memória, sem rede, sem Supabase real). NÃO é um teste end-to-end nem
// de integração - não prova que o Supabase real, RLS, ou a RPC SQL em
// si se comportam assim; prova que a FUNÇÃO orquestradora
// (orquestrarAprovacaoAutoritativa), dado um conjunto de dependências
// que respeitam os contratos de tipo declarados, toma as decisões
// corretas na ordem certa. A fidelidade das dependências reais
// (aprovarSimulacaoComercialAction.ts) ao contrato aqui testado não é
// verificada automaticamente por este arquivo.
import { describe, expect, it, vi } from "vitest";
import {
  MENSAGEM_ERRO_GENERICA,
  orquestrarAprovacaoAutoritativa,
  type DependenciasAprovacaoAutoritativa,
} from "./orquestrarAprovacaoAutoritativa";
import type { ItemSimulacaoOperacao, ResultadoSimulacao } from "../lib/executarSimulacao";
import type { JanelaComercialValida, JanelaComercialInvalida } from "../lib/prepararJanelaComercial";
import type { PayloadAprovacao } from "./validarPayloadAprovacao";
import { EstruturaFabricacaoIncompletaError } from "../lib/errors";
import { SubconjuntoSemBomError } from "@/modules/bom/lib/errors";

function criarItem(overrides: Partial<ItemSimulacaoOperacao> = {}): ItemSimulacaoOperacao {
  return {
    bomOperacaoId: "op-1",
    recursoOriginalId: "recurso-1",
    necessario: 10,
    deficit: 0,
    distribuicoes: [
      {
        recursoId: "recurso-1",
        origem: "ORIGINAL",
        ordemConsideracao: 0,
        capacidadeBrutaPeriodo: 100,
        produtividadeConsiderada: 0.9,
        capacidadeEfetiva: 90,
        comprometidoInicial: 0,
        capacidadeDisponivelInicial: 90,
        capacidadeDisponivelAntes: 90,
        horasPadraoAlocadas: 10,
        horasMaquinaEstimadas: 10 / 0.9,
        capacidadeDisponivelDepois: 80,
      },
    ],
    ...overrides,
  };
}

const JANELA_SERVIDOR: JanelaComercialValida = {
  valida: true,
  dataChegadaPrevista: "2026-11-13",
  dataDisponibilidadeProducao: "2026-11-16",
  prazoInterno: "2026-11-26",
  janelaInicio: "2026-11-16",
  janelaFim: "2026-11-26",
};

function criarPayload(overrides: Partial<PayloadAprovacao> = {}): PayloadAprovacao {
  const resultado: ResultadoSimulacao = { itensPorOperacao: [criarItem()] };

  return {
    projetoId: "projeto-1",
    resultado,
    cenarioDemanda: "Pedidos confirmados",
    modoProducao: "Normal",
    dataNecessidade: "2026-11-26",
    margemSegurancaDias: 3,
    dataPrevistaAprovacaoPedido: "2026-11-02",
    // Por padrão, IGUAL à janela que o servidor vai recalcular - os
    // testes de divergência sobrescrevem isso deliberadamente.
    janelaInicio: JANELA_SERVIDOR.janelaInicio,
    janelaFim: JANELA_SERVIDOR.janelaFim,
    chaveIdempotencia: "11111111-1111-1111-1111-111111111111",
    ...overrides,
  };
}

function criarDependenciasFelizes(
  overrides: Partial<DependenciasAprovacaoAutoritativa> = {},
): DependenciasAprovacaoAutoritativa {
  return {
    autenticar: vi.fn(async () => "usuario-1"),
    buscarEmpresaId: vi.fn(async () => "empresa-1"),
    prepararJanela: vi.fn(async () => JANELA_SERVIDOR),
    executarMotor: vi.fn(async (): Promise<ResultadoSimulacao> => ({ itensPorOperacao: [criarItem()] })),
    persistir: vi.fn(async () => ({ simulacaoComercialId: "snapshot-1", erro: null })),
    ...overrides,
  };
}

describe("orquestrarAprovacaoAutoritativa — correção 5: fronteira autoritativa testável", () => {
  it("payload com janela adulterada: o servidor recalcula, detecta a divergência, NÃO chama persistir (cliente privilegiado/RPC) e nenhuma persistência ocorre", async () => {
    // 1. Payload contém janela adulterada: o cliente diz que a janela é
    // uma coisa, mas o servidor (via prepararJanela injetado) vai
    // recalcular outra.
    const payload = criarPayload({
      janelaInicio: "2026-11-16",
      janelaFim: "2026-12-31", // adulterada - não bate com JANELA_SERVIDOR.janelaFim (2026-11-26)
    });

    const deps = criarDependenciasFelizes();

    const resultado = await orquestrarAprovacaoAutoritativa(payload, deps);

    // 2. O servidor de fato recalculou a janela (prepararJanela foi chamado).
    expect(deps.prepararJanela).toHaveBeenCalledTimes(1);

    // 3. A divergência foi detectada.
    expect(resultado.ok).toBe(false);
    if (!resultado.ok && resultado.motivo === "divergente") {
      expect(resultado.diferencas.some((d) => d.operacao === "janela-comercial" && d.campo === "janelaFim")).toBe(
        true,
      );
    } else {
      expect.unreachable(`esperava motivo "divergente", recebeu: ${JSON.stringify(resultado)}`);
    }

    // 4 e 5. O cliente privilegiado/RPC (persistir) NUNCA foi chamado -
    // logo, nenhuma persistência ocorreu.
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  it("payload com itens divergentes dos recalculados pelo Motor: também bloqueia antes de persistir", async () => {
    const payload = criarPayload({
      resultado: { itensPorOperacao: [criarItem({ necessario: 999 })] }, // diferente do que executarMotor vai devolver
    });

    const deps = criarDependenciasFelizes();

    const resultado = await orquestrarAprovacaoAutoritativa(payload, deps);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok && resultado.motivo === "divergente") {
      expect(resultado.diferencas.some((d) => d.campo === "necessario")).toBe(true);
    } else {
      expect.unreachable(`esperava motivo "divergente", recebeu: ${JSON.stringify(resultado)}`);
    }
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  it("payload consistente (janela e itens batem com o recálculo do servidor): persiste exatamente uma vez", async () => {
    const payload = criarPayload();
    const deps = criarDependenciasFelizes();

    const resultado = await orquestrarAprovacaoAutoritativa(payload, deps);

    expect(resultado).toEqual({ ok: true, simulacaoComercialId: "snapshot-1" });
    expect(deps.persistir).toHaveBeenCalledTimes(1);
  });

  it("idempotência: a mesma chaveIdempotencia do payload é repassada sem alteração a cada chamada - repetir a aprovação com o mesmo payload produz o mesmo resultado, nunca uma chave nova gerada pelo orquestrador", async () => {
    // Simula o comportamento real da RPC (v3/v4): mesma chave+hash já
    // usada retorna o snapshot já gravado, sem erro e sem duplicar -
    // este teste prova que o ORQUESTRADOR não atrapalha isso, repassando
    // exatamente a chaveIdempotencia do payload em toda chamada, nunca
    // gerando uma própria.
    const payload = criarPayload({ chaveIdempotencia: "11111111-1111-1111-1111-111111111111" });
    const persistirMock = vi.fn<DependenciasAprovacaoAutoritativa["persistir"]>(async () => ({
      simulacaoComercialId: "snapshot-idempotente",
      erro: null,
    }));
    const deps = criarDependenciasFelizes({ persistir: persistirMock });

    const resultado1 = await orquestrarAprovacaoAutoritativa(payload, deps);
    const resultado2 = await orquestrarAprovacaoAutoritativa(payload, deps);

    expect(resultado1).toEqual({ ok: true, simulacaoComercialId: "snapshot-idempotente" });
    expect(resultado2).toEqual({ ok: true, simulacaoComercialId: "snapshot-idempotente" });
    expect(persistirMock).toHaveBeenCalledTimes(2);

    const chamada1 = persistirMock.mock.calls[0][0];
    const chamada2 = persistirMock.mock.calls[1][0];
    expect(chamada1.chaveIdempotencia).toBe("11111111-1111-1111-1111-111111111111");
    expect(chamada2.chaveIdempotencia).toBe("11111111-1111-1111-1111-111111111111");
    // Mesmo payload + mesmo recálculo do servidor = mesmo hash de
    // conteúdo em ambas as chamadas (é a RPC, não simulada aqui, que
    // decide se é replay idempotente ou conflito - o orquestrador só
    // precisa ser determinístico ao calcular esse hash).
    expect(chamada1.hashSolicitacao).toBe(chamada2.hashSolicitacao);
  });

  it("sem janela produtiva: não executa o Motor nem chama persistir", async () => {
    const payload = criarPayload();
    const deps = criarDependenciasFelizes({
      prepararJanela: vi.fn(async (): Promise<JanelaComercialInvalida> => ({
        valida: false,
        motivo: "disponibilidade_apos_prazo_interno",
        dataChegadaPrevista: "2026-11-13",
        dataDisponibilidadeProducao: "2026-11-16",
        prazoInterno: "2026-11-10",
      })),
    });

    const resultado = await orquestrarAprovacaoAutoritativa(payload, deps);

    expect(resultado).toMatchObject({ ok: false, motivo: "sem_janela_produtiva" });
    expect(deps.executarMotor).not.toHaveBeenCalled();
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  it("estrutura de fabricação incompleta (EstruturaFabricacaoIncompletaError do Motor): motivo autoritativo específico, mensagem de negócio repassada, persistir nunca chamado", async () => {
    const mensagem =
      "Roteiro de fabricação incompleto: nenhuma matéria-prima ativa foi encontrada (item abc, caminho: ZTESTE-SIMCAP-002).";
    const payload = criarPayload();
    const deps = criarDependenciasFelizes({
      executarMotor: vi.fn(async () => {
        throw new EstruturaFabricacaoIncompletaError("projeto-1", mensagem);
      }),
    });

    const resultado = await orquestrarAprovacaoAutoritativa(payload, deps);

    expect(resultado).toEqual({ ok: false, motivo: "estrutura_fabricacao_incompleta", mensagem });
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  it("subconjunto sem BOM (SubconjuntoSemBomError do Motor): mesmo motivo autoritativo específico, persistir nunca chamado", async () => {
    const mensagem = 'O subconjunto SUB-01 não possui roteiro (BOM) cadastrado (caminho: PROD-RAIZ → SUB-01).';
    const payload = criarPayload();
    const deps = criarDependenciasFelizes({
      executarMotor: vi.fn(async () => {
        throw new SubconjuntoSemBomError("produto-2", "SUB-01", ["PROD-RAIZ", "SUB-01"]);
      }),
    });

    const resultado = await orquestrarAprovacaoAutoritativa(payload, deps);

    expect(resultado).toEqual({ ok: false, motivo: "estrutura_fabricacao_incompleta", mensagem });
    expect(deps.persistir).not.toHaveBeenCalled();
  });

  it("não autenticado: nem chega a resolver empresa, janela ou Motor", async () => {
    const payload = criarPayload();
    const deps = criarDependenciasFelizes({ autenticar: vi.fn(async () => null) });

    const resultado = await orquestrarAprovacaoAutoritativa(payload, deps);

    expect(resultado).toEqual({ ok: false, motivo: "nao_autenticado" });
    expect(deps.buscarEmpresaId).not.toHaveBeenCalled();
    expect(deps.prepararJanela).not.toHaveBeenCalled();
    expect(deps.persistir).not.toHaveBeenCalled();
  });
});

describe("orquestrarAprovacaoAutoritativa — correção 4: mensagens seguras", () => {
  it("quando a persistência (RPC) falha, o detalhe técnico vai só para console.error - o retorno usa a mensagem genérica", async () => {
    const detalheTecnicoSensivel = "relation \"simulacoes_comerciais\" violates constraint xyz_chk (host: db.interno:5432)";
    const espiaoConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const payload = criarPayload();
    const deps = criarDependenciasFelizes({
      persistir: vi.fn(async () => ({ simulacaoComercialId: null, erro: detalheTecnicoSensivel })),
    });

    const resultado = await orquestrarAprovacaoAutoritativa(payload, deps);

    expect(resultado).toEqual({ ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA });
    expect(JSON.stringify(resultado)).not.toContain("db.interno");
    expect(JSON.stringify(resultado)).not.toContain("violates constraint");

    // O detalhe não desaparece - só não vai para o usuário.
    expect(espiaoConsoleError).toHaveBeenCalledWith(expect.stringContaining(detalheTecnicoSensivel));

    espiaoConsoleError.mockRestore();
  });

  it("quando uma dependência lança uma exceção inesperada, o retorno também usa a mensagem genérica, nunca erro.message", async () => {
    const detalheTecnicoSensivel = "ECONNREFUSED 10.0.0.5:5432 - internal connection string leaked here";
    const espiaoConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const payload = criarPayload();
    const deps = criarDependenciasFelizes({
      executarMotor: vi.fn(async () => {
        throw new Error(detalheTecnicoSensivel);
      }),
    });

    const resultado = await orquestrarAprovacaoAutoritativa(payload, deps);

    expect(resultado).toEqual({ ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA });
    expect(JSON.stringify(resultado)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(resultado)).not.toContain("connection string");
    expect(deps.persistir).not.toHaveBeenCalled();

    expect(espiaoConsoleError).toHaveBeenCalledWith(expect.stringContaining(detalheTecnicoSensivel));

    espiaoConsoleError.mockRestore();
  });

  it("erro ao resolver empresa também não vaza detalhe - mensagem genérica, log no servidor", async () => {
    const espiaoConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const payload = criarPayload();
    const deps = criarDependenciasFelizes({ buscarEmpresaId: vi.fn(async () => null) });

    const resultado = await orquestrarAprovacaoAutoritativa(payload, deps);

    expect(resultado).toEqual({ ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA });
    expect(espiaoConsoleError).toHaveBeenCalled();

    espiaoConsoleError.mockRestore();
  });
});
