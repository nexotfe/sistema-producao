// Códigos de erro estáveis do orquestrador de provisionamento
// (GA-4C2.3-E2). Nunca persistir/devolver mensagem SQL ou do GoTrue
// bruta ao chamador - só estes códigos + uma mensagem amigável fixa por
// código. Mapeamento das 3 mensagens de negócio conhecidas da RPC
// provisionar_usuario_com_grupo (20260930160000) para HTTP/código
// estável; qualquer mensagem não reconhecida cai em RPC_ERRO_INESPERADO.

export const CODIGOS_ERRO_PROVISIONAMENTO = {
  SESSAO_INVALIDA: "SESSAO_INVALIDA",
  ENTRADA_INVALIDA: "ENTRADA_INVALIDA",
  FALHA_AUTH: "FALHA_AUTH",
  AUTH_CREATE_TIMEOUT: "AUTH_CREATE_TIMEOUT",
  AUTH_CREATE_ERROR: "AUTH_CREATE_ERROR",
  RPC_CRIADOR_NAO_AUTORIZADO: "RPC_CRIADOR_NAO_AUTORIZADO",
  RPC_GRUPO_INVALIDO: "RPC_GRUPO_INVALIDO",
  RPC_EMAIL_DUPLICADO: "RPC_EMAIL_DUPLICADO",
  RPC_ERRO_INESPERADO: "RPC_ERRO_INESPERADO",
  COMPENSACAO_ERROR: "COMPENSACAO_ERROR",
  COMPENSACAO_TIMEOUT: "COMPENSACAO_TIMEOUT",
  RECONCILIACAO_INCONCLUSIVA: "RECONCILIACAO_INCONCLUSIVA",
  RECONCILIACAO_PENDENTE: "RECONCILIACAO_PENDENTE",
  INCIDENTE_PERSISTENCIA_ERROR: "INCIDENTE_PERSISTENCIA_ERROR",
  FALHA_INTERNA: "FALHA_INTERNA",
} as const;

export type CodigoErroProvisionamento =
  (typeof CODIGOS_ERRO_PROVISIONAMENTO)[keyof typeof CODIGOS_ERRO_PROVISIONAMENTO];

interface ErroMapeado {
  status: number;
  code: CodigoErroProvisionamento;
  message: string;
}

// Mensagens EXATAS de public.provisionar_usuario_com_grupo
// (20260930160000_ga4c23d_provisionar_usuario_com_grupo.sql) - só as 3
// que a validação local (passo 6) nunca intercepta antes da RPC rodar,
// porque dependem de estado do banco, não de formato do payload.
const MENSAGEM_CRIADOR_NAO_AUTORIZADO = "Criador não autorizado para provisionar usuários.";
const MENSAGEM_GRUPO_INVALIDO = "Grupo de acesso não encontrado para a empresa atual.";
const MENSAGEM_EMAIL_DUPLICADO = "Já existe um usuário com este e-mail nesta empresa.";

export function mapearErroRpcProvisionamento(mensagemRpc: string | null | undefined): ErroMapeado {
  const mensagem = mensagemRpc ?? "";

  if (mensagem.includes(MENSAGEM_CRIADOR_NAO_AUTORIZADO)) {
    return { status: 403, code: CODIGOS_ERRO_PROVISIONAMENTO.RPC_CRIADOR_NAO_AUTORIZADO, message: MENSAGEM_CRIADOR_NAO_AUTORIZADO };
  }
  if (mensagem.includes(MENSAGEM_GRUPO_INVALIDO)) {
    return { status: 404, code: CODIGOS_ERRO_PROVISIONAMENTO.RPC_GRUPO_INVALIDO, message: MENSAGEM_GRUPO_INVALIDO };
  }
  if (mensagem.includes(MENSAGEM_EMAIL_DUPLICADO)) {
    return { status: 409, code: CODIGOS_ERRO_PROVISIONAMENTO.RPC_EMAIL_DUPLICADO, message: MENSAGEM_EMAIL_DUPLICADO };
  }
  return { status: 500, code: CODIGOS_ERRO_PROVISIONAMENTO.RPC_ERRO_INESPERADO, message: "Falha interna ao provisionar usuário." };
}
