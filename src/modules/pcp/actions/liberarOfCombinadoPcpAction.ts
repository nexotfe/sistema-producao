"use server";
// Liberação de OF (ação combinada) — Server Action NOVA que conecta o
// único botão real "Liberar OF" (/ordens/[id]) à RPC candidata
// aprovar_e_liberar_of (ainda NÃO aplicada no banco vinculado). Decisão
// de negócio: o PCP vê um único botão, mesmo quando a OF ainda precisa
// de aprovação — o sistema orquestra as duas transições internamente,
// na mesma transação.
//
// Decisão explícita do usuário: NÃO substitui liberarOfPcpAction.ts
// (preservada, intocada, sem consumidor na UI por ora) — esta é uma
// Action separada, dedicada à ação combinada.
//
// Reaproveita o portão PCP_LIBERACAO_OF_HABILITADA já existente
// (decisão explícita do usuário) — nunca um portão novo.
//
// Diferença estrutural de liberarOfPcpAction.ts: aprovar_e_liberar_of
// resolve auth.uid()/empresa_atual_id() e AS DUAS permissões
// (pcp.aprovar_of quando aplicável, pcp.liberar_of sempre)
// INTEIRAMENTE DENTRO DE SI MESMA (GRANT concedido só a `authenticated`,
// nunca a service_role) — por isso esta Action usa SÓ o client de
// SESSÃO, do início ao fim, sem client de serviço nem checagem de
// permissão redundante na própria Action.
//
// Mesmo padrão de fluxo das Actions anteriores:
// 1. Autentica pela sessão real (client de sessão, auth.getUser()).
// 2. Portão de implantação (liberacaoOfPcpHabilitada, reaproveitado).
// 3. Resolve a empresa da sessão (empresa_atual_id()).
// 4. Localiza a OF via client de SESSÃO (RLS filtra por empresa).
// 5. Chama aprovar_e_liberar_of via client de SESSÃO. As proteções de
//    estado, permissão granular, atomicidade e concorrência pertencem
//    inteiramente à RPC - esta Action nunca as reimplementa nem decide
//    por conta própria, só nomeia o motivo já decidido lá.
// 6. Devolve resultado ou erro controlado, nunca repete a chamada
//    automaticamente em caso de falha de rede (gravação incerta).
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { persistirAprovacaoELiberacaoOfPcp, classificarErroAprovacaoELiberacaoOfPcp } from "../lib/persistirAprovacaoELiberacaoOfPcp";
import { liberacaoOfPcpHabilitada } from "../lib/liberacaoOfPcpHabilitada";

export type ResultadoLiberarOfCombinadoPcp =
  | { ok: true; jaLiberada: boolean; aprovacaoRealizada: boolean; numeroOf: string | null }
  | {
      ok: false;
      motivo:
        | "nao_autenticado"
        | "empresa_nao_encontrada"
        | "of_nao_encontrada"
        | "implantacao_bloqueada"
        | "nao_autorizado_aprovar"
        | "nao_autorizado_liberar"
        | "liberado_por_invalido"
        | "estado_incompativel"
        | "momento_y_pendente"
        | "conflito_concorrencia"
        | "erro_desconhecido";
    }
  | { ok: false; motivo: "gravacao_incerta" };

function logErroTecnicoLiberarOfCombinado(origem: string, erro: unknown): void {
  console.error(`liberarOfCombinadoPcpAction: falha tecnica em ${origem}`, erro);
}

export async function liberarOfCombinadoPcpAction(
  ofId: string,
  observacaoAprovacao?: string,
  motivoLiberacao?: string,
): Promise<ResultadoLiberarOfCombinadoPcp> {
  // 1. Autenticação real.
  const serverClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();
  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  // 2. Portão de implantação - reaproveita o de Liberação de OF.
  if (!liberacaoOfPcpHabilitada()) {
    return { ok: false, motivo: "implantacao_bloqueada" };
  }

  // 3. Empresa da sessão.
  const { data: empresaId, error: erroEmpresa } = await serverClient.rpc("empresa_atual_id");
  if (erroEmpresa) {
    logErroTecnicoLiberarOfCombinado("empresa_atual_id", erroEmpresa);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!empresaId) {
    return { ok: false, motivo: "empresa_nao_encontrada" };
  }

  // 4. OF via client de sessão - RLS garante que só aparece se for da empresa atual.
  const { data: ofRow, error: erroOf } = await serverClient
    .from("ordens_fabricacao")
    .select("id")
    .eq("id", ofId)
    .maybeSingle();
  if (erroOf) {
    logErroTecnicoLiberarOfCombinado("ordens_fabricacao", erroOf);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!ofRow) {
    return { ok: false, motivo: "of_nao_encontrada" };
  }

  // 5. RPC oficial, sempre via client de sessão - aprovar_e_liberar_of
  // resolve auth.uid()/empresa_atual_id()/as duas permissões internamente.
  const observacaoTratada = observacaoAprovacao?.trim() ? observacaoAprovacao.trim() : null;
  const motivoTratado = motivoLiberacao?.trim() ? motivoLiberacao.trim() : null;
  const resultado = await persistirAprovacaoELiberacaoOfPcp(serverClient, ofId, observacaoTratada, motivoTratado);

  if (resultado.gravacaoIncerta) {
    logErroTecnicoLiberarOfCombinado("aprovar_e_liberar_of (rede)", { message: resultado.erro ?? "falha de rede" });
    return { ok: false, motivo: "gravacao_incerta" };
  }

  if (resultado.erro) {
    logErroTecnicoLiberarOfCombinado("aprovar_e_liberar_of", { message: resultado.erro });
    return { ok: false, motivo: classificarErroAprovacaoELiberacaoOfPcp(resultado.erro) };
  }

  if (resultado.resultado === null) {
    logErroTecnicoLiberarOfCombinado("aprovar_e_liberar_of (resposta vazia)", { message: "RPC retornou sucesso sem resultado reconhecido" });
    return { ok: false, motivo: "erro_desconhecido" };
  }

  // 6. Resultado.
  return {
    ok: true,
    jaLiberada: resultado.resultado === "ja_liberada",
    aprovacaoRealizada: resultado.aprovacaoRealizada,
    numeroOf: resultado.numeroOf,
  };
}
