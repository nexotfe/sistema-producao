// Testes obrigatórios do PAD-008 v2.0 (Entrega 1), itens 1-5, mais as
// correções da auditoria (limite defensivo contra loop infinito e
// validação de data civil real).
import { describe, expect, it } from "vitest";
import { deslocarDiasProdutivos, MAX_DIAS_CIVIS_EXAMINADOS } from "./deslocarDiasProdutivos";
import { carregarContextoCalendario } from "./contextoCalendario";
import { LimiteDeslocamentoDiasProdutivosExcedidoError } from "./errors";
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

function clienteComPadraoSemanal(
  extra: Partial<FixtureCalendario> = {},
) {
  return criarClienteCalendarioFalso({
    empresaId: EMPRESA_ID,
    padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    ...extra,
  });
}

describe("deslocarDiasProdutivos", () => {
  it("item 1 — deslocamento zero devolve a própria data-base, sem consultar o calendário", async () => {
    // Padrão semanal todo falso: se a função consultasse o calendário para
    // deslocamento 0, qualquer avanço/retrocesso real falharia em achar um
    // dia produtivo. O teste prova que ela nem tenta.
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: {
        segunda: false,
        terca: false,
        quarta: false,
        quinta: false,
        sexta: false,
        sabado: false,
        domingo: false,
      },
    });

    const resultado = await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-08-01", 0);

    expect(resultado).toBe("2026-08-01");
  });

  it("item 2 — deslocamento positivo não conta a data-base", async () => {
    const client = clienteComPadraoSemanal();

    // 2026-11-23 é segunda (produtiva). Se a data-base fosse contada, +3
    // pousaria em 2026-11-25 (quarta). Sem contar a base, pousa em
    // 2026-11-26 (quinta): terça(1), quarta(2), quinta(3).
    const resultado = await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-11-23", 3);

    expect(resultado).toBe("2026-11-26");
  });

  it("item 3 — deslocamento negativo não conta a data-base", async () => {
    const client = clienteComPadraoSemanal();

    // 2026-12-02 é quarta (produtiva). Se a data-base fosse contada, -2
    // pousaria em 2026-11-30 (segunda) contando a própria quarta como 1.
    // Sem contar a base: terça 12/01 (1), segunda 11/30 (2).
    const resultado = await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-12-02", -2);

    expect(resultado).toBe("2026-11-30");
  });

  it("item 4 — respeita feriado oficial (subtrai um dia normalmente produtivo) e evento de dia trabalhado excepcional (devolve um fim de semana como produtivo)", async () => {
    const client = clienteComPadraoSemanal({
      empresa: { pais_codigo: "BR", uf_codigo: null, municipio_codigo: null },
      feriados: [
        {
          data: "2026-11-25", // quarta, normalmente produtiva
          abrangencia: "nacional",
          pais_codigo: "BR",
          uf_codigo: null,
          municipio_codigo: null,
          descricao: "Feriado de teste",
        },
      ],
      eventos: [
        {
          id: "evento-1",
          data: "2026-11-28", // sábado, normalmente não produtivo
          tipo: "dia_trabalhado_excepcional",
        },
      ],
    });

    // A partir de 2026-11-23 (segunda), +3 dias produtivos: terça 24/11(1),
    // quarta 25/11 é feriado -> pulada, quinta 26/11(2), sexta 27/11(3).
    const comFeriado = await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-11-23", 3);
    expect(comFeriado).toBe("2026-11-27");

    // A partir de sexta 27/11, +1 dia produtivo cai no sábado 28/11, que
    // vira produtivo por causa do evento "dia_trabalhado_excepcional".
    const comEventoExcepcional = await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-11-27", 1);
    expect(comEventoExcepcional).toBe("2026-11-28");
  });

  it("item 5 — exemplo obrigatório: 30/11/2026 menos 3 dias produtivos = 25/11/2026", async () => {
    const client = clienteComPadraoSemanal();

    const resultado = await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-11-30", -3);

    expect(resultado).toBe("2026-11-25");
  });
});

describe("deslocarDiasProdutivos — correção 1: limite defensivo contra loop infinito", () => {
  it("lança LimiteDeslocamentoDiasProdutivosExcedidoError e ENCERRA quando o calendário não tem nenhum dia produtivo, em vez de rodar para sempre", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: {
        segunda: false,
        terca: false,
        quarta: false,
        quinta: false,
        sexta: false,
        sabado: false,
        domingo: false,
      },
    });

    await expect(
      deslocarDiasProdutivos(client, EMPRESA_ID, "2026-08-01", 5),
    ).rejects.toBeInstanceOf(LimiteDeslocamentoDiasProdutivosExcedidoError);
  });

  it("o erro de limite carrega a quantidade de dias civis examinados, igual a MAX_DIAS_CIVIS_EXAMINADOS", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: {
        segunda: false,
        terca: false,
        quarta: false,
        quinta: false,
        sexta: false,
        sabado: false,
        domingo: false,
      },
    });

    try {
      await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-08-01", 1);
      expect.unreachable("deveria ter lançado LimiteDeslocamentoDiasProdutivosExcedidoError");
    } catch (erro) {
      expect(erro).toBeInstanceOf(LimiteDeslocamentoDiasProdutivosExcedidoError);
      expect((erro as InstanceType<typeof LimiteDeslocamentoDiasProdutivosExcedidoError>).diasCivisExaminados).toBe(
        MAX_DIAS_CIVIS_EXAMINADOS,
      );
    }
  });

  it("um deslocamento negativo (para trás) também respeita o limite e encerra", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: {
        segunda: false,
        terca: false,
        quarta: false,
        quinta: false,
        sexta: false,
        sabado: false,
        domingo: false,
      },
    });

    await expect(
      deslocarDiasProdutivos(client, EMPRESA_ID, "2026-08-01", -3),
    ).rejects.toBeInstanceOf(LimiteDeslocamentoDiasProdutivosExcedidoError);
  });
});

describe("deslocarDiasProdutivos — correção 2: validação de data civil real", () => {
  const client = clienteComPadraoSemanal();

  it("rejeita 2026-02-31 (fevereiro não tem 31 dias)", async () => {
    await expect(deslocarDiasProdutivos(client, EMPRESA_ID, "2026-02-31", 1)).rejects.toThrow(TypeError);
  });

  it("rejeita mês 13", async () => {
    await expect(deslocarDiasProdutivos(client, EMPRESA_ID, "2026-13-01", 1)).rejects.toThrow(TypeError);
  });

  it("rejeita dia zero", async () => {
    await expect(deslocarDiasProdutivos(client, EMPRESA_ID, "2026-01-00", 1)).rejects.toThrow(TypeError);
  });

  it("rejeita qualquer data que o JavaScript normalizaria silenciosamente (2026-04-31 → 2026-05-01)", async () => {
    await expect(deslocarDiasProdutivos(client, EMPRESA_ID, "2026-04-31", 1)).rejects.toThrow(TypeError);
  });

  it("teste positivo: aceita uma data civil real e válida (2026-02-28)", async () => {
    const resultado = await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-02-28", 0);
    expect(resultado).toBe("2026-02-28");
  });

  it("teste positivo: aceita ano bissexto real (2028-02-29)", async () => {
    const resultado = await deslocarDiasProdutivos(client, EMPRESA_ID, "2028-02-29", 0);
    expect(resultado).toBe("2028-02-29");
  });
});

// Correção de performance (N+1): deslocarDiasProdutivos/resolverDiaProdutivo
// faziam até 4 consultas ao Supabase POR DIA CIVIL examinado. Depois da
// correção (carregarContextoCalendario em lote + resolução em memória), o
// número de consultas passou a ser constante (tipicamente 1 lote = até 4
// consultas), não mais proporcional à distância em dias entre as datas.
// Estes testes provam as DUAS coisas ao mesmo tempo: o resultado não mudou
// (equivalência) e a quantidade de consultas não cresce com a distância.
describe("deslocarDiasProdutivos — correção de performance (N+1): resultado idêntico, consultas constantes", () => {
  it("cenário real (cadastro atual da ENIFER): 01/09/2026 + 9 dias produtivos, com o feriado nacional de 07/09/2026, é constante em consultas", async () => {
    const { client: clienteContado, contador } = criarClienteCalendarioFalsoComContagem({
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

    const resultado = await deslocarDiasProdutivos(clienteContado, EMPRESA_ID, "2026-09-01", 9);

    // Mesmo resultado de antes da otimização (confirmado manualmente e na
    // tela real em 2026-08-02): 14 dias civis, pulando 2 fins de semana e
    // o feriado de 07/09, chegam em 15/09/2026.
    expect(resultado).toBe("2026-09-15");

    // O número de consultas não pode crescer com os 14 dias civis
    // examinados - constante e pequeno (1 lote de carregarContextoCalendario
    // = até 4 consultas), nunca "uma consulta por dia".
    expect(contador.total()).toBeLessThanOrEqual(4);
  });

  it("deslocamento maior (+30 dias produtivos) não aumenta o número de consultas em relação a um deslocamento pequeno (+3) - prova que não é mais proporcional aos dias", async () => {
    const fixture: FixtureCalendario = {
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    };

    const pequeno = criarClienteCalendarioFalsoComContagem(fixture);
    await deslocarDiasProdutivos(pequeno.client, EMPRESA_ID, "2026-09-01", 3);

    const grande = criarClienteCalendarioFalsoComContagem(fixture);
    await deslocarDiasProdutivos(grande.client, EMPRESA_ID, "2026-09-01", 30);

    // Antes da correção: +3 fazia ~5 chamadas a resolverDiaProdutivo e +30
    // fazia ~42 - uma proporcional a mais que a outra em consultas. Depois:
    // as duas cabem no mesmo lote inicial (mesma ordem de grandeza de
    // consultas), independente da distância.
    expect(grande.contador.total()).toBeLessThanOrEqual(pequeno.contador.total() * 2);
  });

  it("deslocamento negativo (prazo interno) também vira 1 lote de consultas, não 1 por dia", async () => {
    const { client: clienteContado, contador } = criarClienteCalendarioFalsoComContagem({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    });

    // 01/10/2026 (quinta) - 2 dias produtivos = 29/09/2026 (terça),
    // mesmo resultado do cenário real.
    const resultado = await deslocarDiasProdutivos(clienteContado, EMPRESA_ID, "2026-10-01", -2);

    expect(resultado).toBe("2026-09-29");
    expect(contador.total()).toBeLessThanOrEqual(4);
  });

  it("disponibilidade para produção (+1 dia produtivo a partir da chegada) continua caindo no próximo dia produtivo, não no calendário", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    });

    // 15/09/2026 é terça (produtiva); +1 dia produtivo cai em 16/09 (quarta).
    const resultado = await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-09-15", 1);
    expect(resultado).toBe("2026-09-16");
  });

  it("evento específico da empresa (dia_trabalhado_excepcional) continua tendo precedência sobre o padrão semanal, mesmo vindo do contexto em lote", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
      eventos: [
        { id: "evento-empresa-1", data: "2026-09-05", tipo: "dia_trabalhado_excepcional" }, // sábado
      ],
    });

    // 04/09/2026 (sexta) +1 dia produtivo: sábado 05/09 vira produtivo por
    // causa do evento da empresa, mesmo sendo fim de semana no padrão.
    const resultado = await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-09-04", 1);
    expect(resultado).toBe("2026-09-05");
  });

  it("intervalo inválido continua sendo rejeitado por carregarContextoCalendario (dataFim antes de dataInicio)", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    });

    await expect(
      carregarContextoCalendario(client, EMPRESA_ID, "2026-09-10", "2026-09-01"),
    ).rejects.toThrow(RangeError);
  });

  it("limite defensivo (calendário sem nenhum dia produtivo) continua lançando o mesmo erro, com o mesmo diasCivisExaminados", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: {
        segunda: false,
        terca: false,
        quarta: false,
        quinta: false,
        sexta: false,
        sabado: false,
        domingo: false,
      },
    });

    try {
      await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-08-01", 1);
      expect.unreachable("deveria ter lançado LimiteDeslocamentoDiasProdutivosExcedidoError");
    } catch (erro) {
      expect(erro).toBeInstanceOf(LimiteDeslocamentoDiasProdutivosExcedidoError);
      expect(
        (erro as InstanceType<typeof LimiteDeslocamentoDiasProdutivosExcedidoError>).diasCivisExaminados,
      ).toBe(MAX_DIAS_CIVIS_EXAMINADOS);
    }
  });
});

// Auditoria da correção de N+1, ponto 2: opcoes.contexto pode ter sido
// carregado por quem chama (ex.: prepararJanelaComercial) com uma janela
// generosa, mas ainda insuficiente para um calendário muito restritivo -
// deslocarDiasProdutivos precisa detectar isso e buscar mais, nunca
// devolver um resultado incorreto nem deixar
// resolverDiaProdutivoComContexto lançar "fora do contexto pré-carregado"
// para uma entrada válida.
describe("deslocarDiasProdutivos — expansão de contexto compartilhado (opcoes.contexto insuficiente)", () => {
  // Só segunda-feira é produtiva - calendário deliberadamente restritivo:
  // 5 dias produtivos exigem 35 dias civis, bem mais do que cabe num
  // contexto pequeno passado de propósito.
  const PADRAO_SO_SEGUNDA: FixtureCalendario["padraoSemanal"] = {
    segunda: true,
    terca: false,
    quarta: false,
    quinta: false,
    sexta: false,
    sabado: false,
    domingo: false,
  };

  it("amplia sozinho um opcoes.contexto pequeno demais e chega ao resultado correto (não lança 'fora do contexto', não trava)", async () => {
    const fixture: FixtureCalendario = { empresaId: EMPRESA_ID, padraoSemanal: PADRAO_SO_SEGUNDA };
    const { client, contador } = criarClienteCalendarioFalsoComContagem(fixture);

    // Contexto deliberadamente minúsculo (3 dias) - não contém nenhuma
    // segunda-feira além da própria base, muito menos as 5 necessárias.
    const contextoPequeno = await carregarContextoCalendario(client, EMPRESA_ID, "2026-08-03", "2026-08-05");

    const resultado = await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-08-03", 5, {
      contexto: contextoPequeno,
    });

    // Confirmado por cálculo independente: 2026-08-03 é segunda; a 5ª
    // segunda-feira posterior é 2026-09-07 (35 dias civis).
    expect(resultado).toBe("2026-09-07");

    // Teve que buscar mais de uma vez (o contexto inicial de 3 dias não
    // bastava), mas o número de consultas continua pequeno e limitado -
    // nunca 1 por dia civil (seriam 35+ chamadas de rede antes da
    // correção).
    expect(contador.total()).toBeGreaterThan(4); // precisou expandir pelo menos 1 vez além do contexto inicial passado
    expect(contador.total()).toBeLessThan(40); // mas nada perto de 1 consulta por dia civil
  });

  it("mesmo com opcoes.contexto insuficiente, o limite defensivo MAX_DIAS_CIVIS_EXAMINADOS continua valendo (calendário sem nenhum dia produtivo)", async () => {
    const fixture: FixtureCalendario = {
      empresaId: EMPRESA_ID,
      padraoSemanal: {
        segunda: false,
        terca: false,
        quarta: false,
        quinta: false,
        sexta: false,
        sabado: false,
        domingo: false,
      },
    };
    const client = criarClienteCalendarioFalso(fixture);
    const contextoPequeno = await carregarContextoCalendario(client, EMPRESA_ID, "2026-08-01", "2026-08-03");

    try {
      await deslocarDiasProdutivos(client, EMPRESA_ID, "2026-08-01", 1, { contexto: contextoPequeno });
      expect.unreachable("deveria ter lançado LimiteDeslocamentoDiasProdutivosExcedidoError");
    } catch (erro) {
      expect(erro).toBeInstanceOf(LimiteDeslocamentoDiasProdutivosExcedidoError);
      expect(
        (erro as InstanceType<typeof LimiteDeslocamentoDiasProdutivosExcedidoError>).diasCivisExaminados,
      ).toBe(MAX_DIAS_CIVIS_EXAMINADOS);
    }
  });

  it("isolamento por empresa: contexto de uma empresa nunca é usado para resolver a outra, mesmo com a mesma data-base", async () => {
    const empresaRestrita = "empresa-restrita";
    const empresaAmpla = "empresa-ampla";

    const clientRestrita = criarClienteCalendarioFalso({
      empresaId: empresaRestrita,
      padraoSemanal: PADRAO_SO_SEGUNDA,
    });
    const clientAmpla = criarClienteCalendarioFalso({
      empresaId: empresaAmpla,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    });

    const resultadoRestrita = await deslocarDiasProdutivos(clientRestrita, empresaRestrita, "2026-08-03", 3);
    const resultadoAmpla = await deslocarDiasProdutivos(clientAmpla, empresaAmpla, "2026-08-03", 3);

    // Mesma data-base e mesmo deslocamento, calendários diferentes -
    // resultados têm que ser diferentes (prova de que não há vazamento
    // de contexto entre empresas).
    expect(resultadoRestrita).not.toBe(resultadoAmpla);
    expect(resultadoRestrita).toBe("2026-08-24"); // 3ª segunda-feira depois de 03/08
    expect(resultadoAmpla).toBe("2026-08-06"); // 3º dia útil (seg-sex) depois de 03/08 (segunda)
  });
});
