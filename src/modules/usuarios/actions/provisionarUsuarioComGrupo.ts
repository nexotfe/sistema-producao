// Orquestrador de provisionamento de usuário com Grupo de Acesso
// (GA-4C2.3-E2) - extraído do Route Handler (src/app/api/usuarios/route.ts)
// para ter uma fronteira testável com dependências injetadas, mesmo
// padrão já usado em orquestrarAprovacaoAutoritativa.ts/
// orquestrarAprovacaoCenarioComercial.ts: cada interação externa é uma
// função isolada (nunca um client Supabase cru), para testar sem
// precisar simular a cadeia de métodos encadeados do SDK.
//
// SEM "use server": não é Server Action - é chamado pelo Route Handler,
// que monta as dependências reais (ver ../lib/provisionamentoAdaptadoresSupabase)
// e as injeta aqui.
//
// Fronteira de confiança (GA-4C2.3-E1): o chamador do Route Handler só
// controla nome/emailComercial/grupoId. empresa_id, nivel_acesso, ativo,
// criado_por, p_user_id, identidade técnica e service_role NUNCA vêm do
// payload - criado_por sempre vem de obterUsuarioSessao() (nunca
// getSession()); identidade técnica é sempre gerada aqui, nunca
// derivada de nada do payload; a RPC provisionar_usuario_com_grupo é a
// única autoridade sobre empresa/nível/grupo - este orquestrador nunca
// duplica essa decisão, só traduz o resultado dela.
import { randomUUID } from "crypto";
import { CODIGOS_ERRO_PROVISIONAMENTO, mapearErroRpcProvisionamento, type CodigoErroProvisionamento } from "../lib/provisionamentoErros";
import type {
  DadosIncidenteProvisionamento,
  EstadoResultanteIncidente,
  EtapaIncidente,
} from "../lib/provisionamentoIncidentes";
import type { ResultadoBuscaAuthPorIdentidade, ResultadoReconciliacaoEstado } from "../lib/provisionamentoReconciliacao";

const DOMINIO_IDENTIDADE_TECNICA = "auth.nexotfe.internal";

// "conclusivo: false" = a chamada não retornou resposta (timeout/rede
// perdida) - nunca decidir nada definitivo nesse caso sem reconciliar
// primeiro. "conclusivo: true" = o servidor respondeu, mesmo que com erro.
export type ResultadoCriarAuthUser =
  | { conclusivo: true; ok: true; authUserId: string }
  | { conclusivo: true; ok: false }
  | { conclusivo: false };

export type ResultadoChamarRpc =
  | { conclusivo: true; ok: true }
  | { conclusivo: true; ok: false; mensagem: string | null }
  | { conclusivo: false };

export type ResultadoDeletarAuthUser = { conclusivo: true; ok: boolean } | { conclusivo: false };

export interface DependenciasProvisionamento {
  obterUsuarioSessao: () => Promise<{ id: string } | null>;
  obterEmpresaIdCriador: (sessionUserId: string) => Promise<string | null>;
  criarAuthUser: (email: string) => Promise<ResultadoCriarAuthUser>;
  buscarAuthUserPorIdentidade: (identidade: string) => Promise<ResultadoBuscaAuthPorIdentidade>;
  chamarRpcProvisionamento: (params: {
    pUserId: string;
    pNome: string;
    pEmailComercial: string;
    pGrupoId: string;
    pCriadoPor: string;
  }) => Promise<ResultadoChamarRpc>;
  deletarAuthUser: (authUserId: string) => Promise<ResultadoDeletarAuthUser>;
  reconciliarEstado: (authUserId: string) => Promise<ResultadoReconciliacaoEstado>;
  registrarIncidente: (dados: DadosIncidenteProvisionamento) => Promise<boolean>;
}

export interface PayloadProvisionamentoBruto {
  nome?: unknown;
  emailComercial?: unknown;
  grupoId?: unknown;
}

export type ResultadoProvisionamento =
  | { ok: true; status: 201; usuarioId: string }
  | { ok: false; status: number; error: { code: CodigoErroProvisionamento; message: string } };

function erro(status: number, code: CodigoErroProvisionamento, message: string): ResultadoProvisionamento {
  return { ok: false, status, error: { code, message } };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validarEmailFormatoMinimo(email: string): boolean {
  // Mesma regra estrutural da RPC (passo 6 de provisionar_usuario_com_grupo):
  // rejeita ausência de "@", "@" na primeira posição, ou "@" na última
  // posição - nunca tenta validar entregabilidade.
  const posicao = email.indexOf("@");
  return posicao > 0 && posicao < email.length - 1;
}

function incidente(
  base: Omit<DadosIncidenteProvisionamento, "etapa" | "estadoResultante">,
  etapa: EtapaIncidente,
  estadoResultante: EstadoResultanteIncidente,
): DadosIncidenteProvisionamento {
  return { ...base, etapa, estadoResultante };
}

export async function provisionarUsuarioComGrupo(
  deps: DependenciasProvisionamento,
  payloadBruto: PayloadProvisionamentoBruto,
): Promise<ResultadoProvisionamento> {
  // 4. sessão real - única fonte de criado_por.
  const sessionUser = await deps.obterUsuarioSessao();
  if (!sessionUser) {
    return erro(401, CODIGOS_ERRO_PROVISIONAMENTO.SESSAO_INVALIDA, "Sessão inválida.");
  }
  const sessionUserId = sessionUser.id;

  // 5. tentativa_id - correlação de log, nunca idempotency key.
  const tentativaId = randomUUID();

  // 24. empresa_id do criador, via leitura segura - nunca do payload,
  // nunca inventado; fica NULL se não for possível obter com segurança.
  const empresaIdCriador = await deps.obterEmpresaIdCriador(sessionUserId);

  // 3/6. extração seletiva (nunca spread) + validação local.
  const nome = typeof payloadBruto?.nome === "string" ? payloadBruto.nome.trim() : "";
  const emailComercial =
    typeof payloadBruto?.emailComercial === "string" ? payloadBruto.emailComercial.trim().toLowerCase() : "";
  const grupoId = typeof payloadBruto?.grupoId === "string" ? payloadBruto.grupoId : "";

  if (!nome) {
    return erro(400, CODIGOS_ERRO_PROVISIONAMENTO.ENTRADA_INVALIDA, "Nome obrigatório.");
  }
  if (!emailComercial || !validarEmailFormatoMinimo(emailComercial)) {
    return erro(400, CODIGOS_ERRO_PROVISIONAMENTO.ENTRADA_INVALIDA, "E-mail comercial em formato inválido.");
  }
  if (!UUID_REGEX.test(grupoId)) {
    return erro(400, CODIGOS_ERRO_PROVISIONAMENTO.ENTRADA_INVALIDA, "Grupo de acesso inválido.");
  }

  // 7. identidade técnica - sempre gerada aqui, nunca derivada de nome/
  // e-mail/grupo/empresa/p_user_id. Sem UUIDv5, sem idempotencyKey.
  const uuidTecnico = randomUUID();
  const identidadeTecnica = `${uuidTecnico}@${DOMINIO_IDENTIDADE_TECNICA}`;

  const baseIncidente = {
    tentativaId,
    identidadeTecnica,
    criadoPorId: sessionUserId,
  };

  // 8/9/10/11. createUser.
  let authUserId: string;
  const criado = await deps.criarAuthUser(identidadeTecnica);

  if (criado.conclusivo && criado.ok) {
    authUserId = criado.authUserId;
  } else if (criado.conclusivo && !criado.ok) {
    // 10. erro síncrono/conclusivo - não chamar RPC, não compensar.
    console.error("[provisionamento] auth_create falhou (conclusivo)", {
      tentativaId,
      codigo: CODIGOS_ERRO_PROVISIONAMENTO.AUTH_CREATE_ERROR,
    });
    return erro(502, CODIGOS_ERRO_PROVISIONAMENTO.FALHA_AUTH, "Falha ao criar identidade de autenticação.");
  } else {
    // 11. timeout/resultado incerto - tentar localizar pela identidade técnica.
    const busca = await deps.buscarAuthUserPorIdentidade(identidadeTecnica);

    if (busca.resultado === "nao_encontrado") {
      console.error("[provisionamento] auth_create timeout, confirmado ausente", { tentativaId });
      return erro(502, CODIGOS_ERRO_PROVISIONAMENTO.FALHA_AUTH, "Falha ao criar identidade de autenticação.");
    }

    if (busca.resultado === "inconclusivo") {
      await deps.registrarIncidente(
        incidente(
          { ...baseIncidente, authUserId: null, empresaId: empresaIdCriador, codigoErroPrincipal: CODIGOS_ERRO_PROVISIONAMENTO.AUTH_CREATE_TIMEOUT, codigoErroCompensacao: null },
          "auth_create",
          "parcial_incoerente",
        ),
      );
      return erro(
        503,
        CODIGOS_ERRO_PROVISIONAMENTO.RECONCILIACAO_INCONCLUSIVA,
        "Não foi possível confirmar a criação do usuário. Tente novamente mais tarde.",
      );
    }

    authUserId = busca.authUserId;
  }

  // 12. RPC - única fonte de autoridade de negócio (empresa/nível/grupo).
  const rpcResultado = await deps.chamarRpcProvisionamento({
    pUserId: authUserId,
    pNome: nome,
    pEmailComercial: emailComercial,
    pGrupoId: grupoId,
    pCriadoPor: sessionUserId,
  });

  // 13. sucesso.
  if (rpcResultado.conclusivo && rpcResultado.ok) {
    return { ok: true, status: 201, usuarioId: authUserId };
  }

  if (rpcResultado.conclusivo && !rpcResultado.ok) {
    // 14/15/16. erro síncrono - rollback completo garantido pela RPC
    // (transação única, já comprovado em GA-4C2.3-D2/D3) - sempre
    // seguro compensar.
    const mapeado = mapearErroRpcProvisionamento(rpcResultado.mensagem);
    const deletado = await deps.deletarAuthUser(authUserId);

    if (deletado.conclusivo && deletado.ok) {
      // 15. compensação funcionou - não grava incidente.
      console.error("[provisionamento] RPC falhou, compensado com sucesso", { tentativaId, codigo: mapeado.code });
      return erro(mapeado.status, mapeado.code, mapeado.message);
    }

    // 16. compensação falhou (ou ficou incerta) - incidente orfao_auth.
    await deps.registrarIncidente(
      incidente(
        {
          ...baseIncidente,
          authUserId,
          empresaId: empresaIdCriador,
          codigoErroPrincipal: mapeado.code,
          codigoErroCompensacao: deletado.conclusivo
            ? CODIGOS_ERRO_PROVISIONAMENTO.COMPENSACAO_ERROR
            : CODIGOS_ERRO_PROVISIONAMENTO.COMPENSACAO_TIMEOUT,
        },
        "compensacao",
        "orfao_auth",
      ),
    );
    return erro(500, CODIGOS_ERRO_PROVISIONAMENTO.FALHA_INTERNA, "Falha interna ao provisionar usuário.");
  }

  // 17/18. RPC timeout/resultado incerto - reconciliar ANTES de apagar qualquer coisa.
  const reconciliacao = await deps.reconciliarEstado(authUserId);

  if (reconciliacao.estado === "coerente") {
    // A: já commitou de verdade - tratar como sucesso confirmado, nunca apagar.
    return { ok: true, status: 201, usuarioId: authUserId };
  }

  if (reconciliacao.estado === "nenhum") {
    // B: RPC não commitou - seguro tentar compensar.
    const deletado = await deps.deletarAuthUser(authUserId);

    if (deletado.conclusivo && deletado.ok) {
      return erro(500, CODIGOS_ERRO_PROVISIONAMENTO.FALHA_INTERNA, "Falha interna ao provisionar usuário.");
    }

    await deps.registrarIncidente(
      incidente(
        {
          ...baseIncidente,
          authUserId,
          empresaId: empresaIdCriador,
          codigoErroPrincipal: CODIGOS_ERRO_PROVISIONAMENTO.RPC_ERRO_INESPERADO,
          codigoErroCompensacao: deletado.conclusivo
            ? CODIGOS_ERRO_PROVISIONAMENTO.COMPENSACAO_ERROR
            : CODIGOS_ERRO_PROVISIONAMENTO.COMPENSACAO_TIMEOUT,
        },
        "compensacao",
        "orfao_auth",
      ),
    );
    return erro(500, CODIGOS_ERRO_PROVISIONAMENTO.FALHA_INTERNA, "Falha interna ao provisionar usuário.");
  }

  // C: estado parcial/incoerente - nunca apagar automaticamente.
  await deps.registrarIncidente(
    incidente(
      {
        ...baseIncidente,
        authUserId,
        empresaId: reconciliacao.empresaId ?? empresaIdCriador,
        codigoErroPrincipal: CODIGOS_ERRO_PROVISIONAMENTO.RECONCILIACAO_INCONCLUSIVA,
        codigoErroCompensacao: null,
      },
      "reconciliacao",
      "parcial_incoerente",
    ),
  );
  return erro(
    503,
    CODIGOS_ERRO_PROVISIONAMENTO.RECONCILIACAO_PENDENTE,
    "Estado do provisionamento pendente de verificação. Contate o suporte.",
  );
}
