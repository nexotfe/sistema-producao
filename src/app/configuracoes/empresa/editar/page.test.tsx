/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const routerReplaceMock = vi.fn();
const routerPushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplaceMock, push: routerPushMock }),
}));

const useUsuarioEhAdminMock = vi.fn();
vi.mock("@/modules/empresa/hooks/useUsuarioEhAdmin", () => ({
  useUsuarioEhAdmin: () => useUsuarioEhAdminMock(),
}));

const useEditarIdentidadeEmpresaMock = vi.fn();
vi.mock("@/modules/empresa/hooks/useEditarIdentidadeEmpresa", () => ({
  useEditarIdentidadeEmpresa: () => useEditarIdentidadeEmpresaMock(),
}));

const enviarLogoEmpresaMock = vi.fn();
vi.mock("@/modules/empresa/lib/enviarLogoEmpresa", () => ({
  enviarLogoEmpresa: (...args: unknown[]) => enviarLogoEmpresaMock(...args),
}));

const removerLogoEmpresaMock = vi.fn();
vi.mock("@/modules/empresa/lib/removerLogoEmpresa", () => ({
  removerLogoEmpresa: (...args: unknown[]) => removerLogoEmpresaMock(...args),
}));

const getPublicUrlMock = vi.fn(() => ({ data: { publicUrl: "https://fake-storage.test/nova-logo.png" } }));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    storage: {
      from: () => ({ getPublicUrl: getPublicUrlMock }),
    },
  },
}));

import EditarIdentidadeEmpresaPage from "./page";

function hookIdentidadePadrao(overrides: Record<string, unknown> = {}) {
  return {
    estadoCarregamento: "ok" as const,
    mensagemCarregamento: null,
    logoUrl: null,
    nome: "NEXOTFE Demo",
    setNome: vi.fn(),
    cnpj: "12.345.678/0001-90",
    setCnpj: vi.fn(),
    inscricaoEstadual: "123456",
    setInscricaoEstadual: vi.fn(),
    endereco: "Rua Teste, 100",
    setEndereco: vi.fn(),
    telefone: "(11) 1111-1111",
    setTelefone: vi.fn(),
    email: "contato@empresa.test",
    setEmail: vi.fn(),
    site: "www.empresa.test",
    setSite: vi.fn(),
    salvando: false,
    erro: null,
    avisoSite: null,
    sucesso: false,
    salvar: vi.fn(async () => true),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("configuracoes/empresa/editar - gate de admin", () => {
  it("permissão carregando: mostra estado neutro, nunca o formulário", () => {
    useUsuarioEhAdminMock.mockReturnValue({ status: "carregando" });
    useEditarIdentidadeEmpresaMock.mockReturnValue(hookIdentidadePadrao());

    render(<EditarIdentidadeEmpresaPage />);

    expect(screen.getByText("Verificando permissão...")).toBeTruthy();
    expect(screen.queryByText("Salvar dados da empresa")).toBeNull();
    expect(screen.queryByDisplayValue("NEXOTFE Demo")).toBeNull();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("não-admin: nunca renderiza o formulário, redireciona para a view", async () => {
    useUsuarioEhAdminMock.mockReturnValue({ status: "ok", ehAdmin: false });
    useEditarIdentidadeEmpresaMock.mockReturnValue(hookIdentidadePadrao());

    render(<EditarIdentidadeEmpresaPage />);

    expect(screen.getByText("Redirecionando...")).toBeTruthy();
    expect(screen.queryByText("Salvar dados da empresa")).toBeNull();
    expect(screen.queryByDisplayValue("NEXOTFE Demo")).toBeNull();

    await act(async () => {});
    expect(routerReplaceMock).toHaveBeenCalledWith("/configuracoes/empresa");
  });

  it("erro ao verificar permissão: mostra a mensagem, nunca o formulário", () => {
    useUsuarioEhAdminMock.mockReturnValue({ status: "erro", mensagem: "Falha de rede" });
    useEditarIdentidadeEmpresaMock.mockReturnValue(hookIdentidadePadrao());

    render(<EditarIdentidadeEmpresaPage />);

    expect(screen.getByText("Falha de rede")).toBeTruthy();
    expect(screen.queryByText("Salvar dados da empresa")).toBeNull();
  });

  it("admin, mas dados da empresa ainda carregando: estado neutro, nenhum controle", () => {
    useUsuarioEhAdminMock.mockReturnValue({ status: "ok", ehAdmin: true });
    useEditarIdentidadeEmpresaMock.mockReturnValue(hookIdentidadePadrao({ estadoCarregamento: "carregando" }));

    render(<EditarIdentidadeEmpresaPage />);

    expect(screen.getByText("Carregando dados da empresa...")).toBeTruthy();
    expect(screen.queryByText("Salvar dados da empresa")).toBeNull();
  });

  it("admin: renderiza o formulário com os dados carregados", () => {
    useUsuarioEhAdminMock.mockReturnValue({ status: "ok", ehAdmin: true });
    useEditarIdentidadeEmpresaMock.mockReturnValue(hookIdentidadePadrao());

    render(<EditarIdentidadeEmpresaPage />);

    expect(screen.getByText("Salvar dados da empresa")).toBeTruthy();
    expect(screen.getByDisplayValue("NEXOTFE Demo")).toBeTruthy();
    expect(screen.getByDisplayValue("12.345.678/0001-90")).toBeTruthy();
  });
});

describe("configuracoes/empresa/editar - logo (operação independente dos dados)", () => {
  function renderFormulario(overrides: Record<string, unknown> = {}) {
    useUsuarioEhAdminMock.mockReturnValue({ status: "ok", ehAdmin: true });
    useEditarIdentidadeEmpresaMock.mockReturnValue(hookIdentidadePadrao(overrides));
    return render(<EditarIdentidadeEmpresaPage />);
  }

  function arquivoFalso() {
    return new File([new Uint8Array(10)], "logo.png", { type: "image/png" });
  }

  it("upload com sucesso: atualiza a logo exibida, sem tocar erro/aviso dos dados cadastrais", async () => {
    enviarLogoEmpresaMock.mockResolvedValue({ status: "ok", logoPath: "empresa-x/logo-1.png" });
    renderFormulario();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivoFalso()] } });
    });

    expect(enviarLogoEmpresaMock).toHaveBeenCalled();
    expect(getPublicUrlMock).toHaveBeenCalledWith("empresa-x/logo-1.png");
    expect(screen.getByAltText("NEXOTFE Demo")).toBeTruthy();
  });

  it("upload com falha: mostra erro da logo, preserva os dados cadastrais (sem erro no formulário)", async () => {
    enviarLogoEmpresaMock.mockResolvedValue({ status: "erro", mensagem: "Falha ao enviar a logo" });
    renderFormulario();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivoFalso()] } });
    });

    expect(screen.getByText("Falha ao enviar a logo")).toBeTruthy();
    expect(screen.getByDisplayValue("NEXOTFE Demo")).toBeTruthy();
  });

  it("remoção com sucesso: logo some da tela (volta ao fallback)", async () => {
    removerLogoEmpresaMock.mockResolvedValue({ status: "ok" });
    renderFormulario({ logoUrl: "https://fake-storage.test/logo-atual.png" });

    expect(screen.getByAltText("NEXOTFE Demo")).toBeTruthy();

    const botaoRemover = screen.getByText("Remover logo");
    await act(async () => {
      fireEvent.click(botaoRemover);
    });

    expect(removerLogoEmpresaMock).toHaveBeenCalled();
    expect(screen.queryByAltText("NEXOTFE Demo")).toBeNull();
    expect(screen.getByText("LOGO")).toBeTruthy();
  });

  it("remoção com falha: mostra erro da logo, mantém a logo exibida", async () => {
    removerLogoEmpresaMock.mockResolvedValue({ status: "erro", mensagem: "Falha ao remover a logo" });
    renderFormulario({ logoUrl: "https://fake-storage.test/logo-atual.png" });

    const botaoRemover = screen.getByText("Remover logo");
    await act(async () => {
      fireEvent.click(botaoRemover);
    });

    expect(screen.getByText("Falha ao remover a logo")).toBeTruthy();
    expect(screen.getByAltText("NEXOTFE Demo")).toBeTruthy();
  });
});

describe("configuracoes/empresa/editar - aviso de falha parcial do site", () => {
  it("salvar com aviso de site: aviso fica visível e os dados já preenchidos continuam na tela", () => {
    useUsuarioEhAdminMock.mockReturnValue({ status: "ok", ehAdmin: true });
    useEditarIdentidadeEmpresaMock.mockReturnValue(
      hookIdentidadePadrao({
        sucesso: true,
        avisoSite: "Os dados da empresa foram salvos, mas não foi possível atualizar o site.",
      }),
    );

    render(<EditarIdentidadeEmpresaPage />);

    expect(
      screen.getByText("Os dados da empresa foram salvos, mas não foi possível atualizar o site."),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("NEXOTFE Demo")).toBeTruthy();
    expect(screen.getByDisplayValue("12.345.678/0001-90")).toBeTruthy();
  });
});
