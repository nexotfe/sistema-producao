// Função pura (sem React, sem I/O): dado o estado acumulado atual e
// uma página nova recebida, decide o próximo `itens`/`offset`/`temMais`.
// Extraída de useBuscaPaginada.ts para ser testável isoladamente.
export interface ResultadoAcumulacao<T> {
  itens: T[];
  offset: number;
  temMais: boolean;
}

/**
 * `offsetAnterior` avança pelo tamanho BRUTO de `pagina` (antes do
 * dedupe) - se avançasse pelo tamanho pós-dedupe, uma linha removida
 * defensivamente faria a próxima página pedir de novo uma faixa
 * parcialmente já vista. Mesmo raciocínio para `temMais`: comparado
 * contra o tamanho bruto recebido, não contra quantos itens sobraram
 * depois do dedupe.
 */
export function acumularPaginaBusca<T>(params: {
  itensAtuais: T[];
  pagina: T[];
  offsetAnterior: number;
  tamanhoPagina: number;
  obterId: (item: T) => string;
  primeiraPagina: boolean;
}): ResultadoAcumulacao<T> {
  const { itensAtuais, pagina, offsetAnterior, tamanhoPagina, obterId, primeiraPagina } = params;

  const base = primeiraPagina ? [] : itensAtuais;
  const idsVistos = new Set(base.map(obterId));
  const novos = pagina.filter((item) => !idsVistos.has(obterId(item)));

  return {
    itens: [...base, ...novos],
    offset: offsetAnterior + pagina.length,
    temMais: pagina.length === tamanhoPagina,
  };
}
