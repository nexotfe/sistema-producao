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

  return {
    valorTecnico,
    valorDesconto,
    valorComercial,
    impostos,
    lucro,
  };
}
