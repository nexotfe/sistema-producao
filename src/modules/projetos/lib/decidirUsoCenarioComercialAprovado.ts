// DEC-007 §6.2/Fase 8b (invalidação automática de cenário aprovado) -
// função PURA (sem I/O), fonte ÚNICA da decisão "usar o cenário
// aprovado ou cair para custo ao vivo", reutilizada por
// useOrcamento.ts, useProposta.ts e a tela de Cenários
// (CenarioAprovadoVigenteCard.tsx) - nunca reimplementada em cada
// tela (motivo do achado do orçamento 260007: Orçamento e Proposta já
// divergiram uma vez sobre como tratar o mesmo cenário aprovado).
//
// Regras (decisão do usuário, 2026-08-22):
// - projeto com status='aprovado' (aprovação final) SEMPRE usa o
//   congelamento definitivo do cenário - nunca recalcula/compara
//   assinatura, mesmo que ela exista e esteja desatualizada;
// - cenário com assinatura_tecnica NULL (legado - aprovado antes da
//   migration 20260822165408, nunca backfillado) é sempre tratado como
//   desatualizado quando o projeto não está com status='aprovado';
// - assinatura recalculada ao vivo diferente da armazenada -
//   desatualizado;
// - falha ao carregar/calcular a assinatura ao vivo - comportamento
//   CONSERVADOR: tratado como desatualizado (nunca como "vigente" por
//   omissão);
// - "verificando" (assinatura ainda não resolvida) também é tratado
//   como desatualizado - o chamador (avaliarCenarioComercialAprovado.ts)
//   garante que este estado nunca chega a ser aplicado a um render
//   real (o cálculo roda inteiro ANTES do primeiro setState do
//   carregamento), mas a função pura cobre o caso de qualquer forma,
//   para nunca precisar de uma suposição não verificável em teste.
export type MotivoCenarioDesatualizado =
  | "assinatura_nula_legado"
  | "assinatura_divergente"
  | "erro_verificacao"
  | "verificando";

export type DecisaoUsoCenarioComercial =
  | { readonly usarCenario: true; readonly motivo: "congelamento_definitivo" | "assinatura_confere" }
  | { readonly usarCenario: false; readonly motivoDesatualizado: MotivoCenarioDesatualizado };

export type VerificacaoAssinaturaTecnica =
  | { readonly status: "verificando" }
  | { readonly status: "ok"; readonly assinaturaAtual: string }
  | { readonly status: "erro" };

export interface ParametrosDecisaoCenarioComercial {
  readonly projetoAprovado: boolean;
  readonly assinaturaTecnicaArmazenada: string | null;
  readonly verificacao: VerificacaoAssinaturaTecnica;
}

export function decidirUsoCenarioComercialAprovado(
  params: ParametrosDecisaoCenarioComercial,
): DecisaoUsoCenarioComercial {
  if (params.projetoAprovado) {
    return { usarCenario: true, motivo: "congelamento_definitivo" };
  }

  if (params.assinaturaTecnicaArmazenada === null) {
    return { usarCenario: false, motivoDesatualizado: "assinatura_nula_legado" };
  }

  if (params.verificacao.status === "verificando") {
    return { usarCenario: false, motivoDesatualizado: "verificando" };
  }

  if (params.verificacao.status === "erro") {
    return { usarCenario: false, motivoDesatualizado: "erro_verificacao" };
  }

  if (params.verificacao.assinaturaAtual !== params.assinaturaTecnicaArmazenada) {
    return { usarCenario: false, motivoDesatualizado: "assinatura_divergente" };
  }

  return { usarCenario: true, motivo: "assinatura_confere" };
}
