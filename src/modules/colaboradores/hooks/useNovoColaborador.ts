"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useNovoColaborador() {
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
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvarColaborador() {
    try {
      setLoading(true);
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

      const { error } = await supabase.from("funcionarios").insert({
        empresa_id: usuario.empresa_id,
        created_by: user.id,
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
        ativo: true,
      });

      if (error) {
        throw error;
      }

      return true;
    } catch {
      setErro("Nao foi possivel salvar o colaborador.");
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
    erro,
    salvarColaborador,
  };
}
