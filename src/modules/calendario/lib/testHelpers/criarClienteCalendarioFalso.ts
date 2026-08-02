// Client Supabase falso, só para testes automatizados do calendário
// operacional (resolverDiaProdutivo/contarDiasProdutivosNaJanela/
// deslocarDiasProdutivos/carregarContextoCalendario). Não é um mock de
// biblioteca externa: reimplementa só a fatia de
// `.from().select().eq()/.gte()/.lte()...` que esses módulos usam,
// apoiada numa "base" em memória — permite testar a regra real de
// precedência do calendário (Operacional -> Oficial -> Eventos) sem banco.
//
// Suporta filtros de igualdade (`.eq`) E de faixa (`.gte`/`.lte`) na
// coluna `data`, porque carregarContextoCalendario (correção de
// performance/N+1) busca feriados/eventos de um INTERVALO de datas de uma
// vez, não mais um dia por consulta.
import type { SupabaseClient } from "@supabase/supabase-js";

export type FixtureCalendario = {
  empresaId: string;
  /** Padrão semanal (Calendário Operacional da Empresa, seção 7.2). */
  padraoSemanal: {
    segunda: boolean;
    terca: boolean;
    quarta: boolean;
    quinta: boolean;
    sexta: boolean;
    sabado: boolean;
    domingo: boolean;
  };
  /** Localização da empresa, para filtrar o Calendário Oficial (seção 7.1). */
  empresa?: {
    pais_codigo: string | null;
    uf_codigo: string | null;
    municipio_codigo: string | null;
  };
  /**
   * Feriados oficiais aplicáveis (seção 7.1). `id` é opcional aqui só
   * para não obrigar toda fixture existente a informar um - quando
   * ausente, um id determinístico é derivado de
   * (data, abrangencia, uf_codigo, municipio_codigo), que é exatamente a
   * constraint UNIQUE real da tabela (calendario_oficial_feriados_unico)
   * - continua garantidamente único por linha.
   */
  feriados?: Array<{
    id?: string;
    data: string;
    abrangencia: "nacional" | "estadual" | "municipal";
    pais_codigo: string;
    uf_codigo: string | null;
    municipio_codigo: string | null;
    descricao: string;
  }>;
  /** Exceções pontuais da empresa (seção 7.3). */
  eventos?: Array<{
    id: string;
    data: string;
    tipo:
      | "dia_trabalhado_excepcional"
      | "recesso_coletivo"
      | "inventario"
      | "paralisacao"
      | "feriado_local_temporario";
  }>;
};

type Filtros = Record<string, unknown>;
type Faixas = Record<string, { gte?: unknown; lte?: unknown }>;

/** Contagem de consultas por tabela - usada pelos testes que provam que o
 * número de chamadas ao Supabase é constante, não proporcional aos dias. */
export type ContadorConsultas = {
  porTabela: Record<string, number>;
  total: () => number;
};

function dentroDaFaixa(valor: unknown, faixa: { gte?: unknown; lte?: unknown } | undefined): boolean {
  if (!faixa) return true;
  if (faixa.gte !== undefined && (valor as string) < (faixa.gte as string)) return false;
  if (faixa.lte !== undefined && (valor as string) > (faixa.lte as string)) return false;
  return true;
}

function resolverLinha(
  tabela: string,
  fixture: FixtureCalendario,
  filtros: Filtros,
  faixas: Faixas,
): unknown {
  switch (tabela) {
    case "calendario_operacional_empresa":
      if (filtros.empresa_id !== fixture.empresaId) return null;
      return fixture.padraoSemanal;

    case "empresas":
      if (filtros.id !== fixture.empresaId) return null;
      return fixture.empresa ?? { pais_codigo: null, uf_codigo: null, municipio_codigo: null };

    case "calendario_oficial_feriados":
      return (fixture.feriados ?? [])
        .filter((feriado) => {
          if (filtros.pais_codigo !== undefined && feriado.pais_codigo !== filtros.pais_codigo) {
            return false;
          }
          if (filtros.data !== undefined && feriado.data !== filtros.data) {
            return false;
          }
          return dentroDaFaixa(feriado.data, faixas.data);
        })
        .map((feriado) => ({
          ...feriado,
          id: feriado.id ?? `${feriado.data}|${feriado.abrangencia}|${feriado.uf_codigo}|${feriado.municipio_codigo}`,
        }));

    case "calendario_empresa_eventos":
      return (fixture.eventos ?? [])
        .filter((evento) => {
          if (filtros.empresa_id !== fixture.empresaId) return false;
          if (filtros.data !== undefined && evento.data !== filtros.data) return false;
          return dentroDaFaixa(evento.data, faixas.data);
        })
        .map((evento) => ({ id: evento.id, tipo: evento.tipo, data: evento.data }));

    default:
      throw new Error(`Tabela não suportada no cliente falso de teste: ${tabela}`);
  }
}

type ColunaOrdenacao = { coluna: string; ascending: boolean };

/**
 * Comparador genérico por string - suficiente para `data` (ISO,
 * ordenação lexicográfica = cronológica) e `id` (UUID, só precisa ser UMA
 * ordem total válida e estável, não precisa replicar a ordenação exata
 * de índice do Postgres). O que este cliente falso precisa provar é que,
 * dada uma `.order()` com colunas suficientes para formar uma chave
 * única, a paginação nunca omite nem duplica linha - não que a ordem
 * batha byte a byte com a do Postgres real.
 */
function compararPorColunas(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  colunas: ColunaOrdenacao[],
): number {
  for (const { coluna, ascending } of colunas) {
    const valorA = String(a[coluna] ?? "");
    const valorB = String(b[coluna] ?? "");
    if (valorA < valorB) return ascending ? -1 : 1;
    if (valorA > valorB) return ascending ? 1 : -1;
  }
  return 0;
}

function criarQueryBuilder(
  tabela: string,
  fixture: FixtureCalendario,
  registrarConsulta: (tabela: string) => void,
) {
  const filtros: Filtros = {};
  const faixas: Faixas = {};
  const ordenacao: ColunaOrdenacao[] = [];
  let paginacao: { inicio: number; fim: number } | null = null;

  const builder = {
    select() {
      return builder;
    },
    eq(coluna: string, valor: unknown) {
      filtros[coluna] = valor;
      return builder;
    },
    gte(coluna: string, valor: unknown) {
      faixas[coluna] = { ...(faixas[coluna] ?? {}), gte: valor };
      return builder;
    },
    lte(coluna: string, valor: unknown) {
      faixas[coluna] = { ...(faixas[coluna] ?? {}), lte: valor };
      return builder;
    },
    // Simula o `.range()` do supabase-js (paginação defensiva contra o
    // teto de linhas do PostgREST/db.max_rows) - offsets inclusive, igual
    // ao real.
    range(inicio: number, fim: number) {
      paginacao = { inicio, fim };
      return builder;
    },
    is() {
      return builder;
    },
    // Diferente do stub anterior (no-op): ordena de verdade, porque os
    // testes de paginação precisam provar que o resultado final não
    // depende da ordem em que a fixture forneceu as linhas, e que
    // `.range()` sem `.order()` correspondente seria o bug que esta
    // correção existe para evitar.
    order(coluna: string, opcoes?: { ascending?: boolean }) {
      ordenacao.push({ coluna, ascending: opcoes?.ascending ?? true });
      return builder;
    },
    async maybeSingle() {
      registrarConsulta(tabela);
      const resultado = resolverLinha(tabela, fixture, filtros, faixas);
      const linha = Array.isArray(resultado) ? (resultado[0] ?? null) : resultado;
      return { data: linha, error: null };
    },
    // Query builders do supabase-js são "thenable": awaitar direto (sem
    // .maybeSingle()) resolve para { data: array, error }.
    then(resolve: (valor: { data: unknown; error: null }) => void) {
      registrarConsulta(tabela);
      const resultado = resolverLinha(tabela, fixture, filtros, faixas);
      let linhas = Array.isArray(resultado) ? resultado : resultado === null ? [] : [resultado];

      if (ordenacao.length > 0) {
        linhas = [...(linhas as Record<string, unknown>[])].sort((a, b) =>
          compararPorColunas(a, b, ordenacao),
        );
      }

      if (paginacao) {
        linhas = linhas.slice(paginacao.inicio, paginacao.fim + 1);
      }

      resolve({ data: linhas, error: null });
    },
  };

  return builder;
}

export function criarClienteCalendarioFalso(fixture: FixtureCalendario): SupabaseClient {
  return {
    from(tabela: string) {
      return criarQueryBuilder(tabela, fixture, () => {});
    },
  } as unknown as SupabaseClient;
}

/**
 * Mesma base do cliente falso acima, mas contando quantas consultas cada
 * tabela recebeu - usado pelos testes que provam que
 * deslocarDiasProdutivos/prepararJanelaComercial fazem um número
 * CONSTANTE de consultas (não proporcional à distância em dias entre as
 * datas), depois da correção do N+1.
 */
export function criarClienteCalendarioFalsoComContagem(fixture: FixtureCalendario): {
  client: SupabaseClient;
  contador: ContadorConsultas;
} {
  const porTabela: Record<string, number> = {};

  const contador: ContadorConsultas = {
    porTabela,
    total: () => Object.values(porTabela).reduce((soma, valor) => soma + valor, 0),
  };

  function registrarConsulta(tabela: string) {
    porTabela[tabela] = (porTabela[tabela] ?? 0) + 1;
  }

  const client = {
    from(tabela: string) {
      return criarQueryBuilder(tabela, fixture, registrarConsulta);
    },
  } as unknown as SupabaseClient;

  return { client, contador };
}
