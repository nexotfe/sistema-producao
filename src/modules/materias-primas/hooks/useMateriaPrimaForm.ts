"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  type EstoqueInfo,
  type FornecedorMateriaPrima,
  type FornecedorSelecao,
  materiaPrimaInitialForm,
  type MateriaPrima,
  type MateriaPrimaForm,
  type ResultadoAjusteEstoque,
} from "../types";

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const CODIGO_UNIQUE_VIOLATION = "23505";

// Codigo nao pode ter espacos (evita duplicidade tipo "SAE 1045" vs
// "SAE1045" sendo tratados como codigos diferentes).
function normalizarCodigo(valor: string) {
  return valor.toUpperCase().replace(/\s+/g, "");
}

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
  const [estoque, setEstoque] = useState<EstoqueInfo | null>(null);
  const [ajustandoEstoque, setAjustandoEstoque] = useState(false);
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
          "id,codigo,descricao,familia,unidade,bitola,dimensao,ncm,endereco,fabricante,marca,material_especificacao,norma,peso_especifico,observacoes_tecnicas,observacoes,custo_referencia,custo_origem,custo_justificativa,estoque_minimo,estoque_ideal,ativo,created_at,updated_at,empresa_id",
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
        custoReferencia:
          materiaPrima.custo_referencia !== null
            ? String(materiaPrima.custo_referencia)
            : "",
        custoOrigem: materiaPrima.custo_origem ?? "manual",
        custoJustificativa: materiaPrima.custo_justificativa ?? "",
        estoqueMinimo:
          materiaPrima.estoque_minimo !== null
            ? String(materiaPrima.estoque_minimo)
            : "",
        estoqueIdeal:
          materiaPrima.estoque_ideal !== null
            ? String(materiaPrima.estoque_ideal)
            : "",
        ativo: materiaPrima.ativo,
      });
      if (modoEdicao) {
        await carregarFornecedoresAssociados(materiaPrima.id);
        await carregarEstoque(materiaPrima.id);
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
      [campo]:
        campo === "codigo"
          ? (normalizarCodigo(valor as string) as MateriaPrimaForm[K])
          : valor,
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

      const custoReferenciaTexto = form.custoReferencia.trim();
      let custoReferenciaNumerica: number | null = null;

      if (custoReferenciaTexto) {
        custoReferenciaNumerica = Number(custoReferenciaTexto.replace(",", "."));

        if (
          !Number.isFinite(custoReferenciaNumerica) ||
          custoReferenciaNumerica < 0
        ) {
          setErro("Informe um custo de referência numérico válido.");
          return false;
        }
      }

      if (
        form.custoOrigem === "manual" &&
        custoReferenciaNumerica !== null &&
        !form.custoJustificativa.trim()
      ) {
        setErro(
          "Informe a justificativa do custo (obrigatória quando a origem é Manual e há custo de referência).",
        );
        return false;
      }

      const estoqueMinimoNumerico = parseNumeroOpcional(form.estoqueMinimo);
      const estoqueIdealNumerico = parseNumeroOpcional(form.estoqueIdeal);

      if (estoqueMinimoNumerico === "invalido") {
        setErro("Informe um Estoque Mínimo numérico válido.");
        return false;
      }

      if (estoqueIdealNumerico === "invalido") {
        setErro("Informe um Estoque Ideal numérico válido.");
        return false;
      }

      if (
        estoqueMinimoNumerico !== null &&
        estoqueIdealNumerico !== null &&
        estoqueIdealNumerico < estoqueMinimoNumerico
      ) {
        setErro("O Estoque Ideal não pode ser menor que o Estoque Mínimo.");
        return false;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErro("Usuário não autenticado.");
        return false;
      }

      const payload = {
        codigo: normalizarCodigo(form.codigo),
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
        custo_referencia: custoReferenciaNumerica,
        custo_origem: form.custoOrigem,
        custo_justificativa:
          custoReferenciaNumerica !== null
            ? emptyToNull(form.custoJustificativa)
            : null,
        custo_atualizado_em:
          custoReferenciaNumerica !== null ? new Date().toISOString() : null,
        custo_atualizado_por: custoReferenciaNumerica !== null ? user.id : null,
        estoque_minimo: estoqueMinimoNumerico,
        estoque_ideal: estoqueIdealNumerico,
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

      if (supabaseError.code === CODIGO_UNIQUE_VIOLATION) {
        const texto = `${supabaseError.message ?? ""} ${supabaseError.details ?? ""}`;

        if (texto.includes("materias_primas_codigo_empresa_uniq")) {
          setErro("Já existe uma matéria-prima com este código.");
        } else if (texto.includes("materias_primas_descricao_empresa_uniq")) {
          setErro("Já existe uma matéria-prima com esta descrição.");
        } else {
          setErro("Já existe uma matéria-prima com estes dados.");
        }
        return false;
      }

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
    estoque,
    ajustandoEstoque,
    ajustarEstoque,
    loading,
    salvando,
    erro,
    modoEdicao,
    salvarMateriaPrima,
  };

  async function carregarEstoque(materiaPrimaId: string) {
    const { data: saldo } = await supabase
      .from("estoque_saldos")
      .select("saldo_disponivel,saldo_reservado,saldo_livre")
      .eq("materia_prima_id", materiaPrimaId)
      .eq("local_estoque", "principal")
      .maybeSingle();

    const { data: movimentacao } = await supabase
      .from("estoque_movimentacoes")
      .select("tipo_movimento,created_at")
      .eq("materia_prima_id", materiaPrimaId)
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
  }

  async function ajustarEstoque(
    saldoReal: number,
    justificativa: string,
  ): Promise<ResultadoAjusteEstoque> {
    if (!registroId) {
      return { status: "erro", mensagem: "Matéria-prima não encontrada." };
    }

    setAjustandoEstoque(true);

    const { error } = await supabase.rpc("ajustar_estoque_materia_prima", {
      p_materia_prima_id: registroId,
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

    await carregarEstoque(registroId);
    setAjustandoEstoque(false);
    return { status: "ok" };
  }

  async function carregarFornecedoresAssociados(materiaPrimaId: string) {
    const { data } = await supabase
      .from("materias_primas_fornecedores")
      .select(
        "id,fornecedor_id,codigo_fornecedor,moeda,preferencial,fornecedores(nome,nome_fantasia,cnpj)",
      )
      .eq("materia_prima_id", materiaPrimaId)
      .is("deleted_at", null)
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

function parseNumeroOpcional(value: string): number | null | "invalido" {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const numero = Number(trimmed.replace(",", "."));

  if (!Number.isFinite(numero) || numero < 0) {
    return "invalido";
  }

  return numero;
}
