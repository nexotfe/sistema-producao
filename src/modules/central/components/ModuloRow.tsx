import { Badge } from "@/modules/shared/ui/Badge";
import { Icon } from "../icons";
import type { Modulo } from "../types";

export function ModuloRow({ modulo, onSelecionar }: { modulo: Modulo; onSelecionar: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className="flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2.5 text-left outline-none transition hover:bg-border-subtle focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-border-subtle text-text-secondary">
        <Icon name={modulo.icon} size={18} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{modulo.titulo}</span>
          {modulo.futuro ? <Badge variant="neutral">Em desenvolvimento</Badge> : null}
        </span>
      </span>

      <span aria-hidden="true" className="text-base font-semibold leading-none text-text-disabled">
        {"›"}
      </span>
    </button>
  );
}
