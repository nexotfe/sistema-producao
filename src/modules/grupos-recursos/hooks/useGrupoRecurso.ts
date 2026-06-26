"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { GrupoRecursoProdutivo } from "../types";

export function useGrupoRecurso(id: string) {
  const [grupo, setGrupo] = useState<GrupoRecursoProdutivo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregarGrupo() {
      if (!id) {
        setErro("Grupo de recursos nao informado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErro(null);

      const { data, error } = await supabase
        .from("grupos_recursos")
        .select(
          "id,codigo,nome,descricao,setor,unidade_capacidade,ativo,created_at",
        )
        .eq("id", id)
        .single();

      if (error || !data) {
        setErro("Nao foi possivel carregar o grupo de recursos.");
        setGrupo(null);
      } else {
        setGrupo(data as GrupoRecursoProdutivo);
      }

      setLoading(false);
    }

    carregarGrupo();
  }, [id]);

  return {
    grupo,
    loading,
    erro,
  };
}
