// Etapa 46: testes locais de buscarOfsPcp com um client Supabase falso
// (só a fatia .from().select().ilike()/.eq()/.in()/.gte()/.lte()/.order()/
// .range() de fato usada) - nunca escreve, nunca chama service_role.
//
// Isolamento entre empresas (item 12 da seção 10) NÃO é testado aqui por
// fixture: esta função não reimplementa filtro de empresa_id nenhum, ela
// depende inteiramente da RLS real das 5 tabelas tocadas (confirmada por
// leitura direta do catálogo do Postgres na investigação da Etapa 45/46
// - todas com policy "empresa_id = empresa_atual_id()"). Um client falso
// não simula RLS, então um teste aqui daria falsa confiança; a evidência
// real de isolamento é a policy no banco, não um mock.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarOfsPcp } from "./buscarOfsPcp";

type Linha = Record<string, unknown>;
type Fixtures = Record<string, Linha[]>;

function criarClienteFalso(fixturesIniciais: Fixtures, capturarSelect?: (tabela: string, colunas: string) => void): SupabaseClient {
  function builder(tabela: string) {
    let linhas = (fixturesIniciais[tabela] ?? []).slice();
    let contarExato = false;
    let ordemColuna: string | null = null;
    let ordemAsc = true;
    let rangeFrom: number | null = null;
    let rangeTo: number | null = null;

    function ilikeCombina(valor: string, padrao: string): boolean {
      const comecaPct = padrao.startsWith("%");
      const terminaPct = padrao.endsWith("%");
      const nucleo = padrao.replace(/^%/, "").replace(/%$/, "").toLowerCase();
      const v = valor.toLowerCase();
      if (comecaPct && terminaPct) return v.includes(nucleo);
      if (terminaPct) return v.startsWith(nucleo);
      if (comecaPct) return v.endsWith(nucleo);
      return v === nucleo;
    }

    const api = {
      select(cols: string, opts?: { count?: string }) {
        capturarSelect?.(tabela, cols);
        if (opts?.count === "exact") contarExato = true;
        return api;
      },
      ilike(coluna: string, padrao: string) {
        linhas = linhas.filter((l) => ilikeCombina(String(l[coluna] ?? ""), padrao));
        return api;
      },
      eq(coluna: string, valor: unknown) {
        linhas = linhas.filter((l) => l[coluna] === valor);
        return api;
      },
      in(coluna: string, valores: unknown[]) {
        linhas = linhas.filter((l) => valores.includes(l[coluna]));
        return api;
      },
      gte(coluna: string, valor: unknown) {
        linhas = linhas.filter((l) => (l[coluna] as string | number) >= (valor as string | number));
        return api;
      },
      lte(coluna: string, valor: unknown) {
        linhas = linhas.filter((l) => (l[coluna] as string | number) <= (valor as string | number));
        return api;
      },
      // Suporte mínimo ao subconjunto real usado por buscarOfsPcp:
      // só "and(col.eq.v,col.eq.v),and(...)"  (pares exatos de status
      // simplificado) - não é um parser geral de sintaxe PostgREST.
      or(condicao: string) {
        const grupos = condicao.split("),and(").map((g) => g.replace(/^and\(/, "").replace(/\)$/, ""));
        linhas = linhas.filter((l) =>
          grupos.some((grupo) =>
            grupo.split(",").every((parte) => {
              const [coluna, , valor] = parte.split(".");
              return l[coluna] === valor;
            }),
          ),
        );
        return api;
      },
      order(coluna: string, opts?: { ascending?: boolean }) {
        ordemColuna = coluna;
        ordemAsc = opts?.ascending ?? true;
        return api;
      },
      range(from: number, to: number) {
        rangeFrom = from;
        rangeTo = to;
        return api;
      },
      then(resolve: (valor: { data: unknown; error: null; count: number | null }) => void) {
        let resultado = linhas.slice();
        if (ordemColuna) {
          const col = ordemColuna;
          resultado = resultado.slice().sort((a, b) => {
            const av = a[col] as string | number;
            const bv = b[col] as string | number;
            if (av === bv) return 0;
            return av < bv ? -1 : 1;
          });
          if (!ordemAsc) resultado.reverse();
        }
        const total = resultado.length;
        if (rangeFrom !== null && rangeTo !== null) {
          resultado = resultado.slice(rangeFrom, rangeTo + 1);
        }
        resolve({ data: resultado, error: null, count: contarExato ? total : null });
      },
    };
    return api;
  }
  return { from: builder } as unknown as SupabaseClient;
}

const CLIENTE_A = { id: "cli-a", nome: "Metalúrgica Vale do Aço" };
const CLIENTE_B = { id: "cli-b", nome: "Industrial Nordeste" };
const PROJETO_1 = { id: "proj-260015", cliente_id: "cli-a", data_objetivo: "2026-12-10", numero_projeto: "260015" };
const PROJETO_2 = { id: "proj-260020", cliente_id: "cli-b", data_objetivo: "2026-11-20", numero_projeto: "260020" };
const PRODUTO_FLANGE = { id: "prod-flange", descricao: "Flange de acoplamento", codigo: "FLG-001" };
const PRODUTO_EIXO = { id: "prod-eixo", descricao: "Eixo usinado", codigo: null };

const FIXTURES_BASE: Fixtures = {
  clientes: [CLIENTE_A, CLIENTE_B],
  projetos: [PROJETO_1, PROJETO_2],
  itens_industriais: [PRODUTO_FLANGE, PRODUTO_EIXO],
  cenarios_comerciais_aprovados: [{ projeto_id: "proj-260015", prazo_proposto: "2026-12-05", vigente: true }],
  ordens_fabricacao: [
    {
      id: "of-1",
      numero_of: "260015-0001",
      projeto_id: "proj-260015",
      produto_id: "prod-flange",
      estado_aprovacao: "aprovada",
      estado_execucao: "liberada",
      quantidade_planejada: 12,
      unidade: "un",
    },
    {
      id: "of-2",
      numero_of: "260015-0002",
      projeto_id: "proj-260015",
      produto_id: "prod-flange",
      estado_aprovacao: "aprovada",
      estado_execucao: "em_producao",
      quantidade_planejada: 8,
      unidade: "un",
    },
    {
      id: "of-3",
      numero_of: "260015-0003",
      projeto_id: "proj-260015",
      produto_id: "prod-eixo",
      estado_aprovacao: "aguardando_auditoria",
      estado_execucao: "planejada",
      quantidade_planejada: 20,
      unidade: "un",
    },
    {
      id: "of-4",
      numero_of: "260020-0001",
      projeto_id: "proj-260020",
      produto_id: "prod-eixo",
      estado_aprovacao: "aprovada",
      estado_execucao: "concluida",
      quantidade_planejada: 5,
      unidade: "un",
    },
  ],
};

describe("buscarOfsPcp", () => {
  it("1. lista sem registros: retorna vazio, sem erro, quando a empresa não tem nenhuma OF", async () => {
    const client = criarClienteFalso({ clientes: [], projetos: [], itens_industriais: [], cenarios_comerciais_aprovados: [], ordens_fabricacao: [] });
    const resultado = await buscarOfsPcp(client, {}, 1);
    expect(resultado).toEqual({ ok: true, resultado: { linhas: [], totalRegistros: 0, pagina: 1, tamanhoPagina: 20 } });
  });

  it("1b. Etapa 58 — busca exata por ofId (abrir o documento de uma OF)", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { ofId: "of-2" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas.map((l) => l.numeroOf)).toEqual(["260015-0002"]);
      expect(resultado.resultado.totalRegistros).toBe(1);
    }
  });

  it("1c. Ajuste de identificadores — numeroProjeto e produtoCodigo vêm junto da linha", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { ofId: "of-2" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const [linha] = resultado.resultado.linhas;
      expect(linha.projetoId).toBe("proj-260015");
      expect(linha.numeroProjeto).toBe("260015");
      expect(linha.produtoId).toBe("prod-flange");
      expect(linha.produtoCodigo).toBe("FLG-001");
    }
  });

  it("1d. Ajuste de identificadores — produtoCodigo null quando o item não tem código cadastrado", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { ofId: "of-3" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const [linha] = resultado.resultado.linhas;
      expect(linha.produtoId).toBe("prod-eixo");
      expect(linha.produtoCodigo).toBeNull();
    }
  });

  it("2. OF específica por número exato", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { numeroOf: "260015-0002" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas.map((l) => l.numeroOf)).toEqual(["260015-0002"]);
      expect(resultado.resultado.totalRegistros).toBe(1);
    }
  });

  it("3. todas as OFs de um projeto pelo prefixo do número", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { numeroOf: "260015" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas.map((l) => l.numeroOf)).toEqual(["260015-0001", "260015-0002", "260015-0003"]);
      expect(resultado.resultado.totalRegistros).toBe(3);
    }
  });

  it("4. filtro por cliente, mesmo pertencendo a projetos diferentes", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { cliente: "Nordeste" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas.map((l) => l.numeroOf)).toEqual(["260020-0001"]);
      expect(resultado.resultado.linhas[0].cliente).toBe("Industrial Nordeste");
    }
  });

  it("5. filtro por status simplificado (Em produção)", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { statusSimplificado: ["Em produção"] }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas.map((l) => l.numeroOf)).toEqual(["260015-0002"]);
    }
  });

  it("5b. Cancelada não traz reprovada+planejada (que é Aguardando, não cancelamento formal)", async () => {
    const fixtures: Fixtures = {
      ...FIXTURES_BASE,
      ordens_fabricacao: [
        ...FIXTURES_BASE.ordens_fabricacao,
        {
          id: "of-reprovada",
          numero_of: "260015-0004",
          projeto_id: "proj-260015",
          produto_id: "prod-flange",
          estado_aprovacao: "reprovada",
          estado_execucao: "planejada",
          quantidade_planejada: 3,
          unidade: "un",
        },
        {
          id: "of-cancelada-real",
          numero_of: "260015-0005",
          projeto_id: "proj-260015",
          produto_id: "prod-flange",
          estado_aprovacao: "cancelada",
          estado_execucao: "planejada",
          quantidade_planejada: 3,
          unidade: "un",
        },
      ],
    };
    const client = criarClienteFalso(fixtures);
    const resultado = await buscarOfsPcp(client, { statusSimplificado: ["Cancelada"] }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      // of-cancelada-real (aprovação formalmente cancelada) entra; a
      // reprovada+planejada (of-reprovada, nunca formalmente cancelada) não.
      expect(resultado.resultado.linhas.map((l) => l.numeroOf)).toEqual(["260015-0005"]);
    }
  });

  it("5c. Aguardando inclui reprovada+planejada e aprovada+suspensa, nunca Cancelada", async () => {
    const fixtures: Fixtures = {
      ...FIXTURES_BASE,
      ordens_fabricacao: [
        {
          id: "of-reprovada",
          numero_of: "260015-0004",
          projeto_id: "proj-260015",
          produto_id: "prod-flange",
          estado_aprovacao: "reprovada",
          estado_execucao: "planejada",
          quantidade_planejada: 3,
          unidade: "un",
        },
        {
          id: "of-suspensa",
          numero_of: "260015-0006",
          projeto_id: "proj-260015",
          produto_id: "prod-flange",
          estado_aprovacao: "aprovada",
          estado_execucao: "suspensa",
          quantidade_planejada: 3,
          unidade: "un",
        },
      ],
    };
    const client = criarClienteFalso(fixtures);
    const resultado = await buscarOfsPcp(client, { statusSimplificado: ["Aguardando"] }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas.map((l) => l.numeroOf).sort()).toEqual(["260015-0004", "260015-0006"]);
    }
  });

  it("5d. Desdobrada cobre as 3 combinações administrativas possíveis", async () => {
    const fixtures: Fixtures = {
      ...FIXTURES_BASE,
      ordens_fabricacao: [
        {
          id: "of-d1",
          numero_of: "260015-0007",
          projeto_id: "proj-260015",
          produto_id: "prod-flange",
          estado_aprovacao: "aguardando_auditoria",
          estado_execucao: "desdobrada",
          quantidade_planejada: 3,
          unidade: "un",
        },
        {
          id: "of-d2",
          numero_of: "260015-0008",
          projeto_id: "proj-260015",
          produto_id: "prod-flange",
          estado_aprovacao: "aprovada",
          estado_execucao: "desdobrada",
          quantidade_planejada: 3,
          unidade: "un",
        },
        {
          id: "of-d3",
          numero_of: "260015-0009",
          projeto_id: "proj-260015",
          produto_id: "prod-flange",
          estado_aprovacao: "cancelada",
          estado_execucao: "desdobrada",
          quantidade_planejada: 3,
          unidade: "un",
        },
      ],
    };
    const client = criarClienteFalso(fixtures);
    const resultado = await buscarOfsPcp(client, { statusSimplificado: ["Desdobrada"] }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas.map((l) => l.numeroOf).sort()).toEqual(["260015-0007", "260015-0008", "260015-0009"]);
    }
  });

  it("5e. os 15 pares reais aparecem exatamente uma vez em GRUPOS_STATUS_SIMPLIFICADO", async () => {
    const { GRUPOS_STATUS_SIMPLIFICADO } = await import("./buscarOfsPcp");
    const todosPares = Object.values(GRUPOS_STATUS_SIMPLIFICADO).flat();
    expect(todosPares).toHaveLength(15);
    const chaves = todosPares.map((p) => `${p.estadoAprovacao}|${p.estadoExecucao}`);
    expect(new Set(chaves).size).toBe(15);
  });

  it("6. filtro por descrição (texto parcial no produto)", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { descricao: "eixo" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas.map((l) => l.numeroOf).sort()).toEqual(["260015-0003", "260020-0001"]);
    }
  });

  it("7. filtro por quantidade (intervalo numérico)", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { quantidadeMin: 10, quantidadeMax: 15 }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas.map((l) => l.numeroOf)).toEqual(["260015-0001"]);
    }
  });

  it("8. filtro por data de entrega (intervalo sobre projetos.data_objetivo)", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { entregaDe: "2026-12-01", entregaAte: "2026-12-31" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas.map((l) => l.numeroOf).sort()).toEqual(["260015-0001", "260015-0002", "260015-0003"]);
    }
  });

  it("9. combinação de filtros (cliente + status simplificado + quantidade)", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(
      client,
      { cliente: "Vale do Aço", statusSimplificado: ["Em produção"], quantidadeMin: 5, quantidadeMax: 10 },
      1,
    );
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas.map((l) => l.numeroOf)).toEqual(["260015-0002"]);
    }
  });

  it("10. paginação em múltiplas páginas, com contagem total correta", async () => {
    const muitasOfs = Array.from({ length: 25 }, (_, i) => ({
      id: `of-vol-${i}`,
      numero_of: `999990-${String(i + 1).padStart(4, "0")}`,
      projeto_id: "proj-260015",
      produto_id: "prod-flange",
      estado_aprovacao: "aprovada",
      estado_execucao: "liberada",
      quantidade_planejada: 1,
      unidade: "un",
    }));
    const client = criarClienteFalso({ ...FIXTURES_BASE, ordens_fabricacao: muitasOfs });

    const pagina1 = await buscarOfsPcp(client, {}, 1, 10);
    const pagina2 = await buscarOfsPcp(client, {}, 2, 10);
    const pagina3 = await buscarOfsPcp(client, {}, 3, 10);

    expect(pagina1.ok && pagina1.resultado.linhas).toHaveLength(10);
    expect(pagina2.ok && pagina2.resultado.linhas).toHaveLength(10);
    expect(pagina3.ok && pagina3.resultado.linhas).toHaveLength(5);
    expect(pagina1.ok && pagina1.resultado.totalRegistros).toBe(25);
    expect(pagina3.ok && pagina3.resultado.totalRegistros).toBe(25);
  });

  it("11. ordenação estável e determinística por numero_of", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, {}, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas.map((l) => l.numeroOf)).toEqual([
        "260015-0001",
        "260015-0002",
        "260015-0003",
        "260020-0001",
      ]);
    }
  });

  it("13. ausência de duplicações mesmo com cenário comercial vigente presente", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { numeroOf: "260015" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      const ids = resultado.resultado.linhas.map((l) => l.ofId);
      expect(new Set(ids).size).toBe(ids.length);
      const linha1 = resultado.resultado.linhas.find((l) => l.numeroOf === "260015-0001");
      expect(linha1?.prazoComercialVigente).toBe("2026-12-05");
      expect(linha1?.dataObjetivo).toBe("2026-12-10");
    }
  });

  it("13b. observacao_pcp entra no select de ordens_fabricacao (Controle de OFs, migration 20261110090000)", async () => {
    const colunasPorTabela: Record<string, string> = {};
    const client = criarClienteFalso(FIXTURES_BASE, (tabela, colunas) => {
      colunasPorTabela[tabela] = colunas;
    });
    await buscarOfsPcp(client, {}, 1);
    expect(colunasPorTabela.ordens_fabricacao).toContain("observacao_pcp");
  });

  it("13c. observacao_pcp preenchida é mapeada para observacaoPcp na linha", async () => {
    const fixtures: Fixtures = {
      ...FIXTURES_BASE,
      ordens_fabricacao: [{ ...FIXTURES_BASE.ordens_fabricacao[0], observacao_pcp: "Revisar torque antes de liberar" }],
    };
    const client = criarClienteFalso(fixtures);
    const resultado = await buscarOfsPcp(client, { ofId: "of-1" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas[0].observacaoPcp).toBe("Revisar torque antes de liberar");
    }
  });

  it("13d. observacao_pcp nula é mapeada para null, nunca undefined", async () => {
    const fixtures: Fixtures = {
      ...FIXTURES_BASE,
      ordens_fabricacao: [{ ...FIXTURES_BASE.ordens_fabricacao[0], observacao_pcp: null }],
    };
    const client = criarClienteFalso(fixtures);
    const resultado = await buscarOfsPcp(client, { ofId: "of-1" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas[0].observacaoPcp).toBeNull();
    }
  });

  it("13e. observacao_pcp ausente na linha (coluna nunca gravada) também é mapeada para null", async () => {
    // FIXTURES_BASE nunca define observacao_pcp - cobre o caso real de
    // qualquer OF criada antes da migration 20261110090000.
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { ofId: "of-1" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas[0].observacaoPcp).toBeNull();
    }
  });

  it("13f. observacao_pcp vazia (string) é preservada como string vazia, sem normalização aqui - normalização é responsabilidade da RPC atualizar_observacao_pcp_of", async () => {
    const fixtures: Fixtures = {
      ...FIXTURES_BASE,
      ordens_fabricacao: [{ ...FIXTURES_BASE.ordens_fabricacao[0], observacao_pcp: "" }],
    };
    const client = criarClienteFalso(fixtures);
    const resultado = await buscarOfsPcp(client, { ofId: "of-1" }, 1);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.resultado.linhas[0].observacaoPcp).toBe("");
    }
  });

  it("14a. filtro inválido: quantidadeMin maior que quantidadeMax", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { quantidadeMin: 50, quantidadeMax: 10 }, 1);
    expect(resultado).toEqual({ ok: false, motivo: "filtro_invalido", campo: "quantidade" });
  });

  it("14b. filtro inválido: data de entrega mal formatada", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { entregaDe: "10/12/2026" }, 1);
    expect(resultado).toEqual({ ok: false, motivo: "filtro_invalido", campo: "entregaDe" });
  });

  it("14c. filtro inválido: valor de status fora dos 6 rótulos aprovados", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { statusSimplificado: ["inventado"] }, 1);
    expect(resultado).toEqual({ ok: false, motivo: "filtro_invalido", campo: "statusSimplificado" });
  });

  it("14d. filtro inválido: página menor que 1", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, {}, 0);
    expect(resultado).toEqual({ ok: false, motivo: "filtro_invalido", campo: "pagina" });
  });

  it("14e. resultado vazio bem definido quando o filtro de cliente não encontra ninguém", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, { cliente: "Empresa Inexistente" }, 1);
    expect(resultado).toEqual({ ok: true, resultado: { linhas: [], totalRegistros: 0, pagina: 1, tamanhoPagina: 20 } });
  });

  it("tamanho de página é limitado ao máximo permitido", async () => {
    const client = criarClienteFalso(FIXTURES_BASE);
    const resultado = await buscarOfsPcp(client, {}, 1, 10000);
    expect(resultado.ok && resultado.resultado.tamanhoPagina).toBe(100);
  });
});
