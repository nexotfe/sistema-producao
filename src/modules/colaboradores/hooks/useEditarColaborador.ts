"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useEditarColaborador(id: string) {
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [apelido, setApelido] = useState("");
  const [setor, setSetor] = useState("");
  const [funcao, setFuncao] = useState("");
  const [habilidades, setHabilidades] = useState("");
  const [cargaProdutiva, setCargaProdutiva] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregarColaborador() {
      if (!id || id === "novo") {
        setErro("Colaborador nao informado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErro(null);

      const { data, error } = await supabase
        .from("funcionarios")
        .select(
          "id,codigo,nome,apelido,setor,funcao,habilidades,carga_produtiva,telefone,email,data_admissao,observacoes",
        )
        .eq("id", id)
        .single();

      if (error || !data) {
        setErro("Nao foi possivel carregar o colaborador.");
        setLoading(false);
        return;
      }

      setCodigo(data.codigo ? String(data.codigo) : "");
      setNome(data.nome ?? "");
      setApelido(data.apelido ?? "");
      setSetor(data.setor ?? "");
      setFuncao(data.funcao ?? "");
      setHabilidades(data.habilidades ?? "");
      setCargaProdutiva(
        data.carga_produtiva !== null && data.carga_produtiva !== undefined
          ? String(data.carga_produtiva)
          : "",
      );
      setTelefone(data.telefone ?? "");
      setEmail(data.email ?? "");
      setDataAdmissao(data.data_admissao ?? "");
      setObservacoes(data.observacoes ?? "");
      setLoading(false);
    }

    carregarColaborador();
  }, [id]);

  async function salvarColaborador() {
    if (!id || id === "novo") {
      setErro("Colaborador nao informado.");
      return false;
    }

    try {
      setSalvando(true);
      setErro(null);

      const codigoNumerico = Number(codigo);

      if (!Number.isInteger(codigoNumerico) || codigoNumerico <= 0) {
        setErro("Informe um codigo numerico valido.");
        return false;
      }

      if (!nome.trim()) {
        setErro("Informe o nome do colaborador.");
        return false;
      }

      const { error } = await supabase
        .from("funcionarios")
        .update({
          codigo: codigoNumerico,
          nome,
          apelido,
          setor,
          funcao,
          habilidades,
          carga_produtiva: cargaProdutiva ? Number(cargaProdutiva) : null,
          telefone,
          email: email ? email.toLowerCase().trim() : null,
          data_admissao: dataAdmissao || null,
          observacoes,
        })
        .eq("id", id);

      if (error) {
        throw error;
      }

      return true;
    } catch {
      setErro("Nao foi possivel salvar o colaborador.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function inativarColaborador() {
    if (!id || id === "novo") {
      setErro("Colaborador nao informado.");
      return false;
    }

    try {
      setSalvando(true);
      setErro(null);

      const { error } = await supabase
        .from("funcionarios")
        .update({
          ativo: false,
        })
        .eq("id", id);

      if (error) {
        throw error;
      }

      return true;
    } catch {
      setErro("Nao foi possivel inativar o colaborador.");
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
    apelido,
    setApelido,
    setor,
    setSetor,
    funcao,
    setFuncao,
    habilidades,
    setHabilidades,
    cargaProdutiva,
    setCargaProdutiva,
    telefone,
    setTelefone,
    email,
    setEmail,
    dataAdmissao,
    setDataAdmissao,
    observacoes,
    setObservacoes,
    loading,
    salvando,
    erro,
    salvarColaborador,
    inativarColaborador,
  };
}
