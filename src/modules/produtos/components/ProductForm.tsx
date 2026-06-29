"use client";

import { useState } from "react";
import type { ProductFormValues } from "../types";

type ProductFormProps = {
  initialValues?: ProductFormValues;
  mode: "new" | "edit";
};

type ProductFormState = ProductFormValues & {
  currentRouting: string;
};

const emptyValues: ProductFormValues = {
  code: "",
  description: "",
  type: "Produto Acabado",
  unit: "un",
  active: true,
  notes: "",
  quantity: 0,
};

export function ProductForm({ initialValues }: ProductFormProps) {
  const [values, setValues] = useState<ProductFormState>({
    ...(initialValues ?? emptyValues),
    quantity: 0,
    currentRouting: "",
  });
  const [codeValidationMessage] = useState<string | null>(null);
  const [descriptionValidationMessage] = useState<string | null>(null);

  function updateValue<K extends keyof ProductFormState>(
    key: K,
    value: ProductFormState[K],
  ) {
    setValues((current) => ({
      ...current,
      [key]: value,
      quantity: 0,
    }));
  }

  return (
    <section className="flex flex-col gap-4">
      <Card titulo="Identificacao">
        <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
          <Field
            label="Codigo"
            value={values.code}
            onChange={(value) => updateValue("code", value)}
          />
          <Field
            label="Descricao"
            value={values.description}
            onChange={(value) => updateValue("description", value)}
          />
          <SelectField
            label="Tipo"
            value={values.type}
            onChange={(value) => updateValue("type", value)}
            options={["Produto Acabado", "Semiacabado"]}
          />
          <Field
            label="Unidade"
            value={values.unit}
            onChange={(value) => updateValue("unit", value)}
          />
        </div>
      </Card>

      <Card titulo="Controle">
        <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
          <Field
            label="Unidade"
            value={values.unit}
            onChange={(value) => updateValue("unit", value)}
          />
          <Field
            label="Quantidade"
            value={String(values.quantity)}
            onChange={() => undefined}
            readOnly
          />
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={values.active}
              onChange={(event) => updateValue("active", event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            Situacao
          </label>
        </div>
      </Card>

      <Card titulo="Engenharia">
        <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
          <Field
            label="Roteiro Atual"
            value={values.currentRouting || "Sem roteiro"}
            onChange={() => undefined}
            readOnly
          />
          <div className="flex items-end">
            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 md:w-auto"
            >
              Criar Roteiro
            </button>
          </div>
        </div>
      </Card>

      <Card titulo="Observacoes">
        <div className="px-5 py-4">
          <textarea
            rows={4}
            value={values.notes}
            onChange={(event) => updateValue("notes", event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
          />
        </div>
      </Card>

      <div className="space-y-2">
        {codeValidationMessage && (
          <p className="text-sm font-medium text-red-600">
            Codigo ja existe. Use outro codigo.
          </p>
        )}
        {descriptionValidationMessage && (
          <p className="text-sm font-medium text-red-600">
            Descricao ja existe. Use outra descricao.
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Salvar
        </button>
      </div>
    </section>
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
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
      </div>

      {children}
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
  options: string[];
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <input
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition read-only:bg-slate-50 read-only:text-slate-500 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
      />
    </div>
  );
}
