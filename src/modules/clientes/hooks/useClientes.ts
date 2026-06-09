"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Cliente = {
  id: string;
  nome: string | null;
  empresa: string | null;
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
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [usuario, setUsuario] = useState("Usuário");

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
        .select(
          "id,nome,empresa,telefone,email,cnpj,cidade,ativo,created_at",
        )
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        setErro("Não foi possível carregar os clientes.");
        setClientes([]);
      } else {
        setClientes(data ?? []);
      }

      setLoading(false);
    }

    carregarDados();
  }, []);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) {
      return clientes;
    }

    return clientes.filter((cliente) =>
      [
        cliente.nome,
        cliente.empresa,
        cliente.telefone,
        cliente.email,
        cliente.cnpj,
        cliente.cidade,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(termo),
    );
  }, [busca, clientes]);

  return {
    clientes: clientesFiltrados,
    busca,
    setBusca,
    loading,
    erro,
    usuario,
  };
}