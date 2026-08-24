import Link from "next/link";
import { Badge } from "@/modules/shared/ui/Badge";
import { buttonClassName } from "@/modules/shared/ui/Button";
import type { Acao } from "../types";

export function AcaoRow({ acao }: { acao: Acao }) {
  if (acao.futuro || !acao.href) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-border-subtle px-3 py-2.5">
        <span className="text-sm text-text-secondary">{acao.label}</span>
        <Badge variant="neutral">Em desenvolvimento</Badge>
      </div>
    );
  }

  if (acao.tipo === "criar") {
    return (
      <Link href={acao.href} className={buttonClassName("secondary")}>
        {"+ " + acao.label}
      </Link>
    );
  }

  return (
    <Link
      href={acao.href}
      className="flex min-h-11 items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-text-primary outline-none transition hover:bg-border-subtle focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      <span>{acao.label}</span>
      <span aria-hidden="true" className="ml-3 text-base font-semibold leading-none text-text-disabled">
        {"›"}
      </span>
    </Link>
  );
}
