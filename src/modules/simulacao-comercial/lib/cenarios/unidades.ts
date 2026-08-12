// DEC-007 §2 - Fase 0: unidade interna única do motor diário é horas de
// máquina (tempo real de relógio); a única grandeza que trafega em
// horas-padrão entre candidatos/dias é o necessário da operação (mesma
// "quantidade de trabalho", independente de quem a produz). Conversão
// só acontece nestas duas funções - nunca inline em outro lugar do
// motor, para não repetir a mistura de unidades que originou esta
// decisão. Produtividade zero causaria divisão por zero - validada aqui,
// no único ponto onde a divisão de fato ocorre.
import { validarHorasFinitasNaoNegativas, validarProdutividade } from "./validacoes";

export function horasMaquinaParaHorasPadrao(horasMaquina: number, produtividade: number): number {
  validarHorasFinitasNaoNegativas(horasMaquina, "horasMaquina");
  validarProdutividade(produtividade);
  return horasMaquina * produtividade;
}

export function horasPadraoParaHorasMaquina(horasPadrao: number, produtividade: number): number {
  validarHorasFinitasNaoNegativas(horasPadrao, "horasPadrao");
  validarProdutividade(produtividade);
  return horasPadrao / produtividade;
}
