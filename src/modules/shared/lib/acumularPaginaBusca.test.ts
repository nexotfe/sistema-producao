import { describe, expect, it } from "vitest";
import { acumularPaginaBusca } from "./acumularPaginaBusca";

type Item = { id: string; nome: string };
const obterId = (item: Item) => item.id;

describe("acumularPaginaBusca", () => {
  it("primeira página descarta qualquer itensAtuais anterior, mesmo que não vazio", () => {
    const resultado = acumularPaginaBusca<Item>({
      itensAtuais: [{ id: "velho", nome: "Velho" }],
      pagina: [{ id: "novo", nome: "Novo" }],
      offsetAnterior: 0,
      tamanhoPagina: 20,
      obterId,
      primeiraPagina: true,
    });

    expect(resultado.itens).toEqual([{ id: "novo", nome: "Novo" }]);
  });

  it("páginas seguintes acumulam sobre itensAtuais", () => {
    const resultado = acumularPaginaBusca<Item>({
      itensAtuais: [{ id: "a", nome: "A" }],
      pagina: [{ id: "b", nome: "B" }],
      offsetAnterior: 1,
      tamanhoPagina: 1,
      obterId,
      primeiraPagina: false,
    });

    expect(resultado.itens).toEqual([
      { id: "a", nome: "A" },
      { id: "b", nome: "B" },
    ]);
  });

  it("remove duplicações por id defensivamente (item já presente não é repetido)", () => {
    const resultado = acumularPaginaBusca<Item>({
      itensAtuais: [{ id: "a", nome: "A" }],
      pagina: [
        { id: "a", nome: "A (repetido)" },
        { id: "b", nome: "B" },
      ],
      offsetAnterior: 1,
      tamanhoPagina: 2,
      obterId,
      primeiraPagina: false,
    });

    expect(resultado.itens).toEqual([
      { id: "a", nome: "A" }, // mantém a versão já acumulada, não a repetida
      { id: "b", nome: "B" },
    ]);
  });

  it("offset avança pelo tamanho BRUTO da página recebida, ANTES do dedupe", () => {
    // Página de tamanho 2 (bruto), mas 1 item é duplicado e descartado
    // pelo dedupe - se o offset avançasse pelo tamanho pós-dedupe (1),
    // a próxima busca pediria de novo uma faixa parcialmente já vista.
    const resultado = acumularPaginaBusca<Item>({
      itensAtuais: [{ id: "a", nome: "A" }],
      pagina: [
        { id: "a", nome: "A (repetido)" },
        { id: "b", nome: "B" },
      ],
      offsetAnterior: 10,
      tamanhoPagina: 2,
      obterId,
      primeiraPagina: false,
    });

    expect(resultado.itens).toHaveLength(2); // dedupe removeu 1
    expect(resultado.offset).toBe(12); // avançou pelos 2 recebidos (bruto), não por 1
  });

  it("temMais é derivado do tamanho BRUTO da página, não do tamanho pós-dedupe", () => {
    // Página bruta cheia (tamanhoPagina=2), mesmo com dedupe reduzindo
    // para 1 item novo - ainda pode haver mais páginas.
    const comPaginaCheiaEDedupe = acumularPaginaBusca<Item>({
      itensAtuais: [{ id: "a", nome: "A" }],
      pagina: [
        { id: "a", nome: "A (repetido)" },
        { id: "b", nome: "B" },
      ],
      offsetAnterior: 10,
      tamanhoPagina: 2,
      obterId,
      primeiraPagina: false,
    });
    expect(comPaginaCheiaEDedupe.temMais).toBe(true);

    // Página bruta menor que o tamanho pedido - fim da lista.
    const paginaParcial = acumularPaginaBusca<Item>({
      itensAtuais: [],
      pagina: [{ id: "unico", nome: "Único" }],
      offsetAnterior: 0,
      tamanhoPagina: 20,
      obterId,
      primeiraPagina: true,
    });
    expect(paginaParcial.temMais).toBe(false);
  });

  it("página vazia: temMais false, itens inalterados (além do reset se for primeira página)", () => {
    const resultado = acumularPaginaBusca<Item>({
      itensAtuais: [{ id: "a", nome: "A" }],
      pagina: [],
      offsetAnterior: 1,
      tamanhoPagina: 20,
      obterId,
      primeiraPagina: false,
    });

    expect(resultado.itens).toEqual([{ id: "a", nome: "A" }]);
    expect(resultado.temMais).toBe(false);
    expect(resultado.offset).toBe(1);
  });
});
