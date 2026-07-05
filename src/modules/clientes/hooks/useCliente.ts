"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Cliente = {
  id: string;
  nome: string | null;
  nome_fantasia: string | null;
  telefone: string | null;
  email: string | null;
  cnpj: string | null;
  cidade: string | null;
  observacoes: string | null;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  segmento: string | null;
  telefone_fiscal: string | null;
  email_fiscal: string | null;
  site: string | null;
  cep: string | null;
  estado: string | null;
  bairro: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  ativo: boolean | null;
  created_at: string | null;
};

export function useCliente(id: string) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
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
          "id,nome,nome_fantasia,telefone,email,cnpj,cidade,observacoes,inscricao_estadual,inscricao_municipal,segmento,telefone_fiscal,email_fiscal,site,cep,estado,bairro,endereco,numero,complemento,ativo,created_at",
        )
        .eq("id", id)
        .single();

      if (error) {
        setErro("Não foi possível carregar o cliente.");
        setCliente(null);
      } else {
        setCliente(data);
      }

      setLoading(false);
    }

    carregarCliente();
  }, [id]);

  return {
    cliente,
    loading,
    erro,
  };
}
