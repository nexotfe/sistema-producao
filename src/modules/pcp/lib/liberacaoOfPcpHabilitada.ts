// Bloqueio provisório de implantação da Liberação de OF — exclusivamente
// no servidor, nunca exposto ao client (nunca NEXT_PUBLIC_). Não grava
// nada no banco, não substitui nenhuma checagem de autenticação/
// permissão/estado/concorrência já existente na RPC liberar_of — é um
// portão adicional, checado ANTES delas, só em liberarOfPcpAction.
//
// Nunca reaproveita PCP_GRAVACOES_OP_DEPENDENCIAS_HABILITADAS: aquela
// chave é documentada como exclusiva das 5 Server Actions de escrita de
// OP/Dependências (ver gravacoesOperacionaisPcpHabilitadas.ts) e não se
// estende à Liberação de OF, mecanismo independente.
//
// Comportamento na ausência da variável, ou com qualquer valor que não
// seja exatamente "true": SEMPRE bloquear. Nunca autorizar por omissão
// ou por valor inesperado/malformado.
const CHAVE_ENV_LIBERACAO_OF = "PCP_LIBERACAO_OF_HABILITADA";

export function liberacaoOfPcpHabilitada(): boolean {
  return process.env[CHAVE_ENV_LIBERACAO_OF] === "true";
}
