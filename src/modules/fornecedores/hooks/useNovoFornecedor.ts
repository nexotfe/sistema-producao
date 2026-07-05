"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
};

export function useNovoFornecedor() {
  const [nome, setNome] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [inscricaoEstadual, setInscricaoEstadual] = useState("");
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState("");
  const [segmento, setSegmento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [telefoneComercial, setTelefoneComercial] = useState("");
  const [emailComercial, setEmailComercial] = useState("");
  const [site, setSite] = useState("");
  const [cep, setCep] = useState("");
  const [estado, setEstado] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvarFornecedor() {
    try {
      setLoading(true);
      setErro(null);

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        throw new Error("Usuario nao autenticado.");
      }

      const { data: usuario, error: usuarioError } = await supabase
        .from("usuarios")
        .select("empresa_id")
        .eq("id", userData.user.id)
        .single();

      if (usuarioError || !usuario?.empresa_id) {
        throw new Error("Empresa do usuario nao encontrada.");
      }

      const { error } = await supabase.from("fornecedores").insert({
        empresa_id: usuario.empresa_id,
        created_by: userData.user.id,
        nome,
        nome_fantasia: nomeFantasia,
        cnpj,
        inscricao_estadual: inscricaoEstadual,
        inscricao_municipal: inscricaoMunicipal,
        segmento,
        telefone,
        email,
        telefone_comercial: telefoneComercial,
        email_comercial: emailComercial,
        site,
        cep,
        estado,
        cidade,
        bairro,
        endereco,
        numero,
        complemento,
        observacoes,
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
          ? `Nao foi possivel salvar o fornecedor. ${detalhe}`
          : "Nao foi possivel salvar o fornecedor.",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
    nome,
    setNome,
    nomeFantasia,
    setNomeFantasia,
    cnpj,
    setCnpj,
    inscricaoEstadual,
    setInscricaoEstadual,
    inscricaoMunicipal,
    setInscricaoMunicipal,
    segmento,
    setSegmento,
    telefone,
    setTelefone,
    email,
    setEmail,
    telefoneComercial,
    setTelefoneComercial,
    emailComercial,
    setEmailComercial,
    site,
    setSite,
    cep,
    setCep,
    estado,
    setEstado,
    cidade,
    setCidade,
    bairro,
    setBairro,
    endereco,
    setEndereco,
    numero,
    setNumero,
    complemento,
    setComplemento,
    observacoes,
    setObservacoes,
    loading,
    erro,
    salvarFornecedor,
  };
}
