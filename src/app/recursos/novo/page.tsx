"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useNovoRecurso } from "@/modules/recursos/hooks/useNovoRecurso";
import { ModuleHeader } from "@/modules/shared/ui/ModuleHeader";
import { ThemeToggle } from "@/modules/shared/ui/ThemeToggle";
import { Card } from "@/modules/shared/ui/Card";
import { Field } from "@/modules/shared/ui/Field";
import { Select } from "@/modules/shared/ui/Select";
import { Button } from "@/modules/shared/ui/Button";

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
    setor,
    setSetor,
    setorModo,
    setSetorModo,
    setorHerdado,
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
    observacoes,
    setObservacoes,
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
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <ModuleHeader
          variant="brand"
          title="Recurso Produtivo"
          subtitle="Novo recurso produtivo"
          themeToggle={<ThemeToggle />}
          actions={
            <>
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
                <Button onClick={handleSalvar} disabled={loading || loadingDuplicado}>
                  {loading ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </>
          }
        />

        <section className="flex flex-col gap-5">
          {loadingDuplicado ? (
            <p className="text-sm text-text-secondary">Carregando recurso...</p>
          ) : (
            <>
              <Card title="Informações do recurso">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Código"
                    value={codigo}
                    onChange={(event) => setCodigo(event.target.value)}
                  />
                  <Field
                    label="Nome do recurso"
                    value={nome}
                    onChange={(event) => setNome(event.target.value)}
                  />
                  <Select
                    label="Grupo / Centro de trabalho"
                    value={grupoId}
                    onChange={(event) => setGrupoId(event.target.value)}
                    disabled={loadingGrupos}
                    placeholder="Selecione"
                    options={grupos.map((grupo) => ({
                      value: grupo.id,
                      label: [grupo.codigo, grupo.nome]
                        .filter(Boolean)
                        .join(" - "),
                    }))}
                  />
                  <div className="flex flex-col gap-[7px]">
                    <label className="text-[12.5px] font-semibold text-text-primary">
                      Setor
                    </label>
                    <div className="flex h-[42px] overflow-hidden rounded-[10px] border border-border">
                      <button
                        type="button"
                        onClick={() => setSetorModo("herdar")}
                        className={`h-full flex-1 text-[12.5px] font-semibold transition ${
                          setorModo === "herdar"
                            ? "bg-action-primary text-action-primary-text"
                            : "bg-surface-elevated text-text-secondary hover:bg-border-subtle"
                        }`}
                      >
                        Herdar do Grupo
                      </button>
                      <button
                        type="button"
                        onClick={() => setSetorModo("especifico")}
                        className={`h-full flex-1 border-l border-border text-[12.5px] font-semibold transition ${
                          setorModo === "especifico"
                            ? "bg-action-primary text-action-primary-text"
                            : "bg-surface-elevated text-text-secondary hover:bg-border-subtle"
                        }`}
                      >
                        Usar valor específico
                      </button>
                    </div>
                  </div>
                  {setorModo === "herdar" ? (
                    <div className="flex flex-col gap-[7px]">
                      <label className="text-[12.5px] font-semibold text-text-primary">
                        Setor herdado do Grupo
                      </label>
                      <input
                        value={setorHerdado || "Grupo sem Setor definido"}
                        readOnly
                        className="h-[42px] w-full rounded-[10px] border border-border-subtle bg-border-subtle px-[13px] text-[13.5px] text-text-disabled outline-none"
                      />
                    </div>
                  ) : (
                    <Field
                      label="Setor"
                      value={setor}
                      onChange={(event) => setSetor(event.target.value)}
                    />
                  )}
                  <CurrencyField
                    label="Valor Hora"
                    value={valorHora}
                    onChange={setValorHora}
                  />
                </div>
              </Card>

              <Card title="Características">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Fabricante"
                    value={fabricante}
                    onChange={(event) => setFabricante(event.target.value)}
                  />
                  <Field
                    label="Modelo"
                    value={modelo}
                    onChange={(event) => setModelo(event.target.value)}
                  />
                  <Field
                    label="Carga Horária Semanal (h)"
                    value={cargaHorariaSemanal}
                    onChange={(event) =>
                      setCargaHorariaSemanal(event.target.value)
                    }
                  />
                  <Field
                    label="Dias Trabalhados por Semana"
                    value={diasTrabalhadosSemana}
                    onChange={(event) =>
                      setDiasTrabalhadosSemana(event.target.value)
                    }
                  />
                  <div className="flex flex-col gap-[7px]">
                    <label className="text-[12.5px] font-semibold text-text-primary">
                      Capacidade Diária (calculada)
                    </label>
                    <input
                      value={
                        capacidadeHorasDiaCalculada !== null
                          ? `${capacidadeHorasDiaCalculada} h/dia`
                          : ""
                      }
                      readOnly
                      className="h-[42px] w-full rounded-[10px] border border-border-subtle bg-border-subtle px-[13px] text-[13.5px] text-text-disabled outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-[7px]">
                    <label className="text-[12.5px] font-semibold text-text-primary">
                      Produtividade
                    </label>
                    <div className="flex h-[42px] overflow-hidden rounded-[10px] border border-border">
                      <button
                        type="button"
                        onClick={() => setProdutividadeModo("herdar")}
                        className={`h-full flex-1 text-[12.5px] font-semibold transition ${
                          produtividadeModo === "herdar"
                            ? "bg-action-primary text-action-primary-text"
                            : "bg-surface-elevated text-text-secondary hover:bg-border-subtle"
                        }`}
                      >
                        Herdar do Grupo
                      </button>
                      <button
                        type="button"
                        onClick={() => setProdutividadeModo("especifico")}
                        className={`h-full flex-1 border-l border-border text-[12.5px] font-semibold transition ${
                          produtividadeModo === "especifico"
                            ? "bg-action-primary text-action-primary-text"
                            : "bg-surface-elevated text-text-secondary hover:bg-border-subtle"
                        }`}
                      >
                        Usar valor específico
                      </button>
                    </div>
                  </div>
                  {produtividadeModo === "herdar" ? (
                    <div className="flex flex-col gap-[7px]">
                      <label className="text-[12.5px] font-semibold text-text-primary">
                        Produtividade herdada do Grupo
                      </label>
                      <input
                        value={
                          produtividadeHerdada !== null
                            ? `${Math.round(produtividadeHerdada * 10000) / 100}%`
                            : "Grupo sem Produtividade Padrão definida"
                        }
                        readOnly
                        className="h-[42px] w-full rounded-[10px] border border-border-subtle bg-border-subtle px-[13px] text-[13.5px] text-text-disabled outline-none"
                      />
                    </div>
                  ) : (
                    <Field
                      label="Produtividade (%)"
                      value={produtividade}
                      onChange={(event) => setProdutividade(event.target.value)}
                    />
                  )}
                </div>
              </Card>

              <Card title="Observações">
                <div className="flex flex-col gap-[7px]">
                  <label className="text-[12.5px] font-semibold text-text-primary">
                    Observações
                  </label>
                  <textarea
                    value={observacoes}
                    onChange={(event) => setObservacoes(event.target.value)}
                    rows={6}
                    className="w-full rounded-[10px] border border-border bg-surface-elevated px-[13px] py-[10px] text-[13.5px] text-text-primary outline-none transition placeholder:text-text-disabled focus-visible:border-action-primary focus-visible:ring-[3px] focus-visible:ring-focus-ring"
                  />
                </div>
              </Card>

              {erro && (
                <p className="text-sm font-medium text-status-danger-text">
                  {erro}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </main>
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
    <div className="flex flex-col gap-[7px]">
      <label className="text-[12.5px] font-semibold text-text-primary">
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
        className="h-[42px] w-full rounded-[10px] border border-border bg-surface-elevated px-[13px] text-[13.5px] text-text-primary outline-none transition placeholder:text-text-disabled focus-visible:border-action-primary focus-visible:ring-[3px] focus-visible:ring-focus-ring"
      />
    </div>
  );
}
