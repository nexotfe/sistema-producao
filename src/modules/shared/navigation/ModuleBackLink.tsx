import Link from "next/link";

type ModuleBackLinkProps = {
  href: string;
  label: string;
};

export function ModuleBackLink({ href, label }: ModuleBackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 rounded-sm text-sm font-semibold uppercase text-slate-500 outline-none transition hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
    >
      <span aria-hidden="true" className="text-sm font-semibold leading-none">
        {"\u2039"}
      </span>
      <span className="leading-none">{label}</span>
    </Link>
  );
}
