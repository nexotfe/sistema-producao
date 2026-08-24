/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const useIdentidadeEmpresaAtualMock = vi.fn();
vi.mock("@/modules/empresa/hooks/useIdentidadeEmpresaAtual", () => ({
  useIdentidadeEmpresaAtual: () => useIdentidadeEmpresaAtualMock(),
}));

const useUsuarioEhAdminMock = vi.fn();
vi.mock("@/modules/empresa/hooks/useUsuarioEhAdmin", () => ({
  useUsuarioEhAdmin: () => useUsuarioEhAdminMock(),
}));

import ConfiguracoesEmpresaPage from "./page";

function identidadeOk(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok" as const,
    identidade: {
      nome: "NEXOTFE Demo",
      cnpj: "12.345.678/0001-90",
      inscricaoEstadual: "123456",
      endereco: "Rua Teste, 100",
      telefone: "(11) 1111-1111",
      email: "contato@empresa.test",
      site: "www.empresa.test",
      logoUrl: null,
      ...overrides,
    },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("configuracoes/empresa (view somente-leitura)", () => {
  it("carregando: mostra estado neutro, sem botão Editar", () => {
    useIdentidadeEmpresaAtualMock.mockReturnValue({ status: "carregando" });
    useUsuarioEhAdminMock.mockReturnValue({ status: "carregando" });

    render(<ConfiguracoesEmpresaPage />);

    expect(screen.getByText("Carregando dados da empresa...")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Editar" })).toBeNull();
  });

  it("admin: vê o botão Editar apontando para /configuracoes/empresa/editar", () => {
    useIdentidadeEmpresaAtualMock.mockReturnValue(identidadeOk());
    useUsuarioEhAdminMock.mockReturnValue({ status: "ok", ehAdmin: true });

    render(<ConfiguracoesEmpresaPage />);

    const link = screen.getByRole("link", { name: "Editar" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/configuracoes/empresa/editar");
  });

  it("usuário comum: vê somente leitura, nenhum botão Editar", () => {
    useIdentidadeEmpresaAtualMock.mockReturnValue(identidadeOk());
    useUsuarioEhAdminMock.mockReturnValue({ status: "ok", ehAdmin: false });

    render(<ConfiguracoesEmpresaPage />);

    expect(screen.queryByRole("link", { name: "Editar" })).toBeNull();
    expect(screen.getByText("NEXOTFE Demo")).toBeTruthy();
    expect(screen.getByText("12.345.678/0001-90")).toBeTruthy();
  });

  it("permissão ainda carregando (identidade já ok): não mostra Editar até saber que é admin", () => {
    useIdentidadeEmpresaAtualMock.mockReturnValue(identidadeOk());
    useUsuarioEhAdminMock.mockReturnValue({ status: "carregando" });

    render(<ConfiguracoesEmpresaPage />);

    expect(screen.queryByRole("link", { name: "Editar" })).toBeNull();
  });

  it("sem_empresa: mostra mensagem, sem quebrar", () => {
    useIdentidadeEmpresaAtualMock.mockReturnValue({ status: "sem_empresa" });
    useUsuarioEhAdminMock.mockReturnValue({ status: "ok", ehAdmin: true });

    render(<ConfiguracoesEmpresaPage />);

    expect(screen.getByText("Nenhuma empresa vinculada ao seu usuário.")).toBeTruthy();
  });

  it("erro: mostra a mensagem de erro real", () => {
    useIdentidadeEmpresaAtualMock.mockReturnValue({ status: "erro", mensagem: "Falha ao carregar" });
    useUsuarioEhAdminMock.mockReturnValue({ status: "ok", ehAdmin: true });

    render(<ConfiguracoesEmpresaPage />);

    expect(screen.getByText("Falha ao carregar")).toBeTruthy();
  });
});
