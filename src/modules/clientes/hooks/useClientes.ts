"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SituacaoCliente = "todos" | "ativos" | "inativos";

type Cliente = {
  id: string;
  nome: string | null;
  nome_fantasia: string | null;
  telefone: string | null;
  email: string | null;
  cnpj: string | null;
  cidade: string | null;
  ativo: boolean | null;
  created_at: string | null;
};

export function useClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<SituacaoCliente>("todos");

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
        .from("clientes")
        .select("id,nome,nome_fantasia,telefone,email,cnpj,cidade,ativo,created_at")
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        setErro("Nao foi possivel carregar os clientes.");
        setClientes([]);
      } else {
        setClientes(data ?? []);
      }

      setLoading(false);
    }

    carregarDados();
  }, []);

  const totais = useMemo(
    () => ({
      todos: clientes.length,
      ativos: clientes.filter((cliente) => cliente.ativo === true).length,
      inativos: clientes.filter((cliente) => cliente.ativo === false).length,
    }),
    [clientes],
  );

  const clientesFiltrados = useMemo(() => {
    let resultado = [...clientes];

    if (situacao === "ativos") {
      resultado = resultado.filter((cliente) => cliente.ativo === true);
    }

    if (situacao === "inativos") {
      resultado = resultado.filter((cliente) => cliente.ativo === false);
    }

    const termo = busca.trim().toLowerCase();

    if (termo) {
      resultado = resultado.filter((cliente) =>
        [
          cliente.nome,
          cliente.nome_fantasia,
          cliente.cnpj,
          cliente.cidade,
          cliente.telefone,
          cliente.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termo),
      );
    }

    return resultado;
  }, [busca, clientes, situacao]);

  return {
    clientes: clientesFiltrados,

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
