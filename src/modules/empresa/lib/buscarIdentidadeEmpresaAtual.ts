import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarEmpresaIdAtual } from "./buscarEmpresaIdAtual";
import { BUCKET_LOGOS_EMPRESAS } from "./logoEmpresaConfig";

const CHAVE_SITE = "site";

export type IdentidadeEmpresa = {
  nome: string;
  cnpj: string | null;
  inscricaoEstadual: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  site: string | null;
  logoUrl: string | null;
};

export type ResultadoIdentidadeEmpresa =
  | { status: "ok"; identidade: IdentidadeEmpresa }
  | { status: "sem_empresa" }
  | { status: "erro"; mensagem: string };

/**
 * Fonte única de identidade da empresa atual (nome, CNPJ, inscrição
 * estadual, endereço, telefone, e-mail, site) - usada pela Proposta
 * Comercial na tela e na impressão (mesmo componente, sem consulta
 * separada). empresa_id vem de buscarEmpresaIdAtual (RPC empresa_atual_id(),
 * fonte autoritativa) e é aplicado explicitamente em cada consulta -
 * `empresas.id = empresaId` (linha da própria empresa) e
 * `configuracoes_empresa.empresa_id = empresaId` (chave composta real:
 * UNIQUE(empresa_id, chave), confirmado via introspecção) - a RLS
 * continua sendo a proteção obrigatória, mas não é a única barreira.
 *
 * Ausência de dado (chave "site" sem linha em configuracoes_empresa) é
 * diferente de falha de consulta: a primeira vira `site: null` dentro de
 * um resultado "ok" (campo opcional, tela mostra "Não informado"); a
 * segunda é reportada como status "erro", nunca disfarçada de ausência.
 */
export async function buscarIdentidadeEmpresaAtual(
  client: SupabaseClient,
): Promise<ResultadoIdentidadeEmpresa> {
  let empresaId: string | null;

  try {
    empresaId = await buscarEmpresaIdAtual(client);
  } catch (err) {
    return {
      status: "erro",
      mensagem: err instanceof Error ? err.message : "Erro ao identificar a empresa do usuário logado.",
    };
  }

  if (!empresaId) {
    return { status: "sem_empresa" };
  }

  const [empresaResultado, siteResultado] = await Promise.all([
    client
      .from("empresas")
      .select("nome, cnpj, inscricao_estadual, endereco, telefone, email, logo_path")
      .eq("id", empresaId)
      .single(),
    client
      .from("configuracoes_empresa")
      .select("valor")
      .eq("empresa_id", empresaId)
      .eq("chave", CHAVE_SITE)
      .maybeSingle(),
  ]);

  if (empresaResultado.error) {
    return {
      status: "erro",
      mensagem: `Não foi possível carregar os dados da empresa: ${empresaResultado.error.message}`,
    };
  }

  // Falha real na consulta de configuração (rede/permissão/schema) é
  // reportada como erro - só a AUSÊNCIA da linha (chave "site" nunca
  // cadastrada) vira valor opcional null, nunca as duas coisas tratadas
  // da mesma forma.
  if (siteResultado.error) {
    return {
      status: "erro",
      mensagem: `Não foi possível carregar a configuração de site da empresa: ${siteResultado.error.message}`,
    };
  }

  const nome = empresaResultado.data.nome?.trim();

  if (!nome) {
    return {
      status: "erro",
      mensagem: "A empresa não possui nome cadastrado - não é possível montar a proposta sem essa identificação.",
    };
  }

  const siteValor = siteResultado.data?.valor as { url?: string } | null | undefined;
  const site = siteValor?.url?.trim() || null;

  const logoPath = empresaResultado.data.logo_path as string | null;
  const logoUrl = logoPath
    ? client.storage.from(BUCKET_LOGOS_EMPRESAS).getPublicUrl(logoPath).data.publicUrl
    : null;

  return {
    status: "ok",
    identidade: {
      nome,
      cnpj: empresaResultado.data.cnpj,
      inscricaoEstadual: empresaResultado.data.inscricao_estadual,
      endereco: empresaResultado.data.endereco,
      telefone: empresaResultado.data.telefone,
      email: empresaResultado.data.email,
      site,
      logoUrl,
    },
  };
}
