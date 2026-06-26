"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { RecursoProdutivo } from "../types";

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
          "id,codigo,nome,fabricante,modelo,setor,capacidade,ativo,created_at",
        )
        .eq("id", id)
        .single();

      if (error || !data) {
        setErro("Nao foi possivel carregar o recurso produtivo.");
        setRecurso(null);
        setLoading(false);
        return;
      }

      setRecurso(data as RecursoProdutivo);
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
