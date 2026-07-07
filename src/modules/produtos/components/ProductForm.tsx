"use client";

import Link from "next/link";
import { useState } from "react";
import { RevisaoModal } from "./RevisaoModal";
import type { ProductFormValues, ProductRevision } from "../types";

type ProductFormProps = {
  initialValues?: ProductFormValues;
  mode: "new" | "edit";
};

const unidadesProduto = ["un", "kg", "metro", "conjunto", "peça"];

const emptyValues: ProductFormValues = {
  code: "",
  description: "",
  ncm: "",
  unit: "un",
  active: true,
  notes: "",
  revisions: [],
  roteiroVigente: "",
};

export function ProductForm({ initialValues }: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(
    initialValues ?? emptyValues,
  );
  const [modalRevisaoAberto, setModalRevisaoAberto] = useState(false);

  function updateValue<K extends keyof ProductFormValues>(
    key: K,
    value: ProductFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function adicionarRevisao(revisao: ProductRevision) {
    setValues((current) => ({
      ...current,
      revisions: [...current.revisions, revisao],
    }));
  }

  return (
    <section className="flex flex-col gap-5">
      <Card titulo="Identificação">
        <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
          <Field
            label="Descrição"
            value={values.description}
            onChange={(value) => updateValue("description", value)}
          />
          <Field
            label="Código"
            value={values.code}
            onChange={(value) => updateValue("code", value)}
          />
          <SelectField
            label="UN"
            value={values.unit}
            onChange={(value) => updateValue("unit", value)}
            options={unidadesProduto}
          />
          <ReadOnlyField label="Valor de Venda" value="Aguardando roteiro" />
          <Field
            label="NCM"
            value={values.ncm}
            onChange={(value) => updateValue("ncm", value)}
          />
          <SelectField
            label="Status"
            value={values.active ? "Ativo" : "Inativo"}
            onChange={(value) => updateValue("active", value === "Ativo")}
            options={["Ativo", "Inativo"]}
          />
        </div>
      </Card>

      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <ReadOnlyField
            label="Roteiro Vigente"
            value={values.roteiroVigente || "Nenhum roteiro vinculado"}
          />
        </div>

        <Link
          href={
            values.roteiroVigente
              ? `/roteiros/${values.code || values.roteiroVigente}`
              : `/roteiros/novo${
                  values.code ? `?pn=${encodeURIComponent(values.code)}` : ""
                }`
          }
          className="inline-flex h-10 items-center justify-center rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
        >
          {values.roteiroVigente ? "Abrir Roteiro" : "Criar Roteiro"}
        </Link>
      </div>

      <Card titulo="Revisões">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setModalRevisaoAberto(true)}
              className="h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              Adicionar Revisão
            </button>
          </div>
        </div>
        <RevisoesTable revisoes={values.revisions} />
      </Card>

      <Card titulo="Observações">
        <div className="px-4 py-4">
          <TextareaField
            label="Observações"
            rows={5}
            value={values.notes}
            onChange={(value) => updateValue("notes", value)}
          />
        </div>
      </Card>

      <RevisaoModal
        open={modalRevisaoAberto}
        onClose={() => setModalRevisaoAberto(false)}
        onAdd={adicionarRevisao}
      />
    </section>
  );
}

function RevisoesTable({ revisoes }: { revisoes: ProductRevision[] }) {
  if (revisoes.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-500">
        Nenhuma revisão cadastrada
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          <tr>
            <th className="px-4 py-3">Revisão</th>
            <th className="px-4 py-3">Situação</th>
            <th className="px-4 py-3">Roteiro Vinculado</th>
            <th className="px-4 py-3">Custo Calculado</th>
            <th className="px-4 py-3">Desenho Técnico</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {revisoes.map((revisao) => (
            <tr key={revisao.id} className="transition hover:bg-slate-50">
              <td className="px-4 py-3 font-semibold text-slate-900">
                {revisao.codigoRevisao}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                    revisao.situacao === "vigente"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {revisao.situacao === "vigente" ? "Vigente" : "Anterior"}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-700">
                {revisao.roteiroVinculado}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {revisao.custoCalculado > 0
                  ? revisao.custoCalculado.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })
                  : "Aguardando roteiro"}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {revisao.anexoDesenho ?? "Sem anexo"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>

      <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500">
        {value}
      </div>
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
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
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

function TextareaField({
  label,
  rows,
  value,
  onChange,
}: {
  label: string;
  rows: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>

      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}
