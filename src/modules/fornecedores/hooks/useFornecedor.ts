"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Fornecedor = {
  id: string;
  nome: string | null;
  nome_fantasia: string | null;
  telefone: string | null;
  email: string | null;
  telefone_comercial: string | null;
  email_comercial: string | null;
  cnpj: string | null;
  cidade: string | null;
  observacoes: string | null;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  segmento: string | null;
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

export function useFornecedor(id: string) {
  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null);
  const [loading, setLoading] = useState(true);
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
          "id,nome,nome_fantasia,telefone,email,telefone_comercial,email_comercial,cnpj,cidade,observacoes,inscricao_estadual,inscricao_municipal,segmento,site,cep,estado,bairro,endereco,numero,complemento,ativo,created_at",
        )
        .eq("id", id)
        .single();

      if (error) {
        setErro("Nao foi possivel carregar o fornecedor.");
        setFornecedor(null);
      } else {
        setFornecedor(data);
      }

      setLoading(false);
    }

    carregarFornecedor();
  }, [id]);

  return {
    fornecedor,
    loading,
    erro,
  };
}
