// DEC-007 §6.2/Fase 8b (aprovação do cenário comercial - correção
// achada em teste visual real, projeto 260011) - cartão SEMPRE visível
// assim que `cenarioJaAprovado` termina de carregar, independente de
// premissas preenchidas/recálculo - antes, o único aviso de "cenário já
// aprovado" morava dentro de ResumoFinanceiroCard, que só renderiza
// atrás do gate `cenarioBaseConfirmado && base` (reseta a cada nova
// visita à página), escondendo o cenário vigente até o usuário
// recalcular de novo. Este cartão lê EXCLUSIVAMENTE `cenarioJaAprovado`
// (dado do banco, congelado) - nunca `previsaoComercial`/`saidaAtual`/
// `saidaAjustada` (simulação em edição, mora só em ResumoFinanceiroCard,
// com rótulo "ainda não aprovada"). Separação estrutural pedida pelo
// usuário: só uma aprovação confirmada (RPC) troca o que este cartão
// mostra - nunca uma simulação recalculada.
import { Card } from "@/modules/shared/ui/Card";
import { Badge } from "@/modules/shared/ui/Badge";
import type { CenarioComercialAprovadoResumo } from "@/modules/projetos/lib/buscarCenarioComercialAprovado";

function formatarDataBr(dataIso: string | null): string {
  if (!dataIso) return "—";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDiferenca(diferencaEmDias: number): string {
  if (diferencaEmDias === 0) return "Na data solicitada";
  if (diferencaEmDias > 0) return `${diferencaEmDias} dia(s) depois da data solicitada`;
  return `${Math.abs(diferencaEmDias)} dia(s) antes da data solicitada`;
}

export interface CenarioAprovadoVigenteCardProps {
  /** undefined = ainda carregando (nunca mostrar "Nenhum cenário aprovado" nesse meio-tempo); null = carregado, confirmado que não há vigente; objeto = cenário vigente encontrado. */
  readonly cenarioJaAprovado: CenarioComercialAprovadoResumo | null | undefined;
}

export function CenarioAprovadoVigenteCard({ cenarioJaAprovado }: CenarioAprovadoVigenteCardProps) {
  return (
    <Card title="Cenário comercial aprovado">
      {cenarioJaAprovado === undefined ? (
        <p className="text-[13px] text-text-secondary">Carregando...</p>
      ) : cenarioJaAprovado === null ? (
        <p className="text-[13px] text-text-secondary">Nenhum cenário aprovado ainda para este projeto.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Badge variant="success" className="self-start">
            Vigente — {cenarioJaAprovado.tipoCenario === "ajustado" ? "cenário ajustado" : "cenário atual"}
          </Badge>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <div>
              <dt className="text-[11.5px] font-semibold text-text-secondary">Data solicitada pelo cliente</dt>
              <dd className="text-text-primary">{formatarDataBr(cenarioJaAprovado.dataSolicitadaCliente)}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold text-text-secondary">Prazo proposto pelo cenário</dt>
              <dd className="text-text-primary">{formatarDataBr(cenarioJaAprovado.prazoProposto)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11.5px] font-semibold text-text-secondary">Diferença entre o prazo proposto e a data solicitada</dt>
              <dd className="text-text-primary">{formatarDiferenca(cenarioJaAprovado.diferencaEmDias)}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold text-text-secondary">Custo técnico atual (na aprovação)</dt>
              <dd className="text-text-primary">{formatarMoeda(cenarioJaAprovado.custoTecnicoAtual)}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold text-text-secondary">Custo adicional total</dt>
              <dd className="text-text-primary">{formatarMoeda(cenarioJaAprovado.custoAdicionalTotal)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11.5px] font-semibold text-text-secondary">Novo valor-base do orçamento (ainda sem impostos)</dt>
              <dd className="text-text-primary">{formatarMoeda(cenarioJaAprovado.novoCustoTecnico)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11.5px] font-semibold text-text-secondary">Aprovado em</dt>
              <dd className="text-text-primary">{formatarDataBr(cenarioJaAprovado.aprovadoEm.slice(0, 10))}</dd>
            </div>
          </dl>

          <p className="text-[12px] text-text-secondary">
            Congelado no momento da aprovação - mudanças posteriores no roteiro, recursos, capacidade, convenção ou
            orçamento nunca alteram estes valores. Aprovar outro cenário substitui este (histórico preservado).
          </p>
        </div>
      )}
    </Card>
  );
}
