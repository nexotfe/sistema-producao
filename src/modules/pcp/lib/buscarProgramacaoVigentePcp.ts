// PCP-P8I-B5.1: leitura PURA (sem decisão de vigente/desatualizada,
// sem atraso/déficit/conflito - isso é B5.2; sem UI - isso é B5.3+) da
// programação vigente persistida pelo P8H (pcp_programacoes/
// pcp_programacao_operacoes/pcp_programacao_alocacoes). Mesmo padrão
// de buscarCenarioComercialAprovado.ts: recebe o client de SESSÃO
// (RLS cuida do isolamento por empresa via empresa_atual_id() - esta
// função nunca filtra por empresa_id explicitamente), nunca o
// privilegiado. Autenticação/autorização (pcp.visualizar_programacao)
// são responsabilidade exclusiva do chamador
// (consultarProgramacaoVigentePcpAction.ts) - esta função assume que
// já foram verificadas.
//
// null = ausência LEGÍTIMA de programação vigente (empresa ainda não
// calculou/aprovou nenhuma) - nunca um erro. Qualquer falha real de
// consulta (rede, RLS mal configurada, coluna inexistente) lança
// Error - nunca é absorvida como null, para a interface (B5.3+) nunca
// confundir "sem programação" com "não foi possível carregar".
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AlocacaoProgramacaoVigentePcp {
  readonly data: string;
  readonly recursoId: string;
  readonly nomeRecurso: string;
  readonly natureza: string;
  readonly horasMaquina: number;
  readonly horasPadrao: number;
}

export interface OperacaoProgramacaoVigentePcp {
  readonly opId: string;
  /** ordens_fabricacao_operacoes.codigo_operacional (ex.: "OP10") - identificação principal para o operador, nunca o opId (uuid). null só se a OP não existir mais (nunca inventado). */
  readonly codigoOperacional: string | null;
  /** ordens_fabricacao_operacoes.descricao - null nas mesmas condições de codigoOperacional. */
  readonly descricaoOperacao: string | null;
  readonly ofId: string;
  readonly numeroOf: string;
  readonly projetoId: string;
  readonly numeroProjeto: string;
  readonly nomeProjeto: string;
  readonly prioridadeUsada: number;
  readonly statusCalculoMotor: "concluida" | "bloqueada_por_deficit" | "bloqueada_por_predecessora";
  readonly dataInicioPrevista: string | null;
  readonly dataFimPrevista: string | null;
  readonly deficitResidualHorasPadrao: number;
  readonly alocacoes: readonly AlocacaoProgramacaoVigentePcp[];
}

export interface ProgramacaoVigentePcp {
  readonly programacaoId: string;
  readonly versaoSequencial: number;
  readonly empresaCapacidadeVersaoOrigem: number;
  /** empresas.nome da própria empresa do usuário autenticado - lido pelo client de sessão, RLS restringe a exatamente 1 linha (a própria). */
  readonly nomeEmpresa: string;
  readonly janelaInicio: string;
  readonly janelaFim: string;
  readonly criadaEm: string;
  readonly criadaPor: string;
  readonly motivo: string | null;
  readonly operacoes: readonly OperacaoProgramacaoVigentePcp[];
  /** Versão ATUAL de empresa_capacidade_versoes - dado bruto, sem comparação. A decisão vigente×desatualizada é responsabilidade de B5.2, nunca desta função. */
  readonly versaoCapacidadeAtual: number;
}

export async function buscarProgramacaoVigentePcp(client: SupabaseClient): Promise<ProgramacaoVigentePcp | null> {
  const { data: cabecalho, error: erroCabecalho } = await client
    .from("pcp_programacoes")
    .select("id, versao_sequencial, empresa_capacidade_versao_origem, janela_inicio, janela_fim, criada_em, criada_por, motivo")
    .eq("vigente", true)
    .maybeSingle();

  if (erroCabecalho) {
    throw new Error(`buscarProgramacaoVigentePcp: erro ao consultar pcp_programacoes: ${erroCabecalho.message}`);
  }
  if (!cabecalho) {
    return null;
  }

  const { data: operacoesBrutas, error: erroOperacoes } = await client
    .from("pcp_programacao_operacoes")
    .select("id, op_id, of_id, projeto_id, prioridade_usada, status_calculo_motor, data_inicio_prevista, data_fim_prevista, deficit_residual_horas_padrao")
    .eq("programacao_id", cabecalho.id);

  if (erroOperacoes) {
    throw new Error(`buscarProgramacaoVigentePcp: erro ao consultar pcp_programacao_operacoes: ${erroOperacoes.message}`);
  }
  const operacoes = operacoesBrutas ?? [];

  const idsOperacoes = operacoes.map((o) => o.id);
  const { data: alocacoesBrutas, error: erroAlocacoes } =
    idsOperacoes.length > 0
      ? await client
          .from("pcp_programacao_alocacoes")
          .select("programacao_operacao_id, data, recurso_id, natureza, horas_maquina, horas_padrao")
          .in("programacao_operacao_id", idsOperacoes)
      : { data: [], error: null };

  if (erroAlocacoes) {
    throw new Error(`buscarProgramacaoVigentePcp: erro ao consultar pcp_programacao_alocacoes: ${erroAlocacoes.message}`);
  }
  const alocacoes = alocacoesBrutas ?? [];

  const idsOf = Array.from(new Set(operacoes.map((o) => o.of_id)));
  const idsProjeto = Array.from(new Set(operacoes.map((o) => o.projeto_id)));
  const idsRecurso = Array.from(new Set(alocacoes.map((a) => a.recurso_id)));
  const idsOp = Array.from(new Set(operacoes.map((o) => o.op_id)));

  const [ofsResult, projetosResult, recursosResult, versaoResult, opsResult, empresaResult] = await Promise.all([
    idsOf.length > 0
      ? client.from("ordens_fabricacao").select("id, numero_of").in("id", idsOf)
      : Promise.resolve({ data: [] as { id: string; numero_of: string }[], error: null }),
    idsProjeto.length > 0
      ? client.from("projetos").select("id, numero_projeto, nome").in("id", idsProjeto)
      : Promise.resolve({ data: [] as { id: string; numero_projeto: string; nome: string }[], error: null }),
    idsRecurso.length > 0
      ? client.from("recursos_produtivos").select("id, nome").in("id", idsRecurso)
      : Promise.resolve({ data: [] as { id: string; nome: string }[], error: null }),
    client.from("empresa_capacidade_versoes").select("versao").maybeSingle(),
    // Identificação legível da OP (Etapa 2I) - codigo_operacional/descricao,
    // em lote pelos op_id já carregados, pelo client de SESSÃO (mesma RLS
    // por empresa de todo o resto desta função, nunca um client privilegiado).
    idsOp.length > 0
      ? client.from("ordens_fabricacao_operacoes").select("id, codigo_operacional, descricao").in("id", idsOp)
      : Promise.resolve({ data: [] as { id: string; codigo_operacional: string; descricao: string }[], error: null }),
    // Nome da empresa (Etapa 2L.1) - cliente de SESSÃO, RLS ("empresas
    // select propria empresa") já restringe a exatamente a própria linha,
    // sem nenhum filtro explícito de empresa_id nesta função.
    client.from("empresas").select("nome").maybeSingle(),
  ]);

  if (ofsResult.error) throw new Error(`buscarProgramacaoVigentePcp: erro ao consultar ordens_fabricacao: ${ofsResult.error.message}`);
  if (projetosResult.error) throw new Error(`buscarProgramacaoVigentePcp: erro ao consultar projetos: ${projetosResult.error.message}`);
  if (recursosResult.error) throw new Error(`buscarProgramacaoVigentePcp: erro ao consultar recursos_produtivos: ${recursosResult.error.message}`);
  if (versaoResult.error) throw new Error(`buscarProgramacaoVigentePcp: erro ao consultar empresa_capacidade_versoes: ${versaoResult.error.message}`);
  if (opsResult.error) throw new Error(`buscarProgramacaoVigentePcp: erro ao consultar ordens_fabricacao_operacoes: ${opsResult.error.message}`);
  if (empresaResult.error) throw new Error(`buscarProgramacaoVigentePcp: erro ao consultar empresas: ${empresaResult.error.message}`);
  if (!versaoResult.data) {
    throw new Error("buscarProgramacaoVigentePcp: empresa sem linha em empresa_capacidade_versoes - inconsistência de dados, nunca tratado como ausência legítima.");
  }
  if (!empresaResult.data) {
    throw new Error("buscarProgramacaoVigentePcp: nenhuma empresa visível para o usuário autenticado - inconsistência de dados, nunca tratado como ausência legítima.");
  }

  const numeroOfPorId = new Map((ofsResult.data ?? []).map((o) => [o.id, o.numero_of]));
  const projetoPorId = new Map((projetosResult.data ?? []).map((p) => [p.id, { numero: p.numero_projeto, nome: p.nome }]));
  const nomeRecursoPorId = new Map((recursosResult.data ?? []).map((r) => [r.id, r.nome]));
  // Mapa por op_id - ausência (OP excluída/inacessível) vira null
  // explícito, nunca um placeholder inventado.
  const opPorId = new Map((opsResult.data ?? []).map((o) => [o.id, { codigo: o.codigo_operacional, descricao: o.descricao }]));

  const alocacoesPorOperacaoId = new Map<string, typeof alocacoes>();
  for (const alocacao of alocacoes) {
    const lista = alocacoesPorOperacaoId.get(alocacao.programacao_operacao_id) ?? [];
    lista.push(alocacao);
    alocacoesPorOperacaoId.set(alocacao.programacao_operacao_id, lista);
  }

  const operacoesEnriquecidas: OperacaoProgramacaoVigentePcp[] = operacoes.map((operacao) => {
    const projeto = projetoPorId.get(operacao.projeto_id);
    const op = opPorId.get(operacao.op_id);
    return {
      opId: operacao.op_id,
      codigoOperacional: op?.codigo ?? null,
      descricaoOperacao: op?.descricao ?? null,
      ofId: operacao.of_id,
      numeroOf: numeroOfPorId.get(operacao.of_id) ?? "",
      projetoId: operacao.projeto_id,
      numeroProjeto: projeto?.numero ?? "",
      nomeProjeto: projeto?.nome ?? "",
      prioridadeUsada: operacao.prioridade_usada,
      statusCalculoMotor: operacao.status_calculo_motor as OperacaoProgramacaoVigentePcp["statusCalculoMotor"],
      dataInicioPrevista: operacao.data_inicio_prevista,
      dataFimPrevista: operacao.data_fim_prevista,
      deficitResidualHorasPadrao: operacao.deficit_residual_horas_padrao,
      alocacoes: (alocacoesPorOperacaoId.get(operacao.id) ?? []).map((alocacao) => ({
        data: alocacao.data,
        recursoId: alocacao.recurso_id,
        nomeRecurso: nomeRecursoPorId.get(alocacao.recurso_id) ?? "",
        natureza: alocacao.natureza,
        horasMaquina: alocacao.horas_maquina,
        horasPadrao: alocacao.horas_padrao,
      })),
    };
  });

  return {
    programacaoId: cabecalho.id,
    versaoSequencial: cabecalho.versao_sequencial,
    empresaCapacidadeVersaoOrigem: cabecalho.empresa_capacidade_versao_origem,
    nomeEmpresa: empresaResult.data.nome,
    janelaInicio: cabecalho.janela_inicio,
    janelaFim: cabecalho.janela_fim,
    criadaEm: cabecalho.criada_em,
    criadaPor: cabecalho.criada_por,
    motivo: cabecalho.motivo,
    operacoes: operacoesEnriquecidas,
    versaoCapacidadeAtual: versaoResult.data.versao,
  };
}
