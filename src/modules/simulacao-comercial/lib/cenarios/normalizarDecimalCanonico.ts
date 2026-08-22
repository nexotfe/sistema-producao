// Normaliza um decimal (vindo de numeric do Postgres, sempre como string
// - nunca number, para não perder precisão antes mesmo de chegar aqui)
// para uma representação textual canônica, usada como entrada da
// assinatura técnica (construirDocumentoAssinaturaTecnica.ts). Trabalha
// inteiramente sobre texto, nunca convertendo para number internamente -
// um IEEE 754 não representa exatamente todo decimal (ex.: 0.1 + 0.2),
// e essa é exatamente a divergência que a assinatura não pode ter entre
// navegador/servidor/duas leituras do mesmo valor.
//
// Regras: remove zeros à esquerda da parte inteira e à direita da parte
// fracionária (preserva todos os dígitos SIGNIFICATIVOS); notação
// científica é expandida para decimal plano, nunca aceita como está
// (evita "1e2" e "100" produzirem textos diferentes para o mesmo valor);
// "-0"/"-0.00" viram "0" (sinal de zero não é significativo); NaN,
// Infinity, string vazia ou qualquer formato que não seja um número
// decimal válido lançam RangeError explícito - nunca um valor
// silenciosamente incorreto entrando na assinatura.

const PADRAO_DECIMAL_PLANO = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const PADRAO_CIENTIFICO = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/;

function expandirNotacaoCientifica(
  sinal: string,
  parteInteira: string,
  parteFracionaria: string,
  expoenteTexto: string,
): { sinal: string; inteiro: string; fracionario: string } {
  const expoente = Number(expoenteTexto);
  const digitos = parteInteira + parteFracionaria;
  const posicaoPontoOriginal = parteInteira.length;
  const novaPosicaoPonto = posicaoPontoOriginal + expoente;

  let inteiro: string;
  let fracionario: string;

  if (novaPosicaoPonto <= 0) {
    inteiro = "0";
    fracionario = "0".repeat(-novaPosicaoPonto) + digitos;
  } else if (novaPosicaoPonto >= digitos.length) {
    inteiro = digitos + "0".repeat(novaPosicaoPonto - digitos.length);
    fracionario = "";
  } else {
    inteiro = digitos.slice(0, novaPosicaoPonto);
    fracionario = digitos.slice(novaPosicaoPonto);
  }

  return { sinal, inteiro, fracionario };
}

export function normalizarDecimalCanonico(valorBruto: string | number): string {
  if (typeof valorBruto === "number") {
    if (!Number.isFinite(valorBruto)) {
      throw new RangeError(
        `normalizarDecimalCanonico: valor numérico não finito (${String(valorBruto)}) - NaN/Infinity nunca são aceitos.`,
      );
    }
    // number.toString() pode produzir notação científica para valores
    // muito grandes/pequenos (ex.: (1e-8).toString() === "1e-8") - cai
    // no mesmo caminho de expansão usado para string vinda de fora,
    // nunca um caminho separado que poderia divergir.
    valorBruto = valorBruto.toString();
  }

  const texto = valorBruto.trim();

  if (texto === "") {
    throw new RangeError("normalizarDecimalCanonico: entrada vazia não é um decimal válido.");
  }

  if (/^[+-]?(NaN|Infinity)$/i.test(texto)) {
    throw new RangeError(`normalizarDecimalCanonico: valor não numérico rejeitado ("${texto}").`);
  }

  let sinal: string;
  let inteiro: string;
  let fracionario: string;

  const casaCientifica = PADRAO_CIENTIFICO.exec(texto);
  if (casaCientifica) {
    const [, sinalBruto, parteInteira, parteFracionaria = "", expoenteTexto] = casaCientifica;
    ({ sinal, inteiro, fracionario } = expandirNotacaoCientifica(
      sinalBruto,
      parteInteira,
      parteFracionaria,
      expoenteTexto,
    ));
  } else {
    const casaDecimal = PADRAO_DECIMAL_PLANO.exec(texto);
    if (!casaDecimal) {
      throw new RangeError(
        `normalizarDecimalCanonico: formato decimal inválido ("${texto}") - esperado um número decimal (ex.: "1500.50", "-3", "0.001").`,
      );
    }
    const [, sinalBruto, parteInteira, parteFracionaria = ""] = casaDecimal;
    sinal = sinalBruto;
    inteiro = parteInteira;
    fracionario = parteFracionaria;
  }

  // Zeros à esquerda da parte inteira: mantém pelo menos 1 dígito
  // ("001" -> "1", "0" -> "0", nunca string vazia).
  inteiro = inteiro.replace(/^0+(?=\d)/, "");
  // Zeros à direita da parte fracionária: "5000" -> "5", "50" -> "5",
  // "00" -> "" (fracionário vazio = sem parte decimal).
  fracionario = fracionario.replace(/0+$/, "");

  const ehZeroPuro = inteiro === "0" && fracionario === "";

  if (ehZeroPuro) {
    // "-0"/"-0.00" -> "0": sinal de zero não é significativo.
    return "0";
  }

  const prefixoSinal = sinal === "-" ? "-" : "";
  return fracionario.length > 0 ? `${prefixoSinal}${inteiro}.${fracionario}` : `${prefixoSinal}${inteiro}`;
}
