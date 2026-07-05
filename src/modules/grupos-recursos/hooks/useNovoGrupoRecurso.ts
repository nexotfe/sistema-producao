"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
};

export function useNovoGrupoRecurso() {
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [unidadeCapacidade, setUnidadeCapacidade] = useState("h/dia");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvarGrupo() {
    try {
      setLoading(true);
      setErro(null);

      if (!codigo.trim()) {
        setErro("Informe o codigo do grupo.");
        return false;
      }

      if (!nome.trim()) {
        setErro("Informe o nome do grupo.");
        return false;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErro("Usuario nao autenticado.");
        return false;
      }

      const { data: usuario, error: usuarioError } = await supabase
        .from("usuarios")
        .select("empresa_id")
        .eq("id", user.id)
        .single();

      if (usuarioError || !usuario?.empresa_id) {
        setErro("Empresa do usuario nao encontrada.");
        return false;
      }

      const { error } = await supabase.from("grupos_recursos").insert({
        empresa_id: usuario.empresa_id,
        created_by: user.id,
        codigo,
        nome,
        descricao,
        unidade_capacidade: unidadeCapacidade || "h/dia",
        ativo: true,
      });

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
          ? `Nao foi possivel salvar o grupo. ${detalhe}`
          : "Nao foi possivel salvar o grupo.",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
    codigo,
    setCodigo,
    nome,
    setNome,
    descricao,
    setDescricao,
    unidadeCapacidade,
    setUnidadeCapacidade,
    loading,
    erro,
    salvarGrupo,
  };
}
