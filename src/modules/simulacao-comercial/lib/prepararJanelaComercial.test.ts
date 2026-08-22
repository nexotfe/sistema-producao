// Testes obrigatórios do PAD-008 v2.0 (Entrega 1), itens 6-12 (12 apenas
// a lógica de comparação usada pelo servidor - a Server Action em si,
// que depende de rede/sessão, não é testada aqui).
import { describe, expect, it } from "vitest";
import {
  compararJanelaEfetiva,
  prepararJanelaComercial,
  premissasComerciaisMudaram,
  type PremissasJanelaComercial,
} from "./prepararJanelaComercial";
import { contarDiasProdutivosNaJanela } from "./agregarDiasProdutivos";
import {
  criarClienteCalendarioFalso,
  criarClienteCalendarioFalsoComContagem,
} from "@/modules/calendario/lib/testHelpers/criarClienteCalendarioFalso";

const EMPRESA_ID = "empresa-teste";

const PADRAO_SEGUNDA_A_SEXTA = {
  segunda: true,
  terca: true,
  quarta: true,
  quinta: true,
  sexta: true,
  sabado: false,
  domingo: false,
};

function clientePadrao() {
  return criarClienteCalendarioFalso({
    empresaId: EMPRESA_ID,
    padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
  });
}

describe("prepararJanelaComercial", () => {
  it("item 6 — chegada após 9 dias produtivos e produção disponível no 10º dia produtivo", async () => {
    const client = clientePadrao();

    const resultado = await prepararJanelaComercial(client, EMPRESA_ID, {
      dataPrevistaAprovacaoPedido: "2026-11-02", // segunda
      margemSegurancaDiasProdutivos: 0,
      dataNecessidade: "2027-01-01", // bem à frente, só para não bloquear a janela aqui
    });

    // 9º dia produtivo depois de 02/11 (segunda): 03,04,05,06 (sex),
    // pula 07-08 (fds), 09,10,11,12,13 (sex) = 9º.
    expect(resultado.dataChegadaPrevista).toBe("2026-11-13");
    // 10º dia produtivo: pula 14-15 (fds), cai em 16 (segunda).
    expect(resultado.dataDisponibilidadeProducao).toBe("2026-11-16");
  });

  it("item 7 — janela válida quando a disponibilidade do material antecede o prazo interno com dias produtivos entre as duas", async () => {
    const client = clientePadrao();

    const resultado = await prepararJanelaComercial(client, EMPRESA_ID, {
      dataPrevistaAprovacaoPedido: "2026-11-02",
      margemSegurancaDiasProdutivos: 0,
      dataNecessidade: "2026-12-01", // terça, bem depois de 2026-11-16
    });

    expect(resultado.valida).toBe(true);
    if (resultado.valida) {
      expect(resultado.janelaInicio).toBe(resultado.dataDisponibilidadeProducao);
      expect(resultado.janelaFim).toBe(resultado.prazoInterno);
      expect(resultado.janelaInicio).toBe("2026-11-16");
      expect(resultado.janelaFim).toBe("2026-12-01");
    }
  });

  it("item 8 — datas iguais em dia produtivo: executa (janela de 1 dia útil)", async () => {
    const client = clientePadrao();

    // dataDisponibilidadeProducao cai em 2026-11-16 (segunda, produtiva -
    // ver item 6). Usar a mesma data como dataNecessidade com margem 0
    // faz prazoInterno === dataDisponibilidadeProducao.
    const resultado = await prepararJanelaComercial(client, EMPRESA_ID, {
      dataPrevistaAprovacaoPedido: "2026-11-02",
      margemSegurancaDiasProdutivos: 0,
      dataNecessidade: "2026-11-16",
    });

    expect(resultado.dataDisponibilidadeProducao).toBe(resultado.prazoInterno);
    expect(resultado.valida).toBe(true);
  });

  it("item 9 — datas iguais em dia não produtivo: sem janela (base para a decisão de ausência de janela)", async () => {
    // dataDisponibilidadeProducao é sempre produtiva por construção (é o
    // resultado de deslocarDiasProdutivos, que só para num dia
    // produtivo) - portanto o caso "iguais e não produtivo" não é
    // alcançável através da composição completa de prepararJanelaComercial
    // nesta entrega (prazoInterno só pode "herdar" um dia não produtivo
    // quando margem=0, e nesse caso ele precisaria coincidir com a data
    // de disponibilidade, que é sempre produtiva - contradição). O teste
    // verifica a mesma propriedade na função de base
    // (contarDiasProdutivosNaJanela) da qual a decisão de
    // "sem_dia_produtivo_no_intervalo" depende diretamente.
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
    });

    // 2026-11-07 é sábado - não produtivo no padrão segunda-sexta.
    const { diasProdutivos } = await contarDiasProdutivosNaJanela(
      client,
      EMPRESA_ID,
      "2026-11-07",
      "2026-11-07",
    );

    expect(diasProdutivos).toBe(0);
  });

  it("item 10 — disponibilidade do material posterior ao prazo interno: sem janela produtiva", async () => {
    const client = clientePadrao();

    const resultado = await prepararJanelaComercial(client, EMPRESA_ID, {
      dataPrevistaAprovacaoPedido: "2026-11-02", // dataDisponibilidadeProducao = 2026-11-16
      margemSegurancaDiasProdutivos: 0,
      dataNecessidade: "2026-11-10", // prazoInterno = 2026-11-10, ANTES da disponibilidade
    });

    expect(resultado.valida).toBe(false);
    if (!resultado.valida) {
      expect(resultado.motivo).toBe("disponibilidade_apos_prazo_interno");
      expect(resultado.dataDisponibilidadeProducao > resultado.prazoInterno).toBe(true);
    }
  });
});

// CORREÇÃO DA CAUSA RAIZ (travamento real de "Calcular cenário atual",
// orçamento 260007, DEC-007): prepararJanelaComercial nunca soube que
// Industrialização não precisa da folga genérica de +9+1 dias produtivos
// (material fornecido pelo próprio cliente, disponível já na Data
// Prevista de Aprovação do Pedido) - modoDisponibilidadeMaterial resolve
// isso centralizadamente, sem duplicar a decisão nos chamadores.
describe("prepararJanelaComercial — modoDisponibilidadeMaterial (Industrialização, orçamento 260007)", () => {
  it("'padrao' (default, sem informar o parâmetro): comportamento idêntico ao de sempre - mesmos números do item 6/7 acima, prova de regressão para fabricacao/desenvolvimento/servico", async () => {
    const client = clientePadrao();

    const resultado = await prepararJanelaComercial(client, EMPRESA_ID, {
      dataPrevistaAprovacaoPedido: "2026-11-02",
      margemSegurancaDiasProdutivos: 0,
      dataNecessidade: "2026-12-01",
    });

    expect(resultado.valida).toBe(true);
    if (resultado.valida) {
      // Mesmos valores do item 6/7 - +9 dias produtivos de chegada, +1
      // dia de disponibilidade - nada mudou para esta natureza.
      expect(resultado.dataChegadaPrevista).toBe("2026-11-13");
      expect(resultado.dataDisponibilidadeProducao).toBe("2026-11-16");
    }
  });

  it("'padrao' informado explicitamente: idêntico a omitir o parâmetro (regressão explícita)", async () => {
    const client = clientePadrao();

    const resultado = await prepararJanelaComercial(
      client,
      EMPRESA_ID,
      { dataPrevistaAprovacaoPedido: "2026-11-02", margemSegurancaDiasProdutivos: 0, dataNecessidade: "2026-12-01" },
      "padrao",
    );

    expect(resultado.valida).toBe(true);
    if (resultado.valida) {
      expect(resultado.dataDisponibilidadeProducao).toBe("2026-11-16");
    }
  });

  it("'industrializacao': dataChegadaPrevista/dataDisponibilidadeProducao = a própria Data Prevista de Aprovação do Pedido, sem os deslocamentos de +9+1 dias", async () => {
    const client = clientePadrao();

    const resultado = await prepararJanelaComercial(
      client,
      EMPRESA_ID,
      { dataPrevistaAprovacaoPedido: "2026-11-02", margemSegurancaDiasProdutivos: 0, dataNecessidade: "2026-12-01" },
      "industrializacao",
    );

    expect(resultado.valida).toBe(true);
    if (resultado.valida) {
      expect(resultado.dataChegadaPrevista).toBe("2026-11-02");
      expect(resultado.dataDisponibilidadeProducao).toBe("2026-11-02");
    }
  });

  it("reprodução real do orçamento 260007: 26/08/2026 (aprovação prevista) + 08/09/2026 (necessidade) + margem 0 - INVÁLIDA em 'padrao' (causa raiz do travamento original), VÁLIDA em 'industrializacao' (correção)", async () => {
    const client = clientePadrao();
    const premissas: PremissasJanelaComercial = {
      dataPrevistaAprovacaoPedido: "2026-08-26",
      margemSegurancaDiasProdutivos: 0,
      dataNecessidade: "2026-09-08",
    };

    const resultadoPadrao = await prepararJanelaComercial(client, EMPRESA_ID, premissas, "padrao");
    expect(resultadoPadrao.valida).toBe(false);
    if (!resultadoPadrao.valida) {
      expect(resultadoPadrao.motivo).toBe("disponibilidade_apos_prazo_interno");
    }

    const resultadoIndustrializacao = await prepararJanelaComercial(client, EMPRESA_ID, premissas, "industrializacao");
    expect(resultadoIndustrializacao.valida).toBe(true);
    if (resultadoIndustrializacao.valida) {
      expect(resultadoIndustrializacao.dataDisponibilidadeProducao).toBe("2026-08-26");
    }
  });

  it("'industrializacao' ainda pode ficar inválida (sem_dia_produtivo_no_intervalo) se a data cair fora de qualquer dia produtivo do intervalo - não é um bypass incondicional", async () => {
    const client = clientePadrao();

    // 2026-11-07 é sábado (não produtivo); dataNecessidade igual, sem
    // margem - prazoInterno também cai no mesmo sábado. Sem nenhum
    // deslocamento (modo industrialização), disponibilidadeProducao fica
    // exatamente nesse sábado - contarDiasProdutivosNaJanela continua
    // sendo quem decide, não é ignorado por este modo.
    const resultado = await prepararJanelaComercial(
      client,
      EMPRESA_ID,
      { dataPrevistaAprovacaoPedido: "2026-11-07", margemSegurancaDiasProdutivos: 0, dataNecessidade: "2026-11-07" },
      "industrializacao",
    );

    expect(resultado.valida).toBe(false);
    if (!resultado.valida) {
      expect(resultado.motivo).toBe("sem_dia_produtivo_no_intervalo");
    }
  });
});

describe("premissasComerciaisMudaram (item 11 — invalidação por alteração de premissa)", () => {
  const base: PremissasJanelaComercial = {
    dataNecessidade: "2026-11-30",
    margemSegurancaDiasProdutivos: 3,
    dataPrevistaAprovacaoPedido: "2026-11-02",
  };

  it("retorna false quando nenhuma premissa mudou", () => {
    expect(premissasComerciaisMudaram(base, { ...base })).toBe(false);
  });

  it("retorna true quando a Data Prevista de Aprovação do Pedido muda", () => {
    expect(
      premissasComerciaisMudaram(base, { ...base, dataPrevistaAprovacaoPedido: "2026-11-03" }),
    ).toBe(true);
  });

  it("retorna true quando a Margem de Segurança muda", () => {
    expect(
      premissasComerciaisMudaram(base, { ...base, margemSegurancaDiasProdutivos: 4 }),
    ).toBe(true);
  });

  it("retorna true quando a Data de Necessidade muda", () => {
    expect(premissasComerciaisMudaram(base, { ...base, dataNecessidade: "2026-12-01" })).toBe(
      true,
    );
  });
});

describe("compararJanelaEfetiva (item 12 — base da rejeição de payload derivado divergente)", () => {
  it("não aponta diferença quando janelaInicio/janelaFim são idênticos", () => {
    const anterior = { janelaInicio: "2026-11-16", janelaFim: "2026-12-01" };
    const novo = { janelaInicio: "2026-11-16", janelaFim: "2026-12-01" };

    expect(compararJanelaEfetiva(anterior, novo)).toEqual([]);
  });

  it("aponta diferença quando o servidor recalcula uma janela diferente da enviada pelo cliente", () => {
    // Simula o cenário central do item 12: o cliente enviou uma janela
    // (calculada antes), mas o recálculo autoritativo no servidor -
    // usando as mesmas premissas contra o calendário corrente - produz
    // datas diferentes (ex.: um feriado foi cadastrado nesse meio-tempo).
    const enviadoPeloCliente = { janelaInicio: "2026-11-16", janelaFim: "2026-12-01" };
    const recalculadoNoServidor = { janelaInicio: "2026-11-17", janelaFim: "2026-12-01" };

    const diferencas = compararJanelaEfetiva(enviadoPeloCliente, recalculadoNoServidor);

    expect(diferencas).toHaveLength(1);
    expect(diferencas[0]).toMatchObject({
      operacao: "janela-comercial",
      campo: "janelaInicio",
      valorAnterior: "2026-11-16",
      valorNovo: "2026-11-17",
    });
  });
});

// Correção de performance (N+1) - Escrita 3 (aprovação real via RPC v3,
// projeto 260008/ENIFER, 2026-08-02) usou exatamente estas premissas e
// produziu exatamente estas 4 datas, confirmadas na tela e no banco. Este
// teste fixa esse resultado real como regressão automatizada: depois da
// correção de performance, prepararJanelaComercial precisa continuar
// devolvendo os mesmos valores para as mesmas premissas - e fazendo isso
// com um número de consultas constante, não mais ~124 (31 chamadas a
// resolverDiaProdutivo × até 4 consultas cada, medido antes da correção).
describe("prepararJanelaComercial — correção de performance (N+1): mesmo resultado do cenário real, consultas constantes", () => {
  function clientePadraoComFeriado() {
    return criarClienteCalendarioFalsoComContagem({
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
  }

  it("reproduz exatamente o resultado da Escrita 3 real (aprovação 01/09, necessidade 01/10, margem 2)", async () => {
    const { client } = clientePadraoComFeriado();

    const resultado = await prepararJanelaComercial(client, EMPRESA_ID, {
      dataPrevistaAprovacaoPedido: "2026-09-01",
      margemSegurancaDiasProdutivos: 2,
      dataNecessidade: "2026-10-01",
    });

    expect(resultado.dataChegadaPrevista).toBe("2026-09-15");
    expect(resultado.dataDisponibilidadeProducao).toBe("2026-09-16");
    expect(resultado.prazoInterno).toBe("2026-09-29");
    expect(resultado.valida).toBe(true);
    if (resultado.valida) {
      expect(resultado.janelaInicio).toBe("2026-09-16");
      expect(resultado.janelaFim).toBe("2026-09-29");
    }
  });

  it("o mesmo cenário real faz um número constante de consultas (não ~124: 1 contexto compartilhado entre os 3 deslocamentos + a contagem final)", async () => {
    const { client, contador } = clientePadraoComFeriado();

    await prepararJanelaComercial(client, EMPRESA_ID, {
      dataPrevistaAprovacaoPedido: "2026-09-01",
      margemSegurancaDiasProdutivos: 2,
      dataNecessidade: "2026-10-01",
    });

    // Antes da correção: 31 chamadas a resolverDiaProdutivo (2+14+1+14,
    // contando também a contarDiasProdutivosNaJanela final) × até 4
    // consultas cada = 124. Depois: 1 carregarContextoCalendario
    // compartilhado cobre as 4 etapas -> no máximo 4 consultas.
    expect(contador.total()).toBeLessThanOrEqual(4);
  });

  it("um deslocamento de margem bem maior (30 dias produtivos) não multiplica o número de consultas", async () => {
    const { client, contador } = clientePadraoComFeriado();

    await prepararJanelaComercial(client, EMPRESA_ID, {
      dataPrevistaAprovacaoPedido: "2026-09-01",
      margemSegurancaDiasProdutivos: 30,
      dataNecessidade: "2027-01-01",
    });

    expect(contador.total()).toBeLessThanOrEqual(4);
  });
});

// Auditoria da correção de N+1, ponto 2: o contexto único que
// prepararJanelaComercial monta é dimensionado por uma estimativa
// (estimarJanelaCivil), não por uma garantia matemática - com um
// calendário muito restritivo e uma margem grande, a estimativa pode não
// bastar. Este teste prova que, mesmo assim, o resultado final continua
// correto (nenhuma data errada, nenhum "fora do contexto pré-carregado"),
// porque cada deslocarDiasProdutivos/contarDiasProdutivosNaJanela expande
// sozinho o que receber insuficiente.
describe("prepararJanelaComercial — expansão além da estimativa inicial do contexto compartilhado", () => {
  const PADRAO_SO_SEGUNDA = {
    segunda: true,
    terca: false,
    quarta: false,
    quinta: false,
    sexta: false,
    sabado: false,
    domingo: false,
  };

  it("calendário só com segunda-feira produtiva e margem grande (8) força os 3 deslocamentos a ultrapassar a estimativa inicial (44 dias civis) - resultado seguro, sem lançar erro interno", async () => {
    const client = criarClienteCalendarioFalso({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SO_SEGUNDA,
    });

    // Entrada válida (datas bem formadas, margem inteira não negativa) -
    // o cálculo tem que completar normalmente, mesmo que o resultado
    // comercial seja "sem janela produtiva" (chegada cai depois do prazo
    // interno neste cenário específico, por construção do teste).
    const resultado = await prepararJanelaComercial(client, EMPRESA_ID, {
      dataPrevistaAprovacaoPedido: "2026-11-16",
      margemSegurancaDiasProdutivos: 8,
      dataNecessidade: "2026-12-01",
    });

    // Valores confirmados por cálculo independente (mesma regra de
    // deslocarDiasProdutivos, replicada fora do código de produção):
    // prazoInterno precisa de 50 dias civis (> a estimativa de 44) e
    // dataChegadaPrevista precisa de 63 - as duas ultrapassam o contexto
    // inicial e forçam expansão.
    expect(resultado.prazoInterno).toBe("2026-10-12");
    expect(resultado.dataChegadaPrevista).toBe("2027-01-18");
    expect(resultado.dataDisponibilidadeProducao).toBe("2027-01-25");
    expect(resultado.valida).toBe(false);
    if (!resultado.valida) {
      expect(resultado.motivo).toBe("disponibilidade_apos_prazo_interno");
    }
  });

  it("o mesmo cenário, com contagem de consultas, mostra mais chamadas que o caso normal (expansão real aconteceu) mas ainda longe de 1 por dia civil", async () => {
    const { client, contador } = criarClienteCalendarioFalsoComContagem({
      empresaId: EMPRESA_ID,
      padraoSemanal: PADRAO_SO_SEGUNDA,
    });

    await prepararJanelaComercial(client, EMPRESA_ID, {
      dataPrevistaAprovacaoPedido: "2026-11-16",
      margemSegurancaDiasProdutivos: 8,
      dataNecessidade: "2026-12-01",
    });

    // O caso normal (calendário segunda-sexta) faz até 4 consultas. Este
    // caso adversarial faz mais (teve que expandir), mas nunca perto do
    // que seria 1 consulta por dia dos ~120+ dias civis envolvidos.
    expect(contador.total()).toBeGreaterThan(4);
    expect(contador.total()).toBeLessThan(40);
  });
});
