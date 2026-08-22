// DEC-007 §6.2/Fase 8b (idempotência da aprovação de cenário comercial -
// correção do usuário depois do achado de travamento em "Aprovando...")
// - hash canônico de TUDO que será de fato persistido nesta aprovação,
// para a RPC aprovar_cenario_comercial_v2 detectar se uma repetição
// (mesma chave_idempotencia) é a MESMA solicitação (devolve o cenário já
// gravado) ou uma solicitação DIFERENTE reusando a chave por engano
// (rejeita, nunca devolve outro cenário). Mesmo princípio de
// calcularHashSolicitacao em orquestrarAprovacaoAutoritativa.ts (PAD-008/
// DEC-006) - só roda no servidor (Node crypto síncrono, nunca Web
// Crypto/isomórfico - diferente de calcularHashAssinaturaTecnica.ts, que
// também precisa rodar no navegador).
import { createHash } from "crypto";
import type {
  CenarioComercialAprovadoSnapshot,
  CustoAdicionalPorCategoriaSnapshot,
  TipoCenarioAprovado,
} from "./cenarios/cenarioComercialAprovadoSnapshot";

export interface DadosHashSolicitacaoAprovacaoCenario {
  readonly empresaId: string;
  readonly aprovadoPor: string;
  readonly projetoId: string;
  readonly tipoCenario: TipoCenarioAprovado;
  readonly dataSolicitadaCliente: string;
  readonly prazoProposto: string;
  readonly custoTecnicoAtual: number;
  readonly custoAdicionalPorCategoria: CustoAdicionalPorCategoriaSnapshot;
  readonly valorComercialAtualReferencia: number | null;
  readonly assinaturaTecnica: string;
  readonly snapshot: CenarioComercialAprovadoSnapshot;
  readonly motivoSubstituicao: string | null;
}

export function calcularHashSolicitacaoAprovacaoCenario(dados: DadosHashSolicitacaoAprovacaoCenario): string {
  const canonico = JSON.stringify({
    empresaId: dados.empresaId,
    aprovadoPor: dados.aprovadoPor,
    projetoId: dados.projetoId,
    tipoCenario: dados.tipoCenario,
    dataSolicitadaCliente: dados.dataSolicitadaCliente,
    prazoProposto: dados.prazoProposto,
    custoTecnicoAtual: dados.custoTecnicoAtual,
    custoAdicionalPorCategoria: dados.custoAdicionalPorCategoria,
    valorComercialAtualReferencia: dados.valorComercialAtualReferencia,
    assinaturaTecnica: dados.assinaturaTecnica,
    snapshot: dados.snapshot,
    motivoSubstituicao: dados.motivoSubstituicao,
  });

  return createHash("sha256").update(canonico).digest("hex");
}
