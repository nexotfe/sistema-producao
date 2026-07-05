"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { GrupoRecurso, RecursoProdutivo } from "../types";

type RecursoRow = Omit<RecursoProdutivo, "grupo">;

export function useRecurso(id: string) {
  const [recurso, setRecurso] = useState<RecursoProdutivo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregarRecurso() {
      if (!id) {
        setErro("Recurso nao informado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErro(null);

      const { data, error } = await supabase
        .from("recursos_produtivos")
        .select(
          "id,grupo_id,codigo,nome,fabricante,modelo,setor,capacidade,valor_hora,ativo,created_at",
        )
        .eq("id", id)
        .single();

      if (error || !data) {
        setErro("Nao foi possivel carregar o recurso produtivo.");
        setRecurso(null);
        setLoading(false);
        return;
      }

      let grupo: GrupoRecurso | null = null;

      if (data.grupo_id) {
        const { data: grupoData } = await supabase
          .from("grupos_recursos")
          .select("id,codigo,nome,setor")
          .eq("id", data.grupo_id)
          .single();

        grupo = grupoData ?? null;
      }

      setRecurso({
        ...(data as RecursoRow),
        grupo,
      });
      setLoading(false);
    }

    carregarRecurso();
  }, [id]);

  return {
    recurso,
    loading,
    erro,
  };
}
