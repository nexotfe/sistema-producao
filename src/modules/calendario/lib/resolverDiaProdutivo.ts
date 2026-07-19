// Depende de "@/lib/supabaseClient", cujo client e criado com
// persistSession/detectSessionInUrl (ambos dependem de localStorage/window)
// - por isso e exclusivo de navegador hoje. Uma futura execucao server-side
// (job de agregacao de janela, rota de API) vai precisar de um client
// Supabase separado, seguro para servidor.
"use client";

import { supabase } from "@/lib/supabaseClient";
import {
  ConfiguracaoCalendarioAusenteError,
  IntegridadeCalendarioError,
  TipoEventoNaoSuportadoError,
} from "./errors";

export type OrigemResolucao =
  | "padrao_semanal"
  | "feriado_oficial"
  | "evento_empresa";

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

function validarData(data: string): void {
  if (!REGEX_DATA_ISO.test(data)) {
    throw new TypeError(
      `Data inválida: "${data}". Esperado o formato YYYY-MM-DD.`,
    );
  }

  const [ano, mes, dia] = data.split("-").map(Number);
  const dataUtc = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    dataUtc.getUTCFullYear() !== ano ||
    dataUtc.getUTCMonth() !== mes - 1 ||
    dataUtc.getUTCDate() !== dia
  ) {
    throw new TypeError(
      `Data inválida: "${data}" não corresponde a uma data civil real.`,
    );
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

type FeriadoRow = {
  abrangencia: AbrangenciaFeriado;
  uf_codigo: string | null;
  municipio_codigo: string | null;
  descricao: string;
};

export async function resolverDiaProdutivo(
  empresaId: string,
  data: string,
): Promise<ResultadoDiaProdutivo> {
  validarData(data);

  // Etapa 1 - Calendario Operacional da Empresa (base)
  const { data: padrao, error: erroPadrao } = await supabase
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
    // Ambiguidade estrutural do .maybeSingle(): nenhuma linha visivel aqui
    // tanto significa "empresa nunca configurou o calendario" quanto "RLS
    // ocultou a linha por falta de sessao autenticada" - os dois casos sao
    // indistinguiveis neste ponto. Em uso normal isso nao importa (a funcao
    // sempre roda com uma sessao real), mas nao leia este erro como prova
    // de cadastro incompleto sem antes confirmar que ha sessao autenticada.
    throw new ConfiguracaoCalendarioAusenteError(empresaId);
  }

  const diaSemanaIndex = new Date(`${data}T00:00:00Z`).getUTCDay();
  const diaSemana = DIAS_SEMANA[diaSemanaIndex];
  const baseProdutiva = Boolean(
    (padrao as Record<string, boolean>)[diaSemana.coluna],
  );

  let produtivo = baseProdutiva;
  let origem: OrigemResolucao = "padrao_semanal";
  let motivo = baseProdutiva
    ? `${diaSemana.label}: padrão semanal da empresa marca como produtivo.`
    : `${diaSemana.label}: padrão semanal da empresa marca como não produtivo.`;

  // Etapa 2 - Calendario Oficial (subtrai)
  const { data: empresa, error: erroEmpresa } = await supabase
    .from("empresas")
    .select("pais_codigo,uf_codigo,municipio_codigo")
    .eq("id", empresaId)
    .maybeSingle();

  if (erroEmpresa) {
    throw new Error(
      `Erro ao consultar empresas para id=${empresaId}: ${formatarErroSupabase(erroEmpresa)}`,
    );
  }

  if (empresa?.pais_codigo) {
    const { data: feriados, error: erroFeriados } = await supabase
      .from("calendario_oficial_feriados")
      .select("abrangencia,uf_codigo,municipio_codigo,descricao")
      .eq("data", data)
      .eq("pais_codigo", empresa.pais_codigo);

    if (erroFeriados) {
      throw new Error(
        `Erro ao consultar calendario_oficial_feriados para data=${data} pais_codigo=${empresa.pais_codigo}: ${formatarErroSupabase(erroFeriados)}`,
      );
    }

    const aplicaveis = ((feriados ?? []) as FeriadoRow[]).filter(
      (feriado) => {
        if (feriado.abrangencia === "nacional") return true;

        if (feriado.abrangencia === "estadual") {
          return (
            Boolean(empresa.uf_codigo) &&
            feriado.uf_codigo === empresa.uf_codigo
          );
        }

        if (feriado.abrangencia === "municipal") {
          return (
            Boolean(empresa.uf_codigo) &&
            Boolean(empresa.municipio_codigo) &&
            feriado.uf_codigo === empresa.uf_codigo &&
            feriado.municipio_codigo === empresa.municipio_codigo
          );
        }

        return false;
      },
    );

    if (aplicaveis.length > 0) {
      const maisEspecifico = aplicaveis.reduce((atual, candidato) =>
        PRIORIDADE_ABRANGENCIA[candidato.abrangencia] >
        PRIORIDADE_ABRANGENCIA[atual.abrangencia]
          ? candidato
          : atual,
      );

      produtivo = false;
      origem = "feriado_oficial";
      motivo = `Feriado ${maisEspecifico.abrangencia} aplicável: ${maisEspecifico.descricao} (${data}).`;
    }
  }

  // Etapa 3 - Calendario de Eventos da Empresa (prevalece sobre 1 e 2)
  const { data: eventos, error: erroEventos } = await supabase
    .from("calendario_empresa_eventos")
    .select("id,tipo")
    .eq("empresa_id", empresaId)
    .eq("data", data)
    .eq("ativo", true)
    .is("deleted_at", null);

  if (erroEventos) {
    throw new Error(
      `Erro ao consultar calendario_empresa_eventos para empresa_id=${empresaId} data=${data}: ${formatarErroSupabase(erroEventos)}`,
    );
  }

  const eventosAtivos = eventos ?? [];

  if (eventosAtivos.length > 1) {
    throw new IntegridadeCalendarioError(
      empresaId,
      data,
      eventosAtivos.map((evento) => evento.id),
    );
  }

  if (eventosAtivos.length === 1) {
    const tipo = eventosAtivos[0].tipo as string;

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
        throw new TipoEventoNaoSuportadoError(empresaId, data, tipo);
    }
  }

  return { produtivo, origem, motivo };
}
