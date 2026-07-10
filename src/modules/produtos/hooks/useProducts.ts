"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Product } from "../types";

type ItemIndustrialRow = {
  id: string;
  codigo: string;
  descricao: string;
  tipo_item: string;
  unidade: string;
  ativo: boolean;
};

type ProdutoSaldo = {
  item_id: string;
  saldo_disponivel: number | null;
};

type BomRow = {
  id: string;
  produto_id: string;
  status: string;
  created_at: string;
};

type CustoRow = {
  categoria: string;
  valor: number;
};

async function calcularValorProdutos(
  produtoIds: string[],
): Promise<Map<string, number>> {
  const valores = new Map<string, number>();

  if (produtoIds.length === 0) {
    return valores;
  }

  const { data: boms } = await supabase
    .from("boms")
    .select("id,produto_id,status,created_at")
    .in("produto_id", produtoIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const bomEscolhidoPorProduto = new Map<string, string>();

  ((boms ?? []) as BomRow[]).forEach((bom) => {
    const atual = bomEscolhidoPorProduto.get(bom.produto_id);

    if (!atual) {
      bomEscolhidoPorProduto.set(bom.produto_id, bom.id);
      return;
    }

    // Boms ja vem ordenados por created_at desc; so troca o escolhido se
    // encontrar um com status='ativo' e o atual nao for ativo.
    const bomAtualEhAtivo = ((boms ?? []) as BomRow[]).find(
      (item) => item.id === atual,
    )?.status === "ativo";

    if (!bomAtualEhAtivo && bom.status === "ativo") {
      bomEscolhidoPorProduto.set(bom.produto_id, bom.id);
    }
  });

  await Promise.all(
    Array.from(bomEscolhidoPorProduto.entries()).map(
      async ([produtoId, bomId]) => {
        const { data } = await supabase.rpc("calcular_custo_bom", {
          p_bom_id: bomId,
        });

        const total = ((data ?? []) as CustoRow[]).find(
          (linha) => linha.categoria === "total",
        )?.valor;

        if (total !== undefined) {
          valores.set(produtoId, Number(total));
        }
      },
    ),
  );

  return valores;
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregarProdutos() {
    setLoading(true);
    setErro(null);

    const { data, error } = await supabase
      .from("itens_industriais")
      .select("id,codigo,descricao,tipo_item,unidade,ativo")
      .order("created_at", { ascending: false });

    if (error) {
      setErro("Não foi possível carregar os produtos.");
      setProducts([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as ItemIndustrialRow[];
    const ids = rows.map((item) => item.id);
    const quantidades = new Map<string, number>();

    if (ids.length > 0) {
      const { data: saldos } = await supabase
        .from("produto_saldos")
        .select("item_id,saldo_disponivel")
        .in("item_id", ids);

      ((saldos ?? []) as ProdutoSaldo[]).forEach((saldo) => {
        quantidades.set(
          saldo.item_id,
          (quantidades.get(saldo.item_id) ?? 0) +
            Number(saldo.saldo_disponivel ?? 0),
        );
      });
    }

    const valores = await calcularValorProdutos(ids);

    setProducts(
      rows.map((item) => ({
        id: item.id,
        code: item.codigo,
        description: item.descricao,
        type: item.tipo_item,
        unit: item.unidade,
        active: item.ativo,
        quantity: quantidades.get(item.id) ?? 0,
        valor: valores.get(item.id) ?? null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  async function alternarAtivoProduto(id: string, ativoAtual: boolean) {
    const { error } = await supabase
      .from("itens_industriais")
      .update({ ativo: !ativoAtual })
      .eq("id", id);

    if (error) {
      setErro("Não foi possível atualizar o status do produto.");
      return;
    }

    await carregarProdutos();
  }

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return products;
    }

    return products.filter((product) =>
      [
        product.code,
        product.description,
        product.type,
        product.active ? "Ativo" : "Inativo",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [search, products]);

  return {
    products: filteredProducts,
    search,
    setSearch,
    loading,
    erro,
    alternarAtivoProduto,
  };
}
