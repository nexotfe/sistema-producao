"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Colaborador } from "../types";

export function useColaborador(id: string) {
  const [colaborador, setColaborador] = useState<Colaborador | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregarColaborador() {
      if (!id) {
        setErro("Colaborador nao informado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErro(null);

      const { data, error } = await supabase
        .from("funcionarios")
        .select(
          "id,codigo,nome,apelido,setor,funcao,habilidades,carga_produtiva,telefone,email,data_admissao,observacoes,ativo,created_at,tecnologia_aplicada_id",
        )
        .eq("id", id)
        .single();

      if (error) {
        setErro("Nao foi possivel carregar o colaborador.");
        setColaborador(null);
      } else {
        setColaborador(data);
      }

      setLoading(false);
    }

    carregarColaborador();
  }, [id]);

  return {
    colaborador,
    loading,
    erro,
  };
}
