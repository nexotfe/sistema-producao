import Link from "next/link";

import { EmptyState } from "@/modules/clientes/components/EmptyState";
import { LoadingState } from "@/modules/clientes/components/LoadingState";
import { StatusBadge } from "@/modules/clientes/components/StatusBadge";

type Fornecedor = {
  id: string;
  nome: string | null;
  empresa: string | null;
  telefone: string | null;
  email: string | null;
  cnpj: string | null;
  cidade: string | null;
  ativo: boolean | null;
};

type FornecedoresTableProps = {
  fornecedores: Fornecedor[];
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

export function FornecedoresTable({
  fornecedores,
  loading,
  erro,
  busca,
  colunasVisiveis,
}: FornecedoresTableProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <div>
          <Link
            href="/fornecedores/novo"
            className="inline-flex w-fit items-center rounded-sm text-base font-semibold text-slate-900 outline-none transition hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          >
            Cadastro de Fornecedores
            <span
              aria-hidden="true"
              className="ml-2 text-base font-semibold leading-none"
            >
              {"\u203A"}
            </span>
          </Link>

          <p className="mt-1 text-sm text-slate-500">
            Consulte e gerencie os fornecedores da empresa.
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : erro ? (
        <EmptyState titulo="Falha ao carregar" descricao={erro} />
      ) : fornecedores.length === 0 ? (
        <EmptyState
          titulo="Nenhum fornecedor encontrado"
          descricao={
            busca
              ? "Ajuste a busca para localizar outro cadastro."
              : "Os fornecedores cadastrados aparecerao aqui."
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
              {fornecedores.map((fornecedor) => (
                <tr
                  key={fornecedor.id}
                  className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/80"
                >
                  {colunasVisiveis.nomeFantasia && (
                    <td className="px-5 py-3">
                      <Link
                        href={`/fornecedores/${fornecedor.id}`}
                        className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                      >
                        {fornecedor.empresa || "Sem nome fantasia"}
                      </Link>
                    </td>
                  )}

                  {colunasVisiveis.razaoSocial && (
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {fornecedor.nome || "Nao informada"}
                    </td>
                  )}

                  {colunasVisiveis.cnpj && (
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {fornecedor.cnpj || "Nao informado"}
                    </td>
                  )}

                  {colunasVisiveis.cidade && (
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {fornecedor.cidade || "Nao informada"}
                    </td>
                  )}

                  {colunasVisiveis.status && (
                    <td className="px-5 py-3">
                      <StatusBadge ativo={Boolean(fornecedor.ativo)} />
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
