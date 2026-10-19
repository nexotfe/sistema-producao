// Client Supabase falso, só para testes automatizados de
// montarEntradaMotorPcp.ts (PCP-P8D.1) - mesma filosofia de
// criarClienteCalendarioFalso.ts (reimplementa só a fatia de
// `.from().select().eq()/.in()/.gte()/.lte()/.order()/.range()/.is()`
// e `.rpc()` realmente usada, apoiada numa fixture em memória, sem
// mock de biblioteca externa nem banco real).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FixturePcp {
  // tabelas reais, cada uma como array de linhas em memória
  usuarios: { id: string; empresa_id: string }[];
  pcp_fila_projetos: { empresa_id: string; projeto_id: string; posicao: number }[];
  ordens_fabricacao: {
    id: string;
    empresa_id: string;
    projeto_id: string;
    quantidade_planejada: number;
    estado_aprovacao: string;
    estado_execucao: string;
  }[];
  ordens_fabricacao_operacoes: {
    id: string;
    of_id: string;
    nao_aplicavel: boolean;
    bom_operacao_id: string | null;
    recurso_vigente_id: string | null;
    tempo_vigente_minutos: number | null;
    tempo_restante_estimado_minutos: number | null;
    recurso_restante_estimado_id: string | null;
  }[];
  of_operacao_dependencias: { op_origem_id: string; op_dependente_id: string }[];
  recurso_produtivo_compatibilidades: {
    recurso_origem_id: string;
    recurso_destino_id: string;
    prioridade: number;
    ativo: boolean;
    deleted_at: string | null;
  }[];
  recursos_produtivos: { id: string; capacidade_horas_dia: number }[];
  // calendário - mesma forma de FixtureCalendario, simplificada (produtivo todo dia por padrão)
  calendario_operacional_empresa: { empresa_id: string; segunda: boolean; terca: boolean; quarta: boolean; quinta: boolean; sexta: boolean; sabado: boolean; domingo: boolean }[];
  empresas: { id: string; pais_codigo: string | null; uf_codigo: string | null; municipio_codigo: string | null }[];
  calendario_oficial_feriados: { id: string; data: string; abrangencia: string; pais_codigo: string; uf_codigo: string | null; municipio_codigo: string | null; descricao: string }[];
  calendario_empresa_eventos: { id: string; empresa_id: string; data: string; tipo: string; ativo: boolean; deleted_at: string | null }[];
  // RPCs
  opResolvida: Record<string, boolean>;
  eventosEfetivosPorOp: Record<string, { tipo_evento: string }[]>;
  produtividadePorRecurso: Record<string, number>;
}

export function fixturePcpVazia(): FixturePcp {
  return {
    usuarios: [],
    pcp_fila_projetos: [],
    ordens_fabricacao: [],
    ordens_fabricacao_operacoes: [],
    of_operacao_dependencias: [],
    recurso_produtivo_compatibilidades: [],
    recursos_produtivos: [],
    calendario_operacional_empresa: [],
    empresas: [],
    calendario_oficial_feriados: [],
    calendario_empresa_eventos: [],
    opResolvida: {},
    eventosEfetivosPorOp: {},
    produtividadePorRecurso: {},
  };
}

type Filtros = { eq: Record<string, unknown>; in: Record<string, unknown[]>; faixas: Record<string, { gte?: unknown; lte?: unknown }> };

function linhaPassaFiltros(linha: Record<string, unknown>, filtros: Filtros): boolean {
  for (const [coluna, valor] of Object.entries(filtros.eq)) {
    if (linha[coluna] !== valor) return false;
  }
  for (const [coluna, valores] of Object.entries(filtros.in)) {
    if (!valores.includes(linha[coluna])) return false;
  }
  for (const [coluna, faixa] of Object.entries(filtros.faixas)) {
    const valor = linha[coluna] as string;
    if (faixa.gte !== undefined && valor < (faixa.gte as string)) return false;
    if (faixa.lte !== undefined && valor > (faixa.lte as string)) return false;
  }
  return true;
}

function criarQueryBuilder(tabela: string, fixture: FixturePcp) {
  const filtros: Filtros = { eq: {}, in: {}, faixas: {} };
  let paginacao: { inicio: number; fim: number } | null = null;

  const builder = {
    select() {
      return builder;
    },
    eq(coluna: string, valor: unknown) {
      filtros.eq[coluna] = valor;
      return builder;
    },
    in(coluna: string, valores: unknown[]) {
      filtros.in[coluna] = valores;
      return builder;
    },
    gte(coluna: string, valor: unknown) {
      filtros.faixas[coluna] = { ...(filtros.faixas[coluna] ?? {}), gte: valor };
      return builder;
    },
    lte(coluna: string, valor: unknown) {
      filtros.faixas[coluna] = { ...(filtros.faixas[coluna] ?? {}), lte: valor };
      return builder;
    },
    is() {
      return builder;
    },
    order() {
      return builder;
    },
    range(inicio: number, fim: number) {
      paginacao = { inicio, fim };
      return builder;
    },
    async maybeSingle() {
      const linhas = ((fixture as unknown as Record<string, Record<string, unknown>[]>)[tabela] ?? []).filter((l) =>
        linhaPassaFiltros(l, filtros),
      );
      return { data: linhas[0] ?? null, error: null };
    },
    then(resolve: (valor: { data: unknown; error: null }) => void) {
      let linhas = ((fixture as unknown as Record<string, Record<string, unknown>[]>)[tabela] ?? []).filter((l) =>
        linhaPassaFiltros(l, filtros),
      );
      if (paginacao) linhas = linhas.slice(paginacao.inicio, paginacao.fim + 1);
      resolve({ data: linhas, error: null });
      return Promise.resolve();
    },
  };

  return builder;
}

export function criarClientePcpFalso(fixture: FixturePcp): SupabaseClient {
  return {
    from(tabela: string) {
      return criarQueryBuilder(tabela, fixture);
    },
    rpc(nome: string, params: Record<string, unknown>) {
      if (nome === "op_esta_resolvida") {
        const opId = params.p_op_id as string;
        return Promise.resolve({ data: fixture.opResolvida[opId] ?? false, error: null });
      }
      if (nome === "of_apontamentos_efetivos") {
        const opId = params.p_op_id as string;
        return Promise.resolve({ data: fixture.eventosEfetivosPorOp[opId] ?? [], error: null });
      }
      if (nome === "calcular_produtividade_efetiva") {
        const recursoId = params.p_recurso_id as string;
        return Promise.resolve({ data: fixture.produtividadePorRecurso[recursoId] ?? null, error: null });
      }
      if (nome === "carregar_estado_motor_pcp") {
        const solicitadoPor = params.p_solicitado_por as string;
        const usuario = fixture.usuarios.find((u) => u.id === solicitadoPor);
        if (!usuario) {
          return Promise.resolve({ data: null, error: { message: `carregar_estado_motor_pcp: solicitado_por ${solicitadoPor} nao e um usuario valido.` } });
        }
        const empresaId = usuario.empresa_id;

        const fila = fixture.pcp_fila_projetos.filter((f) => f.empresa_id === empresaId);
        const projetosNaFila = new Set(fila.map((f) => f.projeto_id));
        const ofs = fixture.ordens_fabricacao.filter((of) => of.empresa_id === empresaId && projetosNaFila.has(of.projeto_id));
        const idsOfs = new Set(ofs.map((of) => of.id));
        const ops = fixture.ordens_fabricacao_operacoes
          .filter((op) => idsOfs.has(op.of_id))
          .map((op) => ({
            ...op,
            resolvida: fixture.opResolvida[op.id] ?? false,
            tem_inicio_real: (fixture.eventosEfetivosPorOp[op.id] ?? []).some(
              (e) => e.tipo_evento === "iniciar" || e.tipo_evento === "retomar",
            ),
          }));
        const idsOps = new Set(ops.map((op) => op.id));
        const dependencias = fixture.of_operacao_dependencias.filter((d) => idsOps.has(d.op_origem_id));

        return Promise.resolve({
          data: {
            fila: fila.map((f) => ({ projeto_id: f.projeto_id, posicao: f.posicao })),
            ofs: ofs.map((of) => ({
              id: of.id,
              projeto_id: of.projeto_id,
              quantidade_planejada: of.quantidade_planejada,
              estado_aprovacao: of.estado_aprovacao,
              estado_execucao: of.estado_execucao,
            })),
            ops: ops.map((op) => ({
              id: op.id,
              of_id: op.of_id,
              nao_aplicavel: op.nao_aplicavel,
              recurso_vigente_id: op.recurso_vigente_id,
              tempo_vigente_minutos: op.tempo_vigente_minutos,
              tempo_restante_estimado_minutos: op.tempo_restante_estimado_minutos,
              recurso_restante_estimado_id: op.recurso_restante_estimado_id,
              resolvida: op.resolvida,
              tem_inicio_real: op.tem_inicio_real,
            })),
            dependencias,
          },
          error: null,
        });
      }
      throw new Error(`RPC não suportada no cliente falso de teste: ${nome}`);
    },
  } as unknown as SupabaseClient;
}
