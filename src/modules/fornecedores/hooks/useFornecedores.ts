"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SituacaoFornecedor = "todos" | "ativos" | "inativos";

type Fornecedor = {
  id: string;
  nome: string | null;
  nome_fantasia: string | null;
  telefone: string | null;
  email: string | null;
  telefone_comercial: string | null;
  email_comercial: string | null;
  cnpj: string | null;
  cidade: string | null;
  ativo: boolean | null;
  created_at: string | null;
};

export function useFornecedores() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<SituacaoFornecedor>("todos");

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [usuario, setUsuario] = useState("Usuario");

  useEffect(() => {
    async function carregarDados() {
      setLoading(true);
      setErro(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.email) {
        setUsuario(user.email);
      }

      const { data, error } = await supabase
        .from("fornecedores")
        .select(
          "id,nome,nome_fantasia,telefone,email,telefone_comercial,email_comercial,cnpj,cidade,ativo,created_at",
        )
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        setErro("Nao foi possivel carregar os fornecedores.");
        setFornecedores([]);
      } else {
        setFornecedores(data ?? []);
      }

      setLoading(false);
    }

    carregarDados();
  }, []);

  const totais = useMemo(
    () => ({
      todos: fornecedores.length,
      ativos: fornecedores.filter((fornecedor) => fornecedor.ativo === true)
        .length,
      inativos: fornecedores.filter((fornecedor) => fornecedor.ativo === false)
        .length,
    }),
    [fornecedores],
  );

  const fornecedoresFiltrados = useMemo(() => {
    let resultado = [...fornecedores];

    if (situacao === "ativos") {
      resultado = resultado.filter((fornecedor) => fornecedor.ativo === true);
    }

    if (situacao === "inativos") {
      resultado = resultado.filter((fornecedor) => fornecedor.ativo === false);
    }

    const termo = busca.trim().toLowerCase();

    if (termo) {
      resultado = resultado.filter((fornecedor) =>
        [
          fornecedor.nome,
          fornecedor.nome_fantasia,
          fornecedor.cnpj,
          fornecedor.cidade,
          fornecedor.telefone,
          fornecedor.email,
          fornecedor.telefone_comercial,
          fornecedor.email_comercial,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termo),
      );
    }

    return resultado;
  }, [busca, fornecedores, situacao]);

  return {
    fornecedores: fornecedoresFiltrados,

    busca,
    setBusca,

    situacao,
    setSituacao,
    totais,

    loading,
    erro,
    usuario,
  };
}
