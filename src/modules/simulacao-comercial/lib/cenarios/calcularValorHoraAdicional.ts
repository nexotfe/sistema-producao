// DEC-007 §6.2/Fase 8b (redesenho: convenção coletiva) - custo da hora
// adicional de um recurso INTERNO: valor-hora cadastrado × (1 +
// percentual da convenção vigente para aquela natureza). Fórmula de
// CUSTO por hora, não de capacidade/agendamento - avaliarCenario.ts/
// capacidadeDia.ts/escalonadorConjunto.ts continuam intocados. Recursos
// externos/temporários NÃO usam esta função (custeio próprio e manual,
// nunca herdado da convenção).
import type { ConvencaoHorasAdicionaisVigencia } from "./resolverConvencaoParaData";
import { validarHorasFinitasNaoNegativas } from "./validacoes";

export type NaturezaCapacidadeExtra = "hora_extra" | "sabado" | "domingo" | "feriado";

function percentualDaNatureza(convencao: ConvencaoHorasAdicionaisVigencia, natureza: NaturezaCapacidadeExtra): number {
  switch (natureza) {
    case "hora_extra":
      return convencao.percentualSegundaSexta;
    case "sabado":
      return convencao.percentualSabado;
    case "domingo":
      return convencao.percentualDomingo;
    case "feriado":
      return convencao.percentualFeriado;
  }
}

export function calcularValorHoraAdicional(
  valorHoraBase: number,
  natureza: NaturezaCapacidadeExtra,
  convencao: ConvencaoHorasAdicionaisVigencia,
): number {
  validarHorasFinitasNaoNegativas(valorHoraBase, "valorHoraBase");
  const percentual = percentualDaNatureza(convencao, natureza);
  validarHorasFinitasNaoNegativas(percentual, `percentual (natureza="${natureza}")`);
  return valorHoraBase * (1 + percentual);
}
