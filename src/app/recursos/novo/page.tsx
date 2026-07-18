"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useNovoRecurso } from "@/modules/recursos/hooks/useNovoRecurso";

export default function NovoRecursoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const duplicarId = searchParams.get("duplicar");
  const {
    codigo,
    setCodigo,
    nome,
    setNome,
    grupoId,
    setGrupoId,
    fabricante,
    setFabricante,
    modelo,
    setModelo,
    cargaHorariaSemanal,
    setCargaHorariaSemanal,
    diasTrabalhadosSemana,
    setDiasTrabalhadosSemana,
    capacidadeHorasDiaCalculada,
    produtividade,
    setProdutividade,
    produtividadeModo,
    setProdutividadeModo,
    produtividadeHerdada,
    valorHora,
    setValorHora,
    grupos,
    loadingGrupos,
    loadingDuplicado,
    loading,
    erro,
    salvarRecurso,
  } = useNovoRecurso(duplicarId);

  async function handleSalvar() {
    const sucesso = await salvarRecurso();

    if (sucesso) {
      router.push("/recursos");
    }
  }

  return (
    <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-t-lg border-x border-t border-slate-200 bg-[#0B1B2B] px-5 py-4 -mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
                LOGO
              </div>

              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                  Recurso Produtivo
                </h1>
                <p className="mt-1 text-sm text-slate-300">
                  Novo recurso produtivo
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <span className="whitespace-nowrap text-sm font-medium text-slate-300">
                Nome do usuário
              </span>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="h-10 rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
                >
                  Voltar
                </button>
                <Link
                  href="/central"
                  className="inline-flex h-10 items-center rounded-md border border-white/20 bg-white/[0.08] px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.15]"
                >
                  Início
                </Link>
                <button
                  type="button"
                  onClick={handleSalvar}
                  disabled={loading || loadingDuplicado}
                  className="h-10 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          {loadingDuplicado ? (
            <p className="text-sm text-slate-500">Carregando recurso...</p>
          ) : (
            <>
              <Card titulo="Informações do recurso">
                <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
                  <Field label="Código" value={codigo} onChange={setCodigo} />
                  <Field
                    label="Nome do recurso"
                    value={nome}
                    onChange={setNome}
                  />
                  <SelectField
                    label="Grupo / Centro de trabalho"
                    value={grupoId}
                    onChange={setGrupoId}
                    disabled={loadingGrupos}
                    options={grupos.map((grupo) => ({
                      value: grupo.id,
                      label: [grupo.codigo, grupo.nome]
                        .filter(Boolean)
                        .join(" - "),
                    }))}
                  />
                  <CurrencyField
                    label="Valor Hora"
                    value={valorHora}
                    onChange={setValorHora}
                  />
                </div>
              </Card>

              <Card titulo="Características">
                <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
                  <Field
                    label="Fabricante"
                    value={fabricante}
                    onChange={setFabricante}
                  />
                  <Field label="Modelo" value={modelo} onChange={setModelo} />
                  <Field
                    label="Carga Horária Semanal (h)"
                    value={cargaHorariaSemanal}
                    onChange={setCargaHorariaSemanal}
                  />
                  <Field
                    label="Dias Trabalhados por Semana"
                    value={diasTrabalhadosSemana}
                    onChange={setDiasTrabalhadosSemana}
                  />
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Capacidade Diária (calculada)
                    </label>
                    <input
                      value={
                        capacidadeHorasDiaCalculada !== null
                          ? `${capacidadeHorasDiaCalculada} h/dia`
                          : ""
                      }
                      readOnly
                      className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Produtividade
                    </label>
                    <div className="flex overflow-hidden rounded-md border border-slate-300">
                      <button
                        type="button"
                        onClick={() => setProdutividadeModo("herdar")}
                        className={`h-10 flex-1 text-xs font-semibold transition ${
                          produtividadeModo === "herdar"
                            ? "bg-blue-600 text-white"
                            : "bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Herdar do Grupo
                      </button>
                      <button
                        type="button"
                        onClick={() => setProdutividadeModo("especifico")}
                        className={`h-10 flex-1 border-l border-slate-300 text-xs font-semibold transition ${
                          produtividadeModo === "especifico"
                            ? "bg-blue-600 text-white"
                            : "bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Usar valor específico
                      </button>
                    </div>
                  </div>
                  {produtividadeModo === "herdar" ? (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Produtividade herdada do Grupo
                      </label>
                      <input
                        value={
                          produtividadeHerdada !== null
                            ? `${Math.round(produtividadeHerdada * 10000) / 100}%`
                            : "Grupo sem Produtividade Padrão definida"
                        }
                        readOnly
                        className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 outline-none"
                      />
                    </div>
                  ) : (
                    <Field
                      label="Produtividade (%)"
                      value={produtividade}
                      onChange={setProdutividade}
                    />
                  )}
                </div>
              </Card>

              {erro && (
                <p className="text-sm font-medium text-red-600">{erro}</p>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Card({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-app-card transition hover:border-blue-700">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-950">{titulo}</h2>
      </div>

      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  disabled,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CurrencyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      {/*
        Valor Hora representa o custo/hora padrão do recurso produtivo.
        Futuramente será usado para custos de operação, custo industrial,
        custo do orçamento e simulações de produção.
      */}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        placeholder="R$ 0,00/h"
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}
