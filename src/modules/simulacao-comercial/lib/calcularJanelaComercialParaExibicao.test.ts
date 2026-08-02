// Teste da correção 3 (auditoria da Entrega 1): calcularJanelaComercialParaExibicao
// é a lógica extraída do useEffect de SimulacaoCapacidade.tsx, testável
// com dependências injetadas em vez de precisar renderizar o componente
// React (não há infraestrutura de teste de componente neste projeto).
import { describe, expect, it, vi } from "vitest";
import {
  calcularJanelaComercialParaExibicao,
  mensagemErroJanelaComercial,
  type CallbacksCalculoJanela,
} from "./calcularJanelaComercialParaExibicao";
import type { PremissasJanelaComercial, ResultadoJanelaComercial } from "./prepararJanelaComercial";
import { LimiteDeslocamentoDiasProdutivosExcedidoError } from "@/modules/calendario/lib/errors";

const PREMISSAS_COMPLETAS: PremissasJanelaComercial = {
  dataNecessidade: "2026-12-01",
  margemSegurancaDiasProdutivos: 3,
  dataPrevistaAprovacaoPedido: "2026-11-02",
};

const JANELA_VALIDA: ResultadoJanelaComercial = {
  valida: true,
  dataChegadaPrevista: "2026-11-13",
  dataDisponibilidadeProducao: "2026-11-16",
  prazoInterno: "2026-11-26",
  janelaInicio: "2026-11-16",
  janelaFim: "2026-11-26",
};

function criarCallbacksEspionados() {
  const chamadas: Array<["erro" | "janela" | "calculando", unknown]> = [];
  const callbacks: CallbacksCalculoJanela = {
    setErro: vi.fn((v) => chamadas.push(["erro", v])),
    setJanela: vi.fn((v) => chamadas.push(["janela", v])),
    setCalculando: vi.fn((v) => chamadas.push(["calculando", v])),
    foiCancelado: () => false,
  };
  return { callbacks, chamadas };
}

describe("calcularJanelaComercialParaExibicao — correção 3 (estado 'calculando')", () => {
  it("com premissas incompletas: nunca chama buscarEmpresaId, e SEMPRE limpa calculando para false", async () => {
    const { callbacks } = criarCallbacksEspionados();
    const buscarEmpresaId = vi.fn();

    await calcularJanelaComercialParaExibicao(
      { ...PREMISSAS_COMPLETAS, dataPrevistaAprovacaoPedido: "" },
      true,
      { buscarEmpresaId, prepararJanela: vi.fn() },
      callbacks,
    );

    expect(buscarEmpresaId).not.toHaveBeenCalled();
    expect(callbacks.setJanela).toHaveBeenCalledWith(null);
    expect(callbacks.setCalculando).toHaveBeenCalledWith(false);
  });

  it("com margem inválida: também limpa calculando para false, sem consultar rede", async () => {
    const { callbacks } = criarCallbacksEspionados();
    const buscarEmpresaId = vi.fn();

    await calcularJanelaComercialParaExibicao(
      PREMISSAS_COMPLETAS,
      false, // margemSegurancaValida = false
      { buscarEmpresaId, prepararJanela: vi.fn() },
      callbacks,
    );

    expect(buscarEmpresaId).not.toHaveBeenCalled();
    expect(callbacks.setCalculando).toHaveBeenCalledWith(false);
  });

  it("caminho feliz: liga calculando, calcula, desliga calculando, seta a janela", async () => {
    const { callbacks, chamadas } = criarCallbacksEspionados();

    await calcularJanelaComercialParaExibicao(
      PREMISSAS_COMPLETAS,
      true,
      {
        buscarEmpresaId: async () => "empresa-1",
        prepararJanela: async () => JANELA_VALIDA,
      },
      callbacks,
    );

    const chamadasCalculando = chamadas.filter(([tipo]) => tipo === "calculando").map(([, v]) => v);
    expect(chamadasCalculando).toEqual([true, false]);
    expect(callbacks.setJanela).toHaveBeenCalledWith(JANELA_VALIDA);
  });

  it("reproduz e prova a correção do bug original: uma chamada obsoleta (cancelada) NUNCA reabre calculando=true nem sobrescreve o resultado mais novo", async () => {
    // Reproduz exatamente o cenário da auditoria: uma chamada "antiga"
    // com premissas válidas fica pendurada em voo (a promise só
    // resolve quando o teste manda); enquanto isso, uma chamada "nova"
    // roda com premissas incompletas. Sem a correção, quando a
    // chamada antiga finalmente resolvesse, ela reativaria
    // calculando=true->false por cima do estado já limpo pela nova -
    // ou pior, a nova (síncrona, premissas incompletas) rodaria ANTES
        // de setCalculando(true) da antiga, deixando true travado.
    let resolverChamadaAntiga: (janela: ResultadoJanelaComercial) => void = () => {};
    const promessaAntiga = new Promise<ResultadoJanelaComercial>((resolve) => {
      resolverChamadaAntiga = resolve;
    });

    const { callbacks: callbacksAntiga, chamadas: chamadasAntiga } = criarCallbacksEspionados();
    let cancelDaAntiga = false;
    callbacksAntiga.foiCancelado = () => cancelDaAntiga;

    // Dispara a chamada "antiga" (premissas completas) mas NÃO espera -
    // ela fica presa em prepararJanela até resolverChamadaAntiga ser
    // chamado, simulando uma requisição lenta ainda em voo.
    const execucaoAntiga = calcularJanelaComercialParaExibicao(
      PREMISSAS_COMPLETAS,
      true,
      {
        buscarEmpresaId: async () => "empresa-1",
        prepararJanela: () => promessaAntiga,
      },
      callbacksAntiga,
    );

    // Antes da antiga resolver, o usuário limpa uma premissa - o
    // componente marcaria a chamada antiga como cancelada e dispararia
    // uma nova, com premissas incompletas.
    cancelDaAntiga = true;

    const { callbacks: callbacksNova, chamadas: chamadasNova } = criarCallbacksEspionados();

    await calcularJanelaComercialParaExibicao(
      { ...PREMISSAS_COMPLETAS, dataPrevistaAprovacaoPedido: "" },
      true,
      { buscarEmpresaId: vi.fn(), prepararJanela: vi.fn() },
      callbacksNova,
    );

    // A chamada NOVA (síncrona, premissas incompletas) já deve ter
    // limpado calculando para false, independentemente da antiga.
    expect(chamadasNova.filter(([tipo]) => tipo === "calculando").map(([, v]) => v)).toEqual([false]);
    expect(callbacksNova.setJanela).toHaveBeenCalledWith(null);

    // Só agora a chamada antiga (obsoleta) resolve.
    resolverChamadaAntiga(JANELA_VALIDA);
    await execucaoAntiga;

    // A chamada antiga LIGOU calculando (true) ao começar, mas por
    // estar cancelada, seu bloco finally NÃO deve chamar
    // setCalculando(false) de novo nem setJanela - ela não pode
    // sobrescrever o estado que a chamada nova já deixou correto.
    expect(chamadasAntiga.filter(([tipo]) => tipo === "calculando").map(([, v]) => v)).toEqual([true]);
    expect(callbacksAntiga.setJanela).not.toHaveBeenCalled();
  });
});

describe("mensagemErroJanelaComercial — nunca expõe detalhe técnico", () => {
  it("mapeia LimiteDeslocamentoDiasProdutivosExcedidoError para mensagem genérica, sem a mensagem técnica original", () => {
    const erroTecnico = new LimiteDeslocamentoDiasProdutivosExcedidoError(
      "empresa-1",
      "2026-08-01",
      5,
      10000,
    );

    const mensagem = mensagemErroJanelaComercial(erroTecnico);

    expect(mensagem).not.toContain("empresa-1");
    expect(mensagem).not.toContain("10000");
    expect(mensagem).not.toBe(erroTecnico.message);
  });

  it("erro desconhecido também nunca vaza a própria mensagem técnica", () => {
    const erroTecnico = new Error("detalhe interno sensível: chave xyz");

    const mensagem = mensagemErroJanelaComercial(erroTecnico);

    expect(mensagem).not.toContain("chave xyz");
  });
});
