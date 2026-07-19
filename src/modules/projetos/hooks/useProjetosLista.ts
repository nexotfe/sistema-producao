"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ProjectStatus, ProjectType } from "../types";

export type ProjetoListaItem = {
  id: string;
  numeroProjeto: string;
  nome: string;
  tipoProjeto: ProjectType;
  status: ProjectStatus;
  dataObjetivo: string | null;
  clienteNome: string | null;
};

export function useProjetosLista() {
  const [projetos, setProjetos] = useState<ProjetoListaItem[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      setLoading(true);

      const [{ data: projetosData }, { data: clientesData }] = await Promise.all([
        supabase
          .from("projetos")
          .select("id,numero_projeto,nome,tipo_projeto,status,data_objetivo,cliente_id")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase.from("clientes").select("id,nome"),
      ]);

      const clienteNomePorId = new Map(
        (clientesData ?? []).map((cliente) => [cliente.id, cliente.nome as string]),
      );

      setProjetos(
        (projetosData ?? []).map((projeto) => ({
          id: projeto.id,
          numeroProjeto: projeto.numero_projeto,
          nome: projeto.nome,
          tipoProjeto: projeto.tipo_projeto,
          status: projeto.status,
          dataObjetivo: projeto.data_objetivo,
          clienteNome: projeto.cliente_id
            ? clienteNomePorId.get(projeto.cliente_id) ?? null
            : null,
        })),
      );

      setLoading(false);
    }

    carregar();
  }, []);

  const projetosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) {
      return projetos;
    }

    return projetos.filter((projeto) =>
      [projeto.numeroProjeto, projeto.nome, projeto.clienteNome]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(termo),
    );
  }, [busca, projetos]);

  return {
    projetos: projetosFiltrados,
    busca,
    setBusca,
    loading,
  };
}
