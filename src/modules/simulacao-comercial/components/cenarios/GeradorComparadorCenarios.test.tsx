/* @vitest-environment jsdom */
// Teste de integração (orçamento 260007, DEC-007) - reproduz o estado
// INTEGRADO real da modal "Premissas comerciais", que o teste isolado de
// executarCarregamentoComTimeout.ts não cobria (só testava o helper,
// nunca o efeito completo dentro do componente). Mocka
// carregarBaseCenarios/carregarBasePrevisaoComercial no nível de MÓDULO
// (não a tabela Supabase inteira) - a lógica de negócio delas não é o
// alvo aqui, é a ORQUESTRAÇÃO (janela → base → timeout → retry) que
// falhou na captura de tela real.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() }, rpc: vi.fn() },
}));

vi.mock("@/modules/simulacao-comercial/lib/cenarios/carregarBaseCenarios", () => ({
  carregarBaseCenarios: vi.fn(),
}));

vi.mock("@/modules/simulacao-comercial/lib/cenarios/carregarBasePrevisaoComercial", () => ({
  carregarBasePrevisaoComercial: vi.fn(),
}));

import { supabase } from "@/lib/supabaseClient";
import { carregarBaseCenarios } from "@/modules/simulacao-comercial/lib/cenarios/carregarBaseCenarios";
import { carregarBasePrevisaoComercial } from "@/modules/simulacao-comercial/lib/cenarios/carregarBasePrevisaoComercial";
import { criarClienteCalendarioFalso } from "@/modules/calendario/lib/testHelpers/criarClienteCalendarioFalso";
import { GeradorComparadorCenarios } from "./GeradorComparadorCenarios";

/**
 * Tabelas de calendário (calendario_operacional_empresa, empresas,
 * calendario_oficial_feriados, calendario_empresa_eventos) usam
 * .gte()/.lte()/.range() de verdade em carregarContextoCalendario - o
 * `tabelaFiltravel` abaixo não implementa isso (achado ao rodar este
 * teste pela primeira vez: prepararJanelaComercial lançava e
 * calcularJanelaComercialParaExibicao caía no catch, mascarando
 * qualquer premissa como "não foi possível calcular"). Em vez de
 * reimplementar gte/lte, delega essas 4 tabelas para o cliente falso já
 * testado (criarClienteCalendarioFalso), usado por
 * prepararJanelaComercial.test.ts - único ponto de verdade de como o
 * calendário responde nos testes deste projeto.
 */
const TABELAS_DE_CALENDARIO = new Set(["calendario_operacional_empresa", "empresas", "calendario_oficial_feriados", "calendario_empresa_eventos"]);

const supabaseMock = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  auth: { getUser: ReturnType<typeof vi.fn> };
  rpc: ReturnType<typeof vi.fn>;
};
const carregarBaseCenariosMock = carregarBaseCenarios as ReturnType<typeof vi.fn>;
const carregarBasePrevisaoComercialMock = carregarBasePrevisaoComercial as ReturnType<typeof vi.fn>;

const PROJETO_ID = "1148bd72-a0cd-4a6a-94a2-69fc3dd9138f"; // orçamento 260007 (Autoliv), real
const EMPRESA_ID = "empresa-teste";

/** Mesmo mock genérico de tabela filtrável já usado em usePrevisaoComercialCapacidade.test.ts - respeita eq/is/order/maybeSingle/single de verdade; insert/update/delete/upsert sempre lançam. */
function tabelaFiltravel(linhas: readonly Record<string, unknown>[]) {
  const filtros: ((linha: Record<string, unknown>) => boolean)[] = [];
  let single = false;
  const builder = {
    select: () => builder,
    eq: (coluna: string, valor: unknown) => {
      filtros.push((linha) => linha[coluna] === valor);
      return builder;
    },
    is: (coluna: string, valor: null) => {
      filtros.push((linha) => linha[coluna] === valor);
      return builder;
    },
    order: () => builder,
    maybeSingle: () => {
      single = true;
      return builder;
    },
    single: () => {
      single = true;
      return builder;
    },
    insert: () => {
      throw new Error("Mock não implementa insert - este teste é só leitura.");
    },
    update: () => {
      throw new Error("Mock não implementa update - este teste é só leitura.");
    },
    then: (resolve: (v: unknown) => unknown) => {
      const resultado = linhas.filter((linha) => filtros.every((f) => f(linha)));
      return Promise.resolve(resolve({ data: single ? (resultado[0] ?? null) : resultado, error: null }));
    },
  };
  return builder;
}

/**
 * Com Data de Necessidade=08/09/2026, margem=0 e Data Prevista de
 * Aprovação do Pedido=26/08/2026, a fórmula GENÉRICA de janela (+9 dias
 * produtivos de chegada +1 dia de disponibilidade) calcula
 * disponibilidadeProducao=09/09/2026 - POSTERIOR ao prazo interno
 * (08/09/2026) - portanto janela INVÁLIDA. Confirmado por cálculo manual
 * contra o calendário real da empresa (orçamento 260007, introspecção
 * somente-leitura no projeto vinculado: segunda a sexta produtivos)
 * antes de escrever este teste (ver relato da investigação) - reproduz
 * exatamente o travamento visto na captura de tela real, sem depender
 * de nenhum feriado.
 */
function instalarMockBase(
  tipoProjeto: "industrializacao" | "fabricacao" | "desenvolvimento" | "servico" = "industrializacao",
) {
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

  const tabelas: Record<string, Record<string, unknown>[]> = {
    usuarios: [{ id: "user-1", empresa_id: EMPRESA_ID, nome: "Usuário Teste" }],
    projetos: [
      {
        id: PROJETO_ID,
        empresa_id: EMPRESA_ID,
        numero_projeto: "260007",
        nome: "Autoliv",
        tipo_projeto: tipoProjeto,
        status: "em_analise",
        cliente_id: null,
        data_objetivo: "2026-09-08",
        created_at: "2026-01-01T00:00:00Z",
        margem_lucro_percent: 20,
        carga_tributaria_percent: null,
        desconto_percentual: null,
        desconto_motivo: null,
        deleted_at: null,
      },
    ],
    simulacoes_comerciais: [], // nenhuma vigente - sem pré-preenchimento, premissas digitadas no teste
    configuracoes_empresa: [],
    clientes: [],
    projeto_itens: [], // orçamento sem itens - buscarDadosOrcamento resolve com itensCalculados=[]
    cenarios_comerciais_aprovados: [], // sem cenário vigente - fora do escopo deste teste
  };

  // Calendário real da empresa (orçamento 260007, confirmado por
  // introspecção somente-leitura no projeto vinculado): segunda a sexta
  // produtivos, sábado/domingo não, sem feriados no intervalo usado
  // pelos testes - delegado ao cliente falso já testado (ver comentário
  // de TABELAS_DE_CALENDARIO no topo do arquivo).
  const clienteCalendario = criarClienteCalendarioFalso({
    empresaId: EMPRESA_ID,
    padraoSemanal: { segunda: true, terca: true, quarta: true, quinta: true, sexta: true, sabado: false, domingo: false },
    empresa: { pais_codigo: null, uf_codigo: null, municipio_codigo: null },
    feriados: [],
  });

  supabaseMock.from.mockImplementation((tabela: string) =>
    TABELAS_DE_CALENDARIO.has(tabela) ? clienteCalendario.from(tabela) : tabelaFiltravel(tabelas[tabela] ?? []),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function abrirModalEEditarPremissas() {
  const { unmount } = render(<GeradorComparadorCenarios projetoId={PROJETO_ID} />);

  // `vi.waitFor` (não o `waitFor`/`findBy*` de @testing-library/react,
  // que fazem polling com setInterval REAL) - funciona igual com
  // temporizador real ou falso, então este helper serve os dois blocos
  // de teste sem precisar de duas versões.
  //
  // Data de Necessidade vem pré-preenchida por projetos.data_objetivo -
  // espera o carregamento inicial terminar antes de abrir a modal.
  await vi.waitFor(() => expect(screen.getByText("08/09/2026")).toBeTruthy());

  fireEvent.click(screen.getByRole("button", { name: "Editar premissas" }));
  // "Premissas comerciais" é o título tanto do cartão de fundo quanto da
  // modal - ambíguo para uma busca por heading. O campo abaixo só existe
  // uma vez o conteúdo da modal (PremissasJanelaComercialForm) montar.
  await vi.waitFor(() => expect(screen.getByLabelText("Data Prevista de Aprovação do Pedido")).toBeTruthy());
  const campoAprovacaoPrevista = screen.getByLabelText("Data Prevista de Aprovação do Pedido") as HTMLInputElement;

  return { campoAprovacaoPrevista, unmount };
}

describe("GeradorComparadorCenarios - integração (orçamento 260007)", () => {
  // CORREÇÃO DA CAUSA RAIZ (prepararJanelaComercial ganhou
  // modoDisponibilidadeMaterial): antes desta correção, 26/08/2026 dava
  // janela INVÁLIDA para Industrialização pela fórmula genérica (+9+1
  // dias produtivos) - ver git history/relato da investigação. Depois
  // da correção, a mesma data fica VÁLIDA para Industrialização (não
  // precisa da folga genérica) mas CONTINUA inválida para as outras 3
  // naturezas (fabricacao/desenvolvimento/servico) - regressão exigida
  // pelo usuário antes de repetir o teste visual.
  describe("gate de validade da janela - específico por natureza (causa raiz real, não era o timeout)", () => {
    it("Industrialização, 26/08/2026: janela AGORA válida (correção aplicada) - carregarBaseCenarios roda normalmente, botão fica habilitado", async () => {
      instalarMockBase("industrializacao");
      carregarBaseCenariosMock.mockResolvedValue({
        empresaId: EMPRESA_ID,
        projetoId: PROJETO_ID,
        ocorrencias: [],
        dependencias: [],
        chavesRaizOrcamentoNovo: [],
        chavesFinaisOrcamentoNovo: [],
        recursoIds: [],
        compatibilidades: {},
        capacidadeDiariaPorRecurso: {},
        produtividadePorRecurso: {},
        comprometidoInicialPorRecurso: {},
        valorHoraPorRecurso: {},
        convencoesHorasAdicionais: [],
        restricaoMaterialPorChave: {},
      });
      carregarBasePrevisaoComercialMock.mockResolvedValue({
        empresaId: EMPRESA_ID,
        projetoId: PROJETO_ID,
        dataSolicitadaCliente: "2026-09-08",
        compromissosConfirmados: [],
        necessidadesOrcamentoNovo: [],
        capacidadesNormais: new Map(),
        datasGrade: [],
        diasProdutivos: new Set(),
        diagnosticos: [],
      });

      const { campoAprovacaoPrevista } = await abrirModalEEditarPremissas();

      // 3 alterações rápidas, sem aguardar entre elas (cada `act` síncrono
      // deixa o React commitar antes da próxima, sem esperar a rede) -
      // mesmo padrão de digitação rápida que produziu o travamento real.
      act(() => {
        fireEvent.change(campoAprovacaoPrevista, { target: { value: "2026-08-24" } });
      });
      act(() => {
        fireEvent.change(campoAprovacaoPrevista, { target: { value: "2026-08-25" } });
      });
      act(() => {
        fireEvent.change(campoAprovacaoPrevista, { target: { value: "2026-08-26" } });
      });

      // Estado final: SEM mensagem de janela inválida, base carregada,
      // botão habilitado.
      await vi.waitFor(() => expect(carregarBaseCenariosMock).toHaveBeenCalled());

      expect(screen.queryByText("Não foi possível calcular a janela produtiva a partir das premissas informadas.")).toBeNull();
      // Prova a simplificação de dataDisponibilidadeMaterialResolvida:
      // carregarBaseCenarios precisa ter recebido a própria Data
      // Prevista de Aprovação do Pedido (26/08/2026) como disponibilidade
      // de material - sem os deslocamentos de +9+1 dias.
      expect(carregarBaseCenariosMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        PROJETO_ID,
        "2026-08-26",
        expect.anything(),
      );

      const botaoCalcular = screen.getByRole("button", { name: /Calcular cenário atual/ }) as HTMLButtonElement;
      expect(botaoCalcular.disabled).toBe(false);
    });

    it("regressão: as mesmas 3 edições terminando em 26/08/2026 CONTINUAM produzindo janela inválida para fabricacao/desenvolvimento/servico (fórmula genérica intacta para as outras naturezas)", async () => {
      for (const tipoProjeto of ["fabricacao", "desenvolvimento", "servico"] as const) {
        instalarMockBase(tipoProjeto);
        const { campoAprovacaoPrevista, unmount } = await abrirModalEEditarPremissas();

        act(() => {
          fireEvent.change(campoAprovacaoPrevista, { target: { value: "2026-08-24" } });
        });
        act(() => {
          fireEvent.change(campoAprovacaoPrevista, { target: { value: "2026-08-25" } });
        });
        act(() => {
          fireEvent.change(campoAprovacaoPrevista, { target: { value: "2026-08-26" } });
        });

        await vi.waitFor(() =>
          expect(
            screen.getAllByText("Não foi possível calcular a janela produtiva a partir das premissas informadas.").length,
          ).toBeGreaterThan(0),
        );

        expect(carregarBaseCenariosMock).not.toHaveBeenCalled();
        expect(carregarBasePrevisaoComercialMock).not.toHaveBeenCalled();
        const botaoCalcular = screen.getByRole("button", { name: /Calcular cenário atual/ }) as HTMLButtonElement;
        expect(botaoCalcular.disabled).toBe(true);

        unmount();
        vi.clearAllMocks();
      }
    });
  });

  describe("timeout real no carregamento da base (janela válida, consulta nunca resolve)", () => {
    beforeEach(() => {
      // Fake timers ligados desde o início - mas o setTimeout(15s) real de
      // executarCarregamentoComTimeout só é criado quando carregarBaseCenarios
      // é chamado (dentro do efeito, depois da janela assentar) - se ele
      // fosse criado ANTES de vi.useFakeTimers(), seria um timer REAL que
      // advanceTimersByTimeAsync nunca tocaria (achado ao rodar este teste
      // a primeira vez: o timer real ficava pendurado, o teste via só
      // "Calculando..." para sempre). `vi.waitFor` (não o `waitFor` de
      // @testing-library/react, que usa setInterval real e trava com fake
      // timers ativos) é quem espera a janela assentar de forma compatível.
      vi.useFakeTimers();
      instalarMockBase("fabricacao");
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("timeout de 15s: desliga carregando, mostra o erro E o botão Tentar novamente DENTRO da modal aberta - nunca escondido atrás dela", async () => {
      carregarBaseCenariosMock.mockImplementation(() => new Promise(() => {})); // nunca resolve
      carregarBasePrevisaoComercialMock.mockImplementation(() => new Promise(() => {}));

      const { campoAprovacaoPrevista } = await abrirModalEEditarPremissas();

      // 17/08 (segunda-feira, dia produtivo) - bastante folga contra
      // 08/09 (data de necessidade) mesmo pela fórmula genérica (+9+1
      // dias produtivos), isolando o cenário de timeout do bug de
      // janela inválida coberto acima.
      await act(async () => {
        fireEvent.change(campoAprovacaoPrevista, { target: { value: "2026-08-17" } });
      });

      // Janela precisa ficar válida (e o setTimeout(15s) real precisa já
      // ter sido criado, agora sob fake timers) antes do avanço abaixo.
      await vi.waitFor(() => expect(carregarBaseCenariosMock).toHaveBeenCalled());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });

      // Mensagem de erro clara - já deve estar no DOM (advanceTimersByTimeAsync
      // dentro de `act` já flushou as atualizações de estado resultantes).
      // Duplicada de propósito (cartão de fundo + modal) - ver comentário
      // equivalente no teste de janela inválida, acima.
      expect(screen.getAllByText("Não foi possível carregar os dados do cenário.").length).toBeGreaterThan(0);

      // CORREÇÃO EXIGIDA: o botão "Tentar novamente" e a mensagem de erro
      // precisam estar DENTRO do diálogo aberto (role="dialog"), nunca
      // só no cartão de fundo - o usuário não pode depender de fechar a
      // modal para ver ou agir sobre o erro.
      const dialogo = screen.getByRole("dialog");
      expect(within(dialogo).getByText("Não foi possível carregar os dados do cenário.")).toBeTruthy();
      expect(within(dialogo).getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
    });
  });
});
