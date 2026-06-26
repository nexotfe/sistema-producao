"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
};

export function useEditarRecurso(id: string) {
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [fabricante, setFabricante] = useState("");
  const [modelo, setModelo] = useState("");
  const [setor, setSetor] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregarDados() {
      if (!id) {
        setErro("Recurso nao informado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErro(null);

      const recursoResult = await supabase
        .from("recursos_produtivos")
        .select("id,codigo,nome,fabricante,modelo,setor,capacidade")
        .eq("id", id)
        .single();

      if (recursoResult.error || !recursoResult.data) {
        setErro("Nao foi possivel carregar o recurso produtivo.");
        setLoading(false);
        return;
      }

      const recurso = recursoResult.data;
      setCodigo(recurso.codigo ?? "");
      setNome(recurso.nome ?? "");
      setFabricante(recurso.fabricante ?? "");
      setModelo(recurso.modelo ?? "");
      setSetor(recurso.setor ?? "");
      setCapacidade(
        recurso.capacidade !== null && recurso.capacidade !== undefined
          ? String(recurso.capacidade)
          : "",
      );
      setLoading(false);
    }

    carregarDados();
  }, [id]);

  async function salvarRecurso() {
    if (!id) {
      setErro("Recurso nao informado.");
      return false;
    }

    try {
      setSalvando(true);
      setErro(null);

      if (!codigo.trim()) {
        setErro("Informe o codigo do recurso.");
        return false;
      }

      if (!nome.trim()) {
        setErro("Informe o nome do recurso.");
        return false;
      }

      const { error } = await supabase
        .from("recursos_produtivos")
        .update({
          codigo,
          nome,
          fabricante,
          modelo,
          setor,
          capacidade: capacidade ? Number(capacidade) : null,
        })
        .eq("id", id);

      if (error) {
        throw error;
      }

      return true;
    } catch (err) {
      const supabaseError = err as SupabaseErrorLike;
      const detalhe =
        supabaseError.message || supabaseError.details || supabaseError.hint;

      setErro(
        detalhe
          ? `Nao foi possivel salvar o recurso. ${detalhe}`
          : "Nao foi possivel salvar o recurso.",
      );
      return false;
    } finally {
      setSalvando(false);
    }
  }

  return {
    codigo,
    setCodigo,
    nome,
    setNome,
    fabricante,
    setFabricante,
    modelo,
    setModelo,
    setor,
    setSetor,
    capacidade,
    setCapacidade,
    loading,
    salvando,
    erro,
    salvarRecurso,
  };
}
