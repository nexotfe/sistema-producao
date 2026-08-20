export type ResumoOrcamentoCalculado = {
  valorTecnico: number;
  valorDesconto: number;
  valorComercial: number;
  impostos: number;
  lucro: number;
  margemTecnica?: number;
  margemEfetiva?: number;
};

type CalcularResumoOrcamentoParams = {
  custoTotal: number;
  margemLucroPercent: number;
  cargaTributariaPercent: number;
  descontoPercent?: number | null;
};

/**
 * Formula unica de precificacao do Orcamento (DEC-001). Centraliza o
 * calculo que antes estava duplicado em useOrcamento.ts e
 * useProposta.ts - qualquer consumidor do Valor Comercial do Orcamento
 * deve passar por aqui, nunca reimplementar a formula (DEC-001, secao
 * "Consistencia entre modulos").
 *
 * Margem e "por fora" (% direto do custo); Carga Tributaria e "por
 * dentro", incidindo sobre Custo + Lucro (o valor final da nota), nao
 * sobre o custo isolado. O desconto comercial e aplicado por cima do
 * Valor Tecnico ja calculado - nunca recalcula custo, impostos ou
 * margem (DEC-001, secao "Regras permanentes").
 */
export function calcularResumoOrcamento({
  custoTotal,
  margemLucroPercent,
  cargaTributariaPercent,
  descontoPercent,
}: CalcularResumoOrcamentoParams): ResumoOrcamentoCalculado {
  const margem = margemLucroPercent / 100;
  const carga = cargaTributariaPercent / 100;
  const lucro = custoTotal * margem;
  const subtotal = custoTotal + lucro;
  const denominador = 1 - carga;

  let valorTecnico: number;
  let impostos: number;

  if (denominador <= 0) {
    valorTecnico = subtotal;
    impostos = 0;
  } else {
    valorTecnico = subtotal / denominador;
    impostos = valorTecnico * carga;
  }

  const desconto = descontoPercent ?? 0;
  const valorDesconto = valorTecnico * (desconto / 100);
  const valorComercial = valorTecnico - valorDesconto;

  // Margem Tecnica e so a margem de lucro configurada (input, nao um
  // calculo derivado). Margem Efetiva e indicador gerencial: recalcula
  // o imposto proporcionalmente sobre o Valor Comercial so para medir o
  // lucro real apos desconto - nao afeta valorComercial em si, que
  // continua sendo valorTecnico - desconto, sem recalculo de imposto
  // real (DEC-001).
  const margemTecnica = margemLucroPercent;
  const margemEfetiva =
    custoTotal > 0
      ? ((valorComercial - valorComercial * carga - custoTotal) /
          custoTotal) *
        100
      : undefined;

  return {
    valorTecnico,
    valorDesconto,
    valorComercial,
    impostos,
    lucro,
    margemTecnica,
    margemEfetiva,
  };
}

export type ResumoOrcamentoProjetoCalculado = ResumoOrcamentoCalculado & { custoTotal: number };

/**
 * Orquestração "custoTotal (soma dos itens) + fallback de carga
 * tributária (projeto -> sugerida) + calcularResumoOrcamento" - extraída
 * de useOrcamento.ts (useMemo `resumoOrcamento`) para ser a fonte ÚNICA
 * usada tanto pela tela de Orçamento quanto por qualquer outra tela que
 * precise do "valor atual do orçamento" de um projeto (ex.: Cenários,
 * DEC-007 §6.2) - nunca uma segunda montagem dos mesmos parâmetros em
 * outro lugar. Não faz nenhuma consulta - os itens/percentuais já
 * resolvidos são responsabilidade do chamador (ver buscarDadosOrcamento.ts).
 */
export function calcularValorComercialProjeto(params: {
  itens: readonly { custo: number }[];
  margemLucroPercent: number;
  cargaTributariaPercent: number | null;
  cargaTributariaSugerida: number;
  descontoPercentual: number | null;
}): ResumoOrcamentoProjetoCalculado {
  const custoTotal = params.itens.reduce((acc, item) => acc + item.custo, 0);
  const cargaTributariaEfetiva = params.cargaTributariaPercent ?? params.cargaTributariaSugerida;

  const resumo = calcularResumoOrcamento({
    custoTotal,
    margemLucroPercent: params.margemLucroPercent,
    cargaTributariaPercent: cargaTributariaEfetiva,
    descontoPercent: params.descontoPercentual,
  });

  return { custoTotal, ...resumo };
}

/**
 * "Novo valor do orçamento" = valor atual do orçamento + custo adicional
 * EFETIVAMENTE UTILIZADO (nunca o potencial máximo das horas
 * disponibilizadas - ver ResumoCenarioParaExibicao.custoAdicionalTotal,
 * que já é o custo real sobre uso real). Extraída como função própria
 * (em vez de soma inline no componente) para ter cobertura de teste
 * automatizada - DEC-007 §6.2, tela de Cenários.
 */
export function calcularNovoValorOrcamento(valorAtualOrcamento: number, custoAdicionalEfetivamenteUtilizado: number): number {
  return valorAtualOrcamento + custoAdicionalEfetivamenteUtilizado;
}
