"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { emptyProductFormValues } from "../types";
import type {
  NovaRevisaoInput,
  ProductFormValues,
  ResultadoAdicionarRevisao,
} from "../types";

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
};

export function useNovoProduto() {
  const [values, setValues] = useState<ProductFormValues>(
    emptyProductFormValues,
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function updateValue<K extends keyof ProductFormValues>(
    key: K,
    value: ProductFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  // Revisões dependem de um item_industrial_id real (FK not null em
  // revisoes_itens) - produto ainda não existe até o primeiro Salvar.
  async function adicionarRevisao(
    _input: NovaRevisaoInput,
  ): Promise<ResultadoAdicionarRevisao> {
    return {
      status: "erro",
      mensagem: "Salve o produto antes de adicionar revisões.",
    };
  }

  async function salvarProduto() {
    try {
      setSalvando(true);
      setErro(null);

      if (!values.code.trim()) {
        setErro("Informe o código do produto.");
        return false;
      }

      if (!values.description.trim()) {
        setErro("Informe a descrição do produto.");
        return false;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErro("Usuário não autenticado.");
        return false;
      }

      const { error } = await supabase.from("itens_industriais").insert({
        created_by: user.id,
        codigo: values.code.trim(),
        descricao: values.description.trim(),
        tipo_item: values.tipoItem,
        unidade: values.unit,
        codigo_ncm: values.ncm.trim() || null,
        ativo: values.active,
        observacoes: values.notes.trim() || null,
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
          ? `Não foi possível salvar o produto. ${detalhe}`
          : "Não foi possível salvar o produto.",
      );
      return false;
    } finally {
      setSalvando(false);
    }
  }

  return {
    values,
    updateValue,
    adicionarRevisao,
    salvando,
    erro,
    salvarProduto,
  };
}
