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

describe("LogoEmpresa - logoUrl muda depois da montagem (sem reload da página)", () => {
  it("null -> primeira URL válida: sai do fallback e passa a renderizar <img>, mesmo sem remontar", () => {
    const { rerender } = render(<LogoEmpresa logoUrl={null} nomeEmpresa="ENIFER" />);

    expect(screen.getByText("LOGO")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();

    rerender(<LogoEmpresa logoUrl="https://exemplo.test/logo-nova.png" nomeEmpresa="ENIFER" />);

    const img = screen.getByRole("img", { name: "ENIFER" }) as HTMLImageElement;
    expect(img.src).toBe("https://exemplo.test/logo-nova.png");
    expect(img.className).toContain("opacity-0");
    expect(screen.queryByText("LOGO")).toBeNull();
  });

  it("URL válida -> outra URL válida: reseta para carregando (opacidade 0) na URL nova, não fica com a imagem antiga", () => {
    const { rerender } = render(<LogoEmpresa logoUrl="https://exemplo.test/logo-1.png" nomeEmpresa="ENIFER" />);

    fireEvent.load(screen.getByRole("img", { name: "ENIFER" }));
    expect(screen.getByRole("img", { name: "ENIFER" }).className).toContain("opacity-100");

    rerender(<LogoEmpresa logoUrl="https://exemplo.test/logo-2.png" nomeEmpresa="ENIFER" />);

    const img = screen.getByRole("img", { name: "ENIFER" }) as HTMLImageElement;
    expect(img.src).toBe("https://exemplo.test/logo-2.png");
    expect(img.className).toContain("opacity-0");
  });

  it("URL com erro -> nova URL válida: sai do fallback 'LOGO' e volta a tentar renderizar <img>", () => {
    const { rerender } = render(<LogoEmpresa logoUrl="https://exemplo.test/logo-quebrada.png" nomeEmpresa="ENIFER" />);

    fireEvent.error(screen.getByRole("img", { name: "ENIFER" }));
    expect(screen.getByText("LOGO")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();

    rerender(<LogoEmpresa logoUrl="https://exemplo.test/logo-boa.png" nomeEmpresa="ENIFER" />);

    const img = screen.getByRole("img", { name: "ENIFER" }) as HTMLImageElement;
    expect(img.src).toBe("https://exemplo.test/logo-boa.png");
    expect(screen.queryByText("LOGO")).toBeNull();
  });

  it("URL válida -> null: volta para o fallback 'LOGO' (ex.: remoção da logo)", () => {
    const { rerender } = render(<LogoEmpresa logoUrl="https://exemplo.test/logo.png" nomeEmpresa="ENIFER" />);

    fireEvent.load(screen.getByRole("img", { name: "ENIFER" }));
    rerender(<LogoEmpresa logoUrl={null} nomeEmpresa="ENIFER" />);

    expect(screen.getByText("LOGO")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("mesma URL em re-render: não reinicializa o estado à toa (permanece carregada, sem voltar a opacity-0)", () => {
    const mesmaUrl = "https://exemplo.test/logo-estavel.png";
    const { rerender } = render(<LogoEmpresa logoUrl={mesmaUrl} nomeEmpresa="ENIFER" />);

    fireEvent.load(screen.getByRole("img", { name: "ENIFER" }));
    expect(screen.getByRole("img", { name: "ENIFER" }).className).toContain("opacity-100");

    rerender(<LogoEmpresa logoUrl={mesmaUrl} nomeEmpresa="ENIFER" />);

    expect(screen.getByRole("img", { name: "ENIFER" }).className).toContain("opacity-100");
  });
});
