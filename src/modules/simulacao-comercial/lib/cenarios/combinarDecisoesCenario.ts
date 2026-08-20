// DEC-007 §6.2/Fase 8b (incremento capacidade extra) - permite que dois
// (ou mais) painéis independentes da tela de Cenários (antecipação de
// materiais, capacidade extra, e os que vierem depois) contribuam cada
// um com seu próprio DecisoesCenario "completo" (só o seu pedaço
// preenchido, o resto vazio - mesmo contrato que PainelAntecipacaoMaterial
// já usa hoje) e sejam combinados num único DecisoesCenario antes de
// avaliarCenario. União simples dos arrays - cada painel gera seus
// próprios `contratacaoId` via crypto.randomUUID(), então não há risco
// de colisão entre fragmentos.
import type { DecisoesCenario } from "./avaliarCenario";

export function combinarDecisoesCenario(fragmentos: readonly DecisoesCenario[]): DecisoesCenario {
  return {
    capacidadeExtra: fragmentos.flatMap((f) => f.capacidadeExtra),
    contratacoes: fragmentos.flatMap((f) => f.contratacoes),
    terceirizacoes: fragmentos.flatMap((f) => f.terceirizacoes),
    recursosTemporarios: fragmentos.flatMap((f) => f.recursosTemporarios),
    antecipacoesMaterial: fragmentos.flatMap((f) => f.antecipacoesMaterial),
  };
}
