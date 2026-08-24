"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { buscarIdentidadeEmpresaAtual } from "../lib/buscarIdentidadeEmpresaAtual";
import { atualizarIdentidadeEmpresa } from "../lib/atualizarIdentidadeEmpresa";

export type EstadoCarregamentoIdentidade = "carregando" | "ok" | "sem_empresa" | "erro";

/**
 * Formulário de edição da identidade da empresa (nome, CNPJ, inscrição
 * estadual, endereço, telefone, e-mail, site). Deliberadamente NÃO
 * cuida da logo - upload/troca/remoção são operações independentes na
 * tela (enviarLogoEmpresa.ts/removerLogoEmpresa.ts chamados direto da
 * página), para uma falha de upload nunca dar a impressão de que os
 * demais campos também falharam. `logoUrl` aqui é só o valor inicial
 * lido junto da identidade (evita um segundo fetch redundante) - a
 * página mantém seu próprio estado para refletir upload/remoção sem
 * depender deste hook de novo.
 */
export function useEditarIdentidadeEmpresa() {
  const [estadoCarregamento, setEstadoCarregamento] = useState<EstadoCarregamentoIdentidade>("carregando");
  const [mensagemCarregamento, setMensagemCarregamento] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [inscricaoEstadual, setInscricaoEstadual] = useState("");
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [site, setSite] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoSite, setAvisoSite] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      const resultado = await buscarIdentidadeEmpresaAtual(supabase);

      if (cancelado) {
        return;
      }

      if (resultado.status === "ok") {
        setNome(resultado.identidade.nome);
        setCnpj(resultado.identidade.cnpj ?? "");
        setInscricaoEstadual(resultado.identidade.inscricaoEstadual ?? "");
        setEndereco(resultado.identidade.endereco ?? "");
        setTelefone(resultado.identidade.telefone ?? "");
        setEmail(resultado.identidade.email ?? "");
        setSite(resultado.identidade.site ?? "");
        setLogoUrl(resultado.identidade.logoUrl);
        setEstadoCarregamento("ok");
      } else if (resultado.status === "sem_empresa") {
        setEstadoCarregamento("sem_empresa");
      } else {
        setMensagemCarregamento(resultado.mensagem);
        setEstadoCarregamento("erro");
      }
    }

    carregar();

    return () => {
      cancelado = true;
    };
  }, []);

  async function salvar(): Promise<boolean> {
    setSalvando(true);
    setErro(null);
    setAvisoSite(null);
    setSucesso(false);

    const resultado = await atualizarIdentidadeEmpresa(supabase, {
      nome,
      cnpj,
      inscricaoEstadual,
      endereco,
      telefone,
      email,
      site,
    });

    setSalvando(false);

    if (resultado.status === "ok") {
      setSucesso(true);
      if (resultado.avisoSite) {
        setAvisoSite(resultado.avisoSite);
      }
      return true;
    }

    if (resultado.status === "validacao") {
      setErro(resultado.mensagem);
      return false;
    }

    if (resultado.status === "sem_empresa") {
      setErro("Nenhuma empresa vinculada ao seu usuário.");
      return false;
    }

    setErro(resultado.mensagem);
    return false;
  }

  return {
    estadoCarregamento,
    mensagemCarregamento,
    logoUrl,
    nome,
    setNome,
    cnpj,
    setCnpj,
    inscricaoEstadual,
    setInscricaoEstadual,
    endereco,
    setEndereco,
    telefone,
    setTelefone,
    email,
    setEmail,
    site,
    setSite,
    salvando,
    erro,
    avisoSite,
    sucesso,
    salvar,
  };
}
