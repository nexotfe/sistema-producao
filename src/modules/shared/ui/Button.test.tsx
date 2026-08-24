/* @vitest-environment jsdom */
// Fase 1d-0 (padronização de botões) - cobertura das variantes, tamanhos
// e estados novos adicionados ao componente compartilhado. Não testa
// hover (não observável de forma confiável via classe estática em jsdom),
// só o que efetivamente muda o DOM/atributos.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Button, buttonClassName } from "./Button";

afterEach(() => {
  cleanup();
});

describe("buttonClassName", () => {
  it("gera exatamente a mesma classe que o <Button> aplica - fonte única para <Link> com aparência de botão", () => {
    render(<Button variant="secondary">Cancelar</Button>);
    const botao = screen.getByRole("button", { name: "Cancelar" });
    expect(botao.className).toBe(buttonClassName("secondary"));
  });

  it("aceita variant/size/className como o <Button>", () => {
    const classe = buttonClassName("danger-solid", "icon", "mt-2");
    expect(classe).toContain("bg-status-danger-solid-bg");
    expect(classe).toContain("h-10 w-10");
    expect(classe).toContain("mt-2");
  });
});

describe("Button", () => {
  it("renderiza o texto e usa type=button por padrão (nunca submete formulário sem querer)", () => {
    render(<Button>Salvar</Button>);
    const botao = screen.getByRole("button", { name: "Salvar" });
    expect(botao.getAttribute("type")).toBe("button");
  });

  it("variant=primary (padrão) usa os tokens de ação primária", () => {
    render(<Button>Salvar</Button>);
    const botao = screen.getByRole("button", { name: "Salvar" });
    expect(botao.className).toContain("bg-action-primary");
    expect(botao.className).toContain("text-action-primary-text");
    expect(botao.className).toContain("hover:bg-action-primary-hover");
  });

  it("variant=secondary usa fundo neutro e borda", () => {
    render(<Button variant="secondary">Cancelar</Button>);
    const botao = screen.getByRole("button", { name: "Cancelar" });
    expect(botao.className).toContain("border-border");
    expect(botao.className).toContain("bg-surface");
    expect(botao.className).toContain("text-text-primary");
  });

  it("variant=ghost é transparente e mantém o sublinhado no hover (mesmo tratamento de link)", () => {
    render(<Button variant="ghost">Ver mais</Button>);
    const botao = screen.getByRole("button", { name: "Ver mais" });
    expect(botao.className).toContain("bg-transparent");
    expect(botao.className).toContain("text-action-primary");
    expect(botao.className).toContain("hover:underline");
  });

  it("variant=danger é outline (sem preenchimento sólido)", () => {
    render(<Button variant="danger">Excluir</Button>);
    const botao = screen.getByRole("button", { name: "Excluir" });
    expect(botao.className).toContain("border-status-danger-border");
    expect(botao.className).toContain("bg-transparent");
    expect(botao.className).toContain("text-status-danger-text");
  });

  it("variant=danger-solid usa o token fixo -solid-bg da família danger como preenchimento, com texto branco", () => {
    render(<Button variant="danger-solid">Excluir definitivamente</Button>);
    const botao = screen.getByRole("button", { name: "Excluir definitivamente" });
    expect(botao.className).toContain("bg-status-danger-solid-bg");
    expect(botao.className).toContain("text-action-primary-text");
  });

  it("variant=success usa o token fixo -solid-bg da família success como preenchimento", () => {
    render(<Button variant="success">Aprovar</Button>);
    const botao = screen.getByRole("button", { name: "Aprovar" });
    expect(botao.className).toContain("bg-status-success-solid-bg");
    expect(botao.className).toContain("text-action-primary-text");
  });

  it("variant=warning usa o token fixo -solid-bg da família warning como preenchimento", () => {
    render(<Button variant="warning">Avançar mesmo assim</Button>);
    const botao = screen.getByRole("button", { name: "Avançar mesmo assim" });
    expect(botao.className).toContain("bg-status-warning-solid-bg");
    expect(botao.className).toContain("text-action-primary-text");
  });

  it("size=default (implícito) preserva a altura/padding já usados por cada variante hoje", () => {
    render(
      <>
        <Button>Primário</Button>
        <Button variant="ghost">Fantasma</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Primário" }).className).toContain("px-[18px]");
    expect(screen.getByRole("button", { name: "Fantasma" }).className).toContain("px-2");
  });

  it("size=icon vira um quadrado sem padding horizontal, independente da variante", () => {
    render(
      <Button variant="secondary" size="icon" aria-label="Abrir ações">
        {"⋮"}
      </Button>,
    );
    const botao = screen.getByRole("button", { name: "Abrir ações" });
    expect(botao.className).toContain("h-10 w-10");
    expect(botao.className).toContain("p-0");
    expect(botao.className).not.toContain("px-[18px]");
  });

  it("estado desabilitado é o atributo nativo disabled + opacidade reduzida (padrão único para toda variante)", () => {
    render(<Button disabled>Salvando...</Button>);
    const botao = screen.getByRole("button", { name: "Salvando..." }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.className).toContain("disabled:opacity-50");
    expect(botao.className).toContain("disabled:cursor-not-allowed");
  });

  it("mantém o anel de foco visível por teclado em toda variante (acessibilidade do DESIGN.md)", () => {
    render(<Button variant="danger-solid">Excluir</Button>);
    const botao = screen.getByRole("button", { name: "Excluir" });
    expect(botao.className).toContain("focus-visible:ring-[3px]");
    expect(botao.className).toContain("focus-visible:ring-focus-ring");
  });

  it("className extra do consumidor é preservado (merge, não substitui a variante)", () => {
    render(<Button className="mt-4">Salvar</Button>);
    const botao = screen.getByRole("button", { name: "Salvar" });
    expect(botao.className).toContain("mt-4");
    expect(botao.className).toContain("bg-action-primary");
  });
});
