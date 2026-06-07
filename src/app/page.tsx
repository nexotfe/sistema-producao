export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl lg:grid-cols-[1.1fr_0.9fr]">
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
                •	Orçamento e proposta automatizadas.
                </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                •	Projetos customizados e manufatura sob encomenda.
                </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                •	Controle de qualidade por etapa.
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                •	Análise de recursos para enxergar gargalos no chão de fábrica.
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8">
                <p className="text-sm font-semibold text-blue-700">
                  Do orçamento à produção
                </p>
                <h2 className="mt-2 text-3xl font-bold text-slate-950">
                  Bem-vindo!
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Acesse sua conta para continuar.
                </p>
              </div>

              <form action="/dashboard" className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    E-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="Digite seu e-mail"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="senha"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Senha
                  </label>
                  <input
                    id="senha"
                    type="password"
                    placeholder="Digite sua senha"
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                <div className="flex justify-end">
                  <a
                    href="#"
                    className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
                  >
                    Esqueci minha senha
                  </a>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200"
                >
                  Entrar
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
