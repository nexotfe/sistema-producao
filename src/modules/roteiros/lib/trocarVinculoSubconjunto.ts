// DEC-007 §6.1 - Fase 7: camada fina sobre a criação/troca/remoção
// lógica do vínculo "esta operação precisa deste subconjunto pronto
// antes de rodar" (bom_operacao_dependencias_subconjunto). Sem estado,
// cliente injetado (mesmo padrão de editarMaterial.ts) - testável sem
// mockar o módulo inteiro do Supabase.
//
// empresa_id/created_by/deleted_by NUNCA são aceitos como parâmetro -
// são sempre resolvidos aqui dentro a partir da sessão autenticada
// (client.auth.getUser()) e, para empresa_id, de uma consulta a
// public.usuarios - o chamador (hook/componente) não tem como escolher
// esses valores, mesmo que tentasse. Troca de operação é sempre 1
// UPDATE atômico só de bom_operacao_id; remover é sempre UPDATE de
// deleted_at/deleted_by - nunca DELETE físico. Verifica linhas
// retornadas pelo UPDATE antes de reportar sucesso: RLS bloqueando
// (usuário não é created_by nem admin) não gera erro do Postgres, só
// devolve 0 linhas - mesmo padrão de editarMaterial.ts/
// excluirRegistro.ts/useCompatibilidadesRecurso.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultadoOperacaoRoteiro } from "../types";

export interface ParametrosTrocarVinculoSubconjunto {
  bomItemId: string;
  vinculoIdAtual: string | null;
  vinculoOperacaoIdAtual: string | null;
  novaOperacaoId: string | null;
}

type SupabaseErrorLike = { code?: string; message?: string };

const CODIGO_UNIQUE_VIOLATION = "23505";
const CODIGO_FK_VIOLATION = "23503";

function mapearErro(
  err: SupabaseErrorLike,
  mensagemPadrao: string,
): ResultadoOperacaoRoteiro {
  if (err.code === CODIGO_UNIQUE_VIOLATION) {
    return {
      status: "erro",
      mensagem:
        "Este subconjunto já está vinculado a outra operação (provavelmente por outra aba/usuário) - recarregue a página.",
    };
  }
  if (err.code === CODIGO_FK_VIOLATION) {
    return {
      status: "erro",
      mensagem: "A operação selecionada não existe mais ou está inválida.",
    };
  }
  // Mensagens do trigger validar_atualizacao_dependencia_subconjunto
  // (imutabilidade, auditoria) já vêm em português, claras o
  // suficiente para mostrar direto ao usuário.
  return { status: "erro", mensagem: err.message || mensagemPadrao };
}

export async function trocarVinculoSubconjunto(
  client: SupabaseClient,
  params: ParametrosTrocarVinculoSubconjunto,
): Promise<ResultadoOperacaoRoteiro> {
  const { bomItemId, vinculoIdAtual, vinculoOperacaoIdAtual, novaOperacaoId } = params;

  if (vinculoOperacaoIdAtual === novaOperacaoId) {
    return { status: "ok" };
  }

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { status: "erro", mensagem: "Usuário não autenticado." };
  }

  // Remover: já existia vínculo, nova seleção é "— (regra
  // conservadora)" - UPDATE de deleted_at/deleted_by, nunca DELETE.
  if (vinculoIdAtual && novaOperacaoId === null) {
    const { data, error } = await client
      .from("bom_operacao_dependencias_subconjunto")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq("id", vinculoIdAtual)
      .select("id");

    if (error) {
      return mapearErro(error, "Não foi possível remover o vínculo.");
    }
    if (!data || data.length === 0) {
      return {
        status: "erro",
        mensagem:
          "Não foi possível remover - verifique se você é quem criou este vínculo ou é administrador.",
      };
    }
    return { status: "ok" };
  }

  // Trocar: já existia vínculo, nova operação é diferente - UPDATE
  // atômico só de bom_operacao_id (nunca DELETE+INSERT).
  if (vinculoIdAtual && novaOperacaoId !== null) {
    const { data, error } = await client
      .from("bom_operacao_dependencias_subconjunto")
      .update({ bom_operacao_id: novaOperacaoId })
      .eq("id", vinculoIdAtual)
      .select("id");

    if (error) {
      return mapearErro(error, "Não foi possível trocar o vínculo.");
    }
    if (!data || data.length === 0) {
      return {
        status: "erro",
        mensagem:
          "Não foi possível trocar - verifique se você é quem criou este vínculo ou é administrador.",
      };
    }
    return { status: "ok" };
  }

  // Criar: não existia vínculo, uma operação foi escolhida - INSERT.
  // empresa_id resolvido do servidor (nunca aceito como parâmetro).
  const { data: usuario, error: usuarioError } = await client
    .from("usuarios")
    .select("empresa_id")
    .eq("id", user.id)
    .single();

  if (usuarioError || !usuario?.empresa_id) {
    return { status: "erro", mensagem: "Empresa do usuário não encontrada." };
  }

  const { error } = await client
    .from("bom_operacao_dependencias_subconjunto")
    .insert({
      empresa_id: usuario.empresa_id,
      bom_operacao_id: novaOperacaoId,
      bom_item_id: bomItemId,
      created_by: user.id,
    });

  if (error) {
    return mapearErro(error, "Não foi possível vincular a operação.");
  }

  return { status: "ok" };
}
