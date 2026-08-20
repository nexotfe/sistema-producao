// Converte o percentual de acréscimo digitado na tela de convenção
// coletiva (inteiro, ex.: 30 para 30%) para a fração usada internamente
// pelo motor e armazenada no banco (0,30) - mesma direção inversa de
// `formatarPercentual` (fração -> inteiro, usada só para exibição) e
// mesma unidade que `calcularValorHoraAdicional.ts` espera receber.
// Extraída como função pura (em vez de inline na tela) para ter cobertura
// de teste automatizada e ser o único ponto de conversão antes da RPC.
export function converterPercentualParaFracao(percentualTexto: string, nomeParametro: string): number {
  const normalizado = percentualTexto.trim().replace(",", ".");
  if (normalizado === "") {
    throw new Error(`Informe um percentual válido (número não negativo) para ${nomeParametro}.`);
  }

  const percentual = Number(normalizado);
  if (!Number.isFinite(percentual) || percentual < 0) {
    throw new Error(`Informe um percentual válido (número não negativo) para ${nomeParametro}.`);
  }

  return percentual / 100;
}
