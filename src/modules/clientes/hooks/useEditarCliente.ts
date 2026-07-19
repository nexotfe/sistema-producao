"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useEditarCliente(id: string) {
  const [nome, setNome] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [cidade, setCidade] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const [inscricaoEstadual, setInscricaoEstadual] = useState("");
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState("");
  const [segmento, setSegmento] = useState("");

  const [telefoneFiscal, setTelefoneFiscal] = useState("");
  const [emailFiscal, setEmailFiscal] = useState("");
  const [site, setSite] = useState("");

  const [cep, setCep] = useState("");
  const [estado, setEstado] = useState("");
  const [bairro, setBairro] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregarCliente() {
      if (!id) {
        setErro("Cliente não informado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErro(null);

      const { data, error } = await supabase
        .from("clientes")
        .select(
          "id,nome,nome_fantasia,telefone,email,cnpj,cidade,observacoes,inscricao_estadual,inscricao_municipal,segmento,telefone_fiscal,email_fiscal,site,cep,estado,bairro,endereco,numero,complemento",
        )
        .eq("id", id)
        .is("deleted_at", null)
        .single();

      if (error || !data) {
        setErro("Não foi possível carregar o cliente.");
        setLoading(false);
        return;
      }

      setNome(data.nome ?? "");
      setNomeFantasia(data.nome_fantasia ?? "");
      setTelefone(data.telefone ?? "");
      setEmail(data.email ?? "");
      setCidade(data.cidade ?? "");
      setCnpj(data.cnpj ?? "");
      setObservacoes(data.observacoes ?? "");

      setInscricaoEstadual(data.inscricao_estadual ?? "");
      setInscricaoMunicipal(data.inscricao_municipal ?? "");
      setSegmento(data.segmento ?? "");

      setTelefoneFiscal(data.telefone_fiscal ?? "");
      setEmailFiscal(data.email_fiscal ?? "");
      setSite(data.site ?? "");

      setCep(data.cep ?? "");
      setEstado(data.estado ?? "");
      setBairro(data.bairro ?? "");
      setEndereco(data.endereco ?? "");
      setNumero(data.numero ?? "");
      setComplemento(data.complemento ?? "");

      setLoading(false);
    }

    carregarCliente();
  }, [id]);

  async function salvarCliente() {
    if (!id) {
      setErro("Cliente não informado.");
      return false;
    }

    try {
      setSalvando(true);
      setErro(null);

      const { error } = await supabase
        .from("clientes")
        .update({
          nome,
          nome_fantasia: nomeFantasia,
          telefone,
          email,
          cidade,
          cnpj,
          observacoes,
          inscricao_estadual: inscricaoEstadual,
          inscricao_municipal: inscricaoMunicipal,
          segmento,
          telefone_fiscal: telefoneFiscal,
          email_fiscal: emailFiscal,
          site,
          cep,
          estado,
          bairro,
          endereco,
          numero,
          complemento,
        })
        .eq("id", id);

      if (error) {
        throw error;
      }

      return true;
    } catch (err) {
      console.error(err);
      setErro("Não foi possível salvar o cliente.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  return {
    nome,
    setNome,

    nomeFantasia,
    setNomeFantasia,

    telefone,
    setTelefone,

    email,
    setEmail,

    cidade,
    setCidade,

    cnpj,
    setCnpj,

    observacoes,
    setObservacoes,

    inscricaoEstadual,
    setInscricaoEstadual,

    inscricaoMunicipal,
    setInscricaoMunicipal,

    segmento,
    setSegmento,

    telefoneFiscal,
    setTelefoneFiscal,

    emailFiscal,
    setEmailFiscal,

    site,
    setSite,

    cep,
    setCep,

    estado,
    setEstado,

    bairro,
    setBairro,

    endereco,
    setEndereco,

    numero,
    setNumero,

    complemento,
    setComplemento,

    loading,
    salvando,
    erro,

    salvarCliente,
  };
}
