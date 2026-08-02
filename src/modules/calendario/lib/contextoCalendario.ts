// Contexto de calendário pré-carregado em lote para um intervalo de datas -
// elimina o padrão N+1 que resolverDiaProdutivo/deslocarDiasProdutivos
// tinham antes (até 4 consultas ao Supabase POR DIA CIVIL examinado).
//
// Este módulo é a ÚNICA fonte da regra de precedência do calendário
// (Calendário Operacional -> Calendário Oficial -> Eventos da Empresa,
// seção 7): resolverDiaProdutivo.ts passou a ser um wrapper fino que
// carrega um contexto de 1 dia e delega para resolverDiaProdutivoComContexto
// - nenhuma regra foi duplicada nem reescrita, só reorganizada para poder
// ser executada em memória depois de um carregamento em lote.
//
// Sem "use client": recebe o client Supabase por parâmetro, mesmo padrão
// do resto do módulo de calendário.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ConfiguracaoCalendarioAusenteError,
  IntegridadeCalendarioError,
  TipoEventoNaoSuportadoError,
} from "./errors";

export type OrigemResolucao = "padrao_semanal" | "feriado_oficial" | "evento_empresa";

export interface ResultadoDiaProdutivo {
  produtivo: boolean;
  origem: OrigemResolucao;
  motivo: string;
}

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
};

function formatarErroSupabase(error: SupabaseErrorLike): string {
  const detalhes = error.details ? ` — ${error.details}` : "";
  const dica = error.hint ? ` (${error.hint})` : "";
  return `${error.message ?? "erro desconhecido"}${detalhes}${dica}`;
}

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function validarData(data: string, rotulo: string): void {
  if (!REGEX_DATA_ISO.test(data)) {
    throw new TypeError(`Data inválida em ${rotulo}: "${data}". Esperado o formato YYYY-MM-DD.`);
  }

  const [ano, mes, dia] = data.split("-").map(Number);
  const dataUtc = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    dataUtc.getUTCFullYear() !== ano ||
    dataUtc.getUTCMonth() !== mes - 1 ||
    dataUtc.getUTCDate() !== dia
  ) {
    throw new TypeError(`Data inválida em ${rotulo}: "${data}" não corresponde a uma data civil real.`);
  }
}

const DIAS_SEMANA = [
  { coluna: "domingo", label: "Domingo" },
  { coluna: "segunda", label: "Segunda-feira" },
  { coluna: "terca", label: "Terça-feira" },
  { coluna: "quarta", label: "Quarta-feira" },
  { coluna: "quinta", label: "Quinta-feira" },
  { coluna: "sexta", label: "Sexta-feira" },
  { coluna: "sabado", label: "Sábado" },
] as const;

type AbrangenciaFeriado = "nacional" | "estadual" | "municipal";

const PRIORIDADE_ABRANGENCIA: Record<AbrangenciaFeriado, number> = {
  municipal: 3,
  estadual: 2,
  nacional: 1,
};

type PadraoSemanalRow = Record<(typeof DIAS_SEMANA)[number]["coluna"], boolean>;

type FeriadoRow = {
  id: string;
  data: string;
  abrangencia: AbrangenciaFeriado;
  uf_codigo: string | null;
  municipio_codigo: string | null;
  descricao: string;
};

type EventoRow = {
  id: string;
  data: string;
  tipo: string;
};

/**
 * Snapshot em memória de tudo que resolverDiaProdutivoComContexto precisa
 * para resolver qualquer dia dentro de [dataInicio, dataFim] sem nenhuma
 * consulta adicional. Carregado uma única vez (4 consultas, não importa o
 * tamanho do intervalo) por carregarContextoCalendario.
 *
 * Não é cache global: é criado a cada chamada, sempre para UMA empresa e
 * UM intervalo específico - nunca compartilhado entre empresas nem
 * reaproveitado além do escopo de quem o pediu.
 */
export interface ContextoCalendario {
  empresaId: string;
  dataInicio: string;
  dataFim: string;
  padraoSemanal: PadraoSemanalRow;
  paisCodigo: string | null;
  ufCodigo: string | null;
  municipioCodigo: string | null;
  feriadosPorData: Map<string, FeriadoRow[]>;
  eventosPorData: Map<string, EventoRow[]>;
}

function dentroDoContexto(contexto: ContextoCalendario, data: string): boolean {
  return data >= contexto.dataInicio && data <= contexto.dataFim;
}

// Auditoria da correção de N+1, ponto 3: o Supabase/PostgREST tem um teto
// de linhas por resposta (db.max_rows, 1000 no supabase/config.toml deste
// projeto) - uma consulta sem paginação que bata nesse teto TRUNCA em
// silêncio (sem erro), o que faria feriados/eventos fora das primeiras
// N linhas desaparecerem da resolução sem nenhum aviso. 500 é
// deliberadamente menor que os 1000 configurados, com folga de segurança
// caso o teto real do projeto seja mais baixo do que o config.toml local
// - se o servidor devolver menos que TAMANHO_PAGINA numa página, isso é
// tratado como "acabaram os dados", então o valor pedido não pode ser
// maior que o teto real de resposta, ou a paginação pararia cedo demais.
const TAMANHO_PAGINA_SUPABASE = 500;

type ConsultaPaginavel<T> = (
  offset: number,
  limite: number,
) => PromiseLike<{ data: T[] | null; error: SupabaseErrorLike | null }>;

/**
 * Busca todas as linhas de uma consulta potencialmente maior que o teto
 * de resposta do Supabase, paginando com `.range()` até receber uma
 * página menor que TAMANHO_PAGINA_SUPABASE (sinal de que não há mais
 * dados). O número de consultas geradas escala com o número de PÁGINAS
 * de resultado (raro passar de 1 na prática), nunca com dias civis.
 */
async function buscarTodasAsPaginas<T>(
  consulta: ConsultaPaginavel<T>,
  descricaoErro: string,
): Promise<T[]> {
  const linhas: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await consulta(offset, TAMANHO_PAGINA_SUPABASE);

    if (error) {
      throw new Error(`${descricaoErro}: ${formatarErroSupabase(error)}`);
    }

    const pagina = data ?? [];
    linhas.push(...pagina);

    if (pagina.length < TAMANHO_PAGINA_SUPABASE) {
      break;
    }

    offset += TAMANHO_PAGINA_SUPABASE;
  }

  return linhas;
}

// Heurística de tamanho de janela civil a pré-carregar para conseguir
// `diasProdutivos` dias produtivos - não é regra de negócio, só o
// tamanho do lote buscado de uma vez. Generosa o bastante para resolver
// a esmagadora maioria dos calendários reais (fins de semana + feriados
// esparsos) com uma única consulta em lote. Compartilhada entre
// deslocarDiasProdutivos.ts (que não sabe de antemão onde vai parar) e
// prepararJanelaComercial.ts (que usa para dimensionar o contexto único
// compartilhado entre as três datas da janela), para não duplicar os
// mesmos números mágicos em dois lugares.
const MULTIPLICADOR_DIAS_CIVIS = 3;
const FOLGA_DIAS_CIVIS = 14;
const TAMANHO_JANELA_MINIMO = 30;
export const MAX_DIAS_CIVIS_EXAMINADOS_PADRAO = 10000;

export function estimarJanelaCivil(
  diasProdutivos: number,
  maxDiasCivis: number = MAX_DIAS_CIVIS_EXAMINADOS_PADRAO,
): number {
  return Math.min(
    Math.max(diasProdutivos * MULTIPLICADOR_DIAS_CIVIS + FOLGA_DIAS_CIVIS, TAMANHO_JANELA_MINIMO),
    maxDiasCivis,
  );
}

/**
 * Carrega, em exatamente até 4 consultas (independente do tamanho do
 * intervalo), tudo que é necessário para resolver dia-a-dia em memória:
 * Calendário Operacional (1 linha, não varia por data), localização da
 * empresa (1 linha), Calendário Oficial e Eventos da Empresa filtrados
 * pelo intervalo [dataInicio, dataFim] (ambos inclusive).
 */
export async function carregarContextoCalendario(
  client: SupabaseClient,
  empresaId: string,
  dataInicio: string,
  dataFim: string,
): Promise<ContextoCalendario> {
  validarData(dataInicio, "dataInicio");
  validarData(dataFim, "dataFim");

  if (dataFim < dataInicio) {
    throw new RangeError(
      `dataFim (${dataFim}) não pode ser anterior a dataInicio (${dataInicio}) ao carregar o contexto de calendário.`,
    );
  }

  // Etapa 1 - Calendario Operacional da Empresa (base) - mesma consulta de
  // sempre, não depende de data, por isso só precisa rodar uma vez.
  const { data: padrao, error: erroPadrao } = await client
    .from("calendario_operacional_empresa")
    .select("segunda,terca,quarta,quinta,sexta,sabado,domingo")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (erroPadrao) {
    throw new Error(
      `Erro ao consultar calendario_operacional_empresa para empresa_id=${empresaId}: ${formatarErroSupabase(erroPadrao)}`,
    );
  }

  if (!padrao) {
    // Mesma ambiguidade estrutural do .maybeSingle() já documentada em
    // resolverDiaProdutivo.ts: nenhuma linha visível aqui tanto significa
    // "empresa nunca configurou o calendário" quanto "RLS ocultou a linha
    // por falta de sessão autenticada".
    throw new ConfiguracaoCalendarioAusenteError(empresaId);
  }

  // Etapa 2 - localização da empresa, para o Calendário Oficial.
  const { data: empresa, error: erroEmpresa } = await client
    .from("empresas")
    .select("pais_codigo,uf_codigo,municipio_codigo")
    .eq("id", empresaId)
    .maybeSingle();

  if (erroEmpresa) {
    throw new Error(
      `Erro ao consultar empresas para id=${empresaId}: ${formatarErroSupabase(erroEmpresa)}`,
    );
  }

  const paisCodigo = empresa?.pais_codigo ?? null;
  const ufCodigo = empresa?.uf_codigo ?? null;
  const municipioCodigo = empresa?.municipio_codigo ?? null;

  // Etapa 3 - Calendario Oficial, filtrado pelo intervalo inteiro de uma
  // vez (antes: 1 consulta por dia civil examinado) e paginado (ver
  // buscarTodasAsPaginas) - um intervalo grande (ex.: margem de segurança
  // de vários anos) pode legitimamente ter mais de mil feriados/eventos.
  //
  // `.order("data").order("id")`: paginação com `.range()` SEM ordenação
  // explícita não tem garantia de ordem estável entre páginas (o
  // otimizador do Postgres pode devolver a mesma linha em páginas
  // diferentes, ou pular linhas, se a ordem de varredura mudar entre as
  // chamadas) - risco real de linha duplicada ou omitida silenciosamente.
  // `data` sozinha NÃO é única aqui (constraint real:
  // UNIQUE(data, abrangencia, pais_codigo, uf_codigo, municipio_codigo)),
  // por isso o desempate é pela chave primária (`id`), a única coluna
  // garantidamente única da tabela.
  const feriadosPorData = new Map<string, FeriadoRow[]>();

  if (paisCodigo) {
    const feriados = await buscarTodasAsPaginas<FeriadoRow>(
      (offset, limite) =>
        client
          .from("calendario_oficial_feriados")
          .select("id,data,abrangencia,uf_codigo,municipio_codigo,descricao")
          .eq("pais_codigo", paisCodigo)
          .gte("data", dataInicio)
          .lte("data", dataFim)
          .order("data", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + limite - 1),
      `Erro ao consultar calendario_oficial_feriados para pais_codigo=${paisCodigo} entre ${dataInicio} e ${dataFim}`,
    );

    for (const feriado of feriados) {
      const lista = feriadosPorData.get(feriado.data) ?? [];
      lista.push(feriado);
      feriadosPorData.set(feriado.data, lista);
    }
  }

  // Etapa 4 - Eventos da Empresa, mesmo intervalo, também paginado e
  // ordenado de forma estável pelo mesmo motivo (constraint real aqui é
  // UNIQUE(empresa_id, data, tipo) - `data` sozinha também não é única).
  const eventos = await buscarTodasAsPaginas<EventoRow>(
    (offset, limite) =>
      client
        .from("calendario_empresa_eventos")
        .select("id,tipo,data")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .is("deleted_at", null)
        .gte("data", dataInicio)
        .lte("data", dataFim)
        .order("data", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + limite - 1),
    `Erro ao consultar calendario_empresa_eventos para empresa_id=${empresaId} entre ${dataInicio} e ${dataFim}`,
  );

  const eventosPorData = new Map<string, EventoRow[]>();
  for (const evento of eventos) {
    const lista = eventosPorData.get(evento.data) ?? [];
    lista.push(evento);
    eventosPorData.set(evento.data, lista);
  }

  return {
    empresaId,
    dataInicio,
    dataFim,
    padraoSemanal: padrao as PadraoSemanalRow,
    paisCodigo,
    ufCodigo,
    municipioCodigo,
    feriadosPorData,
    eventosPorData,
  };
}

/**
 * Resolve um único dia a partir de um contexto já carregado - nenhuma
 * consulta de rede. Mesma regra de precedência de resolverDiaProdutivo.ts
 * (Operacional -> Oficial -> Eventos), aplicada em memória.
 *
 * Lança um erro interno (não um dos erros de domínio) se `data` estiver
 * fora de [contexto.dataInicio, contexto.dataFim] - sinal de bug de quem
 * chamou (contexto carregado pequeno demais), não uma condição de negócio.
 */
export function resolverDiaProdutivoComContexto(
  contexto: ContextoCalendario,
  data: string,
): ResultadoDiaProdutivo {
  validarData(data, "data");

  if (!dentroDoContexto(contexto, data)) {
    throw new Error(
      `resolverDiaProdutivoComContexto: data ${data} fora do intervalo pré-carregado [${contexto.dataInicio}, ${contexto.dataFim}] - contexto carregado com janela insuficiente.`,
    );
  }

  const diaSemanaIndex = new Date(`${data}T00:00:00Z`).getUTCDay();
  const diaSemana = DIAS_SEMANA[diaSemanaIndex];
  const baseProdutiva = Boolean(contexto.padraoSemanal[diaSemana.coluna]);

  let produtivo = baseProdutiva;
  let origem: OrigemResolucao = "padrao_semanal";
  let motivo = baseProdutiva
    ? `${diaSemana.label}: padrão semanal da empresa marca como produtivo.`
    : `${diaSemana.label}: padrão semanal da empresa marca como não produtivo.`;

  // Etapa 2 - Calendario Oficial (subtrai)
  if (contexto.paisCodigo) {
    const feriadosNaData = contexto.feriadosPorData.get(data) ?? [];

    const aplicaveis = feriadosNaData.filter((feriado) => {
      if (feriado.abrangencia === "nacional") return true;

      if (feriado.abrangencia === "estadual") {
        return Boolean(contexto.ufCodigo) && feriado.uf_codigo === contexto.ufCodigo;
      }

      if (feriado.abrangencia === "municipal") {
        return (
          Boolean(contexto.ufCodigo) &&
          Boolean(contexto.municipioCodigo) &&
          feriado.uf_codigo === contexto.ufCodigo &&
          feriado.municipio_codigo === contexto.municipioCodigo
        );
      }

      return false;
    });

    if (aplicaveis.length > 0) {
      const maisEspecifico = aplicaveis.reduce((atual, candidato) =>
        PRIORIDADE_ABRANGENCIA[candidato.abrangencia] > PRIORIDADE_ABRANGENCIA[atual.abrangencia]
          ? candidato
          : atual,
      );

      produtivo = false;
      origem = "feriado_oficial";
      motivo = `Feriado ${maisEspecifico.abrangencia} aplicável: ${maisEspecifico.descricao} (${data}).`;
    }
  }

  // Etapa 3 - Calendario de Eventos da Empresa (prevalece sobre 1 e 2)
  const eventosAtivos = contexto.eventosPorData.get(data) ?? [];

  if (eventosAtivos.length > 1) {
    throw new IntegridadeCalendarioError(
      contexto.empresaId,
      data,
      eventosAtivos.map((evento) => evento.id),
    );
  }

  if (eventosAtivos.length === 1) {
    const tipo = eventosAtivos[0].tipo;

    switch (tipo) {
      case "dia_trabalhado_excepcional":
        produtivo = true;
        origem = "evento_empresa";
        motivo = `Evento "dia_trabalhado_excepcional" registrado nesta data sobrepõe o padrão semanal e o Calendário Oficial.`;
        break;
      case "recesso_coletivo":
      case "inventario":
      case "paralisacao":
      case "feriado_local_temporario":
        produtivo = false;
        origem = "evento_empresa";
        motivo = `Evento "${tipo}" registrado nesta data sobrepõe o padrão semanal e o Calendário Oficial.`;
        break;
      default:
        throw new TipoEventoNaoSuportadoError(contexto.empresaId, data, tipo);
    }
  }

  return { produtivo, origem, motivo };
}
