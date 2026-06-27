import Link from "next/link";

type ProductsHeaderProps = {
  search: string;
  setSearch: (value: string) => void;
};

export function ProductsHeader({ search, setSearch }: ProductsHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Engineering
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Products
          </h1>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          type="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by code, description, customer or type"
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70 lg:max-w-xl"
        />

        <div className="flex w-full flex-wrap items-center justify-start gap-2 lg:justify-end">
          <Link
            href="/produtos/novo"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            New
          </Link>
        </div>
      </div>
    </header>
  );
}
