"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { GrupoRecurso } from "../types";

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
};

export function useEditarRecurso(id: string) {
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [fabricante, setFabricante] = useState("");
  const [modelo, setModelo] = useState("");
  const [setor, setSetor] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [cargaHorariaSemanal, setCargaHorariaSemanal] = useState("");
  const [diasTrabalhadosSemana, setDiasTrabalhadosSemana] = useState("");
  const [produtividade, setProdutividade] = useState("");
  const [valorHora, setValorHora] = useState("0");
  const [grupos, setGrupos] = useState<GrupoRecurso[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cargaPreenchida = cargaHorariaSemanal.trim() !== "";
  const diasPreenchido = diasTrabalhadosSemana.trim() !== "";
  const cargaHorariaSemanalNumerica = cargaPreenchida
    ? Number(cargaHorariaSemanal.replace(",", "."))
    : null;
  const diasTrabalhadosSemanaNumerico = diasPreenchido
    ? Number(diasTrabalhadosSemana.replace(",", "."))
    : null;
  const capacidadeHorasDiaCalculada =
    cargaPreenchida &&
    diasPreenchido &&
    Number.isFinite(cargaHorariaSemanalNumerica) &&
    Number.isFinite(diasTrabalhadosSemanaNumerico) &&
    (diasTrabalhadosSemanaNumerico as number) > 0
      ? Math.round(
          (cargaHorariaSemanalNumerica! / diasTrabalhadosSemanaNumerico!) *
            100,
        ) / 100
      : null;

  const produtividadeHerdada =
    grupos.find((grupo) => grupo.id === grupoId)?.produtividade_padrao ??
    null;

  useEffect(() => {
    async function carregarDados() {
      if (!id) {
        setErro("Recurso nao informado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErro(null);

      const [recursoResult, gruposResult] = await Promise.all([
        supabase
          .from("recursos_produtivos")
          .select(
            "id,grupo_id,codigo,nome,fabricante,modelo,setor,capacidade,carga_horaria_semanal,dias_trabalhados_semana,produtividade,valor_hora",
          )
          .eq("id", id)
          .single(),
        supabase
          .from("grupos_recursos")
          .select("id,codigo,nome,setor,produtividade_padrao")
          .order("nome", { ascending: true }),
      ]);

      setGrupos((gruposResult.data ?? []) as GrupoRecurso[]);

      if (recursoResult.error || !recursoResult.data) {
        setErro("Nao foi possivel carregar o recurso produtivo.");
        setLoading(false);
        return;
      }

      const recurso = recursoResult.data;
      setCodigo(recurso.codigo ?? "");
      setNome(recurso.nome ?? "");
      setGrupoId(recurso.grupo_id ?? "");
      setFabricante(recurso.fabricante ?? "");
      setModelo(recurso.modelo ?? "");
      setSetor(recurso.setor ?? "");
      setCapacidade(
        recurso.capacidade !== null && recurso.capacidade !== undefined
          ? String(recurso.capacidade)
          : "",
      );
      setCargaHorariaSemanal(
        recurso.carga_horaria_semanal !== null &&
          recurso.carga_horaria_semanal !== undefined
          ? String(recurso.carga_horaria_semanal)
          : "",
      );
      setDiasTrabalhadosSemana(
        recurso.dias_trabalhados_semana !== null &&
          recurso.dias_trabalhados_semana !== undefined
          ? String(recurso.dias_trabalhados_semana)
          : "",
      );
      setProdutividade(
        recurso.produtividade !== null && recurso.produtividade !== undefined
          ? String(Number(recurso.produtividade) * 100)
          : "",
      );
      setValorHora(
        recurso.valor_hora !== null && recurso.valor_hora !== undefined
          ? String(recurso.valor_hora)
          : "0",
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

      if (!grupoId) {
        setErro("Selecione o grupo ou centro de trabalho.");
        return false;
      }

      const capacidadeNumerica = capacidade ? Number(capacidade) : null;
      const valorHoraNumerico = parseValorHora(valorHora);

      if (capacidade && !Number.isFinite(capacidadeNumerica)) {
        setErro("Capacidade deve ser numerica. Medidas podem ficar em modelo.");
        return false;
      }

      if (!Number.isFinite(valorHoraNumerico) || valorHoraNumerico < 0) {
        setErro("Valor Hora deve ser numerico e maior ou igual a zero.");
        return false;
      }

      if (cargaPreenchida !== diasPreenchido) {
        setErro(
          "Preencha Carga Horaria Semanal e Dias Trabalhados por Semana juntos para calcular a capacidade diaria.",
        );
        return false;
      }

      if (
        cargaPreenchida &&
        (!Number.isFinite(cargaHorariaSemanalNumerica) ||
          (cargaHorariaSemanalNumerica as number) < 0)
      ) {
        setErro("Carga Horaria Semanal deve ser numerica e maior ou igual a zero.");
        return false;
      }

      if (
        diasPreenchido &&
        (!Number.isFinite(diasTrabalhadosSemanaNumerico) ||
          (diasTrabalhadosSemanaNumerico as number) < 1 ||
          (diasTrabalhadosSemanaNumerico as number) > 7)
      ) {
        setErro("Dias Trabalhados por Semana deve ser um numero entre 1 e 7.");
        return false;
      }

      const produtividadePreenchida = produtividade.trim() !== "";
      const produtividadePercentual = produtividadePreenchida
        ? Number(produtividade.replace(",", "."))
        : null;

      if (
        produtividadePreenchida &&
        (!Number.isFinite(produtividadePercentual) ||
          (produtividadePercentual as number) <= 0 ||
          (produtividadePercentual as number) > 100)
      ) {
        setErro("Produtividade deve ser um número entre 0 e 100.");
        return false;
      }

      const produtividadeFracao = produtividadePreenchida
        ? (produtividadePercentual as number) / 100
        : null;

      const { error } = await supabase
        .from("recursos_produtivos")
        .update({
          grupo_id: grupoId,
          codigo,
          nome,
          fabricante,
          modelo,
          setor,
          capacidade: capacidadeNumerica,
          carga_horaria_semanal: cargaHorariaSemanalNumerica,
          dias_trabalhados_semana: diasTrabalhadosSemanaNumerico,
          produtividade: produtividadeFracao,
          ...(capacidadeHorasDiaCalculada !== null
            ? { capacidade_horas_dia: capacidadeHorasDiaCalculada }
            : {}),
          valor_hora: valorHoraNumerico,
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
    grupoId,
    setGrupoId,
    fabricante,
    setFabricante,
    modelo,
    setModelo,
    setor,
    setSetor,
    capacidade,
    setCapacidade,
    cargaHorariaSemanal,
    setCargaHorariaSemanal,
    diasTrabalhadosSemana,
    setDiasTrabalhadosSemana,
    capacidadeHorasDiaCalculada,
    produtividade,
    setProdutividade,
    produtividadeHerdada,
    valorHora,
    setValorHora,
    grupos,
    loading,
    salvando,
    erro,
    salvarRecurso,
  };
}

function parseValorHora(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;

  return normalized ? Number(normalized) : 0;
}
