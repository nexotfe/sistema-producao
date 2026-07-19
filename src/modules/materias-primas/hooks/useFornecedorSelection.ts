"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { FornecedorSelecao } from "../types";

export function useFornecedorSelection() {
  const [fornecedores, setFornecedores] = useState<FornecedorSelecao[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregarFornecedores() {
    setLoading(true);
    setErro(null);

    const { data, error } = await supabase
      .from("fornecedores")
      .select("id,nome,nome_fantasia,cnpj")
      .eq("ativo", true)
      .is("deleted_at", null)
      .order("nome_fantasia", { ascending: true });

    if (error) {
      setErro("Não foi possível carregar os fornecedores.");
      setFornecedores([]);
    } else {
      setFornecedores((data ?? []) as FornecedorSelecao[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void carregarFornecedores();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const fornecedoresFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) {
      return fornecedores;
    }

    return fornecedores.filter((fornecedor) =>
      [fornecedor.nome, fornecedor.nome_fantasia, fornecedor.cnpj]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(termo),
    );
  }, [busca, fornecedores]);

  return {
    fornecedores: fornecedoresFiltrados,
    busca,
    setBusca,
    loading,
    erro,
  };
}
