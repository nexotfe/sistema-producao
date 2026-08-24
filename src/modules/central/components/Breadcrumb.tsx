import type { Area, Modulo } from "../types";

export function Breadcrumb({
  area,
  modulo,
  onInicio,
  onArea,
}: {
  area: Area | null;
  modulo: Modulo | null;
  onInicio: () => void;
  onArea: () => void;
}) {
  return (
    <nav aria-label="Caminho de navegação" className="flex flex-wrap items-center gap-1.5 text-sm">
      <button
        type="button"
        onClick={onInicio}
        className="rounded px-1 py-0.5 text-text-secondary transition hover:text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        Início
      </button>

      {area ? (
        <>
          <span aria-hidden="true" className="text-text-disabled">
            {"›"}
          </span>
          <button
            type="button"
            onClick={onArea}
            disabled={!modulo}
            className="rounded px-1 py-0.5 text-text-secondary transition hover:text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-default disabled:font-semibold disabled:text-text-primary disabled:hover:no-underline"
          >
            {area.titulo}
          </button>
        </>
      ) : null}

      {modulo ? (
        <>
          <span aria-hidden="true" className="text-text-disabled">
            {"›"}
          </span>
          <span className="px-1 py-0.5 font-semibold text-text-primary">{modulo.titulo}</span>
        </>
      ) : null}
    </nav>
  );
}
