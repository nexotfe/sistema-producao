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
            Product Register
            <span
              aria-hidden="true"
              className="ml-2 text-base font-semibold leading-none"
            >
              {"\u203A"}
            </span>
          </Link>

          <p className="mt-1 text-sm text-slate-500">
            Frontend-only product structure using mocked data.
          </p>
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          titulo="No products found"
          descricao={
            search
              ? "Adjust the search to find another product."
              : "Registered products will appear here."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <Th>Code</Th>
                <Th>Description</Th>
                <Th>Customer</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
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
                    {product.customer}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">
                    {product.type}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge ativo={product.active} />
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/produtos/${product.code}/editar`}
                      className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                    >
                      Edit
                    </Link>
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
