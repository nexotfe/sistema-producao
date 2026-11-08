"use server";
// NEXOTFE — Etapa 64E: uma única Server Action que agrupa, numa só
// viagem servidor<->navegador, as leituras de MONTAGEM da página da OF
// que antes eram 7 Server Actions separadas (consultarOfsPcpAction,
// consultarPropostaMomentoYAction, consultarOperacoesOfPcpAction,
// consultarPermissoesOperacoesOfPcpAction,
// consultarDependenciasOperacoesOfPcpAction, e - condicional ao regime -
// consultarSaldoLivreMateriasPrimasPcpAction OU
// consultarResumoLegadoOfPcpAction OU
// consultarNecessidadesConfirmadasOfPcpAction). Medido na Etapa 64D:
// 48-59% menos tempo de carregamento, por eliminar o enfileiramento
// serializado dessas chamadas (achado da Etapa 64C) e a repetição de
// auth.getUser() por chamada.
//
// Nenhuma regra de negócio nova: cada leitura chama exatamente a mesma
// função de lib/ que sua Server Action original já chamava, com os
// mesmos argumentos. As Server Actions originais continuam existindo
// e são usadas por outros fluxos (ex.: recarregarPropostaMomentoY/
// "Reler OF" na própria página da OF, e a página mockada
// /design/pcp-momento-y-preview) - esta action só orquestra ORDEM/
// PARALELISMO da carga inicial, nunca substitui as outras.
//
// Onda 1 (paralela): operações, dados da OF, proposta Momento Y,
// permissões - nenhuma depende do resultado de outra.
// Onda 2 (paralela entre si, mas depende da onda 1): dependências entre
// OPs (precisa dos opIds da onda 1 - se operações falhou, dependências
// é marcada como indeterminada, NUNCA como "sem dependências") e -
// exclusivamente um dos três, conforme o regime já resolvido na onda 1
// - saldo livre (pendente), resumo legado (legado) ou necessidades
// confirmadas (confirmado).
//
// Isolamento de falhas (Etapa 64E, item 3 do pedido): cada chamada da
// onda 1 é protegida individualmente (protegido()) para que uma falha
// de rede/exceção numa NUNCA derrube as outras três via rejeição do
// Promise.all - cada seção sempre chega ao cliente com seu próprio
// {ok:false,...} explícito, nunca convertida em "vazio válido".
//
// Segurança: client de sessão sempre (RLS/isolamento multiempresa
// preservados); nenhuma verificação de autorização removida; nenhum
// dado novo exposto além do que as 7 Server Actions originais já
// devolviam somadas; o client de sessão é criado uma vez por chamada
// desta action (por requisição/usuário autenticado) e nunca
// compartilhado entre requisições ou usuários - não há cache global.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import { buscarOfsPcp, type RespostaBuscaOfsPcp } from "../lib/buscarOfsPcp";
import { buscarPropostaMomentoY, type ResultadoBuscaPropostaMomentoY } from "../lib/buscarPropostaMomentoY";
import { buscarOperacoesOfPcp, type RespostaOperacoesOfPcp } from "../lib/buscarOperacoesOfPcp";
import {
  buscarDependenciasOperacoesOfPcp,
  type DependenciaRelacionadaOfPcp,
} from "../lib/buscarDependenciasOperacoesOfPcp";
import { buscarSaldoLivreMateriasPrimasPcp } from "../lib/buscarSaldoLivreMateriasPrimasPcp";
import { buscarResumoLegadoOfPcp, type RespostaResumoLegadoOfPcp } from "../lib/buscarResumoLegadoOfPcp";
import {
  buscarNecessidadesConfirmadasOfPcp,
  type RespostaNecessidadesConfirmadasOfPcp,
} from "../lib/buscarNecessidadesConfirmadasOfPcp";

const PERMISSAO_CRIAR_OPERACAO = "pcp.criar_operacao_of";
const PERMISSAO_EDITAR_OPERACAO = "pcp.editar_operacao_of";
const PERMISSAO_REMOVER_OPERACAO = "pcp.remover_operacao_of";

export type ResultadoPermissoesCargaInicial =
  | { ok: true; podeCriarOperacao: boolean; podeEditarOperacao: boolean; podeRemoverOperacao: boolean }
  | { ok: false; motivo: "erro_desconhecido" };

export type ResultadoDependenciasCargaInicial =
  | { ok: true; dependenciasPorOpId: Record<string, readonly DependenciaRelacionadaOfPcp[]> }
  | { ok: false; motivo: "erro_desconhecido" | "operacoes_indisponiveis" };

export type ResultadoSaldoLivreCargaInicial =
  | { ok: true; saldoLivrePorMaterial: Record<string, number> }
  | { ok: false; motivo: "erro_desconhecido" };

export type ResultadoCargaInicialOfPcp =
  | {
      ok: true;
      resultadoOf: RespostaBuscaOfsPcp;
      resultadoMateriais: ResultadoBuscaPropostaMomentoY;
      resultadoOperacoes: RespostaOperacoesOfPcp;
      resultadoDependencias: ResultadoDependenciasCargaInicial;
      resultadoPermissoesOperacoes: ResultadoPermissoesCargaInicial;
      resultadoSaldoLivre: ResultadoSaldoLivreCargaInicial | null;
      resultadoLegado: RespostaResumoLegadoOfPcp | null;
      resultadoConfirmadas: RespostaNecessidadesConfirmadasOfPcp | null;
    }
  | { ok: false; motivo: "nao_autenticado" };

function logErroTecnicoCargaInicial(origem: string, erro: unknown): void {
  console.error(`consultarCargaInicialOfPcpAction: falha tecnica em ${origem}`, erro);
}

/**
 * Nunca deixa uma exceção (rede, timeout, etc.) de UMA leitura derrubar
 * o Promise.all inteiro - converte em erro próprio, isolado, da MESMA
 * forma que cada lib já devolve {ok:false,...} para um erro do
 * PostgREST. Sem isto, uma falha de rede numa chamada transformaria uma
 * falha isolada em falha de TODAS as seções da onda, regressão em
 * relação às Server Actions separadas originais.
 */
async function protegido<T>(promessa: PromiseLike<T>, origem: string, fallback: T): Promise<T> {
  try {
    return await promessa;
  } catch (erro) {
    logErroTecnicoCargaInicial(origem, erro);
    return fallback;
  }
}

export async function consultarCargaInicialOfPcpAction(ofId: string): Promise<ResultadoCargaInicialOfPcp> {
  const serverClient = await createSupabaseServerClient();

  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();

  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  const serviceClient = createSupabaseServiceClient();

  const [respostaOf, respostaMateriais, respostaOperacoes, permCriar, permEditar, permRemover] = await Promise.all([
    protegido(buscarOfsPcp(serverClient, { ofId }, 1, 1), "dados_of", {
      ok: false,
      motivo: "erro_desconhecido",
    } as RespostaBuscaOfsPcp),
    protegido(buscarPropostaMomentoY(serverClient, ofId), "proposta_momento_y", {
      ok: false,
      motivo: "erro_desconhecido",
    } as ResultadoBuscaPropostaMomentoY),
    protegido(buscarOperacoesOfPcp(serverClient, ofId), "operacoes", {
      ok: false,
      motivo: "erro_desconhecido",
    } as RespostaOperacoesOfPcp),
    protegido(
      serviceClient.rpc("usuario_tem_permissao", { p_usuario_id: user.id, p_chave: PERMISSAO_CRIAR_OPERACAO }),
      "permissao_criar",
      { data: null, error: { message: "falha de rede" } } as Awaited<ReturnType<typeof serviceClient.rpc>>,
    ),
    protegido(
      serviceClient.rpc("usuario_tem_permissao", { p_usuario_id: user.id, p_chave: PERMISSAO_EDITAR_OPERACAO }),
      "permissao_editar",
      { data: null, error: { message: "falha de rede" } } as Awaited<ReturnType<typeof serviceClient.rpc>>,
    ),
    protegido(
      serviceClient.rpc("usuario_tem_permissao", { p_usuario_id: user.id, p_chave: PERMISSAO_REMOVER_OPERACAO }),
      "permissao_remover",
      { data: null, error: { message: "falha de rede" } } as Awaited<ReturnType<typeof serviceClient.rpc>>,
    ),
  ]);

  let resultadoPermissoesOperacoes: ResultadoPermissoesCargaInicial;
  if (permCriar.error || permEditar.error || permRemover.error) {
    logErroTecnicoCargaInicial("permissoes", permCriar.error ?? permEditar.error ?? permRemover.error);
    resultadoPermissoesOperacoes = { ok: false, motivo: "erro_desconhecido" };
  } else {
    resultadoPermissoesOperacoes = {
      ok: true,
      podeCriarOperacao: permCriar.data === true,
      podeEditarOperacao: permEditar.data === true,
      podeRemoverOperacao: permRemover.data === true,
    };
  }

  const regime = respostaMateriais.ok ? respostaMateriais.leitura.regime : null;
  const materiaPrimaIds =
    respostaMateriais.ok && regime === "pendente_momento_y"
      ? respostaMateriais.leitura.propostaOriginal.map((item) => item.materia_prima_id)
      : [];

  const [respostaDependencias, respostaCondicional] = await Promise.all([
    // Falha ao buscar operações não vira "sem dependências" - sem os
    // opIds reais não há como saber, então a seção fica explicitamente
    // indeterminada (bloqueia Remover, nunca libera por omissão).
    respostaOperacoes.ok
      ? protegido(
          buscarDependenciasOperacoesOfPcp(
            serverClient,
            respostaOperacoes.operacoes.map((operacao) => operacao.opId),
          ),
          "dependencias",
          { ok: false, motivo: "erro_desconhecido" } as Awaited<ReturnType<typeof buscarDependenciasOperacoesOfPcp>>,
        )
      : Promise.resolve({ ok: false as const, motivo: "erro_desconhecido" as const }),
    (async (): Promise<
      | { tipo: "saldo"; resultado: Awaited<ReturnType<typeof buscarSaldoLivreMateriasPrimasPcp>> }
      | { tipo: "legado"; resultado: RespostaResumoLegadoOfPcp }
      | { tipo: "confirmadas"; resultado: RespostaNecessidadesConfirmadasOfPcp }
      | { tipo: "nenhum"; resultado: null }
    > => {
      if (regime === "pendente_momento_y" && materiaPrimaIds.length > 0) {
        return {
          tipo: "saldo",
          resultado: await protegido(
            buscarSaldoLivreMateriasPrimasPcp(serverClient, materiaPrimaIds),
            "saldo_livre",
            { ok: false, motivo: "erro_desconhecido" } as Awaited<ReturnType<typeof buscarSaldoLivreMateriasPrimasPcp>>,
          ),
        };
      }
      if (regime === "legado") {
        return {
          tipo: "legado",
          resultado: await protegido(buscarResumoLegadoOfPcp(serverClient, ofId), "resumo_legado", {
            ok: false,
            motivo: "erro_desconhecido",
          } as RespostaResumoLegadoOfPcp),
        };
      }
      if (regime === "confirmado_momento_y") {
        return {
          tipo: "confirmadas",
          resultado: await protegido(buscarNecessidadesConfirmadasOfPcp(serverClient, ofId), "necessidades_confirmadas", {
            ok: false,
            motivo: "erro_desconhecido",
          } as RespostaNecessidadesConfirmadasOfPcp),
        };
      }
      return { tipo: "nenhum", resultado: null };
    })(),
  ]);

  const resultadoDependencias: ResultadoDependenciasCargaInicial = !respostaOperacoes.ok
    ? { ok: false, motivo: "operacoes_indisponiveis" }
    : respostaDependencias.ok
      ? { ok: true, dependenciasPorOpId: Object.fromEntries(respostaDependencias.dependenciasPorOpId) }
      : { ok: false, motivo: "erro_desconhecido" };

  const resultadoSaldoLivre: ResultadoSaldoLivreCargaInicial | null =
    respostaCondicional.tipo === "saldo"
      ? respostaCondicional.resultado.ok
        ? { ok: true, saldoLivrePorMaterial: Object.fromEntries(respostaCondicional.resultado.saldoLivrePorMaterial) }
        : { ok: false, motivo: "erro_desconhecido" }
      : null;

  return {
    ok: true,
    resultadoOf: respostaOf,
    resultadoMateriais: respostaMateriais,
    resultadoOperacoes: respostaOperacoes,
    resultadoDependencias,
    resultadoPermissoesOperacoes,
    resultadoSaldoLivre,
    resultadoLegado: respostaCondicional.tipo === "legado" ? respostaCondicional.resultado : null,
    resultadoConfirmadas: respostaCondicional.tipo === "confirmadas" ? respostaCondicional.resultado : null,
  };
}
