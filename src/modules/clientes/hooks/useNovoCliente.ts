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
    empresa,
    telefone,
    email,
    cidade,
    cnpj,
    observacoes,
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