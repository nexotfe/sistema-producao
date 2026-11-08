import { afterEach, describe, expect, it } from "vitest";
import { gravacoesOpDependenciasPcpHabilitadas } from "./gravacoesOperacionaisPcpHabilitadas";

const CHAVE = "PCP_GRAVACOES_OP_DEPENDENCIAS_HABILITADAS";

describe("gravacoesOpDependenciasPcpHabilitadas", () => {
  afterEach(() => {
    delete process.env[CHAVE];
  });

  it("bloqueia quando a variável não está definida", () => {
    delete process.env[CHAVE];
    expect(gravacoesOpDependenciasPcpHabilitadas()).toBe(false);
  });

  it("bloqueia com valor vazio", () => {
    process.env[CHAVE] = "";
    expect(gravacoesOpDependenciasPcpHabilitadas()).toBe(false);
  });

  it("bloqueia com valor malformado/typo", () => {
    process.env[CHAVE] = "True";
    expect(gravacoesOpDependenciasPcpHabilitadas()).toBe(false);
  });

  it("bloqueia com \"false\" explícito", () => {
    process.env[CHAVE] = "false";
    expect(gravacoesOpDependenciasPcpHabilitadas()).toBe(false);
  });

  it("habilita somente com \"true\" exato", () => {
    process.env[CHAVE] = "true";
    expect(gravacoesOpDependenciasPcpHabilitadas()).toBe(true);
  });
});
