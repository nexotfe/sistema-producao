"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function NovaMateriaPrimaPage() {
  const searchParams = useSearchParams();
  const materialDuplicado = searchParams.get("duplicar");
  const duplicando = Boolean(materialDuplicado);

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-lg border border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                LOGO
              </div>

              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                  Matéria-Prima
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Nova matéria-prima
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <span className="whitespace-nowrap text-sm font-medium text-slate-500">
                Nome do usuário
              </span>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/estoque/materias-primas"
                  className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Voltar
                </Link>
                <Link
                  href="/central"
                  className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Início
                </Link>
                <button
                  type="button"
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Excluir
                </button>
                <button
                  type="button"
                  className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card titulo="Identificação">
              <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
                <Field
                  label="Código"
                  placeholder={
                    duplicando ? "Informe um novo código para salvar" : undefined
                  }
                />
                <SelectField
                  label="Família"
                  options={[
                    "Aço carbono",
                    "Aço inox",
                    "Alumínio",
                    "Chapas",
                    "Polímeros",
                    "Consumíveis",
                  ]}
                  defaultValue={duplicando ? "Aço carbono" : undefined}
                />
                <SelectField
                  label="Unidade"
                  options={["kg", "metro", "barra", "chapa", "peça", "litro"]}
                  defaultValue={duplicando ? "metro" : undefined}
                />
                <SelectField
                  label="Status"
                  options={["Ativo", "Inativo"]}
                  defaultValue="Ativo"
                />
                <div className="md:col-span-2">
                  <Field
                    label="Descrição"
                    defaultValue={duplicando ? "SAE 1045 redondo" : undefined}
                  />
                </div>
                <Field
                  label="Bitola"
                  defaultValue={duplicando ? "50 mm" : undefined}
                />
                <Field
                  label="Dimensão"
                  defaultValue={duplicando ? "Ø 50 x 3000 mm" : undefined}
                />
                <Field
                  label="NCM"
                  defaultValue={duplicando ? "7228.30.00" : undefined}
                />
                <Field
                  label="Endereço"
                  defaultValue={duplicando ? "ALM01-R5-E3/P6/4" : undefined}
                />
              </div>
            </Card>

            <Card titulo="Informações Técnicas">
              <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
                <Field
                  label="Fabricante"
                  defaultValue={duplicando ? "Fornecedor técnico" : undefined}
                />
                <Field
                  label="Marca"
                  defaultValue={duplicando ? "Linha industrial" : undefined}
                />
                <div className="md:col-span-2">
                  <Field
                    label="Material / Especificação"
                    defaultValue={duplicando ? "Aço SAE 1045" : undefined}
                  />
                </div>
                <Field
                  label="Norma"
                  defaultValue={duplicando ? "ASTM A576" : undefined}
                />
                <Field
                  label="Peso Específico"
                  defaultValue={duplicando ? "7,85 g/cm³" : undefined}
                />
                <div className="md:col-span-2">
                  <TextareaField
                    label="Observações Técnicas"
                    rows={3}
                    defaultValue={
                      duplicando
                        ? "Dados técnicos copiados para novo cadastro mockado."
                        : undefined
                    }
                  />
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card titulo="Estoque" className="flex h-full flex-col">
              <div className="flex min-h-[220px] flex-1 flex-col justify-between px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Kpi
                    label={["Estoque", "Mínimo"]}
                    value="120 kg"
                    tone="attention"
                  />
                  <Kpi
                    label={["Saldo", "Atual"]}
                    value="340 kg"
                    tone="normal"
                  />
                  <Kpi
                    label={["Entrada", "Prevista"]}
                    value="500 kg"
                    tone="incoming"
                  />
                  <Kpi
                    label={["Previsão", "Entrada"]}
                    value="18/07"
                    tone="normal"
                  />
                </div>

                <div className="flex items-center justify-center pt-1">
                  <button
                    type="button"
                    className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
                  >
                    Ver Movimentações
                  </button>
                </div>
              </div>
            </Card>

            <Card titulo="Última Compra" className="flex h-full flex-col">
              <div className="flex min-h-[220px] flex-1 flex-col justify-between px-4 py-4">
                <div className="space-y-4">
                  <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                    <DashboardInfo label="Fornecedor" value="Metalúrgica ABC" />
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        Classificação
                      </p>
                      <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-lg font-bold text-emerald-700">
                        🟢 A
                      </span>
                    </div>
                    <DashboardInfo label="NF" value="85478" />
                    <DashboardInfo label="Data" value="04/07/2026" />
                  </div>

                  <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                    <DashboardInfo label="Valor Unitário" value="R$ 18,40" />
                    <DashboardInfo label="Unidade" value="kg" />
                  </div>
                </div>

                <div className="flex items-center justify-center pt-1">
                  <button
                    type="button"
                    className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
                  >
                    Ver Histórico de Compras
                  </button>
                </div>
              </div>
            </Card>

            <Card
              titulo="Última Movimentação"
              className="flex h-full flex-col lg:col-span-2"
            >
              <div className="space-y-4 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MovementInfo label="Tipo" value="Saída" tone="outgoing" />
                  <MovementInfo label="Origem" value="OF-2547" />
                  <MovementInfo label="Quantidade" value="25 kg" />
                  <MovementInfo label="Data" value="04/07/2026" />
                </div>

                <div className="flex items-center justify-center pt-1">
                  <button
                    type="button"
                    className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
                  >
                    Ver Todas as Movimentações
                  </button>
                </div>
              </div>
            </Card>
          </div>

          <Card titulo="Observações">
            <div className="px-4 py-4">
              <TextareaField
                label="Observações"
                rows={5}
                placeholder="Digite aqui observações importantes sobre esta matéria-prima..."
                defaultValue={
                  duplicando
                    ? "Cadastro originado por duplicação mockada. Informe um novo código antes de salvar."
                    : undefined
                }
              />
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}

function Card({
  titulo,
  children,
  className = "",
}: {
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-md border border-slate-200 bg-white transition hover:border-blue-700 ${className}`}
    >
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-950">{titulo}</h2>
      </div>

      {children}
    </div>
  );
}

function Field({
  label,
  defaultValue,
  placeholder,
}: {
  label: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <input
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function SelectField({
  label,
  options,
  defaultValue,
}: {
  label: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <select
        defaultValue={defaultValue ?? ""}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      >
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: [string, string];
  value: string;
  tone: "normal" | "attention" | "incoming";
}) {
  const valueColor = {
    normal: "text-blue-700",
    attention: "text-orange-600",
    incoming: "text-emerald-600",
  }[tone];

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-center">
      <p className="flex min-h-8 flex-col justify-center text-xs font-medium leading-4 text-slate-500">
        <span>{label[0]}</span>
        <span>{label[1]}</span>
      </p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}

function DashboardInfo({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "incoming" | "outgoing";
}) {
  const valueColor = {
    default: "text-slate-900",
    incoming: "text-emerald-600",
    outgoing: "text-red-600",
  }[tone];

  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}

function MovementInfo({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "incoming" | "outgoing" | "manual" | "inventory" | "transfer";
}) {
  const badgeColor = {
    incoming: "bg-emerald-50 text-emerald-700",
    outgoing: "bg-red-50 text-red-700",
    manual: "bg-slate-100 text-slate-700",
    inventory: "bg-blue-50 text-blue-700",
    transfer: "bg-orange-50 text-orange-700",
  }[tone ?? "manual"];

  return (
    <div className="text-center">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {tone ? (
        <span
          className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xl font-bold ${badgeColor}`}
        >
          {value}
        </span>
      ) : (
        <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
      )}
    </div>
  );
}

function TextareaField({
  label,
  rows,
  placeholder,
  defaultValue,
}: {
  label: string;
  rows: number;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <textarea
        rows={rows}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}
