import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarEmpresaIdAtual } from "./buscarEmpresaIdAtual";
import {
  BUCKET_LOGOS_EMPRESAS,
  TAMANHO_MAXIMO_LOGO_BYTES,
  TIPOS_MIME_LOGO_PERMITIDOS,
  gerarCaminhoLogoNovo,
} from "./logoEmpresaConfig";

export type ResultadoEnviarLogo =
  | { status: "ok"; logoPath: string; avisoArquivoOrfao?: string }
  | { status: "arquivo_invalido"; mensagem: string }
  | { status: "sem_empresa" }
  | { status: "erro"; mensagem: string };

function tipoPermitido(mime: string): mime is (typeof TIPOS_MIME_LOGO_PERMITIDOS)[number] {
  return (TIPOS_MIME_LOGO_PERMITIDOS as readonly string[]).includes(mime);
}

/**
 * Envia uma logo nova para a empresa atual, tolerando falha parcial
 * (Storage e Postgres não compartilham transação - ver migration
 * 20260824174845_empresas_logo_storage.sql):
 *
 * 1. valida tipo/tamanho no cliente (a barreira REAL é o bucket -
 *    file_size_limit/allowed_mime_types - isto só evita um upload que
 *    o servidor rejeitaria de qualquer forma);
 * 2. envia o arquivo NOVO (path com UUID, nunca reaproveitado, nunca
 *    upsert - se este passo falhar, nada mudou, sem rollback necessário);
 * 3. só então atualiza `empresas.logo_path` - se falhar, apaga o
 *    arquivo novo de volta (rollback), a empresa nunca fica com um
 *    arquivo órfão sem registro;
 * 4. só então tenta apagar o arquivo antigo - a logo nova já está
 *    ativa e correta neste ponto, então uma falha aqui não desfaz o
 *    sucesso: retorna "ok" com aviso de arquivo órfão, nunca erro.
 */
export async function enviarLogoEmpresa(
  client: SupabaseClient,
  arquivo: File,
): Promise<ResultadoEnviarLogo> {
  if (!tipoPermitido(arquivo.type)) {
    return { status: "arquivo_invalido", mensagem: "Formato não suportado. Envie PNG, JPEG ou WebP." };
  }

  if (arquivo.size > TAMANHO_MAXIMO_LOGO_BYTES) {
    return { status: "arquivo_invalido", mensagem: "Arquivo maior que 2 MB. Envie uma imagem menor." };
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

  const caminhoNovo = gerarCaminhoLogoNovo(empresaId, arquivo.type);

  if (!caminhoNovo) {
    return { status: "arquivo_invalido", mensagem: "Formato não suportado. Envie PNG, JPEG ou WebP." };
  }

  const { data: empresaAtual, error: erroLeituraAtual } = await client
    .from("empresas")
    .select("logo_path")
    .eq("id", empresaId)
    .single();

  if (erroLeituraAtual) {
    return {
      status: "erro",
      mensagem: `Não foi possível ler a logo atual da empresa: ${erroLeituraAtual.message}`,
    };
  }

  const caminhoAntigo = (empresaAtual?.logo_path as string | null) ?? null;

  const { error: erroUpload } = await client.storage
    .from(BUCKET_LOGOS_EMPRESAS)
    .upload(caminhoNovo, arquivo, { upsert: false, contentType: arquivo.type });

  if (erroUpload) {
    return { status: "erro", mensagem: `Não foi possível enviar a logo: ${erroUpload.message}` };
  }

  const { error: erroAtualizacao } = await client
    .from("empresas")
    .update({ logo_path: caminhoNovo })
    .eq("id", empresaId);

  if (erroAtualizacao) {
    await client.storage.from(BUCKET_LOGOS_EMPRESAS).remove([caminhoNovo]);
    return {
      status: "erro",
      mensagem: `Não foi possível salvar a nova logo: ${erroAtualizacao.message}`,
    };
  }

  if (caminhoAntigo) {
    const { error: erroRemocaoAntiga } = await client.storage
      .from(BUCKET_LOGOS_EMPRESAS)
      .remove([caminhoAntigo]);

    if (erroRemocaoAntiga) {
      return {
        status: "ok",
        logoPath: caminhoNovo,
        avisoArquivoOrfao: `A logo foi trocada com sucesso, mas o arquivo anterior (${caminhoAntigo}) não pôde ser removido: ${erroRemocaoAntiga.message}`,
      };
    }
  }

  return { status: "ok", logoPath: caminhoNovo };
}
