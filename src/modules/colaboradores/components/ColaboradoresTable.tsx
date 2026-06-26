import Link from "next/link";

import { EmptyState } from "@/modules/clientes/components/EmptyState";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { LoadingState } from "@/modules/clientes/components/LoadingState";
import { StatusBadge } from "@/modules/clientes/components/StatusBadge";
import type { Colaborador, ColunasColaboradores } from "../types";

type ColaboradoresTableProps = {
  colaboradores: Colaborador[];
  loading: boolean;
  erro: string | null;
  busca: string;
  colunasVisiveis: ColunasColaboradores;
};

export function ColaboradoresTable({
  colaboradores,
  loading,
  erro,
  busca,
  colunasVisiveis,
}: ColaboradoresTableProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <div>
          <Link
            href="/colaboradores/novo"
            className="inline-flex w-fit items-center rounded-sm text-base font-semibold text-slate-900 outline-none transition hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          >
            Cadastro de Colaboradores
            <span
              aria-hidden="true"
              className="ml-2 text-base font-semibold leading-none"
            >
              {"\u203A"}
            </span>
          </Link>

          <p className="mt-1 text-sm text-slate-500">
            Consulte e gerencie os colaboradores da empresa.
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : erro ? (
        <EmptyState titulo="Falha ao carregar" descricao={erro} />
      ) : colaboradores.length === 0 ? (
        <EmptyState
          titulo="Nenhum colaborador encontrado"
          descricao={
            busca
              ? "Ajuste a busca para localizar outro cadastro."
              : "Os colaboradores cadastrados aparecerao aqui."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {colunasVisiveis.codigo && <Th>Codigo</Th>}
                {colunasVisiveis.nome && <Th>Nome</Th>}
                {colunasVisiveis.setor && <Th>Setor</Th>}
                {colunasVisiveis.funcao && <Th>Funcao</Th>}
                {colunasVisiveis.disponibilidade && <Th>Disponibilidade</Th>}
                {colunasVisiveis.status && <Th>Status</Th>}
              </tr>
            </thead>

            <tbody>
              {colaboradores.map((colaborador) => (
                <tr
                  key={colaborador.id}
                  className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/80"
                >
                  {colunasVisiveis.codigo && (
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {colaborador.codigo ?? "Nao informado"}
                    </td>
                  )}

                  {colunasVisiveis.nome && (
                    <td className="px-5 py-3">
                      <EntityLink
                        type="colaborador"
                        id={colaborador.id}
                        className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                      >
                        {colaborador.nome || "Colaborador sem nome"}
                      </EntityLink>
                      {colaborador.apelido ? (
                        <p className="mt-1 text-xs text-slate-400">
                          {colaborador.apelido}
                        </p>
                      ) : null}
                    </td>
                  )}

                  {colunasVisiveis.setor && (
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {colaborador.setor || "Nao informado"}
                    </td>
                  )}

                  {colunasVisiveis.funcao && (
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {colaborador.funcao || "Nao informada"}
                    </td>
                  )}

                  {colunasVisiveis.disponibilidade && (
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {formatHoras(colaborador.disponibilidade_atual)}
                    </td>
                  )}

                  {colunasVisiveis.status && (
                    <td className="px-5 py-3">
                      <StatusBadge ativo={Boolean(colaborador.ativo)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
      {children}
    </th>
  );
}

function formatHoras(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Nao informada";
  }

  return `${value.toLocaleString("pt-BR")}h`;
}
