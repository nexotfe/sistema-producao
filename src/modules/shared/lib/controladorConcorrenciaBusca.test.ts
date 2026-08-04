// Cobre exatamente os dois riscos de corrida apontados na revisão desta
// funcionalidade: (1) uma geração nova não pode ficar bloqueada
// esperando uma requisição órfã de uma geração antiga terminar; (2) o
// `finally` de uma requisição antiga não pode liberar/zerar o estado de
// uma requisição nova que já a substituiu.
//
// Nota de leitura: novaGeracao() já reivindica o controle para a
// própria página 0 (ela também é uma "requisição ativa") - por isso os
// testes finalizam essa página 0 antes de exercitar novaPagina(), do
// jeito que o uso real (hook) sempre faz.
import { describe, expect, it } from "vitest";
import { ControladorConcorrenciaBusca } from "./controladorConcorrenciaBusca";

describe("ControladorConcorrenciaBusca", () => {
  it("novaGeracao nunca é bloqueada, mesmo com uma página de carregar-mais da geração atual em voo", () => {
    const c = new ControladorConcorrenciaBusca();
    const g1 = c.novaGeracao();
    expect(c.finalizar(g1)).toBe(true); // página 0 resolve

    const paginaEmVoo = c.novaPagina(); // carregar mais - fica ativa, ainda não finalizada
    expect(paginaEmVoo).not.toBeNull();

    // Mesmo com paginaEmVoo ainda ativa, uma nova geração é concedida
    // imediatamente - troca de termo nunca espera.
    const g2 = c.novaGeracao();
    expect(g2.geracao).toBe(g1.geracao + 1);
    expect(c.ehGeracaoAtual(g2)).toBe(true);
  });

  it("novaPagina é bloqueada (retorna null) quando já há uma página da MESMA geração em voo", () => {
    const c = new ControladorConcorrenciaBusca();
    const g1 = c.novaGeracao();
    c.finalizar(g1); // libera o mutex para a primeira "carregar mais"

    const primeira = c.novaPagina();
    expect(primeira).not.toBeNull();

    const segunda = c.novaPagina();
    expect(segunda).toBeNull(); // bloqueada - primeira ainda não finalizou
  });

  it("novaPagina NÃO é bloqueada por uma requisição órfã de uma geração anterior", () => {
    const c = new ControladorConcorrenciaBusca();
    const g1 = c.novaGeracao();
    c.finalizar(g1);
    const orfa = c.novaPagina(); // ativa para geração 1, NUNCA finalizada
    expect(orfa).not.toBeNull();

    const g2 = c.novaGeracao(); // geração 2 - a órfã da geração 1 fica esquecida, sem esperar por ela
    c.finalizar(g2); // página 0 da geração 2 resolve

    const paginaGeracao2 = c.novaPagina();
    expect(paginaGeracao2).not.toBeNull(); // não bloqueada pela órfã esquecida da geração 1
  });

  it("ehGeracaoAtual retorna false para uma identidade de uma geração já superada", () => {
    const c = new ControladorConcorrenciaBusca();
    const g1 = c.novaGeracao();
    expect(c.ehGeracaoAtual(g1)).toBe(true);

    c.novaGeracao();
    expect(c.ehGeracaoAtual(g1)).toBe(false);
  });

  it("finalizar de uma requisição órfã (geração antiga) NUNCA libera o estado da requisição ativa atual - risco 2 da revisão", () => {
    const c = new ControladorConcorrenciaBusca();
    const g1 = c.novaGeracao();
    c.finalizar(g1);
    const orfa = c.novaPagina()!; // ativa para geração 1

    const g2 = c.novaGeracao(); // reivindica geração 2 imediatamente, sem esperar orfa

    // A requisição órfã da geração 1 termina DEPOIS - finalizar dela não
    // pode reportar "pode limpar o loading", porque não é mais a
    // requisição ativa (foi substituída por g2).
    expect(c.finalizar(orfa)).toBe(false);

    // A requisição realmente ativa (página 0 da geração 2) ainda finaliza normalmente.
    expect(c.finalizar(g2)).toBe(true);
  });

  it("finalizar da requisição realmente ativa reporta true e libera o mutex para a próxima página da mesma geração", () => {
    const c = new ControladorConcorrenciaBusca();
    const g1 = c.novaGeracao();
    c.finalizar(g1);

    const primeira = c.novaPagina()!;
    expect(primeira).not.toBeNull();

    expect(c.novaPagina()).toBeNull(); // ainda bloqueado (primeira não finalizou)

    expect(c.finalizar(primeira)).toBe(true);

    const segunda = c.novaPagina();
    expect(segunda).not.toBeNull(); // liberado depois de finalizar
  });

  it("cenário completo: geração muda com página em voo, depois a página antiga finaliza fora de ordem - estado final continua correto", () => {
    const c = new ControladorConcorrenciaBusca();
    const g1 = c.novaGeracao();
    c.finalizar(g1); // página 0 da geração 1 resolve

    const paginaAntiga = c.novaPagina()!; // carregar-mais da geração 1, ainda não finalizada quando o termo muda

    const g2 = c.novaGeracao(); // reivindica de imediato, sem esperar paginaAntiga
    expect(c.ehGeracaoAtual(g2)).toBe(true);
    expect(c.ehGeracaoAtual(paginaAntiga)).toBe(false); // resposta dela deve ser descartada

    // paginaAntiga finaliza só agora (resposta atrasada, fora de ordem) -
    // não deve conseguir liberar/zerar o controle da geração 2 (cuja
    // própria página 0, iniciada por novaGeracao, ainda está "ativa").
    expect(c.finalizar(paginaAntiga)).toBe(false);
    expect(c.novaPagina()).toBeNull(); // página 0 da geração 2 continua em voo, ainda bloqueado

    // Só depois que a página 0 de verdade (g2) finaliza, a próxima página libera.
    expect(c.finalizar(g2)).toBe(true);
    const paginaNova = c.novaPagina();
    expect(paginaNova).not.toBeNull();
  });
});
