// Tolerância única para toda comparação/validação numérica da Entrega 2
// (distribuição parcial) - núcleo (motorAvaliacaoSequencial.ts),
// comparação autoritativa (compararResultadosSimulacao.ts) e RPC
// (aprovar_projeto_com_simulacao_v4, mesmo valor literal 0.000001 no
// SQL - não importável de lá, mantido em comentário-espelho na
// migration). Antes da Entrega 2 não havia nenhuma convenção de
// tolerância numérica no projeto (comparação sempre foi exata, `!==`) -
// esta é a primeira, motivada pela divisão nova (horas de máquina =
// horas-padrão / produtividade), o primeiro ponto real de risco de
// ponto flutuante do módulo.
export const EPSILON_HORAS = 0.000001;

export function tratarComoZero(valor: number): boolean {
  return Math.abs(valor) <= EPSILON_HORAS;
}

export function numerosIguais(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON_HORAS;
}
