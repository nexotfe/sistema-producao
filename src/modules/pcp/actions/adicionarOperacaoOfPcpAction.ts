"use server";
// Etapa 65A — Server Action real de criação de OP no Y (criar_op_no_y,
// já em produção, auditada nas Etapas 65/65A). Botão da UI real segue
// desconectado desta Action até autorização separada (Etapa 65A é só
// preparação - nenhuma gravação operacional habilitada ainda).
//
// Fluxo obrigatório (Etapa 65A, item 2):
// 1. Autentica pela sessão real (client de sessão, auth.getUser()).
// 2. Resolve a empresa da sessão (empresa_atual_id()).
// 3. Localiza a OF via client de SESSÃO (RLS filtra por empresa - uma
//    OF de outra empresa nunca aparece, nunca confiamos em empresa_id
//    vindo do navegador).
// 4. Verifica a permissão pcp.criar_operacao_of (client de SERVIÇO, só
//    para esta checagem - mesmo padrão já estabelecido em
//    consultarPermissoesOperacoesOfPcpAction.ts).
// 5. Valida o contrato de entrada (mesmas regras já aplicadas pela
//    validação visual mockada da Etapa 59A, mais a RPC/constraints do
//    banco).
// 6. Chama criar_op_no_y via client de SERVIÇO - canal oficial desta
//    RPC (GRANT só a service_role, migration 20261015170000; nunca
//    contorna RLS, é o desenho real da família Y/Z). p_criado_por é
//    SEMPRE o auth.uid() real resolvido no passo 1 - nunca aceito do
//    navegador.
// 7. Devolve resultado ou erro controlado, nunca repete a chamada
//    automaticamente em caso de falha de rede (gravação incerta).
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import {
  persistirCriacaoOperacaoOfPcp,
  classificarErroCriacaoOperacaoOfPcp,
} from "../lib/persistirCriacaoOperacaoOfPcp";
import { gravacoesOpDependenciasPcpHabilitadas } from "../lib/gravacoesOperacionaisPcpHabilitadas";

export interface DadosNovaOperacaoOfPcp {
  readonly codigoOperacional: string;
  readonly descricao: string;
  readonly sequenciaVigente: number;
  readonly recursoVigenteId: string | null;
  readonly tempoVigenteMinutos: number | null;
  readonly motivo: string;
}

export type ResultadoAdicionarOperacaoOfPcp =
  | { ok: true; novoOpId: string }
  | {
      ok: false;
      motivo:
        | "nao_autenticado"
        | "empresa_nao_encontrada"
        | "of_nao_encontrada"
        | "implantacao_bloqueada"
        | "nao_autorizado"
        | "dados_invalidos"
        | "codigo_duplicado"
        | "of_estado_final"
        | "motivo_obrigatorio"
        | "erro_desconhecido";
      campo?: string;
    }
  | { ok: false; motivo: "gravacao_incerta" };

const PERMISSAO_CRIAR_OPERACAO = "pcp.criar_operacao_of";

function logErroTecnicoAdicionarOperacao(origem: string, erro: unknown): void {
  console.error(`adicionarOperacaoOfPcpAction: falha tecnica em ${origem}`, erro);
}

function validarEntrada(dados: DadosNovaOperacaoOfPcp): { campo: string } | null {
  if (!dados.codigoOperacional.trim()) return { campo: "codigo" };
  if (!dados.descricao.trim()) return { campo: "descricao" };
  if (!Number.isInteger(dados.sequenciaVigente) || dados.sequenciaVigente < 0) return { campo: "sequencia" };
  if (dados.tempoVigenteMinutos !== null && (!Number.isFinite(dados.tempoVigenteMinutos) || dados.tempoVigenteMinutos < 0)) {
    return { campo: "tempo" };
  }
  if (!dados.motivo.trim()) return { campo: "motivo" };
  return null;
}

export async function adicionarOperacaoOfPcpAction(
  ofId: string,
  dados: DadosNovaOperacaoOfPcp,
): Promise<ResultadoAdicionarOperacaoOfPcp> {
  // 1. Autenticação real.
  const serverClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: erroAuth,
  } = await serverClient.auth.getUser();
  if (erroAuth || !user) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  // 1.5. Bloqueio provisório de implantação (fechamento objetivo pós-
  // Etapa 66L) — nunca substitui as checagens abaixo, só as antecede.
  if (!gravacoesOpDependenciasPcpHabilitadas()) {
    return { ok: false, motivo: "implantacao_bloqueada" };
  }

  // 2. Empresa da sessão.
  const { data: empresaId, error: erroEmpresa } = await serverClient.rpc("empresa_atual_id");
  if (erroEmpresa) {
    logErroTecnicoAdicionarOperacao("empresa_atual_id", erroEmpresa);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!empresaId) {
    return { ok: false, motivo: "empresa_nao_encontrada" };
  }

  // 3. OF via client de sessão - RLS garante que só aparece se for da empresa atual.
  const { data: ofRow, error: erroOf } = await serverClient
    .from("ordens_fabricacao")
    .select("id")
    .eq("id", ofId)
    .maybeSingle();
  if (erroOf) {
    logErroTecnicoAdicionarOperacao("ordens_fabricacao", erroOf);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (!ofRow) {
    return { ok: false, motivo: "of_nao_encontrada" };
  }

  // 4. Permissão (client de serviço só para esta checagem).
  const serviceClient = createSupabaseServiceClient();
  const { data: podeCriar, error: erroPermissao } = await serviceClient.rpc("usuario_tem_permissao", {
    p_usuario_id: user.id,
    p_chave: PERMISSAO_CRIAR_OPERACAO,
  });
  if (erroPermissao) {
    logErroTecnicoAdicionarOperacao("usuario_tem_permissao", erroPermissao);
    return { ok: false, motivo: "erro_desconhecido" };
  }
  if (podeCriar !== true) {
    return { ok: false, motivo: "nao_autorizado" };
  }

  // 5. Validação de entrada.
  const erroValidacao = validarEntrada(dados);
  if (erroValidacao) {
    return { ok: false, motivo: "dados_invalidos", campo: erroValidacao.campo };
  }

  // 6. RPC oficial, via canal privilegiado - p_criado_por é sempre o auth.uid() real.
  const resultado = await persistirCriacaoOperacaoOfPcp(
    serviceClient,
    ofId,
    user.id,
    dados.codigoOperacional.trim(),
    dados.descricao.trim(),
    dados.sequenciaVigente,
    dados.recursoVigenteId,
    dados.tempoVigenteMinutos,
    dados.motivo.trim(),
  );

  if (resultado.gravacaoIncerta) {
    logErroTecnicoAdicionarOperacao("criar_op_no_y (rede)", { message: resultado.erro ?? "falha de rede" });
    return { ok: false, motivo: "gravacao_incerta" };
  }

  if (resultado.erro) {
    if (resultado.erro.includes("ordens_fabricacao_operacoes_codigo_uniq")) {
      return { ok: false, motivo: "codigo_duplicado" };
    }
    logErroTecnicoAdicionarOperacao("criar_op_no_y", { message: resultado.erro });
    return { ok: false, motivo: classificarErroCriacaoOperacaoOfPcp(resultado.erro) };
  }

  if (!resultado.novoOpId) {
    logErroTecnicoAdicionarOperacao("criar_op_no_y (resposta vazia)", { message: "RPC retornou sucesso sem id" });
    return { ok: false, motivo: "erro_desconhecido" };
  }

  // 7. Resultado.
  return { ok: true, novoOpId: resultado.novoOpId };
}
