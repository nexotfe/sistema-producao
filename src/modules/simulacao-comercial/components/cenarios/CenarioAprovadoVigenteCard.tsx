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
import type { DecisaoUsoCenarioComercial } from "@/modules/projetos/lib/decidirUsoCenarioComercialAprovado";

const AVISO_CENARIO_DESATUALIZADO =
  "O Roteiro foi alterado após a aprovação deste cenário. Recalcule e aprove um novo cenário.";

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
  /**
   * DEC-007 §6.2/Fase 8b (invalidação automática) - MESMA decisão de
   * useOrcamento.ts/useProposta.ts (avaliarCenarioComercialAprovado.ts).
   * undefined = ainda avaliando (mesmo tri-estado de cenarioJaAprovado);
   * null = sem cenário (decisão não se aplica); objeto = decisão
   * resolvida. O snapshot histórico continua exibido mesmo quando
   * desatualizado - só o badge muda.
   *
   * Opcional (compatibilidade): se omitido/undefined enquanto
   * cenarioJaAprovado já é um objeto resolvido, o badge assume
   * "Vigente" (comportamento anterior a esta correção) - o chamador
   * real (GeradorComparadorCenarios.tsx) sempre resolve os dois juntos,
   * na mesma leva de setState, então esse meio-termo nunca é
   * alcançado na prática; existe só para não quebrar um consumidor
   * hipotético que ainda não passe esta prop.
   */
  readonly decisaoCenarioComercial?: DecisaoUsoCenarioComercial | null | undefined;
}

export function CenarioAprovadoVigenteCard({ cenarioJaAprovado, decisaoCenarioComercial }: CenarioAprovadoVigenteCardProps) {
  const desatualizado = cenarioJaAprovado != null && decisaoCenarioComercial != null && !decisaoCenarioComercial.usarCenario;

  return (
    <Card title="Cenário comercial aprovado">
      {cenarioJaAprovado === undefined ? (
        <p className="text-[13px] text-text-secondary">Carregando...</p>
      ) : cenarioJaAprovado === null ? (
        <p className="text-[13px] text-text-secondary">Nenhum cenário aprovado ainda para este projeto.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Badge variant={desatualizado ? "warning" : "success"} className="self-start">
            {desatualizado
              ? "Aprovado — desatualizado para uso corrente"
              : `Vigente — ${cenarioJaAprovado.tipoCenario === "ajustado" ? "cenário ajustado" : "cenário atual"}`}
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
            Registro histórico preservado - o conteúdo acima nunca é alterado após a aprovação. Aprovar outro cenário
            substitui este.
          </p>

          {desatualizado ? (
            <p className="text-[12px] font-semibold text-status-warning-text">{AVISO_CENARIO_DESATUALIZADO}</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
