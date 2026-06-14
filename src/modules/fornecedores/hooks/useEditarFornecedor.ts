"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
};

export function useEditarFornecedor(id: string) {
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
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

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregarFornecedor() {
      if (!id) {
        setErro("Fornecedor nao informado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErro(null);

      const { data, error } = await supabase
        .from("fornecedores")
        .select(
          "id,nome,empresa,telefone,email,telefone_comercial,email_comercial,cnpj,cidade,observacoes,inscricao_estadual,inscricao_municipal,segmento,site,cep,estado,bairro,endereco,numero,complemento",
        )
        .eq("id", id)
        .single();

      if (error || !data) {
        setErro("Nao foi possivel carregar o fornecedor.");
        setLoading(false);
        return;
      }

      setNome(data.nome ?? "");
      setEmpresa(data.empresa ?? "");
      setCnpj(data.cnpj ?? "");
      setInscricaoEstadual(data.inscricao_estadual ?? "");
      setInscricaoMunicipal(data.inscricao_municipal ?? "");
      setSegmento(data.segmento ?? "");
      setTelefone(data.telefone ?? "");
      setEmail(data.email ?? "");
      setTelefoneComercial(data.telefone_comercial ?? "");
      setEmailComercial(data.email_comercial ?? "");
      setSite(data.site ?? "");
      setCep(data.cep ?? "");
      setEstado(data.estado ?? "");
      setCidade(data.cidade ?? "");
      setBairro(data.bairro ?? "");
      setEndereco(data.endereco ?? "");
      setNumero(data.numero ?? "");
      setComplemento(data.complemento ?? "");
      setObservacoes(data.observacoes ?? "");

      setLoading(false);
    }

    carregarFornecedor();
  }, [id]);

  async function salvarFornecedor() {
    if (!id) {
      setErro("Fornecedor nao informado.");
      return false;
    }

    try {
      setSalvando(true);
      setErro(null);

      const { error } = await supabase
        .from("fornecedores")
        .update({
          nome,
          empresa,
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
          ? `Nao foi possivel salvar o fornecedor. ${detalhe}`
          : "Nao foi possivel salvar o fornecedor.",
      );
      return false;
    } finally {
      setSalvando(false);
    }
  }

  return {
    nome,
    setNome,
    empresa,
    setEmpresa,
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
    salvando,
    erro,
    salvarFornecedor,
  };
}
