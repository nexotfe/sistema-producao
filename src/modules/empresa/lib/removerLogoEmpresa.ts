import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarEmpresaIdAtual } from "./buscarEmpresaIdAtual";
import { BUCKET_LOGOS_EMPRESAS } from "./logoEmpresaConfig";

export type ResultadoRemoverLogo =
  | { status: "ok"; avisoArquivoOrfao?: string }
  | { status: "sem_logo" }
  | { status: "sem_empresa" }
  | { status: "erro"; mensagem: string };

/**
 * Remove a logo da empresa atual. Zera `empresas.logo_path` PRIMEIRO -
 * a aplicação para de referenciar o arquivo assim que esse UPDATE
 * confirma, então uma falha ao apagar o arquivo do Storage em seguida
 * nunca deixa a interface mostrando algo quebrado: retorna "ok" com
 * aviso de arquivo órfão, nunca erro (mesmo raciocínio de
 * enviarLogoEmpresa.ts - Storage e Postgres não compartilham transação).
 */
export async function removerLogoEmpresa(client: SupabaseClient): Promise<ResultadoRemoverLogo> {
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

  const { data: empresaAtual, error: erroLeitura } = await client
    .from("empresas")
    .select("logo_path")
    .eq("id", empresaId)
    .single();

  if (erroLeitura) {
    return {
      status: "erro",
      mensagem: `Não foi possível ler a logo atual da empresa: ${erroLeitura.message}`,
    };
  }

  const caminhoAtual = (empresaAtual?.logo_path as string | null) ?? null;

  if (!caminhoAtual) {
    return { status: "sem_logo" };
  }

  const { error: erroAtualizacao } = await client
    .from("empresas")
    .update({ logo_path: null })
    .eq("id", empresaId);

  if (erroAtualizacao) {
    return { status: "erro", mensagem: `Não foi possível remover a logo: ${erroAtualizacao.message}` };
  }

  const { error: erroRemocao } = await client.storage
    .from(BUCKET_LOGOS_EMPRESAS)
    .remove([caminhoAtual]);

  if (erroRemocao) {
    return {
      status: "ok",
      avisoArquivoOrfao: `A logo foi removida, mas o arquivo (${caminhoAtual}) não pôde ser apagado do armazenamento: ${erroRemocao.message}`,
    };
  }

  return { status: "ok" };
}
