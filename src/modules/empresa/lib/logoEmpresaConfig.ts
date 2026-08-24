// Fonte única de configuração do bucket de logo - nome do bucket e
// limites precisam bater exatamente com o que a migration
// 20260824174845_empresas_logo_storage.sql aplica no banco (o bucket é
// a barreira real; estas constantes só evitam repetir os mesmos
// valores em cada consumidor e permitem validar no cliente ANTES de
// gastar uma chamada de upload que o servidor rejeitaria de qualquer
// forma).
export const BUCKET_LOGOS_EMPRESAS = "empresas-logos";

export const TAMANHO_MAXIMO_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

export const TIPOS_MIME_LOGO_PERMITIDOS = ["image/png", "image/jpeg", "image/webp"] as const;

const EXTENSAO_POR_MIME: Record<(typeof TIPOS_MIME_LOGO_PERMITIDOS)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function extensaoParaMime(mime: string): string | null {
  return EXTENSAO_POR_MIME[mime as keyof typeof EXTENSAO_POR_MIME] ?? null;
}

/**
 * Caminho novo a cada chamada (UUID, nunca timestamp sozinho - evita
 * colisão de dois uploads no mesmo segundo) - nunca reaproveita o path
 * anterior, elimina cache de CDN da logo antiga por construção (ver
 * comentário da migration).
 */
export function gerarCaminhoLogoNovo(empresaId: string, mime: string): string | null {
  const extensao = extensaoParaMime(mime);
  if (!extensao) {
    return null;
  }
  return `${empresaId}/logo-${crypto.randomUUID()}.${extensao}`;
}
