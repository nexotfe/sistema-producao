"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  type FornecedorMateriaPrima,
  type FornecedorSelecao,
  materiaPrimaInitialForm,
  type MateriaPrima,
  type MateriaPrimaForm,
} from "../types";

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
};

type UseMateriaPrimaFormOptions = {
  codigo?: string;
  duplicar?: string | null;
};

export function useMateriaPrimaForm({
  codigo,
  duplicar,
}: UseMateriaPrimaFormOptions = {}) {
  const router = useRouter();
  const [form, setForm] = useState<MateriaPrimaForm>(materiaPrimaInitialForm);
  const [registroId, setRegistroId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [fornecedoresAssociados, setFornecedoresAssociados] = useState<
    FornecedorMateriaPrima[]
  >([]);
  const [loading, setLoading] = useState(Boolean(codigo || duplicar));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const modoEdicao = Boolean(codigo);

  useEffect(() => {
    async function carregarMateriaPrima() {
      const codigoReferencia = codigo ?? duplicar;

      if (!codigoReferencia) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setErro(null);

      const { data, error } = await supabase
        .from("materias_primas")
        .select(
          "id,codigo,descricao,familia,unidade,bitola,dimensao,ncm,endereco,fabricante,marca,material_especificacao,norma,peso_especifico,observacoes_tecnicas,observacoes,ativo,created_at,updated_at,empresa_id",
        )
        .eq("codigo", codigoReferencia)
        .single();

      if (error || !data) {
        setErro("Não foi possível carregar a matéria-prima.");
        setLoading(false);
        return;
      }

      const materiaPrima = data as MateriaPrima;
      setRegistroId(modoEdicao ? materiaPrima.id : null);
      setEmpresaId(materiaPrima.empresa_id);
      setForm({
        codigo: modoEdicao ? materiaPrima.codigo ?? "" : "",
        descricao: materiaPrima.descricao ?? "",
        familia: materiaPrima.familia ?? "",
        unidade: materiaPrima.unidade ?? "",
        bitola: materiaPrima.bitola ?? "",
        dimensao: materiaPrima.dimensao ?? "",
        ncm: materiaPrima.ncm ?? "",
        endereco: materiaPrima.endereco ?? "",
        fabricante: materiaPrima.fabricante ?? "",
        marca: materiaPrima.marca ?? "",
        material_especificacao: materiaPrima.material_especificacao ?? "",
        norma: materiaPrima.norma ?? "",
        peso_especifico: materiaPrima.peso_especifico ?? "",
        observacoes_tecnicas: materiaPrima.observacoes_tecnicas ?? "",
        observacoes: materiaPrima.observacoes ?? "",
        ativo: materiaPrima.ativo,
      });
      if (modoEdicao) {
        await carregarFornecedoresAssociados(materiaPrima.id);
      }
      setLoading(false);
    }

    carregarMateriaPrima();
  }, [codigo, duplicar, modoEdicao]);

  function atualizarCampo<K extends keyof MateriaPrimaForm>(
    campo: K,
    valor: MateriaPrimaForm[K],
  ) {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  async function salvarMateriaPrima() {
    try {
      setSalvando(true);
      setErro(null);

      if (!form.codigo.trim()) {
        setErro("Informe o código da matéria-prima.");
        return false;
      }

      if (!form.descricao.trim()) {
        setErro("Informe a descrição da matéria-prima.");
        return false;
      }

      if (!form.unidade.trim()) {
        setErro("Informe a unidade da matéria-prima.");
        return false;
      }

      const payload = {
        codigo: form.codigo.trim(),
        descricao: form.descricao.trim(),
        familia: emptyToNull(form.familia),
        unidade: form.unidade.trim(),
        bitola: emptyToNull(form.bitola),
        dimensao: emptyToNull(form.dimensao),
        ncm: emptyToNull(form.ncm),
        endereco: emptyToNull(form.endereco),
        fabricante: emptyToNull(form.fabricante),
        marca: emptyToNull(form.marca),
        material_especificacao: emptyToNull(form.material_especificacao),
        norma: emptyToNull(form.norma),
        peso_especifico: emptyToNull(form.peso_especifico),
        observacoes_tecnicas: emptyToNull(form.observacoes_tecnicas),
        observacoes: emptyToNull(form.observacoes),
        ativo: form.ativo,
      };

      if (modoEdicao && registroId) {
        const { error } = await supabase
          .from("materias_primas")
          .update(payload)
          .eq("id", registroId);

        if (error) {
          throw error;
        }
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setErro("Usuário não autenticado.");
          return false;
        }

        const { data: usuario, error: usuarioError } = await supabase
          .from("usuarios")
          .select("empresa_id")
          .eq("id", user.id)
          .single();

        if (usuarioError || !usuario?.empresa_id) {
          setErro("Empresa do usuário não encontrada.");
          return false;
        }

        const { data: novaMateriaPrima, error } = await supabase
          .from("materias_primas")
          .insert({
          ...payload,
          empresa_id: usuario.empresa_id,
          created_by: user.id,
          })
          .select("id,empresa_id")
          .single();

        if (error) {
          throw error;
        }

        if (novaMateriaPrima && fornecedoresAssociados.length > 0) {
          const { error: fornecedoresError } = await supabase
            .from("materias_primas_fornecedores")
            .insert(
              fornecedoresAssociados.map((fornecedor) => ({
                empresa_id: novaMateriaPrima.empresa_id,
                materia_prima_id: novaMateriaPrima.id,
                fornecedor_id: fornecedor.fornecedor_id,
                codigo_fornecedor: fornecedor.codigo_fornecedor,
                moeda: fornecedor.moeda,
                preferencial: fornecedor.preferencial,
                created_by: user.id,
              })),
            );

          if (fornecedoresError) {
            throw fornecedoresError;
          }
        }
      }

      router.push("/estoque/materias-primas");
      return true;
    } catch (err) {
      const supabaseError = err as SupabaseErrorLike;
      const detalhe =
        supabaseError.message || supabaseError.details || supabaseError.hint;

      setErro(
        detalhe
          ? `Não foi possível salvar a matéria-prima. ${detalhe}`
          : "Não foi possível salvar a matéria-prima.",
      );
      return false;
    } finally {
      setSalvando(false);
    }
  }

  return {
    form,
    atualizarCampo,
    registroId,
    fornecedoresAssociados,
    adicionarFornecedor,
    loading,
    salvando,
    erro,
    modoEdicao,
    salvarMateriaPrima,
  };

  async function carregarFornecedoresAssociados(materiaPrimaId: string) {
    const { data } = await supabase
      .from("materias_primas_fornecedores")
      .select(
        "id,fornecedor_id,codigo_fornecedor,moeda,preferencial,fornecedores(nome,nome_fantasia,cnpj)",
      )
      .eq("materia_prima_id", materiaPrimaId)
      .order("created_at", { ascending: true });

    setFornecedoresAssociados(
      (data ?? []).map((item) => {
        const fornecedor = Array.isArray(item.fornecedores)
          ? item.fornecedores[0]
          : item.fornecedores;

        return {
          id: item.id,
          fornecedor_id: item.fornecedor_id,
          nome: fornecedor?.nome ?? null,
          nome_fantasia: fornecedor?.nome_fantasia ?? null,
          cnpj: fornecedor?.cnpj ?? null,
          codigo_fornecedor: item.codigo_fornecedor,
          moeda: item.moeda,
          preferencial: item.preferencial,
        };
      }),
    );
  }

  async function adicionarFornecedor(fornecedor: FornecedorSelecao) {
    if (
      fornecedoresAssociados.some(
        (item) => item.fornecedor_id === fornecedor.id,
      )
    ) {
      return true;
    }

    if (modoEdicao && registroId && empresaId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("materias_primas_fornecedores")
        .insert({
          empresa_id: empresaId,
          materia_prima_id: registroId,
          fornecedor_id: fornecedor.id,
          moeda: "BRL",
          preferencial: fornecedoresAssociados.length === 0,
          created_by: user?.id ?? null,
        })
        .select("id,fornecedor_id,codigo_fornecedor,moeda,preferencial")
        .single();

      if (error || !data) {
        setErro("Não foi possível associar o fornecedor.");
        return false;
      }

      setFornecedoresAssociados((atuais) => [
        ...atuais,
        {
          id: data.id,
          fornecedor_id: data.fornecedor_id,
          nome: fornecedor.nome,
          nome_fantasia: fornecedor.nome_fantasia,
          cnpj: fornecedor.cnpj,
          codigo_fornecedor: data.codigo_fornecedor,
          moeda: data.moeda,
          preferencial: data.preferencial,
        },
      ]);
      return true;
    }

    setFornecedoresAssociados((atuais) => [
      ...atuais,
      {
        id: fornecedor.id,
        fornecedor_id: fornecedor.id,
        nome: fornecedor.nome,
        nome_fantasia: fornecedor.nome_fantasia,
        cnpj: fornecedor.cnpj,
        codigo_fornecedor: null,
        moeda: "BRL",
        preferencial: atuais.length === 0,
      },
    ]);
    return true;
  }
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
