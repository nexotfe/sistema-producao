"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export function useNovoCliente() {
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [cidade, setCidade] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvarCliente() {
    try {
      setLoading(true);
      setErro(null);

      const { error } = await supabase
        .from("clientes")
        .insert({
          nome,
          empresa,
          telefone,
          email,
          cidade,
          cnpj,
          observacoes,
          ativo: true,
        });

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

    empresa,
    setEmpresa,

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

    loading,
    erro,

    salvarCliente,
  };
}