"use client";

// NEXOTFE — Planejamento Diário (PCP), rota oficial. Relação
// operacional de referência para a produção — distinta e separada de
// /pcp/programacao-diaria (Programação técnica por Recurso/Dia, com o
// resultado do Motor - intocada, continua existindo).
//
// Fonte de dados deliberadamente independente do último cálculo do
// Motor (nunca pcp_programacao_operacoes/status_calculo_motor - ver
// buscarOperacoesLiberadasPendentesPcp.ts): só OFs com
// estado_execucao='liberada' e suas OPs efetivamente pendentes (mesma
// lógica de buscarOperacoesOfPcp.ts), ordenadas pela fila de
// prioridades REAL e ATUAL (consultarFilaPrioridadesPcpAction, mesma
// usada em /pcp/prioridades) - nunca uma prioridade própria.
import { useEffect, useState } from "react";
import { ModuleBackButton } from "@/modules/shared/navigation/ModuleBackButton";
import { Select } from "@/modules/shared/ui/Select";
import { EmptyState } from "@/modules/shared/ui/EmptyState";
import { consultarFilaPrioridadesPcpAction } from "@/modules/pcp/actions/consultarFilaPrioridadesPcpAction";
import { consultarOperacoesLiberadasPendentesPcpAction } from "@/modules/pcp/actions/consultarOperacoesLiberadasPendentesPcpAction";
import { consultarGruposRecursosPcpAction } from "@/modules/pcp/actions/consultarGruposRecursosPcpAction";
import type { ItemFilaPrioridadesPcp } from "@/modules/pcp/lib/buscarFilaPrioridadesPcp";
import type { ItemOperacaoLiberadaPendentePcp } from "@/modules/pcp/lib/buscarOperacoesLiberadasPendentesPcp";
import type { GrupoRecursoPcp } from "@/modules/pcp/lib/buscarGruposRecursosPcp";

const TODOS_OS_GRUPOS = "";

type EstadoCarregamento =
  | { tipo: "carregando" }
  | { tipo: "nao_autenticado" }
  | { tipo: "nao_autorizado" }
  | { tipo: "falha_tecnica" }
  | {
      tipo: "ok";
      fila: readonly ItemFilaPrioridadesPcp[];
      itens: readonly ItemOperacaoLiberadaPendentePcp[];
      nomeEmpresa: string;
      grupos: readonly GrupoRecursoPcp[];
      grupoIdPorRecursoId: Readonly<Record<string, string>>;
    };

function IconePrinter() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M6 9V3h12v6" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 17v4h12v-4" />
    </svg>
  );
}

function formatarDataBr(data: Date): string {
  return data.toLocaleDateString("pt-BR");
}

function formatarDataHoraBr(data: Date): string {
  return `${data.toLocaleDateString("pt-BR")} ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function PlanejamentoDiarioPage() {
  const [estado, setEstado] = useState<EstadoCarregamento>({ tipo: "carregando" });
  const [grupoFiltro, setGrupoFiltro] = useState<string>(TODOS_OS_GRUPOS);
  const [agora] = useState(() => new Date());

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      const [resFila, resItens, resGrupos] = await Promise.all([
        consultarFilaPrioridadesPcpAction(),
        consultarOperacoesLiberadasPendentesPcpAction(),
        consultarGruposRecursosPcpAction(),
      ]);
      if (cancelado) return;

      for (const resposta of [resFila, resItens, resGrupos]) {
        if (!resposta.ok) {
          if (resposta.motivo === "nao_autenticado") {
            setEstado({ tipo: "nao_autenticado" });
          } else if (resposta.motivo === "nao_autorizado") {
            setEstado({ tipo: "nao_autorizado" });
          } else {
            setEstado({ tipo: "falha_tecnica" });
          }
          return;
        }
      }

      if (!resFila.ok || !resItens.ok || !resGrupos.ok) return; // nunca alcançado - guarda de tipo p/ TS após o loop acima.

      setEstado({
        tipo: "ok",
        fila: resFila.fila,
        itens: resItens.itens,
        nomeEmpresa: resItens.nomeEmpresa,
        grupos: resGrupos.grupos,
        grupoIdPorRecursoId: resGrupos.grupoIdPorRecursoId,
      });
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  function handlePrint() {
    window.print();
  }

  // Agrupa as operações elegíveis por projeto, aplica o filtro de grupo
  // (quando selecionado) e preserva a ordem da fila real - nunca
  // renumera, nunca inventa prioridade própria. Projeto/OF sem nenhuma
  // operação elegível após o filtro simplesmente não aparece.
  const projetosComOperacoes =
    estado.tipo === "ok"
      ? estado.fila
          .map((projeto) => {
            const itensDoProjeto = estado.itens.filter((item) => {
              if (item.projetoId !== projeto.projetoId) return false;
              if (!grupoFiltro) return true;
              return item.recursoId !== null && estado.grupoIdPorRecursoId[item.recursoId] === grupoFiltro;
            });
            return { ...projeto, itens: itensDoProjeto };
          })
          .filter((projeto) => projeto.itens.length > 0)
      : [];

  const grupoLabel = estado.tipo === "ok" ? estado.grupos.find((g) => g.id === grupoFiltro)?.nome ?? "Todos os grupos" : "Todos os grupos";

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10 print:bg-white print:px-0 print:py-0 print:text-black">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          .planejamento-print-card { break-inside: avoid; }
          .planejamento-print-card-header { break-after: avoid; }
        }
      `}</style>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 print:max-w-none print:gap-4">
        <header className="flex flex-col gap-4 print:hidden">
          <ModuleBackButton label="Prioridades" fallbackHref="/pcp/prioridades" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-disabled">PCP</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">Planejamento Diário</h1>
            </div>

            <div className="flex items-end gap-3">
              <div className="w-56">
                <Select
                  label="Grupo de Recursos"
                  value={grupoFiltro}
                  onChange={(e) => setGrupoFiltro(e.target.value)}
                  options={[
                    { value: TODOS_OS_GRUPOS, label: "Todos os grupos" },
                    ...(estado.tipo === "ok" ? estado.grupos.map((g) => ({ value: g.id, label: g.nome })) : []),
                  ]}
                />
              </div>

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex h-[42px] items-center justify-center gap-1.5 rounded-[10px] border border-border bg-surface px-[18px] text-[13.5px] font-semibold text-text-primary transition hover:bg-border-subtle"
              >
                <IconePrinter />
                Imprimir
              </button>
            </div>
          </div>

          {estado.tipo === "nao_autenticado" ? (
            <p className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
              Sessão não autenticada - faça login novamente para ver o planejamento diário.
            </p>
          ) : null}
          {estado.tipo === "nao_autorizado" ? (
            <p className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
              Você não tem a permissão pcp.visualizar_programacao necessária para ver esta tela.
            </p>
          ) : null}
          {estado.tipo === "falha_tecnica" ? (
            <p className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
              Falha técnica ao consultar o planejamento diário.
            </p>
          ) : null}
        </header>

        {/* Cabeçalho exclusivo de impressão — nunca aparece na tela. */}
        <div className="hidden flex-col gap-1 border-b border-black pb-3 print:flex">
          <p className="text-lg font-bold">NEXOTFE — Planejamento Diário</p>
          <p className="text-[14px]">Empresa: {estado.tipo === "ok" ? estado.nomeEmpresa : ""}</p>
          <p className="text-[14px]">Data de referência: {formatarDataBr(agora)}</p>
          <p className="text-[14px]">Grupo de Recursos: {grupoLabel}</p>
          <p className="text-[14px]">Impresso em: {formatarDataHoraBr(agora)}</p>
        </div>

        {estado.tipo === "carregando" ? (
          <p className="text-sm text-text-secondary print:hidden">Carregando planejamento diário...</p>
        ) : estado.tipo === "ok" && projetosComOperacoes.length === 0 ? (
          <EmptyState
            title="Nenhuma operação liberada"
            description={
              grupoFiltro
                ? `Nenhuma operação liberada no grupo "${grupoLabel}" no momento.`
                : "Nenhuma operação liberada no momento."
            }
          />
        ) : estado.tipo === "ok" ? (
          <div className="flex flex-col gap-5 print:gap-3">
            {projetosComOperacoes.map((projeto) => (
              <section
                key={projeto.projetoId}
                className="planejamento-print-card rounded-xl border border-border bg-surface print:rounded-none print:border-0 print:border-b print:border-black print:bg-white print:pb-3"
              >
                <div className="planejamento-print-card-header flex items-center gap-3 border-b border-border-subtle px-4 py-3 print:border-0 print:px-0 print:py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-action-primary text-[13px] font-bold text-action-primary-text print:h-8 print:w-8 print:border print:border-black print:bg-white print:text-[15px] print:text-black">
                    {projeto.posicaoSequencial}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-text-primary print:text-[16px] print:text-black">
                      {projeto.numeroProjeto} — {projeto.nomeProjeto}
                    </p>
                    {projeto.nomeCliente ? (
                      <p className="text-[12.5px] text-text-secondary print:text-[14px] print:text-black">{projeto.nomeCliente}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col divide-y divide-border-subtle print:divide-y-0">
                  {projeto.itens.map((item) => (
                    <div
                      key={item.opId}
                      className="px-4 py-2.5 text-[13px] text-text-secondary print:px-0 print:py-1 print:text-[15.5px] print:font-medium print:text-black"
                    >
                      {item.numeroOf} · {item.codigoOperacional} — {item.descricao}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
