"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/modules/clientes/components/EmptyState";
import { LoadingState } from "@/modules/clientes/components/LoadingState";
import { StatusBadge } from "@/modules/clientes/components/StatusBadge";
import { RowActionsMenu } from "@/modules/shared/components/RowActionsMenu";
import { DuplicarProdutoModal } from "./DuplicarProdutoModal";
import type { Product } from "../types";

type ProductsTableProps = {
  products: Product[];
  search: string;
  loading: boolean;
  erro: string | null;
  alternarAtivoProduto: (id: string, ativoAtual: boolean) => Promise<void>;
};

export function ProductsTable({
  products,
  search,
  loading,
  erro,
  alternarAtivoProduto,
}: ProductsTableProps) {
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null);
  const [produtoDuplicando, setProdutoDuplicando] = useState<Product | null>(null);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border-subtle px-5 py-4">
        <div>
          <Link
            href="/produtos/novo"
            className="inline-flex w-fit items-center rounded-sm text-base font-semibold text-text-primary outline-none transition hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            Cadastro de Produtos
            <span
              aria-hidden="true"
              className="ml-2 text-base font-semibold leading-none"
            >
              {"›"}
            </span>
          </Link>

          <p className="mt-1 text-sm text-text-secondary">
            Produtos cadastrados para uso comercial e operacional.
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : erro ? (
        <EmptyState titulo="Falha ao carregar" descricao={erro} />
      ) : products.length === 0 ? (
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
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-border-subtle bg-border-subtle text-left">
                <Th>Código</Th>
                <Th>Descrição</Th>
                <Th>Unidade</Th>
                <Th>Quantidade</Th>
                <Th>Valor</Th>
                <Th>Status</Th>
                <Th>{""}</Th>
              </tr>
            </thead>

            <tbody>
              {products.map((product) => (
                <tr
                  key={product.code}
                  className="border-b border-border-subtle transition last:border-0 hover:bg-slate-50/80"
                >
                  <td className="whitespace-nowrap px-5 py-3 text-sm font-semibold text-text-primary">
                    {product.code}
                  </td>
                  <td className="px-5 py-3 text-sm text-text-secondary">
                    {product.description}
                  </td>
                  <td className="px-5 py-3 text-sm text-text-secondary">
                    {product.unit}
                  </td>
                  <td className="px-5 py-3 text-sm text-text-secondary">
                    {product.quantity.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-5 py-3 text-sm text-text-secondary">
                    {product.valor !== null
                      ? product.valor.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })
                      : "Aguardando roteiro"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge ativo={product.active} />
                  </td>
                  <td className="relative px-5 py-3 text-right">
                    <RowActionsMenu
                      aberto={menuAbertoId === product.id}
                      onAbrir={() => setMenuAbertoId(product.id)}
                      onFechar={() => setMenuAbertoId(null)}
                      ariaLabel={`Abrir ações de ${product.description}`}
                      editarHref={`/produtos/${encodeURIComponent(product.code)}/editar`}
                      onDuplicar={() => {
                        setMenuAbertoId(null);
                        setProdutoDuplicando(product);
                      }}
                      ativo={product.active}
                      onToggleAtivo={() => {
                        setMenuAbertoId(null);
                        alternarAtivoProduto(product.id, product.active);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {produtoDuplicando ? (
        <DuplicarProdutoModal
          open={produtoDuplicando !== null}
          onClose={() => setProdutoDuplicando(null)}
          produtoOrigemId={produtoDuplicando.id}
          produtoOrigemCodigo={produtoDuplicando.code}
        />
      ) : null}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-disabled">
      {children}
    </th>
  );
}
