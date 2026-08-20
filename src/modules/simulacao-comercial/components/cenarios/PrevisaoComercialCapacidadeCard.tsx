// DEC-007 - previsão comercial por capacidade: bloco de exibição
// SEPARADO do diagnóstico técnico por precedência do motor antigo
// (ResumoCenarioCard.tsx) - nunca importa nem mistura com ele (duas
// fontes de "data correta" na mesma tela confundiriam o orçamentista).
// Rótulo fixo "Previsão comercial por capacidade — não é programação de
// PCP." sempre visível enquanto este bloco renderiza algo.
//
// Linguagem comercial (nunca "inviável"): "atende a data solicitada",
// "entrega N dia(s) depois/antes da data solicitada", "na data
// solicitada" - mesmo quando horizonteTecnico="insuficiente", a
// mensagem nunca usa essa palavra (ver formatarHorizonteInsuficiente).
//
// Diagnóstico incompleto BLOQUEIA a exibição de datas (status
// "sem_necessidades"/"bloqueado_por_diagnostico" de
// montarPrevisaoComercialProjeto.ts) - este componente só renderiza
// datas quando status="calculado", nunca completa por suposição.
import { Card } from "@/modules/shared/ui/Card";
import { Badge } from "@/modules/shared/ui/Badge";
import type { SaidaPrevisaoComercial } from "@/modules/simulacao-comercial/lib/cenarios/montarPrevisaoComercialProjeto";

const ROTULO_PCP = "Previsão comercial por capacidade — não é programação de PCP.";

function formatarDataBr(dataIso: string | null): string {
  if (!dataIso) return "—";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * positivo = entrega DEPOIS da data solicitada; negativo = ANTES; 0 = na
 * data exata - mesma convenção de montarPrevisaoComercialProjeto.ts,
 * traduzida aqui (e só aqui) para linguagem comercial.
 */
function formatarDiferencaComercial(diferencaEmDias: number | null): string {
  if (diferencaEmDias === null) return "—";
  if (diferencaEmDias === 0) return "Na data solicitada";
  if (diferencaEmDias > 0) return `${diferencaEmDias} dia(s) depois da data solicitada`;
  return `${Math.abs(diferencaEmDias)} dia(s) antes da data solicitada`;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface PrevisaoComercialCapacidadeCardProps {
  saidaAtual: SaidaPrevisaoComercial | null;
  /** null = nenhuma alternativa (hora extra/recurso temporário) configurada ainda - nunca um cálculo "vazio" fingido. */
  saidaAjustada: SaidaPrevisaoComercial | null;
  /** recursoId -> "código - nome" - fallback para o ID cru é decidido aqui (nomesRecursos[id] ?? id), nunca no hook. */
  nomesRecursos: Readonly<Record<string, string>>;
  carregando: boolean;
  erro: string | null;
}

function BlocoResultado({
  titulo,
  saida,
  nomesRecursos,
  mensagemVazio,
}: {
  titulo: string;
  saida: SaidaPrevisaoComercial | null;
  nomesRecursos: Readonly<Record<string, string>>;
  mensagemVazio: string;
}) {
  if (!saida) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border-subtle p-4">
        <h4 className="text-[13px] font-semibold text-text-primary">{titulo}</h4>
        <p className="text-[12.5px] text-text-secondary">{mensagemVazio}</p>
      </div>
    );
  }

  if (saida.status !== "calculado") {
    const introducao =
      saida.status === "sem_necessidades"
        ? "Não foi possível calcular: o orçamento não tem itens para esta previsão."
        : "Não foi possível calcular com segurança - revise os diagnósticos abaixo antes de prosseguir.";
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-status-warning-border bg-status-warning-bg p-4">
        <h4 className="text-[13px] font-semibold text-text-primary">{titulo}</h4>
        <p className="text-[12.5px] text-text-primary">{introducao}</p>
        {saida.diagnosticos.length > 0 ? (
          <ul className="flex flex-col gap-1 text-[12.5px] text-text-secondary">
            {saida.diagnosticos.map((diagnostico, indice) => (
              <li key={`${diagnostico.projetoId}-${indice}`}>{diagnostico.motivo}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (saida.horizonteTecnico === "insuficiente") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-status-warning-border bg-status-warning-bg p-4">
        <h4 className="text-[13px] font-semibold text-text-primary">{titulo}</h4>
        <p className="text-[12.5px] text-text-primary">
          Não foi possível determinar uma data de entrega dentro do horizonte avaliado com as alternativas atuais.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-subtle p-4">
      <h4 className="text-[13px] font-semibold text-text-primary">{titulo}</h4>

      <div>
        <Badge variant={saida.atendeDataSolicitada ? "success" : "warning"}>
          {saida.atendeDataSolicitada ? "Atende a data solicitada" : "Não atende a data solicitada"}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className="text-[11.5px] font-semibold text-text-secondary">Primeira entrega possível</dt>
          <dd className="text-text-primary">{formatarDataBr(saida.primeiraEntregaPossivel)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] font-semibold text-text-secondary">Diferença</dt>
          <dd className="text-text-primary">{formatarDiferencaComercial(saida.diferencaEmDias)}</dd>
        </div>
      </dl>

      {saida.recursosQueDeterminamTermino.length > 0 ? (
        <div>
          <p className="text-[11.5px] font-semibold text-text-secondary">Recursos determinantes</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-text-primary">
            {saida.recursosQueDeterminamTermino.map((recursoId) => (
              <li key={recursoId}>{nomesRecursos[recursoId] ?? recursoId}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="text-[11.5px] font-semibold text-text-secondary">Custo adicional</p>
        {saida.custoAdicional === null ? (
          <p className="text-[12.5px] text-status-danger-text">Custo não calculável.</p>
        ) : (
          <>
            <p className="text-text-primary">{formatarMoeda(saida.custoAdicional.total)}</p>
            {saida.custoAdicional.total > 0 ? (
              <ul className="mt-1 flex flex-col gap-0.5 text-[12.5px] text-text-secondary">
                {saida.custoAdicional.negociacaoMaterial > 0 ? <li>Negociação de material: {formatarMoeda(saida.custoAdicional.negociacaoMaterial)}</li> : null}
                {saida.custoAdicional.horaAdicional > 0 ? <li>Horas adicionais: {formatarMoeda(saida.custoAdicional.horaAdicional)}</li> : null}
                {saida.custoAdicional.recursoTemporario > 0 ? <li>Recursos temporários: {formatarMoeda(saida.custoAdicional.recursoTemporario)}</li> : null}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function PrevisaoComercialCapacidadeCard({
  saidaAtual,
  saidaAjustada,
  nomesRecursos,
  carregando,
  erro,
}: PrevisaoComercialCapacidadeCardProps) {
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Badge variant="neutral" className="self-start">
            {ROTULO_PCP}
          </Badge>
          {saidaAtual ? (
            <p className="text-[12.5px] text-text-secondary">Data solicitada: {formatarDataBr(saidaAtual.dataSolicitadaCliente)}</p>
          ) : null}
        </div>

        {erro ? (
          <p className="text-[12.5px] text-status-danger-text">{erro}</p>
        ) : carregando && !saidaAtual ? (
          <p className="text-[12.5px] text-text-secondary">Calculando previsão comercial por capacidade...</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <BlocoResultado titulo="Cenário atual" saida={saidaAtual} nomesRecursos={nomesRecursos} mensagemVazio="Calculando..." />
            <BlocoResultado
              titulo="Cenário ajustado"
              saida={saidaAjustada}
              nomesRecursos={nomesRecursos}
              mensagemVazio="Configure horas extras/recursos temporários em &quot;Capacidade e recursos&quot; para comparar um cenário ajustado."
            />
          </div>
        )}
      </div>
    </Card>
  );
}
