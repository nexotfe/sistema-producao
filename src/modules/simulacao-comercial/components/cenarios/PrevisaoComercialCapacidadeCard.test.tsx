/* @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PrevisaoComercialCapacidadeCard } from "./PrevisaoComercialCapacidadeCard";
import type { SaidaPrevisaoComercial } from "@/modules/simulacao-comercial/lib/cenarios/montarPrevisaoComercialProjeto";

function saida(overrides: Partial<SaidaPrevisaoComercial> = {}): SaidaPrevisaoComercial {
  return {
    dataSolicitadaCliente: "2026-09-10",
    status: "calculado",
    primeiraEntregaPossivel: "2026-09-10",
    atendeDataSolicitada: true,
    diferencaEmDias: 0,
    recursosQueDeterminamTermino: [],
    horizonteTecnico: "suficiente",
    diagnosticos: [],
    tipoAnalise: "previsao_comercial_por_capacidade",
    custoAdicional: { negociacaoMaterial: 0, horaAdicional: 0, recursoTemporario: 0, total: 0 },
    capacidadeUtilizada: { horaAdicionalHoras: 0, recursoTemporarioHoras: 0 },
    detalhamentoPorRecurso: [],
    ...overrides,
  };
}

const SEM_NOMES = {};

afterEach(cleanup);

describe("PrevisaoComercialCapacidadeCard", () => {
  it("mostra sempre o rótulo fixo 'Previsão comercial por capacidade — não é programação de PCP.'", () => {
    render(<PrevisaoComercialCapacidadeCard saidaAtual={saida()} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);
    expect(screen.getByText("Previsão comercial por capacidade — não é programação de PCP.")).toBeTruthy();
  });

  it("orçamento vazio (status sem_necessidades, sem itens): mostra diagnóstico, nunca datas presumidas", () => {
    const saidaVazia = saida({
      status: "sem_necessidades",
      primeiraEntregaPossivel: null,
      atendeDataSolicitada: null,
      diferencaEmDias: null,
      horizonteTecnico: null,
      diagnosticos: [{ empresaId: "e1", projetoId: "p1", motivo: "Simulação vigente sem nenhum item - orçamento novo vazio." }],
    });
    render(<PrevisaoComercialCapacidadeCard saidaAtual={saidaVazia} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);

    expect(screen.getByText(/Não foi possível calcular: o orçamento não tem itens/)).toBeTruthy();
    expect(screen.getByText(/Simulação vigente sem nenhum item/)).toBeTruthy();
    expect(screen.queryByText(/Primeira entrega possível/)).toBeNull(); // nenhuma data de entrega presumida
  });

  it("snapshot ausente (status sem_necessidades, sem simulação vigente): mostra diagnóstico, nunca datas presumidas", () => {
    const saidaSemSnapshot = saida({
      status: "sem_necessidades",
      primeiraEntregaPossivel: null,
      atendeDataSolicitada: null,
      diferencaEmDias: null,
      horizonteTecnico: null,
      diagnosticos: [{ empresaId: "e1", projetoId: "p1", motivo: "Projeto sem simulação comercial vigente - orçamento novo não pode ser avaliado, nunca fabricado." }],
    });
    render(<PrevisaoComercialCapacidadeCard saidaAtual={saidaSemSnapshot} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);

    expect(screen.getByText(/sem simulação comercial vigente/)).toBeTruthy();
    expect(screen.queryByText(/Primeira entrega possível/)).toBeNull();
  });

  it("granularidade insuficiente (status bloqueado_por_diagnostico): bloqueia o resultado, mostra o diagnóstico, nunca uma data presumida", () => {
    const saidaBloqueada = saida({
      status: "bloqueado_por_diagnostico",
      primeiraEntregaPossivel: null,
      atendeDataSolicitada: null,
      diferencaEmDias: null,
      horizonteTecnico: null,
      diagnosticos: [
        { empresaId: "e1", projetoId: "p2", motivo: "PCP cobre parte da carga deste recurso... impossível deduplicar com segurança.", bloqueiaCalculo: true },
      ],
    });
    render(<PrevisaoComercialCapacidadeCard saidaAtual={saidaBloqueada} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);

    expect(screen.getByText(/revise os diagnósticos abaixo/)).toBeTruthy();
    expect(screen.getByText(/impossível deduplicar com segurança/)).toBeTruthy();
    expect(screen.queryByText(/Primeira entrega possível/)).toBeNull();
  });

  it("horizonte insuficiente (status calculado): mensagem comercial, NUNCA a palavra 'inviável'", () => {
    const saidaInsuficiente = saida({
      status: "calculado",
      primeiraEntregaPossivel: null,
      atendeDataSolicitada: false,
      diferencaEmDias: null,
      horizonteTecnico: "insuficiente",
    });
    render(<PrevisaoComercialCapacidadeCard saidaAtual={saidaInsuficiente} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);

    expect(screen.getByText(/Não foi possível determinar uma data de entrega dentro do horizonte avaliado/)).toBeTruthy();
    expect(screen.queryByText(/inviável/i)).toBeNull();
  });

  it("nunca usa a palavra 'inviável' em nenhum status - checagem ampla no container inteiro", () => {
    for (const status of ["sem_necessidades", "bloqueado_por_diagnostico", "calculado"] as const) {
      const { container, unmount } = render(
        <PrevisaoComercialCapacidadeCard
          saidaAtual={saida({
            status,
            primeiraEntregaPossivel: status === "calculado" ? "2026-09-05" : null,
            horizonteTecnico: status === "calculado" ? "insuficiente" : null,
            atendeDataSolicitada: status === "calculado" ? false : null,
            diferencaEmDias: null,
            diagnosticos: [{ empresaId: "e1", projetoId: "p1", motivo: "diagnóstico de teste" }],
          })}
          saidaAjustada={null}
          nomesRecursos={SEM_NOMES}
          carregando={false}
          erro={null}
        />,
      );
      expect(container.textContent?.toLowerCase()).not.toContain("inviável");
      unmount();
    }
  });

  describe("sinal correto: positivo = atraso, negativo = antecedência, zero = na data exata", () => {
    it("positivo: 'depois da data solicitada'", () => {
      const saidaAtrasada = saida({ primeiraEntregaPossivel: "2026-09-13", atendeDataSolicitada: false, diferencaEmDias: 3 });
      render(<PrevisaoComercialCapacidadeCard saidaAtual={saidaAtrasada} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);
      expect(screen.getByText("3 dia(s) depois da data solicitada")).toBeTruthy();
      expect(screen.getByText("Não atende a data solicitada")).toBeTruthy();
    });

    it("negativo: 'antes da data solicitada'", () => {
      const saidaAdiantada = saida({ primeiraEntregaPossivel: "2026-09-05", atendeDataSolicitada: true, diferencaEmDias: -5 });
      render(<PrevisaoComercialCapacidadeCard saidaAtual={saidaAdiantada} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);
      expect(screen.getByText("5 dia(s) antes da data solicitada")).toBeTruthy();
      expect(screen.getByText("Atende a data solicitada")).toBeTruthy();
    });

    it("zero: 'na data solicitada'", () => {
      const saidaExata = saida({ primeiraEntregaPossivel: "2026-09-10", atendeDataSolicitada: true, diferencaEmDias: 0 });
      render(<PrevisaoComercialCapacidadeCard saidaAtual={saidaExata} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);
      expect(screen.getByText("Na data solicitada")).toBeTruthy();
    });
  });

  it("recursos determinantes: usa o nome resolvido quando disponível, cai para o ID cru quando não", () => {
    const saidaComRecursos = saida({ recursosQueDeterminamTermino: ["recurso-A", "recurso-sem-nome"] });
    render(
      <PrevisaoComercialCapacidadeCard
        saidaAtual={saidaComRecursos}
        saidaAjustada={null}
        nomesRecursos={{ "recurso-A": "REC-A - Recurso A" }}
        carregando={false}
        erro={null}
      />,
    );
    expect(screen.getByText("REC-A - Recurso A")).toBeTruthy();
    expect(screen.getByText("recurso-sem-nome")).toBeTruthy();
  });

  it("cenário ajustado null (nenhuma alternativa configurada): mostra mensagem de convite, nunca um cálculo vazio fingido", () => {
    render(<PrevisaoComercialCapacidadeCard saidaAtual={saida()} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);
    expect(screen.getByText(/Configure horas extras\/recursos temporários/)).toBeTruthy();
  });

  it("erro de carregamento é exibido e nunca é confundido com um cálculo", () => {
    render(<PrevisaoComercialCapacidadeCard saidaAtual={null} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro="Não foi possível carregar a previsão comercial por capacidade." />);
    expect(screen.getByText("Não foi possível carregar a previsão comercial por capacidade.")).toBeTruthy();
  });

  describe("custo adicional", () => {
    it("mostra o total e a quebra por categoria quando genuinamente calculado (custo > 0)", () => {
      const saidaComCusto = saida({ custoAdicional: { negociacaoMaterial: 500, horaAdicional: 40, recursoTemporario: 60, total: 600 } });
      render(<PrevisaoComercialCapacidadeCard saidaAtual={saidaComCusto} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);

      expect(screen.getByText("R$ 600,00")).toBeTruthy();
      expect(screen.getByText(/Negociação de material: R\$ 500,00/)).toBeTruthy();
      expect(screen.getByText(/Horas adicionais: R\$ 40,00/)).toBeTruthy();
      expect(screen.getByText(/Recursos temporários: R\$ 60,00/)).toBeTruthy();
    });

    it("Cenário atual (sem alternativas) mostra custo ZERO genuíno - calculado, nunca 'não calculável'", () => {
      render(<PrevisaoComercialCapacidadeCard saidaAtual={saida()} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);
      expect(screen.getByText("R$ 0,00")).toBeTruthy();
      expect(screen.queryByText(/não calculável/i)).toBeNull();
    });

    it("custoAdicional=null mostra 'Custo não calculável' - nunca R$ 0,00 fingido (12: interface nunca mostra 0 quando a alternativa nem chegou a ser calculada)", () => {
      const saidaSemCusto = saida({ custoAdicional: null });
      render(<PrevisaoComercialCapacidadeCard saidaAtual={saidaSemCusto} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);
      expect(screen.getByText("Custo não calculável.")).toBeTruthy();
      expect(screen.queryByText("R$ 0,00")).toBeNull();
    });

    it("status sem_necessidades/bloqueado_por_diagnostico: nenhum custo (nem 0, nem 'não calculável') é exibido - o bloco inteiro vira diagnóstico, sem seção de custo", () => {
      const saidaBloqueada = saida({
        status: "bloqueado_por_diagnostico",
        primeiraEntregaPossivel: null,
        atendeDataSolicitada: null,
        diferencaEmDias: null,
        horizonteTecnico: null,
        custoAdicional: null,
        diagnosticos: [{ empresaId: "e1", projetoId: "p1", motivo: "diagnóstico de teste" }],
      });
      render(<PrevisaoComercialCapacidadeCard saidaAtual={saidaBloqueada} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);
      expect(screen.queryByText("Custo adicional")).toBeNull();
      expect(screen.queryByText("R$ 0,00")).toBeNull();
    });

    it("cenário ajustado não configurado (null): nenhum custo é mostrado para ele - nunca 'R$ 0,00' fingido antes de qualquer alternativa existir", () => {
      render(<PrevisaoComercialCapacidadeCard saidaAtual={saida()} saidaAjustada={null} nomesRecursos={SEM_NOMES} carregando={false} erro={null} />);
      // Só 1 "R$ 0,00" na tela (o do Cenário atual, genuíno) - o ajustado nem existe ainda.
      expect(screen.getAllByText("R$ 0,00")).toHaveLength(1);
    });
  });
});
