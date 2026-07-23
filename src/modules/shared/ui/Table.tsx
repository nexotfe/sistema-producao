import type { ReactNode } from "react";

export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["overflow-x-auto rounded-xl border border-border", className]
        .filter(Boolean)
        .join(" ")}
    >
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="bg-border-subtle">{children}</tr>
    </thead>
  );
}

export function TableHeaderCell({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-[11px] text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-secondary">
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={["transition hover:bg-border-subtle", className].filter(Boolean).join(" ")}>
      {children}
    </tr>
  );
}

export function TableCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={["border-t border-border-subtle px-4 py-3 text-text-primary", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </td>
  );
}
