// Etapa 66E (Fase B) — chamada de rede à RPC real alterar_dependencia_operacao
// (migration candidata 20261108110000, auditada e validada nas Etapas
// 66B/66C/66D — ainda NÃO aplicada em produção, só no sandbox local).
// Mesmo princípio de isolamento e distinção de falha de
// persistirCriacaoOperacaoOfPcp.ts.
//
// alterar_dependencia_operacao é concedida SÓ a service_role (mesma
// família de ACL das RPCs de OP) - canal oficial, nunca "contorno de
// RLS".
import type { SupabaseClient } from "@supabase/supabase-js";

const PERMISSAO_CRIAR_DEPENDENCIA = "pcp.criar_dependencia_operacao";
const PERMISSAO_REMOVER_DEPENDENCIA = "pcp.remover_dependencia_operacao";
// UUID nulo de propósito - nunca aponta para nenhuma OP real. A chamada
// de prova (ver 3/3 abaixo) nunca chega a ler ordens_fabricacao_operacoes,
// porque o motivo vazio é SEMPRE a primeira checagem do corpo da função
// (confirmado lendo o código-fonte da migration candidata).
const UUID_NULO = "00000000-0000-0000-0000-000000000000";

// Etapa 66F/66G — a migration candidata 20261108110000 (tabela de
// auditoria + nova assinatura de 5 parâmetros + catálogo de permissões,
// tudo aplicado ATOMICAMENTE na mesma transação) ainda NÃO existe em
// produção. Este probe é composto por 3 leituras REAIS do schema
// (nunca um valor simulado/hardcoded) - as 3 precisam passar para o
// ambiente ser considerado habilitado:
//
//   1/3 — a tabela de auditoria existe (prova indireta de que a
//         migration inteira rodou, já que tabela e função são criadas
//         na MESMA transação).
//   2/3 — as 2 chaves de permissão estão no catálogo, com a categoria
//         certa (não usa isso para AUTORIZAR ninguém - é só prova de
//         que o catálogo foi populado; a autorização real continua
//         100% em usuario_tem_permissao, chamada depois, nunca
//         dispensada por este probe).
//   3/3 — a assinatura de 5 parâmetros responde. Chamada de prova
//         SEMPRE rejeitada pela própria RPC antes de qualquer escrita
//         (p_motivo vazio é hoje a primeira linha do corpo da função,
//         mas o probe NÃO depende disso continuar assim — ver nota
//         abaixo, Etapa 66H). Se a assinatura de 5 parâmetros não
//         existir (ex.: produção, que só tem a de 4), o PostgREST
//         responde com sua própria mensagem fixa "Could not find the
//         function..." ANTES de executar qualquer coisa no banco -
//         essa mensagem é gerada pelo PostgREST, nunca pela nossa
//         função, e serve de sinal negativo estável.
//
// ETAPA 66H — primeira revisão da checagem 3/3: a versão original exigia
// a mensagem EXATA "motivo e obrigatorio", o que acoplava este probe à
// ORDEM INTERNA de validação da RPC. Corrigido para olhar qualquer erro
// que não fosse "função não encontrada" como prova de existência.
//
// ETAPA 66H.1 — revisão feita por mensagem de texto ainda era frágil
// (string matching, sensível a mudança de wording/locale do PostgREST).
// Substituída por identificação ESTRUTURADA via `error.code` (confirmado
// empiricamente em produção, Etapa 66H.1):
//   - "PGRST202" é o código FIXO do PostgREST para "função não
//     encontrada no schema cache" - nunca gerado pela nossa função.
//   - "P0001" é o código padrão do Postgres para qualquer
//     `RAISE EXCEPTION` em PL/pgSQL sem SQLSTATE customizado - é
//     exatamente a classe de erro que TODAS as validações internas de
//     alterar_dependencia_operacao produzem (motivo/ciclo/apontamento/
//     etc.), não importa qual delas dispara primeiro. Ver a função
//     como um todo: nenhuma validação interna usa um SQLSTATE próprio.
//   - Qualquer OUTRO código (incluindo ausência de código, como em
//     "Invalid API key" - erro de autenticação - ou num erro de rede
//     cru) significa que não dá para confirmar que a assinatura de 5
//     parâmetros existe e foi executada - fail-closed, nunca
//     "habilitado" por omissão.
// Também protegido por try/catch (Etapa 66H.1): embora os testes
// empíricos contra produção mostrem que o supabase-js hoje sempre
// resolve com {error} mesmo para falha de rede (DNS, timeout), nunca
// lançando, a lib de escrita (persistirAlteracaoDependenciaOperacaoOfPcp
// abaixo) já trata esse caminho como possível por segurança - o probe
// segue o mesmo padrão defensivo, por consistência: qualquer exceção
// inesperada também resulta em "não habilitado", nunca propaga sem
// tratamento para quem chamou.
//
// NÃO verificado aqui (exigiria uma função SQL nova de introspecção,
// nunca implementada sem autorização - ver proposta nas Etapas
// 66G/66H): GRANT EXECUTE restrito a service_role, e ausência da
// assinatura antiga de 4 parâmetros. pg_proc/information_schema.routines
// não são tabelas expostas via PostgREST, então essas 2 checagens não
// são alcançáveis só com leituras client-side.
// "PGRST202" (função não encontrada) nunca precisa ser comparado
// diretamente - exigir POSITIVAMENTE o código abaixo já cobre o caso
// negativo e qualquer outro código desconhecido com uma única comparação.
const CODIGO_EXCECAO_PLPGSQL_PADRAO = "P0001";

export async function verificarAmbienteDependenciaOperacaoOfPcpHabilitado(serviceClient: SupabaseClient): Promise<boolean> {
  try {
    const [tabela, catalogo, assinatura] = await Promise.all([
      serviceClient.from("of_operacao_dependencia_auditoria").select("id").limit(1),
      serviceClient.from("permissoes").select("chave, categoria").in("chave", [PERMISSAO_CRIAR_DEPENDENCIA, PERMISSAO_REMOVER_DEPENDENCIA]),
      serviceClient.rpc("alterar_dependencia_operacao", {
        p_op_origem_id: UUID_NULO,
        p_op_dependente_id: UUID_NULO,
        p_acao: "criar",
        p_alterado_por: UUID_NULO,
        p_motivo: "",
      }),
    ]);

    // Qualquer erro na leitura da tabela - ausência real, falha de
    // autenticação/autorização, indisponibilidade temporária do
    // Supabase, ou qualquer outra coisa - é tratado igual: não dá para
    // confirmar que o ambiente está pronto, então não está.
    if (tabela.error) return false;

    const chavesEncontradas = (catalogo.data ?? []) as { chave: string; categoria: string }[];
    const catalogoOk =
      !catalogo.error &&
      chavesEncontradas.length === 2 &&
      chavesEncontradas.every((linha) => linha.categoria === "sensivel");
    if (!catalogoOk) return false;

    // A chamada de prova SEMPRE falha por design (motivo vazio). Só
    // "P0001" (nossa própria função rejeitando, não importa qual
    // validação disparou primeiro) é aceito como prova positiva de que
    // a assinatura de 5 parâmetros existe. Qualquer outro código -
    // "PGRST202" (função ausente), vazio/ausente (erro de
    // autenticação, de rede, ou resposta que o PostgREST nem chegou a
    // processar como chamada de função) - é tratado como "não dá para
    // confirmar", nunca como "habilitado".
    if (!assinatura.error) return false; // nunca deveria suceder - motivo vazio sempre é rejeitado
    // Exigir POSITIVAMENTE "P0001" (em vez de só negar "PGRST202") já
    // cobre os dois sinais com uma única comparação: qualquer código
    // diferente de P0001 - incluindo PGRST202, vazio/ausente, ou
    // qualquer outro - cai neste mesmo `return false`.
    if (assinatura.error.code !== CODIGO_EXCECAO_PLPGSQL_PADRAO) return false;

    return true;
  } catch {
    // Falha de comunicação inesperada (rede, timeout, resposta que o
    // supabase-js não conseguiu nem desserializar como {error}) - na
    // dúvida, rejeita. Nunca presume "habilitado" diante de uma
    // exceção não tratada.
    return false;
  }
}

export interface ResultadoPersistenciaAlteracaoDependenciaOperacaoOfPcp {
  readonly erro: string | null;
  readonly gravacaoIncerta?: boolean;
}

export async function persistirAlteracaoDependenciaOperacaoOfPcp(
  serviceClient: SupabaseClient,
  opOrigemId: string,
  opDependenteId: string,
  acao: "criar" | "remover",
  alteradoPor: string,
  motivo: string,
): Promise<ResultadoPersistenciaAlteracaoDependenciaOperacaoOfPcp> {
  let resposta: { data: unknown; error: { message: string; code?: string } | null };
  try {
    resposta = await serviceClient.rpc("alterar_dependencia_operacao", {
      p_op_origem_id: opOrigemId,
      p_op_dependente_id: opDependenteId,
      p_acao: acao,
      p_alterado_por: alteradoPor,
      p_motivo: motivo,
    });
  } catch (erroDeRede) {
    return { erro: erroDeRede instanceof Error ? erroDeRede.message : String(erroDeRede), gravacaoIncerta: true };
  }

  const { error } = resposta;
  if (error) {
    return { erro: error.message };
  }

  return { erro: null };
}

export type MotivoRejeicaoAlteracaoDependenciaOperacaoOfPcp =
  | "op_nao_encontrada"
  | "empresas_diferentes"
  | "of_diferente"
  | "of_estado_final"
  | "apontamento_bloqueado"
  | "ciclo_detectado"
  | "motivo_obrigatorio"
  | "erro_desconhecido";

/**
 * Classifica a mensagem TÉCNICA bruta da RPC (texto real, confirmado
 * contra sandbox nas Etapas 66B/66C/66D) num motivo estável para a
 * interface. A ordem importa: checagens que a própria RPC faz primeiro
 * (motivo, depois existência/empresa/OF, depois apontamento, depois
 * ciclo, depois o trigger de estado final) são checadas na mesma ordem
 * aqui.
 */
export function classificarErroAlteracaoDependenciaOperacaoOfPcp(mensagem: string): MotivoRejeicaoAlteracaoDependenciaOperacaoOfPcp {
  if (mensagem.includes("motivo e obrigatorio")) return "motivo_obrigatorio";
  if (mensagem.includes("nao encontrada")) return "op_nao_encontrada";
  if (mensagem.includes("empresas diferentes")) return "empresas_diferentes";
  if (mensagem.includes("MESMA OF")) return "of_diferente";
  if (mensagem.includes("ja tem execucao registrada")) return "apontamento_bloqueado";
  if (mensagem.includes("criaria ciclo")) return "ciclo_detectado";
  if (mensagem.includes("esta em estado final")) return "of_estado_final";
  return "erro_desconhecido";
}
