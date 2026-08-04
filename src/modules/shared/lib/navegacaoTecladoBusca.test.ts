import { describe, expect, it } from "vitest";
import { proximoIndiceParaBaixo, proximoIndiceParaCima } from "./navegacaoTecladoBusca";

type Item = { id: string; desabilitado: boolean };
const item = (id: string, desabilitado = false): Item => ({ id, desabilitado });
const desabilitado = (i: Item) => i.desabilitado;

describe("proximoIndiceParaBaixo", () => {
  it("sem itemDesabilitado, avança um índice por vez (fórmula original)", () => {
    const itens = [item("a"), item("b"), item("c")];
    expect(proximoIndiceParaBaixo(itens, 0)).toBe(1);
    expect(proximoIndiceParaBaixo(itens, 1)).toBe(2);
  });

  it("sem itemDesabilitado, retorna -1 no fim da lista (sinal para carregar mais)", () => {
    const itens = [item("a"), item("b")];
    expect(proximoIndiceParaBaixo(itens, 1)).toBe(-1);
  });

  it("pula itens desabilitados consecutivos", () => {
    const itens = [item("a"), item("b", true), item("c", true), item("d")];
    expect(proximoIndiceParaBaixo(itens, 0, desabilitado)).toBe(3);
  });

  it("página inteira desabilitada a partir do índice atual: retorna -1, não avança nem trava", () => {
    const itens = [item("a"), item("b", true), item("c", true)];
    expect(proximoIndiceParaBaixo(itens, 0, desabilitado)).toBe(-1);
  });

  it("cenário de borda de página: -1 na página cheia de desabilitados, e continua corretamente após concatenar a próxima página", () => {
    const pagina1 = [item("a", true), item("b", true)];
    expect(proximoIndiceParaBaixo(pagina1, -1, desabilitado)).toBe(-1);

    const paginasConcatenadas = [...pagina1, item("c", true), item("d")];
    expect(proximoIndiceParaBaixo(paginasConcatenadas, -1, desabilitado)).toBe(3);
  });

  it("lista vazia não trava, retorna -1", () => {
    expect(proximoIndiceParaBaixo([], -1, desabilitado)).toBe(-1);
  });
});

describe("proximoIndiceParaCima", () => {
  it("sem itemDesabilitado, recua um índice por vez, nunca abaixo de 0 (fórmula original)", () => {
    const itens = [item("a"), item("b"), item("c")];
    expect(proximoIndiceParaCima(itens, 2)).toBe(1);
    expect(proximoIndiceParaCima(itens, 0)).toBe(0);
    expect(proximoIndiceParaCima(itens, -1)).toBe(0);
  });

  it("pula itens desabilitados subindo em direção ao topo", () => {
    const itens = [item("a"), item("b", true), item("c", true), item("d")];
    expect(proximoIndiceParaCima(itens, 3, desabilitado)).toBe(0);
  });

  it("tudo acima está desabilitado: retorna -1, não trava no topo nem seleciona item desabilitado", () => {
    const itens = [item("a", true), item("b", true), item("c")];
    expect(proximoIndiceParaCima(itens, 2, desabilitado)).toBe(-1);
  });

  it("lista vazia não trava, retorna -1", () => {
    expect(proximoIndiceParaCima([], -1, desabilitado)).toBe(-1);
  });
});
