"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { Button } from "@/modules/shared/ui/Button";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function entrar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setErro(null);

    if (!isSupabaseConfigured) {
      setLoading(false);
      setErro(
        "Configuracao do Supabase ausente (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). Verifique as variaveis de ambiente do deploy.",
      );
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    setLoading(false);

    if (error) {
      // "Invalid login credentials" e o unico caso de credencial
      // realmente errada - qualquer outro erro (rede, config, 500 do
      // Supabase) e um problema de ambiente/infra, nao de senha, e nao
      // deve ser confundido com um pelo outro no debugging.
      setErro(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha inválidos."
          : `Erro ao entrar: ${error.message}`,
      );
      return;
    }

    router.push("/central");
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl lg:grid-cols-[1.1fr_0.9fr]">
          <div className="hidden bg-slate-800 p-8 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
                Gestão da Produção
              </p>

              <h1 className="mt-6 max-w-xl text-4xl font-bold leading-tight">
                Do Orçamento à entrega.
              </h1>
            </div>

            <div className="grid gap-4 text-sm text-slate-300">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                • Orçamento e proposta automatizadas.
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                • Projetos customizados e manufatura sob encomenda.
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                • Controle de qualidade por etapa.
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                • Análise de recursos para enxergar gargalos no chão de fábrica.
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8">
                <p className="text-sm font-semibold text-action-primary">
                  Do orçamento à produção
                </p>

                <h2 className="mt-2 text-3xl font-bold text-text-primary">
                  Bem-vindo!
                </h2>

                <p className="mt-2 text-sm text-text-secondary">
                  Acesse sua conta para continuar.
                </p>
              </div>

              <form onSubmit={entrar} className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1 block text-sm font-medium text-text-primary"
                  >
                    E-mail
                  </label>

                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Digite seu e-mail"
                    className="w-full rounded-lg border border-border bg-surface-elevated px-4 py-3 text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-4 focus:ring-focus-ring"
                  />
                </div>

                <div>
                  <label
                    htmlFor="senha"
                    className="mb-1 block text-sm font-medium text-text-primary"
                  >
                    Senha
                  </label>

                  <input
                    id="senha"
                    type="password"
                    value={senha}
                    onChange={(event) => setSenha(event.target.value)}
                    placeholder="Digite sua senha"
                    className="w-full rounded-lg border border-border bg-surface-elevated px-4 py-3 text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-4 focus:ring-focus-ring"
                  />
                </div>

                {erro && (
                  <p className="text-sm font-medium text-status-danger-text">{erro}</p>
                )}

                <div className="flex justify-end">
                  <a
                    href="#"
                    className="text-sm font-medium text-action-primary hover:text-action-primary-hover hover:underline"
                  >
                    Esqueci minha senha
                  </a>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
