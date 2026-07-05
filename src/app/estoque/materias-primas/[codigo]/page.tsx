"use client";

import Link from "next/link";
import { use } from "react";

type Props = {
  params: Promise<{
    codigo: string;
  }>;
};

export default function CadastroMateriaPrimaPage({ params }: Props) {
  const { codigo } = use(params);

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
                  Cadastro da matéria-prima
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
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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
          <Card titulo="Identificação">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Código" defaultValue={codigo} />
              <SelectField
                label="Status"
                options={["Ativo", "Inativo"]}
                defaultValue="Ativo"
              />
              <Field
                label="Descrição"
                defaultValue="SAE 1045 redondo"
                className="md:col-span-2"
              />
              <Field label="Família" defaultValue="Aço carbono" />
              <SelectField
                label="Unidade"
                options={["kg", "metro", "barra", "chapa", "peça", "litro"]}
                defaultValue="metro"
              />
              <Field label="Bitola" defaultValue="50 mm" />
              <Field label="Dimensão" defaultValue="Ø 50 x 3000 mm" />
              <Field label="NCM" defaultValue="7228.30.00" />
              <Field
                label="Endereço"
                defaultValue="ALM01-R5-E3/P6/4"
              />
            </div>
          </Card>

          <Card titulo="Informações Técnicas">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Fabricante" defaultValue="Fornecedor técnico" />
              <Field label="Marca" defaultValue="Linha industrial" />
              <Field
                label="Material / Especificação"
                defaultValue="Aço SAE 1045"
              />
              <Field label="Norma" defaultValue="ASTM A576" />
              <Field label="Peso Específico" defaultValue="7,85 g/cm³" />
              <div className="md:col-span-2">
                <TextareaField
                  label="Observações Técnicas"
                  rows={4}
                  defaultValue="Dados mockados para validação visual do cadastro."
                />
              </div>
            </div>
          </Card>

          <Card titulo="Estoque">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <ReadOnlyField label="Saldo Atual" value="18.000" />
              <ReadOnlyField label="Reservado" value="10.000" />
              <ReadOnlyField label="Disponível" value="8.000" />
              <ReadOnlyField label="Endereço" value="ALM01-R5-E3/P6/4" />
              <ReadOnlyField label="Última Movimentação" value="03/07/2026" />
              <div className="flex items-end">
                {/*
                  TODO: abrir a página completa de movimentações da matéria-prima
                  selecionada. As transações de estoque ficarão exclusivamente
                  nessa página: entrada por compra, entrada por devolução, saída
                  para ordem de fabricação, ajustes, inventário e transferências.
                */}
                <button
                  type="button"
                  className="h-11 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
                >
                  Ver Movimentações
                </button>
              </div>
            </div>
          </Card>

          <Card titulo="Fornecedores">
            <div className="border-b border-slate-100 px-6 py-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  className="h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
                >
                  Adicionar Fornecedor
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <tr>
                    <th className="px-6 py-3">Fornecedor</th>
                    <th className="px-4 py-3">Código do Fornecedor</th>
                    <th className="px-4 py-3">Moeda</th>
                    <th className="px-4 py-3">Preferencial</th>
                  </tr>
                </thead>
              </table>
            </div>

            <div className="px-6 py-8 text-center text-sm text-slate-500">
              Nenhum fornecedor cadastrado para esta matéria-prima.
            </div>
          </Card>

          <Card titulo="Observações">
            <div className="px-6 py-6">
              {/*
                TODO: em sprints futuros, este cadastro poderá ser relacionado a
                fornecedores, histórico de compras, histórico de consumo e card
                de estoque, sem transformar esta página em tela de movimentação.
              */}
              <TextareaField
                label="Observações"
                rows={7}
                defaultValue="Informações adicionais sobre a matéria-prima."
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
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white transition hover:border-blue-700">
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
  className = "",
}: {
  label: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <input
        defaultValue={defaultValue}
        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>

      <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800">
        {value}
      </div>
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

function TextareaField({
  label,
  rows,
  defaultValue,
}: {
  label: string;
  rows: number;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <textarea
        rows={rows}
        defaultValue={defaultValue}
        className="w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}
