import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarEmpresaIdAtual } from "./buscarEmpresaIdAtual";

const CHAVE_SITE = "site";

export type DadosIdentidadeEmpresa = {
  nome: string;
  cnpj: string;
  inscricaoEstadual: string;
  endereco: string;
  telefone: string;
  email: string;
  site: string;
};

export type ResultadoAtualizarIdentidadeEmpresa =
  | { status: "ok"; avisoSite?: string }
  | { status: "validacao"; mensagem: string }
  | { status: "sem_empresa" }
  | { status: "erro"; mensagem: string };

function normalizarOpcional(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/**
 * Grava os campos de identidade (tabela `empresas`) e, separadamente, a
 * chave "site" em `configuracoes_empresa` - duas tabelas sem transação
 * compartilhada pelo client, tratadas como operações independentes com
 * a mesma tolerância a falha parcial de enviarLogoEmpresa.ts: se
 * `empresas` salvar mas o site falhar, o resultado é "ok" com aviso,
 * nunca um erro que sugira que nada foi salvo.
 *
 * Tratamento de "site" vazio (confirmado por introspecção antes de
 * implementar, não presumido): `configuracoes_empresa.valor` é `jsonb
 * NOT NULL` - não existe "gravar NULL" nessa coluna. A tabela também
 * tem `deleted_at`/`deleted_by` (soft delete), mas a policy de SELECT
 * (`empresa_id = empresa_atual_id()`) NÃO filtra `deleted_at` - um soft
 * delete deixaria o valor antigo sendo lido de volta por
 * buscarIdentidadeEmpresaAtual.ts, que já trata "sem linha" (não "linha
 * com deleted_at") como `site: null`. Por isso, "site" vazio remove a
 * linha de verdade (DELETE físico, autorizado pela policy admin da
 * tabela), nunca grava string vazia nem um jsonb "vazio" inventado.
 */
export async function atualizarIdentidadeEmpresa(
  client: SupabaseClient,
  dados: DadosIdentidadeEmpresa,
): Promise<ResultadoAtualizarIdentidadeEmpresa> {
  const nome = dados.nome.trim();

  if (!nome) {
    return { status: "validacao", mensagem: "Informe o nome da empresa." };
  }

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

  const { error: erroEmpresa } = await client
    .from("empresas")
    .update({
      nome,
      cnpj: normalizarOpcional(dados.cnpj),
      inscricao_estadual: normalizarOpcional(dados.inscricaoEstadual),
      endereco: normalizarOpcional(dados.endereco),
      telefone: normalizarOpcional(dados.telefone),
      email: normalizarOpcional(dados.email),
    })
    .eq("id", empresaId);

  if (erroEmpresa) {
    return {
      status: "erro",
      mensagem: `Não foi possível salvar os dados da empresa: ${erroEmpresa.message}`,
    };
  }

  return atualizarSite(client, empresaId, normalizarOpcional(dados.site));
}

async function atualizarSite(
  client: SupabaseClient,
  empresaId: string,
  siteNormalizado: string | null,
): Promise<ResultadoAtualizarIdentidadeEmpresa> {
  const { data: linhaSiteExistente, error: erroLeituraSite } = await client
    .from("configuracoes_empresa")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("chave", CHAVE_SITE)
    .maybeSingle();

  if (erroLeituraSite) {
    return {
      status: "ok",
      avisoSite: `Os dados da empresa foram salvos, mas não foi possível confirmar o site: ${erroLeituraSite.message}`,
    };
  }

  if (siteNormalizado === null) {
    if (!linhaSiteExistente) {
      return { status: "ok" };
    }

    const { error: erroRemocaoSite } = await client
      .from("configuracoes_empresa")
      .delete()
      .eq("id", linhaSiteExistente.id);

    if (erroRemocaoSite) {
      return {
        status: "ok",
        avisoSite: `Os dados da empresa foram salvos, mas não foi possível remover o site anterior: ${erroRemocaoSite.message}`,
      };
    }

    return { status: "ok" };
  }

  if (linhaSiteExistente) {
    const { error: erroAtualizacaoSite } = await client
      .from("configuracoes_empresa")
      .update({ valor: { url: siteNormalizado } })
      .eq("id", linhaSiteExistente.id);

    if (erroAtualizacaoSite) {
      return {
        status: "ok",
        avisoSite: `Os dados da empresa foram salvos, mas não foi possível atualizar o site: ${erroAtualizacaoSite.message}`,
      };
    }

    return { status: "ok" };
  }

  const { data: usuarioLogado } = await client.auth.getUser();
  const usuarioId = usuarioLogado.user?.id ?? null;

  if (!usuarioId) {
    return {
      status: "ok",
      avisoSite: "Os dados da empresa foram salvos, mas não foi possível identificar o usuário para cadastrar o site.",
    };
  }

  const { error: erroInsercaoSite } = await client.from("configuracoes_empresa").insert({
    empresa_id: empresaId,
    chave: CHAVE_SITE,
    valor: { url: siteNormalizado },
    created_by: usuarioId,
  });

  if (erroInsercaoSite) {
    return {
      status: "ok",
      avisoSite: `Os dados da empresa foram salvos, mas não foi possível cadastrar o site: ${erroInsercaoSite.message}`,
    };
  }

  return { status: "ok" };
}
