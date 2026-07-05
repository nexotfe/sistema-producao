import Link from "next/link";
import { EmptyState } from "@/modules/clientes/components/EmptyState";
import { StatusBadge } from "@/modules/clientes/components/StatusBadge";
import type { Product } from "../types";

type ProductsTableProps = {
  products: Product[];
  search: string;
};

export function ProductsTable({ products, search }: ProductsTableProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <div>
          <Link
            href="/produtos/novo"
            className="inline-flex w-fit items-center rounded-sm text-base font-semibold text-slate-900 outline-none transition hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          >
            Cadastro de Produtos
            <span
              aria-hidden="true"
              className="ml-2 text-base font-semibold leading-none"
            >
              {"\u203A"}
            </span>
          </Link>

          <p className="mt-1 text-sm text-slate-500">
            Produtos cadastrados para uso comercial e operacional.
          </p>
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          titulo="Nenhum produto encontrado"
          descricao={
            search
              ? "Ajuste a busca para encontrar outro produto."
              : "Os produtos cadastrados aparecerão aqui."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <Th>Código</Th>
                <Th>Descrição</Th>
                <Th>Quantidade Padrão</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>

            <tbody>
              {products.map((product) => (
                <tr
                  key={product.code}
                  className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/80"
                >
                  <td className="px-5 py-3 text-sm font-semibold text-slate-900">
                    {product.code}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">
                    {product.description}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">
                    {product.quantity}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge ativo={product.active} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/produtos/${product.code}/editar`}
                        className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                      >
                        Editar
                      </Link>
                      <button
                        type="button"
                        className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                      >
                        Duplicar
                      </button>
                    </div>
                  </td>
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
