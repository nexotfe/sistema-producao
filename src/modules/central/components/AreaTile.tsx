import { Badge } from "@/modules/shared/ui/Badge";
import { Icon } from "../icons";
import type { Area } from "../types";

export function AreaTile({ area, onSelecionar }: { area: Area; onSelecionar: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      className="flex flex-col items-start gap-3 overflow-hidden rounded-xl border border-border bg-surface px-6 py-6 text-left transition hover:border-action-primary hover:bg-border-subtle focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus-ring"
    >
      <div className="flex w-full items-start justify-between">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-border bg-border-subtle text-text-primary">
          <Icon name={area.icon} size={22} />
        </span>
        {area.futuro ? <Badge variant="neutral">Em desenvolvimento</Badge> : null}
      </div>

      <div>
        <h3 className="text-[15px] font-semibold text-text-primary">{area.titulo}</h3>
        <p className="mt-1 text-[13px] leading-5 text-text-secondary">{area.descricao}</p>
      </div>
    </button>
  );
}
