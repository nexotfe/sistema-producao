"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useNovoCliente() {
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

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvarCliente() {
    console.log("SALVAR CLIENTE EXECUTADO");
    try {
      setLoading(true);
      setErro(null);

      const { data: userData } = await supabase.auth.getUser();

console.log("USUARIO LOGADO:", userData.user);

if (!userData.user) {
  throw new Error("Usuário não autenticado.");
}

const { data: usuario, error: usuarioError } = await supabase
  .from("usuarios")
  .select("empresa_id")
  .eq("id", userData.user.id)
  .single();

if (usuarioError || !usuario?.empresa_id) {
  throw new Error("Empresa do usuário não encontrada.");
}

const { data, error } = await supabase
  .from("clientes")
  .insert({
    empresa_id: usuario.empresa_id,
    created_by: userData.user.id,
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
    ativo: true,
  })
  .select();

    
console.log("DATA:", data);
console.log("ERROR:", error);

            if (error) {
        throw error;
      }

      return true;
    } catch (err) {
      console.error(err);

      setErro("Não foi possível salvar o cliente.");

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
    erro,

    salvarCliente,
  };
}
