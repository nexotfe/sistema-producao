"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  excluirRegistro,
  type ResultadoExclusao,
} from "@/modules/shared/data/excluirRegistro";
import type { GrupoRecursoProdutivo } from "../types";

export function useGrupoRecurso(id: string) {
  const [grupo, setGrupo] = useState<GrupoRecursoProdutivo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

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

  async function inativarGrupo() {
    if (!id) {
      setErro("Grupo de recursos nao informado.");
      return false;
    }

    setProcessando(true);
    const { error } = await supabase
      .from("grupos_recursos")
      .update({ ativo: false })
      .eq("id", id);
    setProcessando(false);

    if (error) {
      setErro("Nao foi possivel inativar o grupo de recursos.");
      return false;
    }

    return true;
  }

  async function excluirGrupo(): Promise<ResultadoExclusao> {
    if (!id) {
      return { status: "erro", mensagem: "Grupo de recursos nao informado." };
    }

    setProcessando(true);
    const resultado = await excluirRegistro("grupos_recursos", id);
    setProcessando(false);

    return resultado;
  }

  return {
    grupo,
    loading,
    erro,
    processando,
    inativarGrupo,
    excluirGrupo,
  };
}
