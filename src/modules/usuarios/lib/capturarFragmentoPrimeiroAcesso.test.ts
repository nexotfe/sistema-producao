/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capturarFragmentoPrimeiroAcesso } from "./capturarFragmentoPrimeiroAcesso";

const UUID_VALIDO = "11111111-2222-3333-4444-555555555555";
const TOKEN_VALIDO = "80b67f9281e9d8629bb6693207d4f1e495bbd7e5dfe41050cf291911";

function irPara(caminhoComFragmento: string) {
  window.history.replaceState(null, "", caminhoComFragmento);
}

describe("capturarFragmentoPrimeiroAcesso", () => {
  beforeEach(() => {
    irPara("/primeiro-acesso");
  });

  afterEach(() => {
    irPara("/primeiro-acesso");
  });

  it("E. fragmento válido -> retorna solicitacaoId e token corretamente", () => {
    irPara(`/primeiro-acesso#solicitacao=${UUID_VALIDO}&token=${TOKEN_VALIDO}`);

    const resultado = capturarFragmentoPrimeiroAcesso();

    expect(resultado).toEqual({ ok: true, solicitacaoId: UUID_VALIDO, token: TOKEN_VALIDO });
  });

  it("F. fragmento sem solicitacao -> falha neutra", () => {
    irPara(`/primeiro-acesso#token=${TOKEN_VALIDO}`);
    expect(capturarFragmentoPrimeiroAcesso()).toEqual({ ok: false });
  });

  it("G. fragmento sem token -> falha neutra", () => {
    irPara(`/primeiro-acesso#solicitacao=${UUID_VALIDO}`);
    expect(capturarFragmentoPrimeiroAcesso()).toEqual({ ok: false });
  });

  it("H. UUID inválido -> falha neutra", () => {
    irPara(`/primeiro-acesso#solicitacao=nao-e-um-uuid&token=${TOKEN_VALIDO}`);
    expect(capturarFragmentoPrimeiroAcesso()).toEqual({ ok: false });

    irPara(`/primeiro-acesso#solicitacao=&token=${TOKEN_VALIDO}`);
    expect(capturarFragmentoPrimeiroAcesso()).toEqual({ ok: false });
  });

  it("token vazio -> falha neutra (mesma família de H, para o lado do token)", () => {
    irPara(`/primeiro-acesso#solicitacao=${UUID_VALIDO}&token=`);
    expect(capturarFragmentoPrimeiroAcesso()).toEqual({ ok: false });
  });

  it("I. parâmetros extras no fragmento são ignorados", () => {
    irPara(`/primeiro-acesso#solicitacao=${UUID_VALIDO}&token=${TOKEN_VALIDO}&utm_source=email&qualquer=coisa`);

    const resultado = capturarFragmentoPrimeiroAcesso();

    expect(resultado).toEqual({ ok: true, solicitacaoId: UUID_VALIDO, token: TOKEN_VALIDO });
  });

  it("J. após a captura, window.location.hash fica vazio (sucesso e falha)", () => {
    irPara(`/primeiro-acesso#solicitacao=${UUID_VALIDO}&token=${TOKEN_VALIDO}`);
    capturarFragmentoPrimeiroAcesso();
    expect(window.location.hash).toBe("");

    irPara(`/primeiro-acesso#solicitacao=invalido&token=${TOKEN_VALIDO}`);
    capturarFragmentoPrimeiroAcesso();
    expect(window.location.hash).toBe("");
  });

  it("K. a URL não ganha query string nem path com o token - só o pathname original sobrevive", () => {
    irPara(`/primeiro-acesso#solicitacao=${UUID_VALIDO}&token=${TOKEN_VALIDO}`);

    capturarFragmentoPrimeiroAcesso();

    expect(window.location.pathname).toBe("/primeiro-acesso");
    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain(TOKEN_VALIDO);
    expect(window.location.href).not.toContain("token=");
  });

  it("preserva query string pré-existente, não relacionada ao fragmento", () => {
    irPara(`/primeiro-acesso?lang=pt#solicitacao=${UUID_VALIDO}&token=${TOKEN_VALIDO}`);

    capturarFragmentoPrimeiroAcesso();

    expect(window.location.pathname).toBe("/primeiro-acesso");
    expect(window.location.search).toBe("?lang=pt");
    expect(window.location.hash).toBe("");
  });

  it("M. nenhum console.log/error/warn contém o token, sucesso ou falha", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    irPara(`/primeiro-acesso#solicitacao=${UUID_VALIDO}&token=${TOKEN_VALIDO}`);
    capturarFragmentoPrimeiroAcesso();

    irPara(`/primeiro-acesso#solicitacao=invalido&token=${TOKEN_VALIDO}`);
    capturarFragmentoPrimeiroAcesso();

    const todasAsChamadas = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((arg) => JSON.stringify(arg));
    expect(todasAsChamadas.some((t) => t.includes(TOKEN_VALIDO))).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("L. não chama fetch/rede", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    irPara(`/primeiro-acesso#solicitacao=${UUID_VALIDO}&token=${TOKEN_VALIDO}`);
    capturarFragmentoPrimeiroAcesso();

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("resultado do caso ok:false nunca inclui o token (objeto mínimo, sem motivo)", () => {
    irPara(`/primeiro-acesso#solicitacao=invalido&token=${TOKEN_VALIDO}`);
    const resultado = capturarFragmentoPrimeiroAcesso();
    expect(resultado).toEqual({ ok: false });
    expect(JSON.stringify(resultado)).not.toContain(TOKEN_VALIDO);
  });
});
