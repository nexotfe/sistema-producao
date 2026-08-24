import { describe, expect, it } from "vitest";
import {
  BUCKET_LOGOS_EMPRESAS,
  TAMANHO_MAXIMO_LOGO_BYTES,
  TIPOS_MIME_LOGO_PERMITIDOS,
  extensaoParaMime,
  gerarCaminhoLogoNovo,
} from "./logoEmpresaConfig";

describe("logoEmpresaConfig", () => {
  it("constantes batem com a migration 20260824174845_empresas_logo_storage.sql", () => {
    expect(BUCKET_LOGOS_EMPRESAS).toBe("empresas-logos");
    expect(TAMANHO_MAXIMO_LOGO_BYTES).toBe(2 * 1024 * 1024);
    expect(TIPOS_MIME_LOGO_PERMITIDOS).toEqual(["image/png", "image/jpeg", "image/webp"]);
  });

  it("extensaoParaMime: mapeia os 3 formatos permitidos", () => {
    expect(extensaoParaMime("image/png")).toBe("png");
    expect(extensaoParaMime("image/jpeg")).toBe("jpg");
    expect(extensaoParaMime("image/webp")).toBe("webp");
  });

  it("extensaoParaMime: formato não permitido (SVG, GIF) retorna null", () => {
    expect(extensaoParaMime("image/svg+xml")).toBeNull();
    expect(extensaoParaMime("image/gif")).toBeNull();
    expect(extensaoParaMime("application/pdf")).toBeNull();
  });

  it("gerarCaminhoLogoNovo: formato {empresaId}/logo-{uuid}.{ext} - isolado pela pasta da empresa", () => {
    const caminho = gerarCaminhoLogoNovo("empresa-abc", "image/png");
    expect(caminho).toMatch(
      /^empresa-abc\/logo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    );
  });

  it("gerarCaminhoLogoNovo: duas chamadas seguidas nunca colidem (UUID, não timestamp)", () => {
    const empresaId = "empresa-abc";
    const caminho1 = gerarCaminhoLogoNovo(empresaId, "image/png");
    const caminho2 = gerarCaminhoLogoNovo(empresaId, "image/png");
    expect(caminho1).not.toBe(caminho2);
  });

  it("gerarCaminhoLogoNovo: mime não suportado retorna null (nunca gera path pra formato inválido)", () => {
    expect(gerarCaminhoLogoNovo("empresa-abc", "image/svg+xml")).toBeNull();
  });
});
