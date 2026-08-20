// DEC-007 §6.2/Fase 8b (redesenho: regras semanais compactas) - expande
// as regras semanais de recursos INTERNOS (original + alternativo) em
// CapacidadeExtraDia[]/Contratacao[], com custo automático (valor-hora
// cadastrado × percentual da convenção vigente) e sem dupla cobrança:
// as datas expandidas são agrupadas por (recurso, natureza, vigência
// resolvida) ANTES de virar Contratacao - todas as datas do mesmo grupo
// compartilham 1 única Contratacao (reaproveita a garantia já existente
// do núcleo: mesmo contratacaoId reutilizado em vários dias, dentro da
// mesma categoria, é cobrado uma única vez por calcularCustoContratacoes).
// Se uma regra atravessa uma troca de vigência no meio do período, ela
// vira automaticamente 2+ grupos, cada um com sua própria taxa correta.
//
// Bloqueia (nunca assume custo zero) quando qualquer data expandida cai
// fora de toda vigência conhecida - validarRegrasCapacidadeExtra deve
// ser chamada ANTES desta função pela UI, para reportar o erro sem
// quebrar o fluxo; esta função também valida internamente como defesa.
import type { CapacidadeExtraDia } from "./capacidadeDia";
import type { Contratacao, TipoContratacao } from "./contratacao";
import type { DecisoesCenario } from "./avaliarCenario";
import { calcularValorHoraAdicional, type NaturezaCapacidadeExtra } from "./calcularValorHoraAdicional";
import { expandirRegraSemanal, calcularJanelaEfetivaSemana, type DiasRegraSemanal } from "./expandirRegraSemanal";
import { resolverConvencaoParaData, type ConvencaoHorasAdicionaisVigencia } from "./resolverConvencaoParaData";
import type { NaturezaDia } from "./derivarNaturezaDia";

export interface RegraSemanalCapacidadeExtra {
  recursoId: string;
  /** Segunda-feira da ÚNICA semana em que esta regra se aplica - nunca repete para outra semana (ver expandirRegraSemanal.ts). */
  semanaInicio: string;
  dias: DiasRegraSemanal;
  horasPorDia: number;
  ativo: boolean;
}

function diasSeSobrepoe(a: DiasRegraSemanal, b: DiasRegraSemanal): boolean {
  if (a.diasUteis.some((dia) => b.diasUteis.includes(dia))) return true;
  if (a.sabado && b.sabado) return true;
  if (a.domingo && b.domingo) return true;
  if (a.feriado && b.feriado) return true;
  return false;
}

/**
 * Procura, entre as regras ATIVAS já existentes, uma que conflite com a
 * candidata: mesmo recurso, mesma semana (mesma `semanaInicio`) e pelo
 * menos um dia/natureza-alvo em comum. Nunca soma horas silenciosamente
 * quando duas regras se sobrepõem - a UI deve rejeitar explicitamente
 * (item 7 do redesenho). Regras INATIVAS nunca conflitam (não produzem
 * capacidade nenhuma).
 */
export function encontrarRegraConflitante(
  regrasExistentes: readonly RegraSemanalCapacidadeExtra[],
  candidata: RegraSemanalCapacidadeExtra,
): RegraSemanalCapacidadeExtra | null {
  for (const existente of regrasExistentes) {
    if (!existente.ativo) continue;
    if (existente.recursoId !== candidata.recursoId) continue;
    if (existente.semanaInicio !== candidata.semanaInicio) continue;
    if (diasSeSobrepoe(existente.dias, candidata.dias)) return existente;
  }
  return null;
}

function naturezaDiaParaCapacidadeExtra(natureza: NaturezaDia): NaturezaCapacidadeExtra {
  return natureza === "normal" ? "hora_extra" : natureza;
}

function tipoContratacaoDaNatureza(natureza: NaturezaCapacidadeExtra): TipoContratacao {
  return natureza === "hora_extra" ? "hora_extra" : "sabado_domingo_feriado";
}

/**
 * Verifica, sem gerar nenhum dado, se TODAS as datas de TODAS as regras
 * ativas têm convenção aplicável - devolve a primeira data sem cobertura
 * (para a UI reportar antes de tentar calcular), ou null quando tudo
 * está coberto.
 */
export function encontrarDataSemConvencaoAplicavel(params: {
  regras: readonly RegraSemanalCapacidadeExtra[];
  janelaInicio: string;
  janelaFim: string;
  resolverNatureza: (data: string) => NaturezaDia;
  convencoes: readonly ConvencaoHorasAdicionaisVigencia[];
}): string | null {
  const { regras, janelaInicio, janelaFim, resolverNatureza, convencoes } = params;
  for (const regra of regras) {
    if (!regra.ativo) continue;
    const janelaEfetiva = calcularJanelaEfetivaSemana({ semanaInicio: regra.semanaInicio, janelaInicio, janelaFim });
    if (!janelaEfetiva) continue;
    const expandido = expandirRegraSemanal({ ...regra, ...janelaEfetiva, resolverNatureza });
    for (const { data } of expandido) {
      if (resolverConvencaoParaData(convencoes, data) === null) {
        return data;
      }
    }
  }
  return null;
}

export function construirDecisoesCapacidadeExtraDeRegras(params: {
  regras: readonly RegraSemanalCapacidadeExtra[];
  janelaInicio: string;
  janelaFim: string;
  resolverNatureza: (data: string) => NaturezaDia;
  valorHoraPorRecurso: Readonly<Record<string, number>>;
  convencoes: readonly ConvencaoHorasAdicionaisVigencia[];
}): DecisoesCenario {
  const { regras, janelaInicio, janelaFim, resolverNatureza, valorHoraPorRecurso, convencoes } = params;

  const capacidadeExtra: CapacidadeExtraDia[] = [];
  const contratacoes: Contratacao[] = [];
  const contratacaoIdPorGrupo = new Map<string, string>();

  for (const regra of regras) {
    if (!regra.ativo) continue;

    const valorHoraBase = valorHoraPorRecurso[regra.recursoId];
    if (valorHoraBase === undefined) {
      throw new RangeError(`valorHoraPorRecurso não tem entrada para o recurso "${regra.recursoId}".`);
    }

    const janelaEfetiva = calcularJanelaEfetivaSemana({ semanaInicio: regra.semanaInicio, janelaInicio, janelaFim });
    if (!janelaEfetiva) continue;

    const expandido = expandirRegraSemanal({ ...regra, ...janelaEfetiva, resolverNatureza });

    for (const { data, horas, natureza } of expandido) {
      const convencao = resolverConvencaoParaData(convencoes, data);
      if (!convencao) {
        throw new RangeError(
          `Não é possível aplicar a regra do recurso "${regra.recursoId}": não há convenção coletiva vigente para o dia ${data}.`,
        );
      }

      const naturezaCapExtra = naturezaDiaParaCapacidadeExtra(natureza);
      const valorHora = calcularValorHoraAdicional(valorHoraBase, naturezaCapExtra, convencao);

      const chaveGrupo = `${regra.recursoId}::${naturezaCapExtra}::${convencao.vigenteDesde}`;
      let contratacaoId = contratacaoIdPorGrupo.get(chaveGrupo);
      if (!contratacaoId) {
        contratacaoId = crypto.randomUUID();
        contratacaoIdPorGrupo.set(chaveGrupo, contratacaoId);
        contratacoes.push({
          id: contratacaoId,
          tipo: tipoContratacaoDaNatureza(naturezaCapExtra),
          abrangencia: "por_hora_utilizada",
          valor: valorHora,
          moeda: "BRL",
          fornecedorOuContratado: "Convenção coletiva",
          referenciaProposta: null,
          justificativa: `Hora adicional (${naturezaCapExtra}) - convenção vigente desde ${convencao.vigenteDesde}.`,
          datas: [],
        });
      }

      capacidadeExtra.push({
        recursoId: regra.recursoId,
        data,
        horasAdicionaisDisponiveis: horas,
        natureza: naturezaCapExtra,
        elegibilidade: { escopo: "somente_orcamento_novo" },
        contratacaoId,
      });
    }
  }

  return { capacidadeExtra, contratacoes, terceirizacoes: [], recursosTemporarios: [], antecipacoesMaterial: [] };
}
