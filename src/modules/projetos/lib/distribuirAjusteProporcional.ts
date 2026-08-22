// Distribui um ajuste (positivo ou negativo) proporcionalmente entre
// itens, sem precisar de uma linha separada de "Ajuste comercial" na
// Proposta - cada item recebe sua fatia, sempre batendo exatamente com
// o valor-alvo agregado (Subtotal). Extraída como função pura (mesmo
// motivo de calcularResumoOrcamento) para ter cobertura de teste
// dedicada a arredondamento e diferença negativa, sem depender de mock
// de Supabase.
//
// Arredondamento cumulativo: acumula o alvo real item a item e só
// arredonda a DIFERENÇA contra o que já foi distribuído - garante soma
// exata em centavos com qualquer sinal, sem casos especiais por sinal
// nem "maior resto" para desempate.
export interface ItemComValorBase {
  valorTotal: number;
}

export function distribuirAjusteProporcional<T extends ItemComValorBase>(
  itens: readonly T[],
  valorAlvo: number,
): T[] {
  if (itens.length === 0) {
    return [];
  }

  const somaBase = itens.reduce((acc, item) => acc + item.valorTotal, 0);

  // Sem base real para proporção (todos os itens com valor 0): distribui
  // igualmente, em vez de dividir por zero.
  const pesos = somaBase === 0 ? itens.map(() => 1) : itens.map((item) => item.valorTotal);
  const somaPesos = pesos.reduce((acc, peso) => acc + peso, 0);

  let acumuladoAlvo = 0;
  let acumuladoDistribuido = 0;

  return itens.map((item, indice) => {
    acumuladoAlvo += (pesos[indice] / somaPesos) * valorAlvo;
    const valorAcumuladoArredondado = arredondarCentavos(acumuladoAlvo);
    const valorDoItem = arredondarCentavos(valorAcumuladoArredondado - acumuladoDistribuido);
    acumuladoDistribuido += valorDoItem;
    return { ...item, valorTotal: valorDoItem };
  });
}

function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}
