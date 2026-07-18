"use client";

import { use } from "react";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { useRouter } from "next/navigation";
import { useEditarRecurso } from "@/modules/recursos/hooks/useEditarRecurso";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default function EditarRecursoPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
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
    setor,
    setSetor,
    cargaHorariaSemanal,
    setCargaHorariaSemanal,
    diasTrabalhadosSemana,
    setDiasTrabalhadosSemana,
    capacidadeHorasDiaExibida,
    produtividade,
    setProdutividade,
    produtividadeModo,
    setProdutividadeModo,
    produtividadeHerdada,
    valorHora,
    setValorHora,
    grupos,
    loading,
    salvando,
    erro,
    salvarRecurso,
  } = useEditarRecurso(id);

  async function handleSalvar() {
    const sucesso = await salvarRecurso();

    if (sucesso) {
      router.push(`/recursos/${id}`);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <p className="text-sm text-slate-500">Carregando recurso...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ModuleBackLink href="/recursos" label="Recurso" />

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Editar recurso produtivo
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Atualizacao dos dados cadastrais do recurso.
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Informacoes do recurso">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Codigo" value={codigo} onChange={setCodigo} />
              <Field label="Nome do recurso" value={nome} onChange={setNome} />
              <SelectField
                label="Grupo / Centro de trabalho"
                value={grupoId}
                onChange={setGrupoId}
                options={grupos.map((grupo) => ({
                  value: grupo.id,
                  label: [grupo.codigo, grupo.nome].filter(Boolean).join(" - "),
                }))}
              />
              <Field
                label="Setor / Centro de trabalho"
                value={setor}
                onChange={setSetor}
              />
              <CurrencyField
                label="Valor Hora"
                value={valorHora}
                onChange={setValorHora}
              />
            </div>
          </Card>

          <Card titulo="Caracteristicas">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
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
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Capacidade Diária
                </label>
                <input
                  value={
                    capacidadeHorasDiaExibida !== null
                      ? `${capacidadeHorasDiaExibida} h/dia`
                      : ""
                  }
                  readOnly
                  className="h-11 w-full rounded-lg border border-slate-100 bg-slate-50 px-4 text-sm text-slate-500 outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Produtividade
                </label>
                <div className="flex overflow-hidden rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setProdutividadeModo("herdar")}
                    className={`h-11 flex-1 text-sm font-medium transition ${
                      produtividadeModo === "herdar"
                        ? "bg-slate-950 text-white"
                        : "bg-app-card text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Herdar do Grupo
                  </button>
                  <button
                    type="button"
                    onClick={() => setProdutividadeModo("especifico")}
                    className={`h-11 flex-1 border-l border-slate-200 text-sm font-medium transition ${
                      produtividadeModo === "especifico"
                        ? "bg-slate-950 text-white"
                        : "bg-app-card text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    Usar valor específico
                  </button>
                </div>
              </div>
              {produtividadeModo === "herdar" ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Produtividade herdada do Grupo
                  </label>
                  <input
                    value={
                      produtividadeHerdada !== null
                        ? `${Math.round(produtividadeHerdada * 10000) / 100}%`
                        : "Grupo sem Produtividade Padrão definida"
                    }
                    readOnly
                    className="h-11 w-full rounded-lg border border-slate-100 bg-slate-50 px-4 text-sm text-slate-500 outline-none"
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

          {erro && <p className="text-sm font-medium text-red-600">{erro}</p>}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push(`/recursos/${id}`)}
              className="rounded-lg border border-slate-200 bg-app-card px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando}
              className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
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
    <div className="rounded-lg border border-slate-200 bg-app-card">
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
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
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-slate-200 bg-app-card px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
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
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        placeholder="R$ 0,00/h"
        className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
      />
    </div>
  );
}
