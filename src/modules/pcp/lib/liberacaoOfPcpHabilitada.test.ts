import { afterEach, describe, expect, it } from "vitest";
import { liberacaoOfPcpHabilitada } from "./liberacaoOfPcpHabilitada";

const CHAVE = "PCP_LIBERACAO_OF_HABILITADA";

describe("liberacaoOfPcpHabilitada", () => {
  afterEach(() => {
    delete process.env[CHAVE];
  });

  it("bloqueia quando a variável não está definida", () => {
    delete process.env[CHAVE];
    expect(liberacaoOfPcpHabilitada()).toBe(false);
  });

  it("bloqueia com valor vazio", () => {
    process.env[CHAVE] = "";
    expect(liberacaoOfPcpHabilitada()).toBe(false);
  });

  it("bloqueia com valor malformado/typo", () => {
    process.env[CHAVE] = "True";
    expect(liberacaoOfPcpHabilitada()).toBe(false);
  });

  it('bloqueia com "false" explícito', () => {
    process.env[CHAVE] = "false";
    expect(liberacaoOfPcpHabilitada()).toBe(false);
  });

  it('habilita somente com "true" exato', () => {
    process.env[CHAVE] = "true";
    expect(liberacaoOfPcpHabilitada()).toBe(true);
  });
});
