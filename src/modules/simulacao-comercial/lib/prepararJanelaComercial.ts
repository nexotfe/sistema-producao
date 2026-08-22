// Camada de preparação comercial (PAD-008 v2.0, seção 17) - deriva a
// janela produtiva a partir das premissas comerciais (Margem de
// Segurança, Data Prevista de Aprovação do Pedido, Data de Necessidade),
// ANTES de qualquer execução do núcleo do Motor (seção 6.1/9). Não
// recalcula calendário duas vezes: reaproveita deslocarDiasProdutivos e
// contarDiasProdutivosNaJanela.
//
// Fora de escopo desta entrega (PAD-008 v2.0, seções 18-19, decisão
// aprovada pendente de implementação): distribuição parcial entre
// recursos e o calculador reverso diário. Esta camada só deriva a
// janela [dataDisponibilidadeProducao, prazoInterno] usada pelo núcleo
// sequencial atual, sem tentar calcular a Data de Início Necessária.
//
// Sem "use client": recebe o client Supabase por parâmetro - portável
// entre o preview no navegador e a revalidação autoritativa no servidor,
// mesmo padrão de prepararEntradasMotor.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { deslocarDiasProdutivos } from "@/modules/calendario/lib/deslocarDiasProdutivos";
import {
  carregarContextoCalendario,
  estimarJanelaCivil,
} from "@/modules/calendario/lib/contextoCalendario";
import { contarDiasProdutivosNaJanela } from "./agregarDiasProdutivos";
import type { DiferencaSimulacao } from "./compararResultadosSimulacao";

/**
 * Decomposição fechada em DEC-004 v1.1 / PAD-008 v2.0 §17.4: 1 dia
 * produtivo para criar a requisição + 1 dia produtivo para realizar a
 * compra + 7 dias produtivos para chegada prevista do material.
 * Regra provisória, válida enquanto o módulo de Compras não existir.
 */
export const DIAS_PRODUTIVOS_ATE_CHEGADA_MATERIAL = 9;

export interface PremissasJanelaComercial {
  /** projetos.data_objetivo (ou editada pelo orçamentista) - a Data de Necessidade do cliente. */
  dataNecessidade: string;
  /** Dias produtivos de folga interna (DEC-004 v1.1, "Papel do orçamentista"). Inteiro >= 0. */
  margemSegurancaDiasProdutivos: number;
  /** Estimativa do orçamentista de quando o pedido do cliente será confirmado (DEC-004 v1.1). Não é situacao_comercial. */
  dataPrevistaAprovacaoPedido: string;
}

export type MotivoAusenciaJanela =
  | "disponibilidade_apos_prazo_interno"
  | "sem_dia_produtivo_no_intervalo";

export interface JanelaComercialValida {
  valida: true;
  dataChegadaPrevista: string;
  dataDisponibilidadeProducao: string;
  prazoInterno: string;
  /** = dataDisponibilidadeProducao (PAD-008 v2.0 §17: janela usada pelo Motor nesta entrega). */
  janelaInicio: string;
  /** = prazoInterno. */
  janelaFim: string;
}

export interface JanelaComercialInvalida {
  valida: false;
  motivo: MotivoAusenciaJanela;
  dataChegadaPrevista: string;
  dataDisponibilidadeProducao: string;
  prazoInterno: string;
}

export type ResultadoJanelaComercial = JanelaComercialValida | JanelaComercialInvalida;

function somarDiasCivis(data: string, quantidade: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const resultado = new Date(Date.UTC(ano, mes - 1, dia + quantidade));
  return resultado.toISOString().slice(0, 10);
}

// Quantos dias produtivos as três datas derivadas podem, no pior caso,
// se afastar da respectiva data-base - usado só para dimensionar o
// contexto de calendário único (carregarContextoCalendario) que esta
// function compartilha entre os quatro cálculos abaixo (correção de
// performance/N+1: antes eram até ~30 consultas de rede POR dia civil
// examinado, quatro vezes). +1 de folga no lado da chegada cobre o
// deslocamento extra de "+1 dia produtivo" até a disponibilidade.
function diasProdutivosMaximosNecessarios(margemSegurancaDiasProdutivos: number): number {
  return Math.max(DIAS_PRODUTIVOS_ATE_CHEGADA_MATERIAL + 1, margemSegurancaDiasProdutivos);
}

/**
 * "padrao" (default, comportamento inalterado para as demais naturezas
 * e para a tela /simulacao, que nunca passa este parâmetro): Data de
 * Chegada Prevista = Data Prevista de Aprovação do Pedido + 9 dias
 * produtivos; Disponibilidade para Produção = Chegada + 1 dia produtivo
 * (hipótese conservadora, DEC-004 v1.1).
 *
 * "industrializacao" (projeto de Industrialização, orçamento 260007,
 * DEC-007): a folga de +9+1 dias NUNCA se aplicou de verdade a essa
 * natureza - o material é fornecido pelo próprio cliente, disponível já
 * na Data Prevista de Aprovação do Pedido, sem etapa de compra/chegada
 * (mesmo motivo já registrado em buscarDadosOrcamento.ts, que exclui
 * matéria-prima do custo para esta natureza). Chegada e Disponibilidade
 * ficam iguais à Data Prevista de Aprovação do Pedido, sem nenhum
 * deslocamento - causa raiz real do travamento de "Calcular cenário
 * atual" para premissas realistas de Industrialização (a fórmula
 * genérica rejeitava como "janela inválida" combinações de data que são
 * perfeitamente válidas para esta natureza).
 */
export type ModoDisponibilidadeMaterial = "padrao" | "industrializacao";

/**
 * Deriva Prazo Interno, Data de Chegada Prevista, Data de Disponibilidade
 * para Produção e a janela produtiva resultante - PAD-008 v2.0 §17.
 * Não executa o núcleo do Motor; só decide SE ele pode ser executado.
 */
export async function prepararJanelaComercial(
  client: SupabaseClient,
  empresaId: string,
  premissas: PremissasJanelaComercial,
  modoDisponibilidadeMaterial: ModoDisponibilidadeMaterial = "padrao",
): Promise<ResultadoJanelaComercial> {
  if (
    !Number.isInteger(premissas.margemSegurancaDiasProdutivos) ||
    premissas.margemSegurancaDiasProdutivos < 0
  ) {
    throw new RangeError(
      `margemSegurancaDiasProdutivos deve ser um número inteiro não negativo: ${premissas.margemSegurancaDiasProdutivos}`,
    );
  }

  // Contexto de calendário único, compartilhado pelos três deslocamentos
  // abaixo e pela contagem final (contarDiasProdutivosNaJanela) - uma
  // janela civil generosa em torno das duas datas-base, calculada com a
  // mesma heurística que deslocarDiasProdutivos usaria sozinho. Se algum
  // cálculo precisar de mais do que esta janela cobre (calendário atípico
  // com muitos dias não produtivos seguidos), cada função busca o
  // restante sozinha - nunca fica incorreto, só perde parte do atalho.
  const folgaProdutivos = diasProdutivosMaximosNecessarios(
    premissas.margemSegurancaDiasProdutivos,
  );
  const janelaCivil = estimarJanelaCivil(folgaProdutivos);

  const limiteInferior = somarDiasCivis(premissas.dataNecessidade, -janelaCivil);
  const limiteSuperior = somarDiasCivis(premissas.dataPrevistaAprovacaoPedido, janelaCivil);

  const dataInicioContexto =
    premissas.dataPrevistaAprovacaoPedido < limiteInferior
      ? premissas.dataPrevistaAprovacaoPedido
      : limiteInferior;
  const dataFimContexto =
    premissas.dataNecessidade > limiteSuperior ? premissas.dataNecessidade : limiteSuperior;

  const contexto = await carregarContextoCalendario(
    client,
    empresaId,
    dataInicioContexto,
    dataFimContexto,
  );

  // Deslocamento negativo (PAD-008 v2.0 §17.2): -0 é tratado como 0 pelo
  // próprio JavaScript (0 === -0), preservando deslocarDiasProdutivos(d,0) = d.
  const prazoInterno = await deslocarDiasProdutivos(
    client,
    empresaId,
    premissas.dataNecessidade,
    -premissas.margemSegurancaDiasProdutivos,
    { contexto },
  );

  let dataChegadaPrevista: string;
  let dataDisponibilidadeProducao: string;

  if (modoDisponibilidadeMaterial === "industrializacao") {
    // Sem etapa de compra/chegada para esta natureza - ver comentário de
    // ModoDisponibilidadeMaterial acima. Nenhum deslocamento de
    // calendário aplicado (nem a folga de +9 dias, nem o +1 dia
    // conservador) - a disponibilidade é a própria data informada,
    // literalmente, mesmo que caia num dia não produtivo (decisão
    // confirmada com o usuário: contarDiasProdutivosNaJanela, logo
    // abaixo, continua sendo quem decide se a janela resultante tem
    // algum dia produtivo utilizável).
    dataChegadaPrevista = premissas.dataPrevistaAprovacaoPedido;
    dataDisponibilidadeProducao = premissas.dataPrevistaAprovacaoPedido;
  } else {
    dataChegadaPrevista = await deslocarDiasProdutivos(
      client,
      empresaId,
      premissas.dataPrevistaAprovacaoPedido,
      DIAS_PRODUTIVOS_ATE_CHEGADA_MATERIAL,
      { contexto },
    );

    // Hipótese conservadora (DEC-004 v1.1): o material pode chegar no fim
    // do dia - o próprio dia da chegada não tem capacidade utilizável.
    dataDisponibilidadeProducao = await deslocarDiasProdutivos(
      client,
      empresaId,
      dataChegadaPrevista,
      1,
      { contexto },
    );
  }

  if (dataDisponibilidadeProducao > prazoInterno) {
    return {
      valida: false,
      motivo: "disponibilidade_apos_prazo_interno",
      dataChegadaPrevista,
      dataDisponibilidadeProducao,
      prazoInterno,
    };
  }

  // dataDisponibilidadeProducao <= prazoInterno aqui, garantido pelo
  // `if` acima - contarDiasProdutivosNaJanela nunca lança RangeError.
  const { diasProdutivos } = await contarDiasProdutivosNaJanela(
    client,
    empresaId,
    dataDisponibilidadeProducao,
    prazoInterno,
    { contexto },
  );

  if (diasProdutivos === 0) {
    return {
      valida: false,
      motivo: "sem_dia_produtivo_no_intervalo",
      dataChegadaPrevista,
      dataDisponibilidadeProducao,
      prazoInterno,
    };
  }

  return {
    valida: true,
    dataChegadaPrevista,
    dataDisponibilidadeProducao,
    prazoInterno,
    janelaInicio: dataDisponibilidadeProducao,
    janelaFim: prazoInterno,
  };
}

const ROTULO_DIFERENCA_JANELA = "janela-comercial";

/**
 * Compara a janela efetivamente avaliada (janelaInicio/janelaFim) entre
 * duas preparações - usada tanto na revalidação do cliente (DEC-002)
 * quanto na aprovação autoritativa no servidor (PAD-008 v2.0 §8/§17):
 * o servidor nunca persiste a janela enviada pelo navegador sem antes
 * recalculá-la e comparar.
 */
export function compararJanelaEfetiva(
  anterior: { janelaInicio: string; janelaFim: string },
  novo: { janelaInicio: string; janelaFim: string },
): DiferencaSimulacao[] {
  const diferencas: DiferencaSimulacao[] = [];

  if (anterior.janelaInicio !== novo.janelaInicio) {
    diferencas.push({
      operacao: ROTULO_DIFERENCA_JANELA,
      campo: "janelaInicio",
      valorAnterior: anterior.janelaInicio,
      valorNovo: novo.janelaInicio,
    });
  }

  if (anterior.janelaFim !== novo.janelaFim) {
    diferencas.push({
      operacao: ROTULO_DIFERENCA_JANELA,
      campo: "janelaFim",
      valorAnterior: anterior.janelaFim,
      valorNovo: novo.janelaFim,
    });
  }

  return diferencas;
}

/**
 * Compara premissas comerciais para decidir se um resultado de simulação
 * já exibido precisa ser invalidado (DEC-004 v1.1, "Papel do orçamentista":
 * "Qualquer alteração posterior invalida o resultado apresentado").
 * Função pura, sem I/O - usada pela UI para decidir quando limpar o
 * resultado exibido.
 */
export function premissasComerciaisMudaram(
  anterior: PremissasJanelaComercial,
  atual: PremissasJanelaComercial,
): boolean {
  return (
    anterior.dataNecessidade !== atual.dataNecessidade ||
    anterior.margemSegurancaDiasProdutivos !== atual.margemSegurancaDiasProdutivos ||
    anterior.dataPrevistaAprovacaoPedido !== atual.dataPrevistaAprovacaoPedido
  );
}
