// Sem "use client": recebe o client Supabase por parâmetro (browser,
// sessão do servidor, ou privilegiado - a escolha é de quem chama),
// portável entre o preview no navegador e a revalidação autoritativa
// no servidor (PAD-008, seções 7-8).
//
// Wrapper fino sobre contextoCalendario.ts (correção de performance -
// eliminação do N+1 de deslocarDiasProdutivos/contarDiasProdutivosNaJanela,
// que chamavam esta function uma vez por dia civil examinado): a regra de
// precedência do calendário (Operacional -> Oficial -> Eventos) mora só em
// resolverDiaProdutivoComContexto agora - esta function só carrega um
// contexto de 1 dia (mesmo número de consultas de antes, para quem só
// precisa de UM dia) e delega. Nenhuma regra de negócio mudou.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  carregarContextoCalendario,
  resolverDiaProdutivoComContexto,
  type OrigemResolucao,
  type ResultadoDiaProdutivo,
} from "./contextoCalendario";

export type { OrigemResolucao, ResultadoDiaProdutivo };

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Contrato público desta function (mensagem exata, sem qualificador de
// "campo") - preservado intencionalmente igual ao de antes da correção de
// performance/N+1, mesmo carregarContextoCalendario tendo sua própria
// validação (com rótulo "dataInicio"/"dataFim") internamente. Validar
// aqui, antes de delegar, garante que quem já trata TypeError desta
// function por mensagem não quebra.
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

export async function resolverDiaProdutivo(
  client: SupabaseClient,
  empresaId: string,
  data: string,
): Promise<ResultadoDiaProdutivo> {
  validarData(data);
  const contexto = await carregarContextoCalendario(client, empresaId, data, data);
  return resolverDiaProdutivoComContexto(contexto, data);
}
