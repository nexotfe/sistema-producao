import "server-only";
// Adaptadores que ligam os dois clients Supabase REAIS (sessão e
// privilegiado) à interface de dependências abstrata do orquestrador
// (DependenciasProvisionamento) - único lugar do projeto que chama
// auth.admin.createUser/deleteUser pela primeira vez. Cada função
// converte uma chamada real (que pode lançar em timeout/rede) num
// resultado estruturado {conclusivo, ok}, nunca deixando a exceção
// cruzar a fronteira do orquestrador.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DependenciasProvisionamento,
  ResultadoChamarRpc,
  ResultadoCriarAuthUser,
  ResultadoDeletarAuthUser,
} from "../actions/provisionarUsuarioComGrupo";
import { registrarIncidenteProvisionamento } from "./provisionamentoIncidentes";
import { buscarAuthUserPorIdentidadeTecnica, reconciliarEstadoProvisionamento } from "./provisionamentoReconciliacao";

export function criarDependenciasReaisProvisionamento(
  sessionClient: SupabaseClient,
  serviceClient: SupabaseClient,
): DependenciasProvisionamento {
  return {
    async obterUsuarioSessao() {
      const { data, error } = await sessionClient.auth.getUser();
      if (error || !data?.user) {
        return null;
      }
      return { id: data.user.id };
    },

    async obterEmpresaIdCriador(sessionUserId: string) {
      try {
        const { data } = await sessionClient.from("profiles").select("empresa_id").eq("id", sessionUserId).maybeSingle();
        return (data as { empresa_id: string } | null)?.empresa_id ?? null;
      } catch {
        return null;
      }
    },

    async criarAuthUser(email: string): Promise<ResultadoCriarAuthUser> {
      try {
        const { data, error } = await serviceClient.auth.admin.createUser({ email });
        if (error) {
          return { conclusivo: true, ok: false };
        }
        return { conclusivo: true, ok: true, authUserId: data.user.id };
      } catch {
        return { conclusivo: false };
      }
    },

    buscarAuthUserPorIdentidade(identidade: string) {
      return buscarAuthUserPorIdentidadeTecnica(serviceClient, identidade);
    },

    async chamarRpcProvisionamento(params): Promise<ResultadoChamarRpc> {
      try {
        const { error } = await serviceClient.rpc("provisionar_usuario_com_grupo", {
          p_user_id: params.pUserId,
          p_nome: params.pNome,
          p_email_comercial: params.pEmailComercial,
          p_grupo_id: params.pGrupoId,
          p_criado_por: params.pCriadoPor,
        });
        if (error) {
          return { conclusivo: true, ok: false, mensagem: error.message ?? null };
        }
        return { conclusivo: true, ok: true };
      } catch {
        return { conclusivo: false };
      }
    },

    async deletarAuthUser(authUserId: string): Promise<ResultadoDeletarAuthUser> {
      try {
        const { error } = await serviceClient.auth.admin.deleteUser(authUserId);
        return { conclusivo: true, ok: !error };
      } catch {
        return { conclusivo: false };
      }
    },

    reconciliarEstado(authUserId: string) {
      return reconciliarEstadoProvisionamento(serviceClient, authUserId);
    },

    registrarIncidente(dados) {
      return registrarIncidenteProvisionamento(serviceClient, dados);
    },
  };
}
