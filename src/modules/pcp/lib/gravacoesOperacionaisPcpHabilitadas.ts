// Bloqueio provisório de implantação (fechamento objetivo para
// publicação, pós-Etapa 66L) — exclusivamente no servidor, nunca
// exposto ao client (nunca usar NEXT_PUBLIC_). Não grava nada no banco,
// não substitui nenhuma autenticação/permissão/checagem SQL já
// existente — é um portão adicional, checado ANTES delas, nas 5 Server
// Actions de escrita de OP/Dependências (adicionar/editar/remover OP,
// criar/remover dependência). Nunca se aplica à leitura/visualização da
// OF, nem ao interruptor oficial de confirmação de matérias-primas
// (momento_y_ativo_para_empresa, mecanismo independente e não tocado
// por este arquivo).
//
// Comportamento na ausência da variável, ou com qualquer valor que não
// seja exatamente "true": SEMPRE bloquear. Nunca autorizar por omissão
// ou por valor inesperado/malformado.
const CHAVE_ENV_GRAVACOES_OP_DEPENDENCIAS = "PCP_GRAVACOES_OP_DEPENDENCIAS_HABILITADAS";

export function gravacoesOpDependenciasPcpHabilitadas(): boolean {
  return process.env[CHAVE_ENV_GRAVACOES_OP_DEPENDENCIAS] === "true";
}
