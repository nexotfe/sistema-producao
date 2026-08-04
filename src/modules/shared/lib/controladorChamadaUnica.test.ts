import { describe, expect, it } from "vitest";
import { ControladorChamadaUnica } from "./controladorChamadaUnica";

describe("ControladorChamadaUnica", () => {
  it("primeira chamada sempre pode iniciar", () => {
    const c = new ControladorChamadaUnica();
    expect(c.iniciar()).toBe(true);
  });

  it("uma segunda chamada enquanto a primeira está em andamento é rejeitada", () => {
    const c = new ControladorChamadaUnica();
    expect(c.iniciar()).toBe(true);
    expect(c.iniciar()).toBe(false); // clique duplo - rejeitado
    expect(c.iniciar()).toBe(false); // terceiro clique - ainda rejeitado
  });

  it("depois de finalizar, uma nova chamada pode iniciar normalmente", () => {
    const c = new ControladorChamadaUnica();
    expect(c.iniciar()).toBe(true);
    c.finalizar();
    expect(c.iniciar()).toBe(true);
  });

  it("finalizar sem nenhuma chamada em andamento não quebra nada (idempotente)", () => {
    const c = new ControladorChamadaUnica();
    c.finalizar();
    expect(c.iniciar()).toBe(true);
  });

  it("ciclo completo: iniciar -> rejeitar -> finalizar -> iniciar de novo", () => {
    const c = new ControladorChamadaUnica();
    expect(c.iniciar()).toBe(true);
    expect(c.iniciar()).toBe(false);
    c.finalizar();
    expect(c.iniciar()).toBe(true);
    expect(c.iniciar()).toBe(false);
  });
});
