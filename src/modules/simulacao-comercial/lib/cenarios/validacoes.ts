// DEC-007 - Fase 0: validação defensiva compartilhada do núcleo do
// motor diário. Nenhum valor externo (candidato injetado, parâmetro de
// chamada) é confiado sem checagem - NaN/infinito/negativo em
// produtividade, horas ou necessário contaminaria todo o cenário
// silenciosamente (produtividade zero, em particular, causa divisão
// por zero em unidades.ts).
export const PRODUTIVIDADE_MAXIMA = 1;

export function validarProdutividade(produtividade: number, nomeParametro = "produtividade"): void {
  if (!Number.isFinite(produtividade) || produtividade <= 0 || produtividade > PRODUTIVIDADE_MAXIMA) {
    throw new RangeError(
      `${nomeParametro} precisa ser finita e estar no intervalo (0, ${PRODUTIVIDADE_MAXIMA}] - recebido: ${produtividade}`,
    );
  }
}

export function validarHorasFinitasNaoNegativas(horas: number, nomeParametro: string): void {
  if (!Number.isFinite(horas) || horas < 0) {
    throw new RangeError(`${nomeParametro} precisa ser finito e não negativo - recebido: ${horas}`);
  }
}

const REGEX_DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

// Date.parse/`new Date(string)` são inconsistentes para rejeitar datas
// de calendário inexistentes (o comportamento varia por engine e por
// componente - mês fora de 1-12 costuma ser rejeitado, mas dia
// inexistente dentro de um mês válido, como 30 de fevereiro, pode
// "rolar" silenciosamente para o mês seguinte em vez de falhar).
// Validação real: reconstrói a data via Date.UTC (que SEMPRE normaliza,
// nunca rejeita) e confere se os componentes lidos de volta batem com
// os informados - se o dia "rolou" para outro mês/ano, a comparação
// falha e a data é rejeitada explicitamente.
export function validarDataIso(data: string, nomeParametro = "data"): void {
  const partes = typeof data === "string" ? REGEX_DATA_ISO.exec(data) : null;
  if (!partes) {
    throw new RangeError(`${nomeParametro} precisa ser uma data ISO válida (YYYY-MM-DD) - recebido: ${JSON.stringify(data)}`);
  }

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const comoData = new Date(Date.UTC(ano, mes - 1, dia));
  const rolou =
    comoData.getUTCFullYear() !== ano || comoData.getUTCMonth() !== mes - 1 || comoData.getUTCDate() !== dia;

  if (rolou) {
    throw new RangeError(
      `${nomeParametro} não é uma data de calendário válida (dia/mês inexistente) - recebido: ${JSON.stringify(data)}`,
    );
  }
}

export function validarDatasEstritamenteCrescentes(datas: string[], nomeParametro = "datasOrdenadas"): void {
  for (let indice = 0; indice < datas.length; indice++) {
    validarDataIso(datas[indice], `${nomeParametro}[${indice}]`);
    if (indice > 0 && datas[indice] <= datas[indice - 1]) {
      throw new RangeError(
        `${nomeParametro} precisa estar estritamente crescente e sem repetição - "${datas[indice - 1]}" seguido de "${datas[indice]}" na posição ${indice}.`,
      );
    }
  }
}
