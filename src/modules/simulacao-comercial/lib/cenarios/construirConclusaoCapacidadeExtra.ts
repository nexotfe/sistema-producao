// DEC-007 §6.2/Fase 8b (redesenho: apresentação em linguagem comercial) -
// "conclusão direta" pedida pelo usuário para o cartão de Capacidade e
// recursos: 1 frase objetiva, nunca mais de uma interpretação possível.
// Função pura extraída de CapacidadeRecursosConfiguracaoCard.tsx para
// ter cobertura de teste automatizada (não há precedente de teste de
// componente React neste projeto - lógica de texto sempre vira função
// pura separada). Usa só horas/custo REALMENTE utilizados (nunca o
// potencial máximo disponibilizado) - se nada foi utilizado, não há
// conclusão sobre prazo/custo para apresentar.
function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarHorasExtras(horas: number): string {
  const texto = horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return horas === 1 ? "1 hora extra" : `${texto} horas extras`;
}

/**
 * - `null` quando nenhuma hora extra foi utilizada (nada a concluir).
 * - "Usando X horas extras, a entrega é antecipada em Y dia(s) e o
 *   orçamento aumenta R$ Z." quando houve ganho de prazo (diasAntecipados > 0).
 * - "Estas X horas extras aumentam o custo em R$ Z, mas não antecipam a
 *   entrega." quando não houve ganho de prazo (diasAntecipados null, 0 ou negativo).
 */
export function construirConclusaoDireta(
  horasUtilizadas: number,
  diasAntecipados: number | null,
  custoUtilizado: number,
): string | null {
  if (horasUtilizadas <= 0) return null;

  const horasTexto = formatarHorasExtras(horasUtilizadas);
  if (diasAntecipados !== null && diasAntecipados > 0) {
    return `Usando ${horasTexto}, a entrega é antecipada em ${diasAntecipados} dia${diasAntecipados === 1 ? "" : "s"} e o orçamento aumenta ${formatarMoeda(custoUtilizado)}.`;
  }
  return `Estas ${horasTexto} aumentam o custo em ${formatarMoeda(custoUtilizado)}, mas não antecipam a entrega.`;
}
