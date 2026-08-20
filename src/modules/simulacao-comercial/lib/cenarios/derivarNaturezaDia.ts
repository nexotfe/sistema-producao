// DEC-007 §6.2/Fase 8b (redesenho: regras semanais compactas) - rotula
// automaticamente cada DATA expandida de uma regra semanal como dia
// útil/sábado/domingo/feriado, para o usuário nunca precisar escolher
// manualmente uma natureza incompatível com a data (pedido explícito do
// redesenho) - feriado sempre prevalece sobre a classificação de dia da
// semana (regra explícita do usuário, já implementada abaixo). Puramente
// uma ROTULAGEM de autorização/custeio para a capacidade EXTRA - o
// núcleo (capacidadeDia.ts/avaliarCenario.ts) nunca consulta calendário
// nem dia da semana; "capacidade normal" é o mesmo valor cadastrado em
// toda data da grade, sem exceção (confirmado por leitura direta do
// núcleo - nenhum arquivo em lib/cenarios/ referencia calendário antes
// deste). Este módulo não muda essa realidade, só ajuda a UI/expansão de
// regra a rotular a data certa.
import { validarDataIso } from "./validacoes";

export type NaturezaDia = "normal" | "sabado" | "domingo" | "feriado";

/**
 * Fato de calendário mínimo necessário - o subconjunto de
 * ResultadoDiaProdutivo (src/modules/calendario/lib/contextoCalendario.ts)
 * relevante aqui. Não importa o tipo de lá para não acoplar este módulo
 * puro a um client Supabase por transitividade - o CHAMADOR resolve o
 * calendário (I/O) e repassa só o fato.
 */
export interface FatoCalendarioDia {
  produtivo: boolean;
  origem: "padrao_semanal" | "feriado_oficial" | "evento_empresa";
}

/**
 * Dia da semana (0=domingo..6=sábado) via Date.UTC - mesma técnica de
 * data civil (sem fuso-horário) já usada em construirGradeCompartilhada.ts.
 */
export function diaDaSemanaCivil(dataIso: string): number {
  validarDataIso(dataIso, "dataIso");
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/**
 * feriado_oficial (calendario_oficial_feriados) e qualquer evento de
 * empresa marcado como NÃO produtivo (calendario_empresa_eventos) contam
 * como "feriado" para fins de rótulo/custeio, independente do dia da
 * semana em que caírem - um feriado numa terça continua feriado. Um
 * evento de empresa marcado como produtivo (ex.: "trabalho extraordinário
 * num feriado", já coberto pelo padrão semanal) não sobrepõe o
 * sábado/domingo/dia útil normal.
 */
export function derivarNaturezaDia(dataIso: string, fatoCalendario: FatoCalendarioDia): NaturezaDia {
  if (!fatoCalendario.produtivo && (fatoCalendario.origem === "feriado_oficial" || fatoCalendario.origem === "evento_empresa")) {
    return "feriado";
  }

  const diaSemana = diaDaSemanaCivil(dataIso);
  if (diaSemana === 6) return "sabado";
  if (diaSemana === 0) return "domingo";
  return "normal";
}

/**
 * Mapeia a natureza da COLUNA para a natureza aceita por
 * CapacidadeExtraDia (capacidadeDia.ts) - "normal" (dia útil) vira
 * "hora_extra" no momento de autorizar um ajuste; as outras 3 já
 * coincidem exatamente.
 */
export function naturezaDiaParaCapacidadeExtra(natureza: NaturezaDia): "hora_extra" | "sabado" | "domingo" | "feriado" {
  return natureza === "normal" ? "hora_extra" : natureza;
}
