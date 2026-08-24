"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { Button } from "@/modules/shared/ui/Button";

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
    <section className="rounded-md border border-border bg-surface p-4">
      <div className="mb-4 grid gap-2 text-xs font-semibold text-text-secondary sm:grid-cols-3">
        <div className="rounded-md border border-status-info-border bg-status-info-bg px-3 py-2 text-status-info-text">
          1. Decidir compra
        </div>
        <div
          className={`rounded-md border px-3 py-2 ${
            decisionConfirmed
              ? "border-status-info-border bg-status-info-bg text-status-info-text"
              : "border-border bg-border-subtle"
          }`}
        >
          2. Gerar pedido
        </div>
        <div
          className={`rounded-md border px-3 py-2 ${
            orderGenerated
              ? "border-status-info-border bg-status-info-bg text-status-info-text"
              : "border-border bg-border-subtle"
          }`}
        >
          3. Pedido rascunho
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_1fr_1fr]">
        <div>
          <label
            htmlFor="planning-mode"
            className="mb-1 block text-xs font-semibold uppercase text-text-secondary"
          >
            Modo
          </label>
          <select
            id="planning-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm font-semibold text-text-primary outline-none transition focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
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
            className="mb-1 block text-xs font-semibold uppercase text-text-secondary"
          >
            Comprar
          </label>
          <input
            id="purchase-decision"
            defaultValue="1 barra 6.000 mm"
            placeholder="Informe o que sera comprado"
            className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm font-semibold text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-text-secondary">
            Sobra prevista
          </label>
          <input
            value="2.300 mm"
            readOnly
            className="h-10 w-full rounded-md border border-border bg-border-subtle px-3 text-sm font-semibold text-text-disabled"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-text-secondary">
            Status
          </label>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setDecisionConfirmed(true);
              setOrderGenerated(false);
            }}
          >
            {decisionConfirmed ? "Compra confirmada" : "Confirmar compra"}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {orderGenerated ? (
          <Link
            href={`/compras/pedidos/${orderNumber}`}
            className="text-sm font-semibold text-action-primary hover:underline"
          >
            Abrir {orderNumber}
          </Link>
        ) : null}

        <Button disabled={!decisionConfirmed} onClick={() => setOrderGenerated(true)}>
          Gerar pedido
        </Button>
      </div>

      {isPartial ? (
        <div className="mt-4 rounded-md border border-status-warning-border bg-status-warning-bg p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-bold text-status-warning-text">
              OFs incluidas neste agrupamento
            </h2>
            <span className="text-xs font-semibold text-status-warning-text">
              {includedCount} selecionada(s)
            </span>
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {partialOrigins.map((origin) => (
              <label
                key={origin.of}
                className="flex items-start gap-2 rounded-md border border-status-warning-border bg-surface-elevated p-3 text-sm"
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
                  className="mt-1 h-4 w-4 rounded border-border"
                />
                <span>
                  <span className="block font-bold text-text-primary">
                    <EntityLink
                      type="of"
                      id={origin.of}
                      className="font-bold text-text-primary transition hover:text-text-secondary"
                    >
                      {origin.of}
                    </EntityLink>
                  </span>
                  <span className="block text-xs text-text-secondary">
                    Projeto{" "}
                    <EntityLink
                      type="projeto"
                      id={origin.project}
                      className="font-semibold text-action-primary transition hover:text-action-primary-hover"
                    >
                      {origin.project}
                    </EntityLink>{" "}
                    - {origin.need}
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
