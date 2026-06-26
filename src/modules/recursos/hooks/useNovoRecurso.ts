"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
};

export function useNovoRecurso() {
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [fabricante, setFabricante] = useState("");
  const [modelo, setModelo] = useState("");
  const [setor, setSetor] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvarRecurso() {
    try {
      setLoading(true);
      setErro(null);

      if (!codigo.trim()) {
        setErro("Informe o codigo do recurso.");
        return false;
      }

      if (!nome.trim()) {
        setErro("Informe o nome do recurso.");
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

      const { error } = await supabase.from("recursos_produtivos").insert({
        empresa_id: usuario.empresa_id,
        created_by: user.id,
        codigo,
        nome,
        fabricante,
        modelo,
        setor,
        capacidade: capacidade ? Number(capacidade) : null,
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
          ? `Nao foi possivel salvar o recurso. ${detalhe}`
          : "Nao foi possivel salvar o recurso.",
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
    fabricante,
    setFabricante,
    modelo,
    setModelo,
    setor,
    setSetor,
    capacidade,
    setCapacidade,
    loading,
    erro,
    salvarRecurso,
  };
}
