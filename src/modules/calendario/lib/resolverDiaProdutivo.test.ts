// Congela o contrato público de resolverDiaProdutivo para validação de
// data - a correção de performance/N+1 (delegando para
// carregarContextoCalendario/resolverDiaProdutivoComContexto) não pode
// mudar a mensagem de erro que já existia antes da refatoração.
import { describe, expect, it } from "vitest";
import { resolverDiaProdutivo } from "./resolverDiaProdutivo";
import {
  criarClienteCalendarioFalso,
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

describe("resolverDiaProdutivo — contrato de mensagem de erro (congelado)", () => {
  const client = criarClienteCalendarioFalso({
    empresaId: EMPRESA_ID,
    padraoSemanal: PADRAO_SEGUNDA_A_SEXTA,
  });

  it('formato inválido lança exatamente "Data inválida: "X". Esperado o formato YYYY-MM-DD." - sem sufixo "em dataInicio" nem qualquer outro rótulo', async () => {
    await expect(resolverDiaProdutivo(client, EMPRESA_ID, "01-09-2026")).rejects.toThrow(
      'Data inválida: "01-09-2026". Esperado o formato YYYY-MM-DD.',
    );
  });

  it('data civil inexistente lança exatamente "Data inválida: "X" não corresponde a uma data civil real." - sem sufixo de rótulo', async () => {
    await expect(resolverDiaProdutivo(client, EMPRESA_ID, "2026-02-31")).rejects.toThrow(
      'Data inválida: "2026-02-31" não corresponde a uma data civil real.',
    );
  });

  it("continua sendo um TypeError (não RangeError nem Error genérico)", async () => {
    await expect(resolverDiaProdutivo(client, EMPRESA_ID, "não-é-data")).rejects.toBeInstanceOf(
      TypeError,
    );
  });

  it("data válida continua resolvendo normalmente (sem regressão funcional pela reintrodução da validação local)", async () => {
    const resultado = await resolverDiaProdutivo(client, EMPRESA_ID, "2026-09-01");
    expect(resultado.produtivo).toBe(true);
  });
});
