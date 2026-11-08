// NEXOTFE — Etapa 46: consulta paginada e filtrável de Ordens de
// Fabricação para a futura tabela de Controle de Produção do PCP. Só
// leitura, client de SESSÃO (RLS normal em todas as 5 tabelas tocadas:
// ordens_fabricacao, projetos, clientes, itens_industriais,
// cenarios_comerciais_aprovados — todas com policy `empresa_id =
// empresa_atual_id()`) - nunca service_role.
//
// Não existe view SQL nem RPC pronta para "OF com detalhe" (confirmado
// por investigação, Etapa 45). Filtro por tabela relacionada (cliente,
// entrega) é feito em passos — resolver ids em projetos/clientes PRIMEIRO,
// depois filtrar ordens_fabricacao por esses ids — mesmo padrão já usado
// em buscarFilaPrioridadesPcp.ts, em vez de depender de embedded-filter
// do PostgREST (!inner em caminho de 2 níveis), que eu não tinha como
// validar ao vivo nesta etapa. Paginação real (.range + count:'exact')
// acontece SEMPRE na consulta final de ordens_fabricacao, nunca
// filtrando tudo no navegador.
//
// Os dados de exibição (nome do cliente, descrição do produto, datas)
// só são buscados para os IDs da PÁGINA atual (não para o resultado
// filtrado inteiro) — mesmo padrão de buscarFilaPrioridadesPcp.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { escaparParaIlike } from "@/modules/shared/lib/filtroBuscaTexto";

// Valores reais confirmados em estados_of_combinacoes_validas (Etapa 45)
// — nunca inventados. A combinação administrativo×execução é validada
// pela própria tabela no banco, não reimplementada aqui.
export const ESTADOS_APROVACAO_OF = ["rascunho", "aguardando_auditoria", "aprovada", "reprovada", "cancelada"] as const;
export const ESTADOS_EXECUCAO_OF = [
  "planejada",
  "liberada",
  "em_producao",
  "suspensa",
  "concluida",
  "desdobrada",
  "cancelada",
] as const;

export type EstadoAprovacaoOf = (typeof ESTADOS_APROVACAO_OF)[number];
export type EstadoExecucaoOf = (typeof ESTADOS_EXECUCAO_OF)[number];

// Os 6 rótulos visuais aprovados (Etapa 49, decisão de negócio do
// usuário) — nunca inventados, nunca derivados automaticamente. Cada um
// dos 15 pares reais de estados_of_combinacoes_validas cai em exatamente
// um destes rótulos, pela ordem de prioridade também aprovada:
// 1) estado_execucao='desdobrada' → Desdobrada;
// 2) cancelamento formal (estado_execucao='cancelada' OU
//    estado_aprovacao='cancelada') → Cancelada;
// 3) liberada/em_producao/concluida → respectivo rótulo;
// 4) qualquer outro (planejada/suspensa, sem cancelamento formal) →
//    Aguardando — inclui reprovada+planejada e aprovada+suspensa, que
//    NÃO podem ser confundidos com cancelamento real (ver alertaDerivado
//    em ListaOfsPcp.tsx para a indicação visível desses dois casos).
export const ROTULOS_STATUS_SIMPLIFICADO = [
  "Aguardando",
  "Liberada",
  "Em produção",
  "Concluída",
  "Cancelada",
  "Desdobrada",
] as const;
export type RotuloStatusSimplificado = (typeof ROTULOS_STATUS_SIMPLIFICADO)[number];

interface ParEstadoOf {
  readonly estadoAprovacao: EstadoAprovacaoOf;
  readonly estadoExecucao: EstadoExecucaoOf;
}

// Fonte única de verdade do agrupamento — usada tanto para montar o
// filtro no servidor (pares exatos, nunca .in() cruzado entre as duas
// colunas) quanto para o rótulo exibido na tabela (ListaOfsPcp.tsx
// importa esta mesma constante, para nunca divergir do filtro).
export const GRUPOS_STATUS_SIMPLIFICADO: Record<RotuloStatusSimplificado, readonly ParEstadoOf[]> = {
  Aguardando: [
    { estadoAprovacao: "rascunho", estadoExecucao: "planejada" },
    { estadoAprovacao: "aguardando_auditoria", estadoExecucao: "planejada" },
    { estadoAprovacao: "reprovada", estadoExecucao: "planejada" },
    { estadoAprovacao: "aprovada", estadoExecucao: "planejada" },
    { estadoAprovacao: "aprovada", estadoExecucao: "suspensa" },
  ],
  Liberada: [{ estadoAprovacao: "aprovada", estadoExecucao: "liberada" }],
  "Em produção": [{ estadoAprovacao: "aprovada", estadoExecucao: "em_producao" }],
  Concluída: [{ estadoAprovacao: "aprovada", estadoExecucao: "concluida" }],
  Cancelada: [
    { estadoAprovacao: "reprovada", estadoExecucao: "cancelada" },
    { estadoAprovacao: "aprovada", estadoExecucao: "cancelada" },
    { estadoAprovacao: "cancelada", estadoExecucao: "planejada" },
    { estadoAprovacao: "cancelada", estadoExecucao: "cancelada" },
  ],
  Desdobrada: [
    { estadoAprovacao: "aguardando_auditoria", estadoExecucao: "desdobrada" },
    { estadoAprovacao: "aprovada", estadoExecucao: "desdobrada" },
    { estadoAprovacao: "cancelada", estadoExecucao: "desdobrada" },
  ],
};

// Etapa 58B: movido de ListaOfsPcp.tsx para esta fonte única - a página
// real da OF (/ordens/[id]) precisa do MESMO rótulo simplificado da
// lista, nunca uma segunda derivação que possa divergir.
export function rotuloSimplificadoOf(estadoAprovacao: string, estadoExecucao: string): RotuloStatusSimplificado | null {
  for (const rotulo of ROTULOS_STATUS_SIMPLIFICADO) {
    const combina = GRUPOS_STATUS_SIMPLIFICADO[rotulo].some(
      (par) => par.estadoAprovacao === estadoAprovacao && par.estadoExecucao === estadoExecucao,
    );
    if (combina) return rotulo;
  }
  return null;
}

// As 15 combinações válidas reais (estados_of_combinacoes_validas,
// investigadas na Etapa 45) — rótulo curto para a UI + o texto real da
// coluna `observacao` do banco como tooltip. Nenhuma combinação nova
// inventada; nenhum rótulo aqui corresponde a um estado que não exista.
// Etapa 58B: movido de ListaOfsPcp.tsx para esta fonte única - a página
// real da OF (/ordens/[id]) também precisa do mesmo rótulo simplificado,
// nunca uma segunda cópia.
const COMBINACOES_STATUS: {
  estadoAprovacao: string;
  estadoExecucao: string;
  rotulo: string;
  observacao: string;
}[] = [
  { estadoAprovacao: "rascunho", estadoExecucao: "planejada", rotulo: "Rascunho", observacao: "Estado inicial — ainda editável pelo PCP, nunca em execução." },
  { estadoAprovacao: "aguardando_auditoria", estadoExecucao: "planejada", rotulo: "Aguardando auditoria", observacao: "Aguardando revisão/aprovação do PCP." },
  { estadoAprovacao: "aguardando_auditoria", estadoExecucao: "desdobrada", rotulo: "Aguardando auditoria (desdobrada)", observacao: "Dividida em lotes durante a auditoria, antes da aprovação formal." },
  { estadoAprovacao: "reprovada", estadoExecucao: "planejada", rotulo: "Reprovada", observacao: "Rejeitada na auditoria, nunca chega a executar." },
  { estadoAprovacao: "reprovada", estadoExecucao: "cancelada", rotulo: "Reprovada (encerrada)", observacao: "Rejeitada e formalmente encerrada." },
  { estadoAprovacao: "aprovada", estadoExecucao: "planejada", rotulo: "Aprovada — aguardando liberação", observacao: "Aprovada, ainda não liberada para produção — aprovação e liberação são atos distintos." },
  { estadoAprovacao: "aprovada", estadoExecucao: "liberada", rotulo: "Liberada", observacao: "Aprovada e liberada, produção pode iniciar." },
  { estadoAprovacao: "aprovada", estadoExecucao: "em_producao", rotulo: "Em produção", observacao: "Em execução real." },
  { estadoAprovacao: "aprovada", estadoExecucao: "suspensa", rotulo: "Suspensa", observacao: "Execução suspensa temporariamente, aprovação permanece válida." },
  { estadoAprovacao: "aprovada", estadoExecucao: "concluida", rotulo: "Concluída", observacao: "Execução concluída." },
  { estadoAprovacao: "aprovada", estadoExecucao: "desdobrada", rotulo: "Desdobrada", observacao: "Dividida em lotes depois de aprovada (revisão)." },
  { estadoAprovacao: "aprovada", estadoExecucao: "cancelada", rotulo: "Cancelada após aprovação", observacao: "Execução cancelada depois de aprovada — aprovação não é desfeita retroativamente." },
  { estadoAprovacao: "cancelada", estadoExecucao: "planejada", rotulo: "Cancelada (antes de executar)", observacao: "Cancelada antes de qualquer execução real." },
  { estadoAprovacao: "cancelada", estadoExecucao: "desdobrada", rotulo: "Cancelada (com lotes)", observacao: "Cancelada com filhas já existentes (histórico preservado)." },
  { estadoAprovacao: "cancelada", estadoExecucao: "cancelada", rotulo: "Cancelada", observacao: "Cancelamento legado — status='cancelada' sempre significou a OF inteira encerrada." },
];

/** Detalhe técnico (texto de tooltip) para a combinação bruta real. */
export function detalheTecnicoStatusOf(estadoAprovacao: string, estadoExecucao: string): string {
  const combinacao = COMBINACOES_STATUS.find(
    (c) => c.estadoAprovacao === estadoAprovacao && c.estadoExecucao === estadoExecucao,
  );
  if (combinacao) return `${combinacao.rotulo} — ${combinacao.observacao}`;
  return "Combinação não catalogada em estados_of_combinacoes_validas.";
}

export interface FiltrosOfsPcp {
  /** Etapa 58 — busca exata por id (uuid), para abrir o documento de UMA OF (ex.: /ordens/[id]). Combinável com os demais filtros, mas narra sempre para no máximo 1 linha na prática. */
  readonly ofId?: string;
  /** Prefixo de numero_of — ex. "260015" retorna 260015-0001, 260015-0002... */
  readonly numeroOf?: string;
  /** Busca parcial no nome do cliente (via projetos.cliente_id). */
  readonly cliente?: string;
  /** Rótulo(s) visuais aprovados (Etapa 49) — expandidos para pares exatos, nunca .in() cruzado. */
  readonly statusSimplificado?: readonly string[];
  /** Busca parcial na descrição do produto (itens_industriais, via produto_id). */
  readonly descricao?: string;
  readonly quantidadeMin?: number;
  readonly quantidadeMax?: number;
  /** Intervalo sobre projetos.data_objetivo, formato YYYY-MM-DD. */
  readonly entregaDe?: string;
  readonly entregaAte?: string;
}

export interface LinhaOfPcp {
  readonly ofId: string;
  readonly numeroOf: string;
  /** Etapa 58B — para o link real ao Projeto (EntityLink type="projeto"). */
  readonly projetoId: string;
  /** Etapa 58B — para o link real ao Produto (EntityLink type="item"). */
  readonly produtoId: string;
  /** Ajuste de identificadores — número comercial do projeto (projetos.numero_projeto), para exibição no lugar do UUID. */
  readonly numeroProjeto: string | null;
  /** Ajuste de identificadores — código comercial do produto (itens_industriais.codigo). A rota /produtos/[pn] usa este código, nunca o UUID. */
  readonly produtoCodigo: string | null;
  readonly cliente: string | null;
  readonly estadoAprovacao: string;
  readonly estadoExecucao: string;
  readonly descricao: string | null;
  readonly quantidadePlanejada: number;
  readonly unidade: string;
  /** projetos.data_objetivo — referência de planejamento, sempre que existir. */
  readonly dataObjetivo: string | null;
  /**
   * cenarios_comerciais_aprovados.prazo_proposto do cenário vigente=true
   * do projeto, quando existir — compromisso comercial oficial,
   * distinto de dataObjetivo (ver Etapa 46, decisão do usuário em
   * 2026-11-06). Garantidamente no máximo 1 por projeto (índice único
   * parcial cenarios_comerciais_aprovados_vigente_unico).
   */
  readonly prazoComercialVigente: string | null;
}

export interface ResultadoBuscaOfsPcp {
  readonly linhas: readonly LinhaOfPcp[];
  readonly totalRegistros: number;
  readonly pagina: number;
  readonly tamanhoPagina: number;
}

export type RespostaBuscaOfsPcp =
  | { ok: true; resultado: ResultadoBuscaOfsPcp }
  | { ok: false; motivo: "filtro_invalido"; campo: string }
  | { ok: false; motivo: "erro_desconhecido" };

const TAMANHO_PAGINA_PADRAO = 20;
const TAMANHO_PAGINA_MAXIMO = 100;
const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function logErroTecnicoOfsPcp(origem: string, erro: { message: string; code?: string; details?: string; hint?: string }): void {
  console.error(`buscarOfsPcp: falha tecnica em ${origem}`, {
    code: erro.code,
    message: erro.message,
    details: erro.details,
    hint: erro.hint,
  });
}

function dataIsoValida(valor: string): boolean {
  if (!REGEX_DATA_ISO.test(valor)) return false;
  const tempo = Date.parse(valor);
  return !Number.isNaN(tempo);
}

function vazio(pagina: number, tamanhoPagina: number): RespostaBuscaOfsPcp {
  return { ok: true, resultado: { linhas: [], totalRegistros: 0, pagina, tamanhoPagina } };
}

export async function buscarOfsPcp(
  client: SupabaseClient,
  filtros: FiltrosOfsPcp,
  pagina: number,
  tamanhoPaginaDesejado: number = TAMANHO_PAGINA_PADRAO,
): Promise<RespostaBuscaOfsPcp> {
  if (!Number.isInteger(pagina) || pagina < 1) {
    return { ok: false, motivo: "filtro_invalido", campo: "pagina" };
  }
  const tamanhoPagina = Math.min(
    Math.max(1, Number.isFinite(tamanhoPaginaDesejado) ? Math.trunc(tamanhoPaginaDesejado) : TAMANHO_PAGINA_PADRAO),
    TAMANHO_PAGINA_MAXIMO,
  );

  if (filtros.quantidadeMin !== undefined && !Number.isFinite(filtros.quantidadeMin)) {
    return { ok: false, motivo: "filtro_invalido", campo: "quantidadeMin" };
  }
  if (filtros.quantidadeMax !== undefined && !Number.isFinite(filtros.quantidadeMax)) {
    return { ok: false, motivo: "filtro_invalido", campo: "quantidadeMax" };
  }
  if (
    filtros.quantidadeMin !== undefined &&
    filtros.quantidadeMax !== undefined &&
    filtros.quantidadeMin > filtros.quantidadeMax
  ) {
    return { ok: false, motivo: "filtro_invalido", campo: "quantidade" };
  }

  if (filtros.entregaDe !== undefined && !dataIsoValida(filtros.entregaDe)) {
    return { ok: false, motivo: "filtro_invalido", campo: "entregaDe" };
  }
  if (filtros.entregaAte !== undefined && !dataIsoValida(filtros.entregaAte)) {
    return { ok: false, motivo: "filtro_invalido", campo: "entregaAte" };
  }
  if (filtros.entregaDe !== undefined && filtros.entregaAte !== undefined && filtros.entregaDe > filtros.entregaAte) {
    return { ok: false, motivo: "filtro_invalido", campo: "entrega" };
  }

  if (filtros.statusSimplificado) {
    for (const valor of filtros.statusSimplificado) {
      if (!(ROTULOS_STATUS_SIMPLIFICADO as readonly string[]).includes(valor)) {
        return { ok: false, motivo: "filtro_invalido", campo: "statusSimplificado" };
      }
    }
  }

  // Passo 1: resolver projeto_id quando houver filtro de cliente e/ou entrega.
  let projetoIds: string[] | null = null;
  if (filtros.cliente || filtros.entregaDe !== undefined || filtros.entregaAte !== undefined) {
    let consultaProjetos = client.from("projetos").select("id, cliente_id");
    if (filtros.entregaDe !== undefined) consultaProjetos = consultaProjetos.gte("data_objetivo", filtros.entregaDe);
    if (filtros.entregaAte !== undefined) consultaProjetos = consultaProjetos.lte("data_objetivo", filtros.entregaAte);

    if (filtros.cliente) {
      const termo = escaparParaIlike(filtros.cliente.trim());
      const { data: clientesRows, error: erroClientes } = await client.from("clientes").select("id").ilike("nome", `%${termo}%`);
      if (erroClientes) {
        logErroTecnicoOfsPcp("clientes", erroClientes);
        return { ok: false, motivo: "erro_desconhecido" };
      }
      const clienteIds = (clientesRows ?? []).map((linha) => linha.id as string);
      if (clienteIds.length === 0) return vazio(pagina, tamanhoPagina);
      consultaProjetos = consultaProjetos.in("cliente_id", clienteIds);
    }

    const { data: projetosRows, error: erroProjetos } = await consultaProjetos;
    if (erroProjetos) {
      logErroTecnicoOfsPcp("projetos (filtro)", erroProjetos);
      return { ok: false, motivo: "erro_desconhecido" };
    }
    projetoIds = (projetosRows ?? []).map((linha) => linha.id as string);
    if (projetoIds.length === 0) return vazio(pagina, tamanhoPagina);
  }

  // Passo 2: resolver produto_id quando houver filtro de descrição.
  let produtoIds: string[] | null = null;
  if (filtros.descricao) {
    const termo = escaparParaIlike(filtros.descricao.trim());
    const { data: itensRows, error: erroItens } = await client
      .from("itens_industriais")
      .select("id")
      .ilike("descricao", `%${termo}%`);
    if (erroItens) {
      logErroTecnicoOfsPcp("itens_industriais (filtro)", erroItens);
      return { ok: false, motivo: "erro_desconhecido" };
    }
    produtoIds = (itensRows ?? []).map((linha) => linha.id as string);
    if (produtoIds.length === 0) return vazio(pagina, tamanhoPagina);
  }

  // Passo 3: consulta principal, paginada, com contagem exata do total filtrado.
  let consultaOf = client
    .from("ordens_fabricacao")
    .select("id, numero_of, projeto_id, produto_id, estado_aprovacao, estado_execucao, quantidade_planejada, unidade", {
      count: "exact",
    });

  if (filtros.ofId) {
    consultaOf = consultaOf.eq("id", filtros.ofId);
  }
  if (filtros.numeroOf) {
    const termo = escaparParaIlike(filtros.numeroOf.trim());
    consultaOf = consultaOf.ilike("numero_of", `${termo}%`);
  }
  if (filtros.statusSimplificado?.length) {
    // Pares exatos via .or(and(...),and(...)) — nunca dois .in()
    // independentes, que combinariam as colunas livremente (ex.: filtrar
    // "Cancelada" não pode também trazer reprovada+planejada, que é
    // "Aguardando"). Os valores vêm só de GRUPOS_STATUS_SIMPLIFICADO
    // (nunca de texto livre do usuário), então a interpolação é segura.
    const pares = filtros.statusSimplificado.flatMap(
      (rotulo) => GRUPOS_STATUS_SIMPLIFICADO[rotulo as RotuloStatusSimplificado],
    );
    if (pares.length === 0) return vazio(pagina, tamanhoPagina);
    const condicao = pares
      .map((par) => `and(estado_aprovacao.eq.${par.estadoAprovacao},estado_execucao.eq.${par.estadoExecucao})`)
      .join(",");
    consultaOf = consultaOf.or(condicao);
  }
  if (filtros.quantidadeMin !== undefined) consultaOf = consultaOf.gte("quantidade_planejada", filtros.quantidadeMin);
  if (filtros.quantidadeMax !== undefined) consultaOf = consultaOf.lte("quantidade_planejada", filtros.quantidadeMax);
  if (projetoIds !== null) consultaOf = consultaOf.in("projeto_id", projetoIds);
  if (produtoIds !== null) consultaOf = consultaOf.in("produto_id", produtoIds);

  const offset = (pagina - 1) * tamanhoPagina;
  consultaOf = consultaOf.order("numero_of", { ascending: true }).range(offset, offset + tamanhoPagina - 1);

  const { data: ofRows, error: erroOf, count } = await consultaOf;
  if (erroOf) {
    logErroTecnicoOfsPcp("ordens_fabricacao", erroOf);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const linhasOf = ofRows ?? [];
  if (linhasOf.length === 0) {
    return { ok: true, resultado: { linhas: [], totalRegistros: count ?? 0, pagina, tamanhoPagina } };
  }

  // Passo 4: dados de exibição só para os IDs da página atual.
  const projetoIdsPagina = Array.from(new Set(linhasOf.map((linha) => linha.projeto_id as string)));
  const produtoIdsPagina = Array.from(new Set(linhasOf.map((linha) => linha.produto_id as string)));

  const { data: projetosDisplay, error: erroProjetosDisplay } = await client
    .from("projetos")
    .select("id, cliente_id, data_objetivo, numero_projeto")
    .in("id", projetoIdsPagina);
  if (erroProjetosDisplay) {
    logErroTecnicoOfsPcp("projetos (exibicao)", erroProjetosDisplay);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const clienteIdsPagina = Array.from(
    new Set((projetosDisplay ?? []).map((linha) => linha.cliente_id as string | null).filter((id): id is string => id !== null)),
  );
  const { data: clientesDisplay, error: erroClientesDisplay } =
    clienteIdsPagina.length > 0
      ? await client.from("clientes").select("id, nome").in("id", clienteIdsPagina)
      : { data: [], error: null };
  if (erroClientesDisplay) {
    logErroTecnicoOfsPcp("clientes (exibicao)", erroClientesDisplay);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const { data: itensDisplay, error: erroItensDisplay } = await client
    .from("itens_industriais")
    .select("id, descricao, codigo")
    .in("id", produtoIdsPagina);
  if (erroItensDisplay) {
    logErroTecnicoOfsPcp("itens_industriais (exibicao)", erroItensDisplay);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const { data: cenariosDisplay, error: erroCenariosDisplay } = await client
    .from("cenarios_comerciais_aprovados")
    .select("projeto_id, prazo_proposto")
    .eq("vigente", true)
    .in("projeto_id", projetoIdsPagina);
  if (erroCenariosDisplay) {
    logErroTecnicoOfsPcp("cenarios_comerciais_aprovados (exibicao)", erroCenariosDisplay);
    return { ok: false, motivo: "erro_desconhecido" };
  }

  const projetoPorId = new Map((projetosDisplay ?? []).map((linha) => [linha.id as string, linha]));
  const nomeClientePorId = new Map((clientesDisplay ?? []).map((linha) => [linha.id as string, linha.nome as string]));
  const descricaoPorProdutoId = new Map((itensDisplay ?? []).map((linha) => [linha.id as string, linha.descricao as string]));
  const codigoPorProdutoId = new Map(
    (itensDisplay ?? []).map((linha) => [linha.id as string, (linha.codigo as string | null) ?? null]),
  );
  const prazoVigentePorProjetoId = new Map(
    (cenariosDisplay ?? []).map((linha) => [linha.projeto_id as string, linha.prazo_proposto as string]),
  );

  const linhas: LinhaOfPcp[] = linhasOf.map((of) => {
    const projeto = projetoPorId.get(of.projeto_id as string);
    const clienteNome = projeto ? nomeClientePorId.get(projeto.cliente_id as string) ?? null : null;
    return {
      ofId: of.id as string,
      numeroOf: of.numero_of as string,
      projetoId: of.projeto_id as string,
      produtoId: of.produto_id as string,
      numeroProjeto: projeto ? ((projeto.numero_projeto as string | null) ?? null) : null,
      produtoCodigo: codigoPorProdutoId.get(of.produto_id as string) ?? null,
      cliente: clienteNome,
      estadoAprovacao: of.estado_aprovacao as string,
      estadoExecucao: of.estado_execucao as string,
      descricao: descricaoPorProdutoId.get(of.produto_id as string) ?? null,
      quantidadePlanejada: of.quantidade_planejada as number,
      unidade: of.unidade as string,
      dataObjetivo: projeto ? ((projeto.data_objetivo as string | null) ?? null) : null,
      prazoComercialVigente: prazoVigentePorProjetoId.get(of.projeto_id as string) ?? null,
    };
  });

  return { ok: true, resultado: { linhas, totalRegistros: count ?? 0, pagina, tamanhoPagina } };
}
