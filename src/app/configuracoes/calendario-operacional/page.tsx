"use client";

import { useState } from "react";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { useCalendarioOperacional } from "@/modules/calendario/hooks/useCalendarioOperacional";
import {
  TIPO_EVENTO_LABELS,
  type TipoEventoCalendario,
} from "@/modules/calendario/types";

const DIAS_SEMANA: Array<{
  key:
    | "segunda"
    | "terca"
    | "quarta"
    | "quinta"
    | "sexta"
    | "sabado"
    | "domingo";
  label: string;
}> = [
  { key: "segunda", label: "Segunda" },
  { key: "terca", label: "Terça" },
  { key: "quarta", label: "Quarta" },
  { key: "quinta", label: "Quinta" },
  { key: "sexta", label: "Sexta" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
];

const TIPOS_EVENTO = Object.keys(TIPO_EVENTO_LABELS) as TipoEventoCalendario[];

export default function CalendarioOperacionalPage() {
  const {
    segunda,
    setSegunda,
    terca,
    setTerca,
    quarta,
    setQuarta,
    quinta,
    setQuinta,
    sexta,
    setSexta,
    sabado,
    setSabado,
    domingo,
    setDomingo,
    eventos,
    loading,
    salvando,
    erro,
    mensagem,
    salvarPadraoSemanal,
    adicionarEvento,
    removerEvento,
  } = useCalendarioOperacional();

  const diasState: Record<string, [boolean, (value: boolean) => void]> = {
    segunda: [segunda, setSegunda],
    terca: [terca, setTerca],
    quarta: [quarta, setQuarta],
    quinta: [quinta, setQuinta],
    sexta: [sexta, setSexta],
    sabado: [sabado, setSabado],
    domingo: [domingo, setDomingo],
  };

  const [novaData, setNovaData] = useState("");
  const [novoTipo, setNovoTipo] = useState<TipoEventoCalendario>(
    "recesso_coletivo",
  );
  const [novaDescricao, setNovaDescricao] = useState("");

  async function handleAdicionarEvento() {
    const resultado = await adicionarEvento(novaData, novoTipo, novaDescricao);

    if (resultado.status === "ok") {
      setNovaData("");
      setNovaDescricao("");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <p className="text-sm text-slate-500">Carregando calendário...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-app-bg px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ModuleBackLink href="/central" label="Configurações" />

          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Calendário Operacional
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Padrão semanal de trabalho e eventos que alteram a
              produtividade de dias específicos.
            </p>
          </div>
        </header>

        {(erro || mensagem) && (
          <p className={`text-sm ${erro ? "text-rose-600" : "text-emerald-600"}`}>
            {erro ?? mensagem}
          </p>
        )}

        <section className="rounded-lg border border-slate-200 bg-app-card">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-base font-semibold text-slate-900">
              Padrão Semanal de Trabalho
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Dias marcados são considerados produtivos por padrão — o
              Calendário Oficial e os Eventos da Empresa podem alterar dias
              específicos.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 px-6 py-6">
            {DIAS_SEMANA.map(({ key, label }) => {
              const [valor, setValor] = diasState[key];

              return (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={valor}
                    onChange={(event) => setValor(event.target.checked)}
                    className="h-4 w-4"
                  />
                  {label}
                </label>
              );
            })}
          </div>

          <div className="flex justify-end border-t border-slate-100 px-6 py-4">
            <button
              type="button"
              onClick={salvarPadraoSemanal}
              disabled={salvando}
              className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Salvar padrão semanal"}
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-app-card">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-base font-semibold text-slate-900">
              Eventos do Calendário da Empresa
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Exceções pontuais — recesso, inventário, paralisação, dia
              trabalhado excepcional, feriado local temporário.
            </p>
          </div>

          <div className="grid gap-4 border-b border-slate-100 px-6 py-6 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Data
              </label>
              <input
                type="date"
                value={novaData}
                onChange={(event) => setNovaData(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Tipo
              </label>
              <select
                value={novoTipo}
                onChange={(event) =>
                  setNovoTipo(event.target.value as TipoEventoCalendario)
                }
                className="h-11 w-full rounded-lg border border-slate-200 bg-app-card px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
              >
                {TIPOS_EVENTO.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {TIPO_EVENTO_LABELS[tipo]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Descrição
              </label>
              <input
                value={novaDescricao}
                onChange={(event) => setNovaDescricao(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
              />
            </div>

            <div className="md:col-span-3">
              <button
                type="button"
                onClick={handleAdicionarEvento}
                className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Adicionar evento
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {eventos.length === 0 ? (
              <p className="px-6 py-6 text-sm text-slate-500">
                Nenhum evento cadastrado.
              </p>
            ) : (
              eventos.map((evento) => (
                <div
                  key={evento.id}
                  className="flex items-center justify-between px-6 py-4"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {new Date(`${evento.data}T00:00:00`).toLocaleDateString(
                        "pt-BR",
                      )}{" "}
                      — {TIPO_EVENTO_LABELS[evento.tipo]}
                    </p>
                    {evento.descricao ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {evento.descricao}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => removerEvento(evento.id)}
                    className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Remover
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
