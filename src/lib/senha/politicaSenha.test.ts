import { describe, expect, it, vi } from "vitest";
import { MENSAGEM_POLITICA_SENHA, validarPoliticaSenha } from "./politicaSenha";

describe("validarPoliticaSenha", () => {
  it("A. 9 caracteres -> inválida", () => {
    const resultado = validarPoliticaSenha("abcdefghi");
    expect(resultado).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
  });

  it("B. 10 caracteres, não comum -> válida", () => {
    const resultado = validarPoliticaSenha("xkcd-batt3ry");
    expect(resultado).toEqual({ valida: true });
  });

  it("C. senha comum com 10+ caracteres -> inválida (3 variações exigidas pelo gate)", () => {
    expect(validarPoliticaSenha("1234567890")).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
    expect(validarPoliticaSenha("password123")).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
    expect(validarPoliticaSenha("senha12345")).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
    expect(validarPoliticaSenha("qwerty12345")).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
  });

  it("D. senha longa sem maiúscula/número/símbolo -> válida (sem exigência de composição)", () => {
    const resultado = validarPoliticaSenha("umasenhalongaequalquer");
    expect(resultado).toEqual({ valida: true });
  });

  it("E. comparação contra a lista: case-insensitive, com espaço nas pontas, e por sufixo numérico", () => {
    // mesmo termo-base, variações de caixa/espaço/sufixo numérico devem
    // cair na mesma rejeição - a normalização (minúsculas + strip de
    // dígitos finais) é o mecanismo de comparação definido.
    expect(validarPoliticaSenha("PASSWORD123")).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
    expect(validarPoliticaSenha("  senha12345  ")).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
    expect(validarPoliticaSenha("Administrador99")).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
    // termo comum sem sufixo numérico, só longo o suficiente por conta própria.
    expect(validarPoliticaSenha("administrador")).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
    // não deve falsear positivo para string que só contém um termo comum como substring.
    expect(validarPoliticaSenha("estaEhUmaSenhaUnicaEIncomum")).toEqual({ valida: true });
  });

  it("F. nenhum teste/log expõe a senha recebida", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const senhaSecreta = "UmaSenhaBemEspecificaDeTeste123!";
    const resultado = validarPoliticaSenha(senhaSecreta);

    // o resultado nunca ecoa a senha recebida, sucesso ou falha.
    expect(JSON.stringify(resultado)).not.toContain(senhaSecreta);

    const todasAsChamadas = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((arg) => JSON.stringify(arg));
    expect(todasAsChamadas.some((t) => t.includes(senhaSecreta))).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("G. mensagem pública idêntica para falha de tamanho e para senha comum", () => {
    const porTamanho = validarPoliticaSenha("curta123");
    const porComum = validarPoliticaSenha("password123");

    expect(porTamanho).toMatchObject({ valida: false });
    expect(porComum).toMatchObject({ valida: false });
    if (porTamanho.valida === false && porComum.valida === false) {
      expect(porTamanho.mensagem).toBe(porComum.mensagem);
      expect(porTamanho.mensagem).toBe(MENSAGEM_POLITICA_SENHA);
    }
  });

  it("H. senha comum que NÃO estava na lista curada original de 27 termos -> inválida (prova da lista ampliada, SecLists 10k)", () => {
    // "dragon"/"mustang"/"jennifer" nunca estiveram na lista artesanal
    // original desta fatia - só existem na lista real embutida depois do
    // AJUSTE FINAL (SecLists 10k-most-common.txt).
    expect(validarPoliticaSenha("dragon12345")).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
    expect(validarPoliticaSenha("mustang1234")).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
    expect(validarPoliticaSenha("jennifer123")).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
  });

  it("I. espaço usado artificialmente para alcançar os 10 caracteres -> inválida (Opção B: rejeita borda, não ignora no comprimento)", () => {
    // "abc123" tem 6 caracteres reais; com 4 espaços na borda chega a 10
    // de comprimento literal, mas deve ser rejeitada mesmo assim.
    const comEspacoNoFinal = "abc123" + " ".repeat(4);
    const comEspacoNoInicio = " ".repeat(4) + "abc123";
    expect(comEspacoNoFinal).toHaveLength(10);
    expect(validarPoliticaSenha(comEspacoNoFinal)).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
    expect(validarPoliticaSenha(comEspacoNoInicio)).toEqual({ valida: false, mensagem: MENSAGEM_POLITICA_SENHA });
  });

  it("J. senha legítima longa com espaços INTERNOS -> válida (frase-senha permitida, só a borda é rejeitada)", () => {
    const fraseSenha = "banana amarela subindo";
    expect(validarPoliticaSenha(fraseSenha)).toEqual({ valida: true });
  });

  it("nunca lança exceção, mesmo com entradas extremas", () => {
    expect(() => validarPoliticaSenha("")).not.toThrow();
    expect(() => validarPoliticaSenha(" ".repeat(20))).not.toThrow();
    expect(() => validarPoliticaSenha("x".repeat(5000))).not.toThrow();
  });
});
