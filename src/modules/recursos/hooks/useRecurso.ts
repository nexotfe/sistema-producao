"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  excluirRegistro,
  type ResultadoExclusao,
} from "@/modules/shared/data/excluirRegistro";
import type { GrupoRecurso, RecursoProdutivo } from "../types";

type RecursoRow = Omit<RecursoProdutivo, "grupo">;

export function useRecurso(id: string) {
  const [recurso, setRecurso] = useState<RecursoProdutivo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

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

  async function inativarRecurso() {
    if (!id) {
      setErro("Recurso nao informado.");
      return false;
    }

    setProcessando(true);
    const { error } = await supabase
      .from("recursos_produtivos")
      .update({ ativo: false })
      .eq("id", id);
    setProcessando(false);

    if (error) {
      setErro("Nao foi possivel inativar o recurso produtivo.");
      return false;
    }

    return true;
  }

  async function excluirRecurso(): Promise<ResultadoExclusao> {
    if (!id) {
      return { status: "erro", mensagem: "Recurso nao informado." };
    }

    setProcessando(true);
    const resultado = await excluirRegistro("recursos_produtivos", id);
    setProcessando(false);

    return resultado;
  }

  return {
    recurso,
    loading,
    erro,
    processando,
    inativarRecurso,
    excluirRecurso,
  };
}
