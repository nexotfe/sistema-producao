import Link from "next/link";

import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";

type Cliente = {
  id: string;
  nome: string | null;
  nome_fantasia: string | null;
  telefone: string | null;
  email: string | null;
  cnpj: string | null;
  cidade: string | null;
  ativo: boolean | null;
};

type ClientesTableProps = {
  clientes: Cliente[];
  loading: boolean;
  erro: string | null;
  busca: string;
  colunasVisiveis: {
    nomeFantasia: boolean;
    razaoSocial: boolean;
    cnpj: boolean;
    cidade: boolean;
    status: boolean;
  };
};

export function ClientesTable({
  clientes,
  loading,
  erro,
  busca,
  colunasVisiveis,
}: ClientesTableProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-app-card">
      <div className="border-b border-slate-100 px-5 py-4">
        <div>
          <Link
            href="/clientes/novo"
            className="inline-flex w-fit items-center rounded-sm text-base font-semibold text-slate-900 outline-none transition hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          >
            Cadastro de Clientes
            <span
              aria-hidden="true"
              className="ml-2 text-base font-semibold leading-none"
            >
              {"\u203A"}
            </span>
          </Link>

          <p className="mt-1 text-sm text-slate-500">
            Consulte e gerencie os clientes da empresa.
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : erro ? (
        <EmptyState titulo="Falha ao carregar" descricao={erro} />
      ) : clientes.length === 0 ? (
        <EmptyState
          titulo="Nenhum cliente encontrado"
          descricao={
            busca
              ? "Ajuste a busca para localizar outro cadastro."
              : "Os clientes cadastrados aparecerao aqui."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {colunasVisiveis.nomeFantasia && <Th>Nome fantasia</Th>}
                {colunasVisiveis.razaoSocial && <Th>Razao social</Th>}
                {colunasVisiveis.cnpj && <Th>CNPJ</Th>}
                {colunasVisiveis.cidade && <Th>Cidade</Th>}
                {colunasVisiveis.status && <Th>Status</Th>}
              </tr>
            </thead>

            <tbody>
              {clientes.map((cliente) => (
                <tr
                  key={cliente.id}
                  className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/80"
                >
                  {colunasVisiveis.nomeFantasia && (
                    <td className="px-5 py-3">
                      <EntityLink
                        type="cliente"
                        id={cliente.id}
                        className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                      >
                        {cliente.nome_fantasia || "Sem nome fantasia"}
                      </EntityLink>
                    </td>
                  )}

                  {colunasVisiveis.razaoSocial && (
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {cliente.nome || "Nao informada"}
                    </td>
                  )}

                  {colunasVisiveis.cnpj && (
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {cliente.cnpj || "Nao informado"}
                    </td>
                  )}

                  {colunasVisiveis.cidade && (
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {cliente.cidade || "Nao informada"}
                    </td>
                  )}

                  {colunasVisiveis.status && (
                    <td className="px-5 py-3">
                      <StatusBadge ativo={Boolean(cliente.ativo)} />
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
