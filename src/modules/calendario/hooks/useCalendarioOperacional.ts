"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CalendarioEmpresaEvento, TipoEventoCalendario } from "../types";

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
};

type ResultadoAcao = { status: "ok" } | { status: "erro"; mensagem: string };

export function useCalendarioOperacional() {
  const [registroId, setRegistroId] = useState<string | null>(null);
  const [segunda, setSegunda] = useState(true);
  const [terca, setTerca] = useState(true);
  const [quarta, setQuarta] = useState(true);
  const [quinta, setQuinta] = useState(true);
  const [sexta, setSexta] = useState(true);
  const [sabado, setSabado] = useState(false);
  const [domingo, setDomingo] = useState(false);
  const [eventos, setEventos] = useState<CalendarioEmpresaEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);

    const [{ data: padrao, error: erroPadrao }, { data: eventosData, error: erroEventos }] =
      await Promise.all([
        supabase
          .from("calendario_operacional_empresa")
          .select("id,segunda,terca,quarta,quinta,sexta,sabado,domingo")
          .maybeSingle(),
        supabase
          .from("calendario_empresa_eventos")
          .select("id,empresa_id,data,tipo,descricao,ativo")
          .is("deleted_at", null)
          .order("data", { ascending: false }),
      ]);

    if (erroPadrao || erroEventos) {
      setErro("Não foi possível carregar o calendário operacional.");
      setLoading(false);
      return;
    }

    if (padrao) {
      setRegistroId(padrao.id);
      setSegunda(padrao.segunda);
      setTerca(padrao.terca);
      setQuarta(padrao.quarta);
      setQuinta(padrao.quinta);
      setSexta(padrao.sexta);
      setSabado(padrao.sabado);
      setDomingo(padrao.domingo);
    }

    setEventos((eventosData ?? []) as CalendarioEmpresaEvento[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvarPadraoSemanal(): Promise<ResultadoAcao> {
    try {
      setSalvando(true);
      setErro(null);
      setMensagem(null);

      const payload = { segunda, terca, quarta, quinta, sexta, sabado, domingo };

      if (registroId) {
        const { error } = await supabase
          .from("calendario_operacional_empresa")
          .update(payload)
          .eq("id", registroId);

        if (error) throw error;
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setErro("Usuario nao autenticado.");
          return { status: "erro", mensagem: "Usuario nao autenticado." };
        }

        const { data: usuario, error: usuarioError } = await supabase
          .from("usuarios")
          .select("empresa_id")
          .eq("id", user.id)
          .single();

        if (usuarioError || !usuario?.empresa_id) {
          setErro("Empresa do usuario nao encontrada.");
          return { status: "erro", mensagem: "Empresa nao encontrada." };
        }

        const { data: inserido, error } = await supabase
          .from("calendario_operacional_empresa")
          .insert({
            empresa_id: usuario.empresa_id,
            created_by: user.id,
            ...payload,
          })
          .select("id")
          .single();

        if (error) throw error;

        setRegistroId(inserido.id);
      }

      setMensagem("Padrão semanal salvo.");
      return { status: "ok" };
    } catch (err) {
      const supabaseError = err as SupabaseErrorLike;
      const detalhe =
        supabaseError.message || supabaseError.details || supabaseError.hint;

      const mensagemErro = detalhe
        ? `Não foi possível salvar o padrão semanal. ${detalhe}`
        : "Não foi possível salvar o padrão semanal.";

      setErro(mensagemErro);
      return { status: "erro", mensagem: mensagemErro };
    } finally {
      setSalvando(false);
    }
  }

  async function adicionarEvento(
    data: string,
    tipo: TipoEventoCalendario,
    descricao: string,
  ): Promise<ResultadoAcao> {
    if (!data) {
      return { status: "erro", mensagem: "Informe a data do evento." };
    }

    setErro(null);
    setMensagem(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { status: "erro", mensagem: "Usuario nao autenticado." };
    }

    const { error } = await supabase.from("calendario_empresa_eventos").insert({
      data,
      tipo,
      descricao: descricao.trim() || null,
      created_by: user.id,
    });

    if (error) {
      const mensagemErro = `Não foi possível adicionar o evento. ${error.message}`;
      setErro(mensagemErro);
      return { status: "erro", mensagem: mensagemErro };
    }

    await carregar();
    setMensagem("Evento adicionado.");
    return { status: "ok" };
  }

  async function removerEvento(id: string): Promise<ResultadoAcao> {
    setErro(null);
    setMensagem(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { status: "erro", mensagem: "Usuario nao autenticado." };
    }

    const { error } = await supabase
      .from("calendario_empresa_eventos")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq("id", id);

    if (error) {
      const mensagemErro = `Não foi possível remover o evento. ${error.message}`;
      setErro(mensagemErro);
      return { status: "erro", mensagem: mensagemErro };
    }

    await carregar();
    setMensagem("Evento removido.");
    return { status: "ok" };
  }

  return {
    segunda,
    setSegunda,
    terca,
    setTerca,
    quarta,
    setQuarta,
    quinta,
    setQuinta,
    sexta,
    setSexta,
    sabado,
    setSabado,
    domingo,
    setDomingo,
    eventos,
    loading,
    salvando,
    erro,
    mensagem,
    salvarPadraoSemanal,
    adicionarEvento,
    removerEvento,
  };
}
