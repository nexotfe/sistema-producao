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

     const [filtroStatus, setFiltroStatus] = useState("todos");
     const [filtroCidade, setFiltroCidade] = useState("");


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
  let resultado = [...clientes];

  // Busca
  const termo = busca.trim().toLowerCase();

  if (termo) {
    resultado = resultado.filter((cliente) =>
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
  }

  // Status
  if (filtroStatus === "ativo") {
    resultado = resultado.filter(
      (cliente) => cliente.ativo === true,
    );
  }

  if (filtroStatus === "inativo") {
    resultado = resultado.filter(
      (cliente) => cliente.ativo === false,
    );
  }
  if (filtroCidade.trim()) {
  resultado = resultado.filter(
    (cliente) =>
      cliente.cidade
        ?.toLowerCase()
        .includes(filtroCidade.toLowerCase()),
  );
}

  return resultado;
}, [busca, clientes, filtroStatus, filtroCidade]);

const cidades = [
  ...new Set(
    clientes
      .map((cliente) => cliente.cidade)
      .filter(Boolean),
  ),
];

 return {
  clientes: clientesFiltrados,

  busca,
  setBusca,

  filtroStatus,
  setFiltroStatus,

  filtroCidade,
  setFiltroCidade,

  cidades,

  loading,
  erro,
  usuario,
};

}