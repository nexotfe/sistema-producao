/* @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LogoEmpresa } from "./LogoEmpresa";

afterEach(() => {
  cleanup();
});

describe("LogoEmpresa", () => {
  it("logoUrl null: mostra o fallback 'LOGO' diretamente, sem tentar renderizar <img>", () => {
    render(<LogoEmpresa logoUrl={null} nomeEmpresa="Empresa Teste" />);

    expect(screen.getByText("LOGO")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("logoUrl presente: renderiza <img> com alt = nome da empresa, inicialmente com opacidade 0 (carregando)", () => {
    render(<LogoEmpresa logoUrl="https://exemplo.test/logo.png" nomeEmpresa="ENIFER" />);

    const img = screen.getByRole("img", { name: "ENIFER" }) as HTMLImageElement;
    expect(img.src).toBe("https://exemplo.test/logo.png");
    expect(img.className).toContain("opacity-0");
  });

  it("evento onLoad da imagem: opacidade some, fallback 'LOGO' nunca aparece", () => {
    render(<LogoEmpresa logoUrl="https://exemplo.test/logo.png" nomeEmpresa="ENIFER" />);

    const img = screen.getByRole("img", { name: "ENIFER" });
    fireEvent.load(img);

    expect(img.className).toContain("opacity-100");
    expect(screen.queryByText("LOGO")).toBeNull();
  });

  it("evento onError da imagem (URL quebrada): troca para o fallback 'LOGO', <img> sai do DOM", () => {
    render(<LogoEmpresa logoUrl="https://exemplo.test/logo-quebrada.png" nomeEmpresa="ENIFER" />);

    const img = screen.getByRole("img", { name: "ENIFER" });
    fireEvent.error(img);

    expect(screen.getByText("LOGO")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("size='md' usa dimensão maior que o padrão 'sm' (Proposta Comercial vs. demais telas)", () => {
    const { container: containerSm } = render(<LogoEmpresa logoUrl={null} nomeEmpresa="X" size="sm" />);
    const { container: containerMd } = render(<LogoEmpresa logoUrl={null} nomeEmpresa="X" size="md" />);

    expect(containerSm.firstElementChild?.className).toContain("h-11");
    expect(containerMd.firstElementChild?.className).toContain("h-14");
  });
});
