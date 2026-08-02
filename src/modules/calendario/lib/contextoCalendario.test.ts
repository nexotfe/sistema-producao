// Testes diretos de contextoCalendario.ts - a base da correção de
// performance (N+1) de deslocarDiasProdutivos/resolverDiaProdutivo.
// Confirma que a mesma regra de precedência do calendário (Operacional ->
// Oficial -> Eventos, seção 7) continua valendo quando resolvida em
// memória a partir de um lote, e que o carregamento em lote continua
// gerando os mesmos erros de domínio de antes.
import { describe, expect, it } from "vitest";
import {
  carregarContextoCalendario,
  resolverDiaProdutivoComContexto,
} from "./contextoCalendario";
import {
  ConfiguracaoCalendarioAusenteError,
  IntegridadeCalendarioError,
  TipoEventoNaoSuportadoError,
} from "./errors";
import {
  criarClienteCalendarioFalso,
  criarClienteCalendarioFalsoComContagem,
  type FixtureCalendario,
} from "./testHelpers/criarClienteCalendarioFalso";

const EMPRESA_ID = "empresa-teste";

const PADRAO_SEGUNDA_A_SEXTA: FixtureCalendario["padraoSemanal"] = {
  segunda: true,
  terca: true,
  quarta: true,
  quinta: true,
  sexta: true,
  sabado: false,
  domingo: false,
};

describe("carregarContextoCalendario + resolverDiaProdutivoComContexto", () => {
  it("resolve fim de semana como não produtivo, a partir de um lote que cobre várias semanas", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    });

    const contexto = await carregarContextoCalendario(client, EMPRESA_ID, "2026-09-01", "2026-09-30");

    // 2026-09-05 é sábado, 2026-09-06 é domingo.
    expect(resolverDiaProdutivoComContexto(contexto, "2026-09-05").produtivo).toBe(false);
    expect(resolverDiaProdutivoComContexto(contexto, "2026-09-06").produtivo).toBe(false);
    // 2026-09-08 é terça, produtiva.
    expect(resolverDiaProdutivoComContexto(contexto, "2026-09-08").produtivo).toBe(true);
  });

  it("subtrai o feriado nacional de 07/09/2026 dentro de um lote de várias semanas, sem afetar os outros dias do mesmo lote", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
      empresa: { pais_codigo: "BR", uf_codigo: "SP", municipio_codigo: "3549904" },
      feriados: [
        {
          data: "2026-09-07",
          abrangencia: "nacional",
          pais_codigo: "BR",
          uf_codigo: null,
          municipio_codigo: null,
          descricao: "Independência do Brasil",
        },
      ],
    });

    const contexto = await carregarContextoCalendario(client, EMPRESA_ID, "2026-09-01", "2026-09-30");

    const resultadoFeriado = resolverDiaProdutivoComContexto(contexto, "2026-09-07");
    expect(resultadoFeriado.produtivo).toBe(false);
    expect(resultadoFeriado.origem).toBe("feriado_oficial");
    expect(resultadoFeriado.motivo).toContain("Independência do Brasil");

    // Segunda-feira normal na mesma semana, fora do feriado - continua produtiva.
    expect(resolverDiaProdutivoComContexto(contexto, "2026-09-14").produtivo).toBe(true);
  });

  it("evento da empresa (dia_trabalhado_excepcional) tem precedência sobre padrão semanal e Calendário Oficial, resolvido do mesmo lote", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
      eventos: [{ id: "evt-1", data: "2026-09-05", tipo: "dia_trabalhado_excepcional" }], // sábado
    });

    const contexto = await carregarContextoCalendario(client, EMPRESA_ID, "2026-09-01", "2026-09-30");
    const resultado = resolverDiaProdutivoComContexto(contexto, "2026-09-05");

    expect(resultado.produtivo).toBe(true);
    expect(resultado.origem).toBe("evento_empresa");
  });

  it("múltiplos eventos ativos no mesmo dia, dentro do mesmo lote, continuam lançando IntegridadeCalendarioError", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
      eventos: [
        { id: "evt-1", data: "2026-09-10", tipo: "inventario" },
        { id: "evt-2", data: "2026-09-10", tipo: "paralisacao" },
      ],
    });

    const contexto = await carregarContextoCalendario(client, EMPRESA_ID, "2026-09-01", "2026-09-30");
    expect(() => resolverDiaProdutivoComContexto(contexto, "2026-09-10")).toThrow(
      IntegridadeCalendarioError,
    );
  });

  it("tipo de evento não suportado continua lançando TipoEventoNaoSuportadoError", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
      eventos: [{ id: "evt-1", data: "2026-09-10", tipo: "tipo_desconhecido" as never }],
    });

    const contexto = await carregarContextoCalendario(client, EMPRESA_ID, "2026-09-01", "2026-09-30");
    expect(() => resolverDiaProdutivoComContexto(contexto, "2026-09-10")).toThrow(
      TipoEventoNaoSuportadoError,
    );
  });

  it("empresa sem Calendário Operacional configurado continua lançando ConfiguracaoCalendarioAusenteError - agora ao carregar o contexto, não a cada dia", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: "outra-empresa",
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    });

    await expect(
      carregarContextoCalendario(client, EMPRESA_ID, "2026-09-01", "2026-09-30"),
    ).rejects.toThrow(ConfiguracaoCalendarioAusenteError);
  });

  it("intervalo inválido (dataFim antes de dataInicio) é rejeitado antes de qualquer consulta", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    });

    await expect(
      carregarContextoCalendario(client, EMPRESA_ID, "2026-09-30", "2026-09-01"),
    ).rejects.toThrow(RangeError);
  });

  it("resolver um dia fora do intervalo pré-carregado é um erro interno (contexto carregado pequeno demais), não um resultado incorreto silencioso", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    });

    const contexto = await carregarContextoCalendario(client, EMPRESA_ID, "2026-09-01", "2026-09-10");
    expect(() => resolverDiaProdutivoComContexto(contexto, "2026-10-01")).toThrow();
  });

  it("um lote cobrindo 90 dias faz o mesmo número de consultas que um lote de 1 dia - a quantidade não é proporcional ao tamanho do intervalo", async () => {
    const fixture: FixtureCalendario = {
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    };

    const umDia = criarClienteCalendarioFalsoComContagem(fixture);
    await carregarContextoCalendario(umDia.client, EMPRESA_ID, "2026-09-01", "2026-09-01");

    const noventaDias = criarClienteCalendarioFalsoComContagem(fixture);
    await carregarContextoCalendario(noventaDias.client, EMPRESA_ID, "2026-09-01", "2026-11-29");

    expect(noventaDias.contador.total()).toBe(umDia.contador.total());
    expect(noventaDias.contador.total()).toBeLessThanOrEqual(4);
  });
});

function somarDiasCivis(data: string, quantidade: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + quantidade)).toISOString().slice(0, 10);
}

// Auditoria da correção de N+1, ponto 3: o Supabase/PostgREST tem um teto
// de linhas por resposta (db.max_rows = 1000 no supabase/config.toml
// deste projeto). Um intervalo grande o bastante (margem de segurança de
// vários anos, por exemplo) pode legitimamente ter mais linhas de
// feriados/eventos do que esse teto - sem paginação, o Supabase
// truncaria a resposta EM SILÊNCIO, e dias produtivos calculados a
// partir daí ficariam errados sem nenhum erro visível.
describe("carregarContextoCalendario — paginação defensiva contra o teto de linhas do Supabase", () => {
  it("mais de 1000 feriados no intervalo: todos são encontrados, inclusive um perto do fim da lista (nenhuma truncagem silenciosa)", async () => {
    // 1200 feriados municipais, um por dia, cobrindo pouco mais de 3 anos
    // - deliberadamente mais que o teto de 1000 linhas do Supabase e mais
    // que 2 páginas de 500 (TAMANHO_PAGINA_SUPABASE).
    const TOTAL_FERIADOS = 1200;
    const dataBase = "2026-01-01";
    const feriados = Array.from({ length: TOTAL_FERIADOS }, (_, indice) => ({
      data: somarDiasCivis(dataBase, indice),
      abrangencia: "municipal" as const,
      pais_codigo: "BR",
      uf_codigo: "SP",
      municipio_codigo: "3549904",
      descricao: `Feriado municipal de teste #${indice}`,
    }));

    // Feriado de índice 1150 - depois da 2ª página (500-999) e dentro da
    // 3ª (1000-1199). Se a paginação parasse cedo (ex.: só a 1ª página de
    // 500), esta data especificamente NÃO apareceria como feriado.
    const dataAlvo = somarDiasCivis(dataBase, 1150);

    const { client, contador } = criarClienteCalendarioFalsoComContagem({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
      empresa: { pais_codigo: "BR", uf_codigo: "SP", municipio_codigo: "3549904" },
      feriados,
    });

    const dataFimIntervalo = somarDiasCivis(dataBase, TOTAL_FERIADOS - 1);
    const contexto = await carregarContextoCalendario(client, EMPRESA_ID, dataBase, dataFimIntervalo);

    const resultadoAlvo = resolverDiaProdutivoComContexto(contexto, dataAlvo);
    expect(resultadoAlvo.produtivo).toBe(false);
    expect(resultadoAlvo.origem).toBe("feriado_oficial");
    expect(resultadoAlvo.motivo).toContain("#1150");

    // 1200 linhas / 500 por página = 3 páginas de
    // calendario_oficial_feriados - a quantidade de consultas cresce com
    // o número de PÁGINAS, nunca com os ~1200 dias civis do intervalo.
    expect(contador.porTabela["calendario_oficial_feriados"]).toBe(3);
  });

  it("mais de 1000 eventos da empresa no intervalo: todos são encontrados, inclusive um perto do fim da lista", async () => {
    const TOTAL_EVENTOS = 1100;
    const dataBase = "2026-01-01";
    const eventos = Array.from({ length: TOTAL_EVENTOS }, (_, indice) => ({
      id: `evento-${indice}`,
      data: somarDiasCivis(dataBase, indice),
      tipo: "dia_trabalhado_excepcional" as const,
    }));

    // Procura, a partir do índice 1050 (na 3ª página de consultas, além
    // do teto de 1000 linhas), um dia que caia num sábado - normalmente
    // não produtivo. Só fica produtivo se o evento desse dia específico
    // (na 3ª página) for realmente encontrado - se a paginação parasse
    // na 1ª ou 2ª página, esse evento "desapareceria" e o resultado
    // cairia de volta para o padrão semanal (sábado = não produtivo).
    let indiceAlvo = 1050;
    let dataAlvo = somarDiasCivis(dataBase, indiceAlvo);
    while (new Date(dataAlvo + "T00:00:00Z").getUTCDay() !== 6) {
      indiceAlvo += 1;
      dataAlvo = somarDiasCivis(dataBase, indiceAlvo);
    }

    const { client, contador } = criarClienteCalendarioFalsoComContagem({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
      eventos,
    });

    const dataFimIntervalo = somarDiasCivis(dataBase, TOTAL_EVENTOS - 1);
    const contexto = await carregarContextoCalendario(client, EMPRESA_ID, dataBase, dataFimIntervalo);

    const resultadoAlvo = resolverDiaProdutivoComContexto(contexto, dataAlvo);
    expect(resultadoAlvo.produtivo).toBe(true);
    expect(resultadoAlvo.origem).toBe("evento_empresa");

    // 1100 linhas / 500 por página = 3 páginas.
    expect(contador.porTabela["calendario_empresa_eventos"]).toBe(3);
  });

  it("intervalo pequeno (poucos feriados) continua fazendo só 1 página - paginação não penaliza o caso normal", async () => {
    const { client, contador } = criarClienteCalendarioFalsoComContagem({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
      empresa: { pais_codigo: "BR", uf_codigo: "SP", municipio_codigo: "3549904" },
      feriados: [
        {
          data: "2026-09-07",
          abrangencia: "nacional",
          pais_codigo: "BR",
          uf_codigo: null,
          municipio_codigo: null,
          descricao: "Independência do Brasil",
        },
      ],
    });

    await carregarContextoCalendario(client, EMPRESA_ID, "2026-08-18", "2026-10-15");

    expect(contador.porTabela["calendario_oficial_feriados"]).toBe(1);
    expect(contador.porTabela["calendario_empresa_eventos"]).toBe(1);
    expect(contador.total()).toBeLessThanOrEqual(4);
  });
});

// Embaralha um array de forma determinística (mesmo "seed" sempre produz
// a mesma permutação) - só para provar que o resultado final não depende
// da ordem em que a fixture forneceu as linhas, sem introduzir
// aleatoriedade real num teste (que seria flaky).
function embaralharDeterministico<T>(itens: T[]): T[] {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = (i * 2654435761) % (i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function totalDeLinhas(mapa: Map<string, Array<{ id: string }>>): { total: number; ids: string[] } {
  const ids: string[] = [];
  for (const lista of mapa.values()) {
    for (const linha of lista) ids.push(linha.id);
  }
  return { total: ids.length, ids };
}

// Auditoria de estabilidade de paginação: `.range()` sem `.order()`
// determinístico e único não garante ausência de linha omitida/duplicada
// entre páginas. Estes testes provam que a ordenação (data + id, a chave
// primária real das duas tabelas) resolve isso, mesmo com várias linhas
// na mesma data e mesmo que a fixture forneça as linhas fora de ordem.
describe("carregarContextoCalendario — paginação determinística (ordenação data + id)", () => {
  it("calendario_oficial_feriados: 1200 linhas espalhadas por só 50 datas (várias linhas por data), fornecidas fora de ordem - nenhuma omitida, nenhuma duplicada", async () => {
    const dataBase = "2026-01-01";
    const TOTAL = 1200;
    const DATAS_DISTINTAS = 50;

    const feriadosEmOrdem = Array.from({ length: TOTAL }, (_, indice) => {
      const dataIndice = indice % DATAS_DISTINTAS; // várias linhas por data
      const data = somarDiasCivis(dataBase, dataIndice);
      return {
        id: `feriado-${indice}`,
        data,
        abrangencia: "municipal" as const,
        pais_codigo: "BR",
        uf_codigo: "SP",
        // municipio_codigo distinto por linha - respeita a UNIQUE real
        // (data, abrangencia, pais_codigo, uf_codigo, municipio_codigo)
        // mesmo com várias linhas na mesma data.
        municipio_codigo: `MUN-${indice}`,
        descricao: `Feriado de teste #${indice}`,
      };
    });

    const { client, contador } = criarClienteCalendarioFalsoComContagem({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
      empresa: { pais_codigo: "BR", uf_codigo: "SP", municipio_codigo: "3549904" },
      // Fora de ordem de propósito - o resultado não pode depender disto.
      feriados: embaralharDeterministico(feriadosEmOrdem),
    });

    const dataFimIntervalo = somarDiasCivis(dataBase, DATAS_DISTINTAS - 1);
    const contexto = await carregarContextoCalendario(client, EMPRESA_ID, dataBase, dataFimIntervalo);

    const { total, ids } = totalDeLinhas(contexto.feriadosPorData);

    expect(total).toBe(TOTAL); // nenhuma linha omitida
    expect(new Set(ids).size).toBe(TOTAL); // nenhuma linha duplicada
    expect(contador.porTabela["calendario_oficial_feriados"]).toBe(3); // 1200 / 500 = 3 páginas
  });

  it("calendario_empresa_eventos: 1100 linhas espalhadas por só 40 datas (várias linhas por data), fornecidas fora de ordem - nenhuma omitida, nenhuma duplicada", async () => {
    const dataBase = "2026-01-01";
    const TOTAL = 1100;
    const DATAS_DISTINTAS = 40;
    const TIPOS = [
      "recesso_coletivo",
      "inventario",
      "paralisacao",
      "dia_trabalhado_excepcional",
      "feriado_local_temporario",
    ] as const;

    const eventosEmOrdem = Array.from({ length: TOTAL }, (_, indice) => {
      const dataIndice = indice % DATAS_DISTINTAS;
      return {
        id: `evento-${indice}`,
        data: somarDiasCivis(dataBase, dataIndice),
        // tipo varia por linha - respeita a UNIQUE real
        // (empresa_id, data, tipo) mesmo com várias linhas na mesma data.
        tipo: TIPOS[indice % TIPOS.length],
      };
    });

    const { client, contador } = criarClienteCalendarioFalsoComContagem({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
      eventos: embaralharDeterministico(eventosEmOrdem),
    });

    const dataFimIntervalo = somarDiasCivis(dataBase, DATAS_DISTINTAS - 1);
    const contexto = await carregarContextoCalendario(client, EMPRESA_ID, dataBase, dataFimIntervalo);

    const { total, ids } = totalDeLinhas(contexto.eventosPorData);

    expect(total).toBe(TOTAL);
    expect(new Set(ids).size).toBe(TOTAL);
    expect(contador.porTabela["calendario_empresa_eventos"]).toBe(3); // 1100 / 500 = 3 páginas
  });

  it("resultado final é idêntico (mesmos ids, mesma contagem) independente da ordem original da fixture", async () => {
    const dataBase = "2026-01-01";
    const TOTAL = 600;

    const feriadosEmOrdem = Array.from({ length: TOTAL }, (_, indice) => ({
      id: `feriado-${indice}`,
      data: somarDiasCivis(dataBase, indice % 20),
      abrangencia: "municipal" as const,
      pais_codigo: "BR",
      uf_codigo: "SP",
      municipio_codigo: `MUN-${indice}`,
      descricao: `Feriado #${indice}`,
    }));

    async function carregarECapturarIds(feriados: typeof feriadosEmOrdem) {
      const client = criarClienteCalendarioFalso({
        empresaId: EMPRESA_ID,
        padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
        empresa: { pais_codigo: "BR", uf_codigo: "SP", municipio_codigo: "3549904" },
        feriados,
      });
      const contexto = await carregarContextoCalendario(
        client,
        EMPRESA_ID,
        dataBase,
        somarDiasCivis(dataBase, 19),
      );
      return totalDeLinhas(contexto.feriadosPorData).ids.sort();
    }

    const idsEmOrdem = await carregarECapturarIds(feriadosEmOrdem);
    const idsEmbaralhados = await carregarECapturarIds(embaralharDeterministico(feriadosEmOrdem));
    const idsInvertidos = await carregarECapturarIds([...feriadosEmOrdem].reverse());

    expect(idsEmbaralhados).toEqual(idsEmOrdem);
    expect(idsInvertidos).toEqual(idsEmOrdem);
    expect(idsEmOrdem.length).toBe(TOTAL);
  });
});
