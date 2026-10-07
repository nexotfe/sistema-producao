/* @vitest-environment jsdom */
// Testes do client isolado de primeiro acesso (C2.4-I1A-4). Usa o
// createClient REAL de @supabase/supabase-js (sem mock) - o objetivo é
// provar o comportamento real da lib com estas opções, não só que
// passamos a intenção certa.
//
// Import dinâmico (vi.resetModules + await import) em cada teste, depois
// de vi.stubEnv: as constantes de URL/chave do módulo são lidas de
// process.env no top-level do arquivo - um import estático no topo deste
// arquivo de teste capturaria essas constantes ANTES do stubEnv rodar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function carregarClienteIsolado() {
  vi.resetModules();
  const { criarClientePrimeiroAcesso } = await import("./criarClientePrimeiroAcesso");
  return criarClientePrimeiroAcesso;
}

describe("criarClientePrimeiroAcesso", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://teste-i1a4.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "chave-anon-falsa-de-teste");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = "";
  });

  it("A. client criado com persistSession=false, autoRefreshToken=false, detectSessionInUrl=false", async () => {
    const criarClientePrimeiroAcesso = await carregarClienteIsolado();
    const client = criarClientePrimeiroAcesso();
    // auth-js expõe esses campos diretamente na instância do GoTrueClient
    // (this.persistSession = settings.persistSession, etc.) - checagem
    // sobre o comportamento REAL resultante, não sobre a chamada mockada.
    expect((client.auth as unknown as { persistSession: boolean }).persistSession).toBe(false);
    expect((client.auth as unknown as { autoRefreshToken: boolean }).autoRefreshToken).toBe(false);
    expect((client.auth as unknown as { detectSessionInUrl: boolean }).detectSessionInUrl).toBe(false);
  });

  it("B. nenhuma chamada a localStorage durante a criação do client", async () => {
    const criarClientePrimeiroAcesso = await carregarClienteIsolado();
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    criarClientePrimeiroAcesso();

    // localStorage e sessionStorage compartilham o protótipo Storage no
    // jsdom - filtra só as chamadas feitas de fato sobre window.localStorage.
    const chamadasLocalStorage = setItemSpy.mock.instances.filter((i) => i === localStorage);
    expect(chamadasLocalStorage).toHaveLength(0);
    expect(getItemSpy.mock.instances.filter((i) => i === localStorage)).toHaveLength(0);

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it("C. nenhuma chamada a sessionStorage durante a criação do client", async () => {
    const criarClientePrimeiroAcesso = await carregarClienteIsolado();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    criarClientePrimeiroAcesso();

    const chamadasSessionStorage = setItemSpy.mock.instances.filter((i) => i === sessionStorage);
    expect(chamadasSessionStorage).toHaveLength(0);

    setItemSpy.mockRestore();
  });

  it("D. nenhuma escrita em document.cookie durante a criação do client", async () => {
    const criarClientePrimeiroAcesso = await carregarClienteIsolado();
    const descritorOriginal = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    const setCookieSpy = vi.fn();
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "",
      set: setCookieSpy,
    });

    criarClientePrimeiroAcesso();

    expect(setCookieSpy).not.toHaveBeenCalled();

    if (descritorOriginal) {
      Object.defineProperty(Document.prototype, "cookie", descritorOriginal);
    }
  });

  it("N. criar um NOVO client isolado não encontra sessão de um client isolado anterior (nada persiste entre instâncias)", async () => {
    const criarClientePrimeiroAcesso = await carregarClienteIsolado();
    const primeiroClient = criarClientePrimeiroAcesso();
    // nenhuma sessão real é criada nesta fatia (sem verifyOtp ainda) -
    // getSession() já deve vir null por não haver nada em memória.
    const { data: dadosPrimeiro } = await primeiroClient.auth.getSession();
    expect(dadosPrimeiro.session).toBeNull();

    const segundoClient = criarClientePrimeiroAcesso();
    const { data: dadosSegundo } = await segundoClient.auth.getSession();
    expect(dadosSegundo.session).toBeNull();

    // instâncias diferentes, nenhum estado compartilhado entre elas.
    expect(primeiroClient).not.toBe(segundoClient);
  });

  it("nenhuma função desta fatia chama fetch/rede ao simplesmente criar o client", async () => {
    const criarClientePrimeiroAcesso = await carregarClienteIsolado();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    criarClientePrimeiroAcesso();

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
