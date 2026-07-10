"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { emptyProductFormValues } from "../types";
import type {
  EstoqueInfo,
  NovaRevisaoInput,
  ProductFormValues,
  ProductRevision,
  ResultadoAdicionarRevisao,
  ResultadoAjusteEstoque,
} from "../types";

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
};

type RevisaoRow = {
  id: string;
  codigo_revisao: string;
  aprovada_em: string | null;
  vigente_ate: string | null;
};

type BomRow = {
  id: string;
  versao: string;
  status: string;
  created_at: string;
};

type CustoRow = {
  categoria: string;
  valor: number;
};

function mapRevisao(row: RevisaoRow, anexoNome: string | null): ProductRevision {
  const vigente = row.aprovada_em !== null && row.vigente_ate === null;

  return {
    id: row.id,
    codigoRevisao: row.codigo_revisao,
    situacao: vigente ? "vigente" : "anterior",
    roteiroVinculado: "Sem roteiro vinculado",
    custoCalculado: 0,
    anexoDesenho: anexoNome,
  };
}

export function useEditarProduto(codigo: string) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [pdfTecnicoNome, setPdfTecnicoNome] = useState<string | null>(null);
  const [values, setValues] = useState<ProductFormValues>(
    emptyProductFormValues,
  );
  const [valorCalculado, setValorCalculado] = useState<number | null>(null);
  const [estoque, setEstoque] = useState<EstoqueInfo | null>(null);
  const [ajustandoEstoque, setAjustandoEstoque] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarValorCalculado = useCallback(async (idProduto: string) => {
    const { data: boms } = await supabase
      .from("boms")
      .select("id,versao,status,created_at")
      .eq("produto_id", idProduto)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    const bomEscolhido =
      ((boms ?? []) as BomRow[]).find((bom) => bom.status === "ativo") ??
      ((boms ?? []) as BomRow[])[0];

    if (!bomEscolhido) {
      setValorCalculado(null);
      setValues((current) => ({ ...current, roteiroVigente: "" }));
      return;
    }

    setValues((current) => ({
      ...current,
      roteiroVigente: `Versão ${bomEscolhido.versao} — status ${bomEscolhido.status}`,
    }));

    const { data: custo } = await supabase.rpc("calcular_custo_bom", {
      p_bom_id: bomEscolhido.id,
    });

    const total = ((custo ?? []) as CustoRow[]).find(
      (linha) => linha.categoria === "total",
    )?.valor;

    setValorCalculado(total !== undefined ? Number(total) : null);
  }, []);

  const carregarEstoque = useCallback(async (idProduto: string) => {
    const { data: saldo } = await supabase
      .from("produto_saldos")
      .select("saldo_disponivel,saldo_reservado,saldo_livre")
      .eq("item_id", idProduto)
      .eq("local_estoque", "principal")
      .maybeSingle();

    const { data: movimentacao } = await supabase
      .from("produto_movimentacoes")
      .select("tipo_movimento,created_at")
      .eq("item_id", idProduto)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setEstoque({
      saldoDisponivel: Number(saldo?.saldo_disponivel ?? 0),
      saldoReservado: Number(saldo?.saldo_reservado ?? 0),
      saldoLivre: Number(saldo?.saldo_livre ?? 0),
      ultimaMovimentacao: movimentacao
        ? {
            tipoMovimento: movimentacao.tipo_movimento,
            criadaEm: movimentacao.created_at,
          }
        : null,
    });
  }, []);

  async function ajustarEstoque(
    saldoReal: number,
    justificativa: string,
  ): Promise<ResultadoAjusteEstoque> {
    if (!itemId) {
      return { status: "erro", mensagem: "Produto não encontrado." };
    }

    setAjustandoEstoque(true);

    const { error } = await supabase.rpc("ajustar_estoque_produto", {
      p_item_id: itemId,
      p_saldo_real: saldoReal,
      p_justificativa: justificativa,
    });

    if (error) {
      setAjustandoEstoque(false);
      return {
        status: "erro",
        mensagem: error.message || "Não foi possível ajustar o estoque.",
      };
    }

    await carregarEstoque(itemId);
    setAjustandoEstoque(false);
    return { status: "ok" };
  }

  const carregarRevisoes = useCallback(
    async (idProduto: string, anexoNome: string | null) => {
      const { data, error } = await supabase
        .from("revisoes_itens")
        .select("id,codigo_revisao,aprovada_em,vigente_ate")
        .eq("item_industrial_id", idProduto)
        .order("created_at", { ascending: false });

      if (error) {
        return;
      }

      setValues((current) => ({
        ...current,
        revisions: ((data ?? []) as RevisaoRow[]).map((row) =>
          mapRevisao(row, anexoNome),
        ),
      }));
    },
    [],
  );

  useEffect(() => {
    async function carregarProduto() {
      if (!codigo) {
        setErro("Produto não informado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErro(null);

      const { data, error } = await supabase
        .from("itens_industriais")
        .select(
          "id,codigo,descricao,tipo_item,unidade,codigo_ncm,ativo,observacoes,pdf_tecnico_nome",
        )
        .eq("codigo", codigo)
        .single();

      if (error || !data) {
        setErro("Não foi possível carregar o produto.");
        setLoading(false);
        return;
      }

      setItemId(data.id);
      setPdfTecnicoNome(data.pdf_tecnico_nome ?? null);
      setValues({
        code: data.codigo ?? "",
        description: data.descricao ?? "",
        tipoItem: data.tipo_item ?? emptyProductFormValues.tipoItem,
        ncm: data.codigo_ncm ?? "",
        unit: data.unidade ?? emptyProductFormValues.unit,
        active: data.ativo ?? true,
        notes: data.observacoes ?? "",
        revisions: [],
        roteiroVigente: "",
      });
      setLoading(false);

      await carregarRevisoes(data.id, data.pdf_tecnico_nome ?? null);
      await carregarValorCalculado(data.id);
      await carregarEstoque(data.id);
    }

    carregarProduto();
  }, [codigo, carregarRevisoes, carregarValorCalculado, carregarEstoque]);

  function updateValue<K extends keyof ProductFormValues>(
    key: K,
    value: ProductFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function adicionarRevisao(
    input: NovaRevisaoInput,
  ): Promise<ResultadoAdicionarRevisao> {
    if (!itemId) {
      return {
        status: "erro",
        mensagem: "Salve o produto antes de adicionar revisões.",
      };
    }

    const { error } = await supabase.rpc("registrar_revisao_item", {
      p_item_industrial_id: itemId,
      p_codigo_revisao: input.codigoRevisao,
      p_aprovar_vigente: input.aprovarVigente,
    });

    if (error) {
      return {
        status: "erro",
        mensagem: error.message || "Não foi possível registrar a revisão.",
      };
    }

    let anexoAtual = pdfTecnicoNome;

    if (input.anexoNomeArquivo) {
      const { error: anexoError } = await supabase
        .from("itens_industriais")
        .update({ pdf_tecnico_nome: input.anexoNomeArquivo })
        .eq("id", itemId);

      if (!anexoError) {
        anexoAtual = input.anexoNomeArquivo;
        setPdfTecnicoNome(anexoAtual);
      }
    }

    await carregarRevisoes(itemId, anexoAtual);
    return { status: "ok" };
  }

  async function salvarProduto() {
    if (!itemId) {
      setErro("Produto não informado.");
      return false;
    }

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

      const { error } = await supabase
        .from("itens_industriais")
        .update({
          codigo: values.code.trim(),
          descricao: values.description.trim(),
          tipo_item: values.tipoItem,
          unidade: values.unit,
          codigo_ncm: values.ncm.trim() || null,
          ativo: values.active,
          observacoes: values.notes.trim() || null,
        })
        .eq("id", itemId);

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
    valorCalculado,
    estoque,
    ajustarEstoque,
    ajustandoEstoque,
    loading,
    salvando,
    erro,
    salvarProduto,
  };
}
