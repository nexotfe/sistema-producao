// DEC-007 §6.2/Fase 8b (primeiro incremento da tela) - função pura de
// produção equivalente ao helper `gradeSimples` que já existia só em
// testes (avaliarCenario.test.ts/prepararResumoCenarioParaExibicao.test.ts).
// Nenhum arquivo de produção construía `GradeCompartilhada` até agora -
// esta é a primeira vez que a tela precisa dela com dado real.
import type { GradeCompartilhada } from "./avaliarCenario";
import { validarDataIso } from "./validacoes";

/** Dias civis mínimos de folga após prazoInterno, mesmo quando a janela [janelaInicio, prazoInterno] já é curta. */
const BUFFER_MINIMO_DIAS_APOS_PRAZO = 30;

function diasCivisEntreDatas(dataInicio: string, dataFim: string): number {
  const [anoA, mesA, diaA] = dataInicio.split("-").map(Number);
  const [anoB, mesB, diaB] = dataFim.split("-").map(Number);
  const utcInicio = Date.UTC(anoA, mesA - 1, diaA);
  const utcFim = Date.UTC(anoB, mesB - 1, diaB);
  return Math.round((utcFim - utcInicio) / 86_400_000);
}

function somarDiasCivis(data: string, quantidade: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + quantidade)).toISOString().slice(0, 10);
}

/**
 * Monta a `GradeCompartilhada` (avaliarCenario.ts) a partir de
 * `janelaInicio` (piso técnico - normalmente
 * `ResultadoJanelaComercial.dataDisponibilidadeProducao`, a mesma data
 * usada como `disponibilidadeOriginalMaterial` de `carregarBaseCenarios()`
 * - nada pode começar antes dela, então não há razão para a grade
 * olhar mais cedo) até `prazoInterno + buffer`, onde
 * `buffer = max(BUFFER_MINIMO_DIAS_APOS_PRAZO, diasCivisEntre(janelaInicio, prazoInterno))`
 * dias civis - folga generosa e proporcional ao tamanho da própria
 * janela, para o Calculador Reverso conseguir diagnosticar atraso
 * (`prazo_inviavel`) ou déficit (`horizonte_tecnico_excedido`) sem
 * cortar a grade cedo demais. Escolha de produto documentada aqui,
 * fácil de revisitar - não é uma fórmula do núcleo (DEC-007 §0-8),
 * só uma decisão de quanto "bem depois do prazo" é suficiente.
 */
export function construirGradeCompartilhada(janelaInicio: string, prazoInterno: string): GradeCompartilhada {
  validarDataIso(janelaInicio, "janelaInicio");
  validarDataIso(prazoInterno, "prazoInterno");
  if (janelaInicio > prazoInterno) {
    throw new RangeError(
      `janelaInicio="${janelaInicio}" é posterior a prazoInterno="${prazoInterno}" - a janela [janelaInicio, prazoInterno] precisa ser não vazia.`,
    );
  }

  const buffer = Math.max(BUFFER_MINIMO_DIAS_APOS_PRAZO, diasCivisEntreDatas(janelaInicio, prazoInterno));
  const fimGrade = somarDiasCivis(prazoInterno, buffer);
  const totalDias = diasCivisEntreDatas(janelaInicio, fimGrade) + 1;

  const datasGradeCompartilhada = Array.from({ length: totalDias }, (_, indice) => somarDiasCivis(janelaInicio, indice));
  const datasCandidatas = datasGradeCompartilhada.filter((data) => data <= prazoInterno);

  return { datasGradeCompartilhada, datasCandidatas, prazoInterno };
}
