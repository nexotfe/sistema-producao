// DEC-007 - correção do seletor "Recurso" da tela de Cenários (achada em
// teste visual real, projeto 260011): o seletor lia `BaseCenarios`
// (motor antigo, árvore INTEIRA - inclui operações de subconjunto) em vez
// da lista já corrigida pela Etapa C (`BasePrevisaoComercial.necessidadesOrcamentoNovo`,
// que já exclui subconjuntos por padrão - ver carregarNecessidadesOrcamentoNovo.ts).
// Estas funções puras isolam a derivação da UI: nunca leem árvore de BOM,
// nunca chamam o motor antigo - só enxergam `NecessidadeCapacidadeFlexivel`,
// o mesmo formato que uma futura "simulação própria" de subconjunto
// (chamada separada com o produto do subconjunto como raiz) já produziria
// sem nenhuma exceção especial de código/projeto aqui.
import type { NecessidadeCapacidadeFlexivel } from "./necessidadeCapacidadeFlexivel";

/** Só `recursoOriginalId`, deduplicado e ordenado - nunca um recurso de fora desta lista de necessidades. */
export function recursosOriginaisDeNecessidades(
  necessidades: readonly Pick<NecessidadeCapacidadeFlexivel, "recursoOriginalId">[],
): string[] {
  return Array.from(new Set(necessidades.map((n) => n.recursoOriginalId))).sort();
}

/** União de `recursosCompativeisPorPrioridade` de todas as necessidades - candidatos ao fluxo "Incluir recurso interno alternativo". */
export function recursosCompativeisDeNecessidades(
  necessidades: readonly Pick<NecessidadeCapacidadeFlexivel, "recursosCompativeisPorPrioridade">[],
): ReadonlySet<string> {
  const set = new Set<string>();
  for (const necessidade of necessidades) {
    for (const id of necessidade.recursosCompativeisPorPrioridade) {
      set.add(id);
    }
  }
  return set;
}

export interface ConfiguracaoCapacidadeRecursos<TRegra extends { recursoId: string }> {
  readonly recursosAlternativos: readonly string[];
  readonly regras: readonly TRegra[];
}

/**
 * Remove de `recursosAlternativos`/`regras` qualquer `recursoId` que saiu
 * do escopo atual (troca de projeto/base, premissas recalculadas) - nunca
 * deixa uma regra já configurada continuar valendo silenciosamente para um
 * recurso fora de `recursosOriginais ∪ recursosCompativeis`. Devolve a
 * MESMA referência de entrada quando nada precisa mudar, para permitir
 * ao chamador pular o `setState` (comparação por identidade).
 */
export function invalidarConfiguracaoForaDeEscopo<TRegra extends { recursoId: string }>(
  configuracao: ConfiguracaoCapacidadeRecursos<TRegra>,
  recursosOriginais: readonly string[],
  recursosCompativeis: ReadonlySet<string>,
): ConfiguracaoCapacidadeRecursos<TRegra> {
  const alternativosValidos = configuracao.recursosAlternativos.filter((id) => recursosCompativeis.has(id));
  const permitidos = new Set([...recursosOriginais, ...alternativosValidos]);
  const regrasValidas = configuracao.regras.filter((r) => permitidos.has(r.recursoId));

  const alternativosMudaram = alternativosValidos.length !== configuracao.recursosAlternativos.length;
  const regrasMudaram = regrasValidas.length !== configuracao.regras.length;
  if (!alternativosMudaram && !regrasMudaram) {
    return configuracao;
  }

  return {
    recursosAlternativos: alternativosMudaram ? alternativosValidos : configuracao.recursosAlternativos,
    regras: regrasMudaram ? regrasValidas : configuracao.regras,
  };
}
