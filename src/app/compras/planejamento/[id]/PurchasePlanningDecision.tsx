"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const partialOrigins = [
  {
    of: "260125-0001",
    project: "260125",
    need: "200 mm",
    checked: true,
  },
  {
    of: "260126-0002",
    project: "260126",
    need: "2.500 mm",
    checked: true,
  },
  {
    of: "260127-0001",
    project: "260127",
    need: "1.000 mm",
    checked: false,
  },
];

type PurchasePlanningDecisionProps = {
  planningNumber: string;
};

export function PurchasePlanningDecision({
  planningNumber,
}: PurchasePlanningDecisionProps) {
  const [mode, setMode] = useState("somar_todas");
  const [decisionConfirmed, setDecisionConfirmed] = useState(false);
  const [orderGenerated, setOrderGenerated] = useState(false);
  const [included, setIncluded] = useState(
    partialOrigins.reduce<Record<string, boolean>>((acc, origin) => {
      acc[origin.of] = origin.checked;
      return acc;
    }, {}),
  );

  const isPartial = mode === "agrupamento_parcial";
  const includedCount = useMemo(
    () => Object.values(included).filter(Boolean).length,
    [included],
  );
  const orderNumber = planningNumber.replace("PC-", "PED-");

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <div className="mb-4 grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-3">
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800">
          1. Decidir compra
        </div>
        <div
          className={`rounded-md border px-3 py-2 ${
            decisionConfirmed
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          2. Gerar pedido
        </div>
        <div
          className={`rounded-md border px-3 py-2 ${
            orderGenerated
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "border-slate-200 bg-slate-50"
          }`}
        >
          3. Pedido rascunho
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_1fr_1fr]">
        <div>
          <label
            htmlFor="planning-mode"
            className="mb-1 block text-xs font-semibold uppercase text-slate-500"
          >
            Modo
          </label>
          <select
            id="planning-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          >
            <option value="manual">Manual</option>
            <option value="somar_todas">Somar todas</option>
            <option value="por_of">Por OF</option>
            <option value="agrupamento_parcial">Agrupamento parcial</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="purchase-decision"
            className="mb-1 block text-xs font-semibold uppercase text-slate-500"
          >
            Comprar
          </label>
          <input
            id="purchase-decision"
            defaultValue="1 barra 6.000 mm"
            placeholder="Informe o que sera comprado"
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
            Sobra prevista
          </label>
          <input
            value="2.300 mm"
            readOnly
            className="h-10 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-950"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
            Status
          </label>
          <button
            onClick={() => {
              setDecisionConfirmed(true);
              setOrderGenerated(false);
            }}
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {decisionConfirmed ? "Compra confirmada" : "Confirmar compra"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {orderGenerated ? (
          <Link
            href={`/compras/pedidos/${orderNumber}`}
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            Abrir {orderNumber}
          </Link>
        ) : null}

        <button
          disabled={!decisionConfirmed}
          onClick={() => setOrderGenerated(true)}
          className="h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
        >
          Gerar pedido
        </button>
      </div>

      {isPartial ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-bold text-amber-900">
              OFs incluidas neste agrupamento
            </h2>
            <span className="text-xs font-semibold text-amber-800">
              {includedCount} selecionada(s)
            </span>
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {partialOrigins.map((origin) => (
              <label
                key={origin.of}
                className="flex items-start gap-2 rounded-md border border-amber-200 bg-white p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={included[origin.of]}
                  onChange={(event) =>
                    setIncluded((current) => ({
                      ...current,
                      [origin.of]: event.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  <span className="block font-bold text-slate-950">
                    {origin.of}
                  </span>
                  <span className="block text-xs text-slate-600">
                    Projeto {origin.project} - {origin.need}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
