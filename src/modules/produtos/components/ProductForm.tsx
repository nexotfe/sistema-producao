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

export function ProductForm({ initialValues, mode }: ProductFormProps) {
  const usarPadraoProjeto = mode === "new";
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
      <Card titulo="Identificação" usarPadraoProjeto={usarPadraoProjeto}>
        <div className="grid gap-4 px-4 py-4 md:grid-cols-3">
          <Field
            label="Código"
            value={values.code}
            onChange={(value) => updateValue("code", value)}
            usarPadraoProjeto={usarPadraoProjeto}
          />
          <Field
            label="Descrição"
            value={values.description}
            onChange={(value) => updateValue("description", value)}
            usarPadraoProjeto={usarPadraoProjeto}
          />
          <Field
            label="Quantidade"
            value={String(values.quantity)}
            onChange={() => undefined}
            readOnly
            usarPadraoProjeto={usarPadraoProjeto}
          />
          <SelectField
            label="Status"
            value={values.active ? "Ativo" : "Inativo"}
            onChange={(value) => updateValue("active", value === "Ativo")}
            options={["Ativo", "Inativo"]}
            usarPadraoProjeto={usarPadraoProjeto}
          />
        </div>
      </Card>

      <Card titulo="Engenharia" usarPadraoProjeto={usarPadraoProjeto}>
        <div className="grid gap-4 px-4 py-4 md:grid-cols-3">
          <Field
            label="Roteiro Atual"
            value={values.currentRouting || "Sem roteiro"}
            onChange={() => undefined}
            readOnly
            usarPadraoProjeto={usarPadraoProjeto}
          />
          <div className="flex items-end">
            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 md:w-auto"
            >
              Criar Roteiro
            </button>
          </div>
        </div>
      </Card>

      <Card titulo="Observações" usarPadraoProjeto={usarPadraoProjeto}>
        <div className="px-4 py-4">
          <textarea
            rows={4}
            value={values.notes}
            onChange={(event) => updateValue("notes", event.target.value)}
            className={
              usarPadraoProjeto
                ? "w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                : "w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
            }
          />
        </div>
      </Card>

      <div className="space-y-2">
        {codeValidationMessage && (
          <p className="text-sm font-medium text-red-600">
            Código já existe. Use outro código.
          </p>
        )}
        {descriptionValidationMessage && (
          <p className="text-sm font-medium text-red-600">
            Descrição já existe. Use outra descrição.
          </p>
        )}
      </div>

    </section>
  );
}

function Card({
  titulo,
  children,
  usarPadraoProjeto,
}: {
  titulo: string;
  children: React.ReactNode;
  usarPadraoProjeto: boolean;
}) {
  return (
    <div
      className={
        usarPadraoProjeto
          ? "rounded-md border border-slate-200 bg-white transition hover:border-blue-700"
          : "rounded-md border border-slate-200 bg-white transition-colors hover:border-blue-700"
      }
    >
      <div
        className={
          usarPadraoProjeto
            ? "border-b border-slate-100 px-4 py-3"
            : "border-b border-slate-200 px-4 py-3"
        }
      >
        <h2 className="text-sm font-bold text-slate-950">{titulo}</h2>
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
  usarPadraoProjeto,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  usarPadraoProjeto: boolean;
}) {
  return (
    <div>
      <label
        className={
          usarPadraoProjeto
            ? "mb-1.5 block text-xs font-semibold text-slate-600"
            : "mb-2 block text-sm font-medium text-slate-700"
        }
      >
        {label}
      </label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={
          usarPadraoProjeto
            ? "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            : "h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
        }
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
  usarPadraoProjeto,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  usarPadraoProjeto: boolean;
}) {
  return (
    <div>
      <label
        className={
          usarPadraoProjeto
            ? "mb-1.5 block text-xs font-semibold text-slate-600"
            : "mb-2 block text-sm font-medium text-slate-700"
        }
      >
        {label}
      </label>

      <input
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className={
          usarPadraoProjeto
            ? "h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition read-only:bg-slate-50 read-only:text-slate-700 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            : "h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition read-only:bg-slate-50 read-only:text-slate-500 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
        }
      />
    </div>
  );
}
