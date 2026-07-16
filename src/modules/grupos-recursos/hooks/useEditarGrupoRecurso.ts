"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
};

export function useEditarGrupoRecurso(id: string) {
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [unidadeCapacidade, setUnidadeCapacidade] = useState("");
  const [produtividadePadrao, setProdutividadePadrao] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
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
          "id,codigo,nome,descricao,unidade_capacidade,produtividade_padrao",
        )
        .eq("id", id)
        .single();

      if (error || !data) {
        setErro("Nao foi possivel carregar o grupo de recursos.");
        setLoading(false);
        return;
      }

      setCodigo(data.codigo ?? "");
      setNome(data.nome ?? "");
      setDescricao(data.descricao ?? "");
      setUnidadeCapacidade(data.unidade_capacidade ?? "");
      setProdutividadePadrao(
        data.produtividade_padrao !== null &&
          data.produtividade_padrao !== undefined
          ? String(Number(data.produtividade_padrao) * 100)
          : "",
      );
      setLoading(false);
    }

    carregarGrupo();
  }, [id]);

  async function salvarGrupo() {
    if (!id) {
      setErro("Grupo de recursos nao informado.");
      return false;
    }

    try {
      setSalvando(true);
      setErro(null);

      if (!codigo.trim()) {
        setErro("Informe o codigo do grupo.");
        return false;
      }

      if (!nome.trim()) {
        setErro("Informe o nome do grupo.");
        return false;
      }

      const produtividadePreenchida = produtividadePadrao.trim() !== "";
      const produtividadePercentual = produtividadePreenchida
        ? Number(produtividadePadrao.replace(",", "."))
        : null;

      if (
        produtividadePreenchida &&
        (!Number.isFinite(produtividadePercentual) ||
          (produtividadePercentual as number) <= 0 ||
          (produtividadePercentual as number) > 100)
      ) {
        setErro("Produtividade Padrão deve ser um número entre 0 e 100.");
        return false;
      }

      const produtividadeFracao = produtividadePreenchida
        ? (produtividadePercentual as number) / 100
        : null;

      const { error } = await supabase
        .from("grupos_recursos")
        .update({
          codigo,
          nome,
          descricao,
          unidade_capacidade: unidadeCapacidade || "h/dia",
          produtividade_padrao: produtividadeFracao,
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
          ? `Nao foi possivel salvar o grupo. ${detalhe}`
          : "Nao foi possivel salvar o grupo.",
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
    descricao,
    setDescricao,
    unidadeCapacidade,
    setUnidadeCapacidade,
    produtividadePadrao,
    setProdutividadePadrao,
    loading,
    salvando,
    erro,
    salvarGrupo,
  };
}
