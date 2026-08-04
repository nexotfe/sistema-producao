// Cobre a tabela de caracteres exigida na revisão desta funcionalidade:
// aspas, vírgula, parênteses, %, _ e acentos. O comportamento real
// contra o PostgREST (sem erro de parse, curinga virando literal,
// sensibilidade a acento) foi verificado por leitura direta do banco
// remoto nesta mesma sessão (sem extensão unaccent/pg_trgm instalada -
// confirmado em pg_extension) - os testes abaixo travam a função pura,
// não repetem a chamada de rede real.
import { describe, expect, it } from "vitest";
import { construirFiltroOrIlike, escaparParaIlike } from "./filtroBuscaTexto";

describe("escaparParaIlike", () => {
  it("escapa aspas dupla (delimitador do valor no filtro .or())", () => {
    expect(escaparParaIlike('aço "temperado"')).toBe('aço \\"temperado\\"');
  });

  it("preserva vírgula e parênteses sem alteração (seguros dentro do valor entre aspas)", () => {
    expect(escaparParaIlike("aço, temperado")).toBe("aço, temperado");
    expect(escaparParaIlike("aço (temperado)")).toBe("aço (temperado)");
  });

  it("escapa % para não virar curinga do ILIKE", () => {
    expect(escaparParaIlike("50%")).toBe("50\\%");
  });

  it("escapa _ para não virar curinga do ILIKE", () => {
    expect(escaparParaIlike("AC_1020")).toBe("AC\\_1020");
  });

  it("escapa barra invertida ANTES de qualquer outro escape (ela é o caractere de escape do ILIKE)", () => {
    expect(escaparParaIlike("a\\b")).toBe("a\\\\b");
  });

  it("não altera caracteres acentuados - acento não é um caractere especial de sintaxe aqui", () => {
    expect(escaparParaIlike("aço")).toBe("aço");
    expect(escaparParaIlike("AÇO")).toBe("AÇO");
  });

  it("combina múltiplos caracteres especiais na ordem correta", () => {
    // barra -> %/_ -> aspas, nessa ordem - testa que uma barra
    // introduzida pelo escape de % ou _ não é escapada de novo.
    expect(escaparParaIlike('50%_"x\\y')).toBe('50\\%\\_\\"x\\\\y');
  });
});

describe("construirFiltroOrIlike", () => {
  it("monta uma cláusula ilike por coluna, unidas por vírgula, valor entre aspas com % de contorno", () => {
    const filtro = construirFiltroOrIlike(["codigo", "descricao"], "aço");
    expect(filtro).toBe('codigo.ilike."%aço%",descricao.ilike."%aço%"');
  });

  it("aplica o escape do termo em cada coluna", () => {
    const filtro = construirFiltroOrIlike(["codigo", "descricao"], '50%_"');
    expect(filtro).toBe(
      'codigo.ilike."%50\\%\\_\\"%",descricao.ilike."%50\\%\\_\\"%"',
    );
  });

  it("funciona com uma única coluna", () => {
    expect(construirFiltroOrIlike(["descricao"], "x")).toBe('descricao.ilike."%x%"');
  });
});
