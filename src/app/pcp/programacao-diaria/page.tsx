"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { ModuleBackButton } from "@/modules/shared/navigation/ModuleBackButton";
import {
  buildDailyScheduleRows,
  type ClientRow,
  type DailyOFRow,
  type DailyProductionOperationRow,
  type DailyScheduleRow,
  type OperationAllocationRow,
  type ProductionAppointmentRow,
  type ProductItemRow,
  type ProductiveResourceRow,
  type ProjectRow,
} from "@/modules/pcp/planningRules";

const currentUser = "Flavio Evangelista";

const situationStyles = {
  Programada: "bg-blue-50 text-blue-700 ring-blue-200",
  "Em execucao": "bg-amber-50 text-amber-700 ring-amber-200",
  Concluida: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Parada: "bg-rose-50 text-rose-700 ring-rose-200",
} as const;

export default function DailySchedulePage() {
  const [scheduleRows, setScheduleRows] = useState<DailyScheduleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadScheduleRows() {
      if (!isSupabaseConfigured) {
        if (isMounted) {
          setScheduleRows([]);
          setLoadError("Supabase nao esta configurado.");
          setIsLoading(false);
        }
        return;
      }

      const ordersResult = await supabase
        .from("ordens_fabricacao")
        .select("id,numero_of,projeto_id,produto_id,status")
        .is("deleted_at", null);

      if (ordersResult.error) {
        if (isMounted) {
          setScheduleRows([]);
          setLoadError(ordersResult.error.message);
          setIsLoading(false);
        }
        return;
      }

      const orders = (ordersResult.data as DailyOFRow[] | null) ?? [];
      const orderIds = orders.map((order) => order.id);
      const projectIds = Array.from(new Set(orders.map((order) => order.projeto_id)));
      const productIds = Array.from(
        new Set(orders.map((order) => order.produto_id).filter(Boolean) as string[]),
      );

      const [projectsResult, itemsResult, operationsResult] = await Promise.all([
        projectIds.length > 0
          ? supabase
              .from("projetos")
              .select("id,cliente_id,numero_projeto,status,prioridade,data_objetivo,created_at")
              .in("id", projectIds)
              .is("deleted_at", null)
          : { data: [], error: null },
        productIds.length > 0
          ? supabase.from("itens_industriais").select("id,pn").in("id", productIds)
          : { data: [], error: null },
        orderIds.length > 0
          ? supabase
              .from("operacoes_producao")
              .select("id,of_id,sequencia_snapshot,tempo_planejado_snapshot,unidade_tempo_snapshot")
              .in("of_id", orderIds)
          : { data: [], error: null },
      ]);

      const firstError = projectsResult.error ?? itemsResult.error ?? operationsResult.error;
      if (firstError) {
        if (isMounted) {
          setScheduleRows([]);
          setLoadError(firstError.message);
          setIsLoading(false);
        }
        return;
      }

      const projects = (projectsResult.data as ProjectRow[] | null) ?? [];
      const operations = (operationsResult.data as DailyProductionOperationRow[] | null) ?? [];
      const clientIds = Array.from(
        new Set(projects.map((project) => project.cliente_id).filter(Boolean) as string[]),
      );
      const operationIds = operations.map((operation) => operation.id);

      const [clientsResult, appointmentsResult, allocationsResult] = await Promise.all([
        clientIds.length > 0
          ? supabase.from("clientes").select("id,nome").in("id", clientIds)
          : { data: [], error: null },
        operationIds.length > 0
          ? supabase
              .from("apontamentos_producao")
              .select("operacao_producao_id,duracao_minutos")
              .in("operacao_producao_id", operationIds)
          : { data: [], error: null },
        operationIds.length > 0
          ? supabase
              .from("operacao_alocacoes")
              .select("operacao_producao_id,recurso_produtivo_id,ativa")
              .in("operacao_producao_id", operationIds)
          : { data: [], error: null },
      ]);

      const secondError = clientsResult.error ?? appointmentsResult.error ?? allocationsResult.error;
      if (secondError) {
        if (isMounted) {
          setScheduleRows([]);
          setLoadError(secondError.message);
          setIsLoading(false);
        }
        return;
      }

      const allocations = (allocationsResult.data as OperationAllocationRow[] | null) ?? [];
      const resourceIds = Array.from(
        new Set(
          allocations
            .map((allocation) => allocation.recurso_produtivo_id)
            .filter(Boolean) as string[],
        ),
      );
      const resourcesResult =
        resourceIds.length > 0
          ? await supabase.from("recursos_produtivos").select("id,nome").in("id", resourceIds)
          : { data: [], error: null };

      if (resourcesResult.error) {
        if (isMounted) {
          setScheduleRows([]);
          setLoadError(resourcesResult.error.message);
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) {
        setScheduleRows(
          buildDailyScheduleRows(
            projects,
            (clientsResult.data as ClientRow[] | null) ?? [],
            orders,
            (itemsResult.data as ProductItemRow[] | null) ?? [],
            operations,
            (appointmentsResult.data as ProductionAppointmentRow[] | null) ?? [],
            allocations,
            (resourcesResult.data as ProductiveResourceRow[] | null) ?? [],
          ),
        );
        setLoadError(null);
        setIsLoading(false);
      }
    }

    loadScheduleRows();

    return () => {
      isMounted = false;
    };
  }, []);

  const groupedSchedule = useMemo(
    () =>
      scheduleRows.reduce<Record<string, DailyScheduleRow[]>>((groups, row) => {
        groups[row.resource] = [...(groups[row.resource] ?? []), row];
        return groups;
      }, {}),
    [scheduleRows],
  );

  function handlePrint() {
    window.print();
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 print:bg-white sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-5 print:hidden">
          <div className="flex items-center gap-3">
            <ModuleBackButton label="PCP" />
            <p className="text-sm font-semibold">{currentUser}</p>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                PCP
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Programacao Diaria
              </h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(220px,320px)_auto_auto_auto_auto_auto] sm:items-center">
              <label htmlFor="daily-search" className="sr-only">
                Buscar programacao diaria
              </label>
              <input
                id="daily-search"
                type="search"
                placeholder="Buscar recurso, OF, projeto ou PN"
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <button className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Atualizar
              </button>
              <button className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Filtros
              </button>
              <button
                onClick={handlePrint}
                className="h-11 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
              >
                Imprimir
              </button>
              <button className="h-11 rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">
                Exportar PDF
              </button>
              <button className="h-11 rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">
                Exportar Excel
              </button>
            </div>
          </div>

          <nav aria-label="Navegacao PCP" className="flex flex-wrap gap-2">
            <Link
              href="/pcp/planejamento"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Planejamento PCP
            </Link>
            <Link
              href="/pcp/programacao-diaria"
              className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white"
            >
              Programacao diaria
            </Link>
            {["Capacidade", "Carga Maquina", "Sequenciamento"].map((item) => (
              <span
                key={item}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400"
              >
                {item}
              </span>
            ))}
          </nav>

          <section className="grid gap-3 lg:grid-cols-5">
            {["Data", "Turno", "Supervisor", "Centro de Trabalho", "Situacao"].map(
              (filter) => (
                <label key={filter} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {filter}
                  </span>
                  <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200">
                    <option>Todos</option>
                  </select>
                </label>
              ),
            )}
          </section>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white print:border-slate-300">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 print:block">
              PCP
            </p>
            <h2 className="text-base font-semibold text-slate-950">
              Programacao diaria por recurso
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Planejamento micro da fabrica para execucao dos lideres.
            </p>
            {loadError ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {loadError}
              </p>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm print:min-w-0">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-5 py-3">Recurso</th>
                  <th className="px-5 py-3">OF</th>
                  <th className="px-5 py-3">Projeto</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">PN</th>
                  <th className="px-5 py-3">Tempo Previsto</th>
                  <th className="px-5 py-3">Prioridade</th>
                  <th className="px-5 py-3">Situacao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                      Carregando programacao diaria...
                    </td>
                  </tr>
                ) : Object.entries(groupedSchedule).length > 0 ? (
                  Object.entries(groupedSchedule).map(([resource, rows]) =>
                    rows.map((row, index) => (
                      <tr key={row.ofId} className="transition hover:bg-slate-50">
                        <td className="px-5 py-4 font-semibold text-slate-900">
                          {index === 0 ? resource : ""}
                        </td>
                        <td className="px-5 py-4">
                          <EntityLink
                            type="of"
                            id={row.ofId}
                            className="font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                          >
                            {row.of}
                          </EntityLink>
                        </td>
                        <td className="px-5 py-4">
                          <EntityLink
                            type="projeto"
                            id={row.projectId}
                            className="font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                          >
                            {row.project}
                          </EntityLink>
                        </td>
                        <td className="px-5 py-4 text-slate-700">{row.client}</td>
                        <td className="px-5 py-4">
                          {row.pnId ? (
                            <EntityLink
                              type="item"
                              id={row.pnId}
                              className="font-semibold text-slate-950 outline-none transition hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                            >
                              {row.pn}
                            </EntityLink>
                          ) : (
                            <span className="text-slate-500">{row.pn}</span>
                          )}
                        </td>
                        <td className="px-5 py-4 tabular-nums text-slate-700">
                          <span>{row.estimatedTime}</span>
                          <span className="mt-1 block text-xs text-slate-400">
                            Apontado {row.reportedTime}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex h-7 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold tabular-nums text-slate-700">
                            {row.priority}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                              situationStyles[row.situation]
                            }`}
                          >
                            {row.situation}
                          </span>
                        </td>
                      </tr>
                    )),
                  )
                ) : (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                      Nenhuma OF encontrada para a programacao diaria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
