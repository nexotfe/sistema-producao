import Link from "next/link";

import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";

type Cliente = {
  id: string;
  nome: string | null;
  empresa: string | null;
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
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Cadastro de clientes
          </h2>

          <p className="text-sm text-slate-500">
            Relação comercial de clientes cadastrados.
          </p>
        </div>

        <span className="text-sm font-medium text-slate-400">
          {clientes.length} registro
          {clientes.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <LoadingState />
      ) : erro ? (
        <EmptyState
          titulo="Falha ao carregar"
          descricao={erro}
        />
      ) : clientes.length === 0 ? (
        <EmptyState
          titulo="Nenhum cliente encontrado"
          descricao={
            busca
              ? "Tente ajustar a busca para localizar outro cadastro."
              : "Os clientes cadastrados aparecerão aqui."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
  <tr className="border-b border-slate-100 bg-slate-50/80 text-left">
    {colunasVisiveis.nomeFantasia && (
      <Th>Nome Fantasia</Th>
    )}

    {colunasVisiveis.razaoSocial && (
      <Th>Razão Social</Th>
    )}

    {colunasVisiveis.cnpj && (
      <Th>CNPJ</Th>
    )}

    {colunasVisiveis.cidade && (
      <Th>Cidade</Th>
    )}

    {colunasVisiveis.status && (
      <Th>Status</Th>
    )}
  </tr>
</thead>

            <tbody>
              {clientes.map((cliente) => (
                <tr
                  key={cliente.id}
                  className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/70"
                >
                  
                  {colunasVisiveis.nomeFantasia && (
  <td className="px-6 py-4">
    <div className="flex flex-col">
      <Link
        href={`/clientes/${cliente.id}`}
        className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
      >
        {cliente.empresa || "Sem nome fantasia"}
      </Link>
    </div>
  </td>
)}

{colunasVisiveis.razaoSocial && (
  <td className="px-6 py-4 text-sm text-slate-600">
    {cliente.nome || "Não informada"}
  </td>
)}

{colunasVisiveis.cnpj && (
  <td className="px-6 py-4 text-sm text-slate-600">
    {cliente.cnpj || "Não informado"}
  </td>
)}

{colunasVisiveis.cidade && (
  <td className="px-6 py-4 text-sm text-slate-600">
    {cliente.cidade || "Não informada"}
  </td>
)}

{colunasVisiveis.status && (
  <td className="px-6 py-4">
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

function Th({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
      {children}
    </th>
  );
}