// Funções puras (sem React) de navegação por teclado em lista com
// itens desabilitáveis - extraídas de DropdownBuscaPaginada.tsx para
// serem testáveis isoladamente, mesmo padrão de acumularPaginaBusca.ts
// e controladorConcorrenciaBusca.ts.
//
// Preservam exatamente a fórmula original quando nenhum item está
// desabilitado (itemDesabilitado ausente ou sempre false):
//   - próximoIndiceParaBaixo(itens, i) === i+1 (ou -1 no fim da lista)
//   - próximoIndiceParaCima(itens, i)  === Math.max(0, i-1)
// Só passam a pular itens quando itemDesabilitado é informado.

/**
 * Índice do próximo item HABILITADO abaixo de `indiceAtivo`, ou -1 se
 * não houver nenhum item habilitado daqui até o fim da lista carregada
 * (nesse caso o chamador decide se carrega mais páginas).
 */
export function proximoIndiceParaBaixo<T>(
  itens: T[],
  indiceAtivo: number,
  itemDesabilitado?: (item: T) => boolean,
): number {
  let indice = indiceAtivo + 1;
  while (indice < itens.length && itemDesabilitado?.(itens[indice])) {
    indice++;
  }
  return indice < itens.length ? indice : -1;
}

/**
 * Índice do próximo item HABILITADO acima de `indiceAtivo`, sem nunca
 * ir abaixo de 0 nem "dar a volta" para o fim da lista - se tudo entre
 * o índice atual e o topo estiver desabilitado, retorna -1 (o chamador
 * mantém a seleção atual, sem mover).
 */
export function proximoIndiceParaCima<T>(
  itens: T[],
  indiceAtivo: number,
  itemDesabilitado?: (item: T) => boolean,
): number {
  if (itens.length === 0) return -1;

  let indice = Math.max(0, indiceAtivo - 1);
  while (indice > 0 && itemDesabilitado?.(itens[indice])) {
    indice--;
  }
  return itemDesabilitado?.(itens[indice]) ? -1 : indice;
}
