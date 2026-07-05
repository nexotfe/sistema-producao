"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMateriasPrimas } from "@/modules/materias-primas/hooks/useMateriasPrimas";
import type { MateriaPrimaLista } from "@/modules/materias-primas/types";

const statusStyles = {
  Ativo: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Inativo: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

export default function RawMaterialsPage() {
  const router = useRouter();
  const {
    materiais,
    busca,
    setBusca,
    menuAberto,
    setMenuAberto,
    loading,
    erro,
    inativarMaterial,
  } = useMateriasPrimas();

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-lg border border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                LOGO
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                Matérias-Primas
              </h1>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label htmlFor="busca-materias-primas" className="sr-only">
                Buscar matérias-primas
              </label>
              <input
                id="busca-materias-primas"
                type="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por código, descrição, família ou endereço"
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 lg:w-[min(42vw,520px)]"
              />

              <span className="whitespace-nowrap text-sm font-medium text-slate-500">
                Nome do Usuário
              </span>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Voltar
                </button>
                <Link
                  href="/central"
                  className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Início
                </Link>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <Link
              href="/estoque/materias-primas/novo"
              className="inline-flex w-fit items-center rounded-sm text-base font-semibold text-slate-900 outline-none transition hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
            >
              Cadastro de Matérias-Primas
              <span
                aria-hidden="true"
                className="ml-2 text-base font-semibold leading-none"
              >
                {"\u203A"}
              </span>
            </Link>
            <p className="mt-2 text-sm text-slate-500">
              Lista de consulta para materiais cadastrados.
            </p>
          </div>

          <div>
            <table className="w-full table-auto text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Bitola</th>
                  <th className="px-4 py-3">Família</th>
                  <th className="px-4 py-3">Unidade</th>
                  <th className="px-4 py-3">Quantidade</th>
                  <th className="px-4 py-3">Endereço</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                      Carregando matérias-primas...
                    </td>
                  </tr>
                ) : erro ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-red-600" colSpan={9}>
                      {erro}
                    </td>
                  </tr>
                ) : materiais.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={9}>
                      Nenhuma matéria-prima encontrada.
                    </td>
                  </tr>
                ) : (
                  materiais.map((material) => (
                    <MaterialRow
                      key={material.id}
                      material={material}
                      menuAberto={menuAberto}
                      setMenuAberto={setMenuAberto}
                      inativarMaterial={inativarMaterial}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function MaterialRow({
  material,
  menuAberto,
  setMenuAberto,
  inativarMaterial,
}: {
  material: MateriaPrimaLista;
  menuAberto: string | null;
  setMenuAberto: (value: string | null) => void;
  inativarMaterial: (id: string) => void;
}) {
  const statusAtual = material.ativo ? "Ativo" : "Inativo";
  const codigo = material.codigo ?? material.id;
  const codigoUrl = encodeURIComponent(codigo);

  return (
    <tr className="transition hover:bg-slate-50">
      <td className="px-4 py-4 font-semibold text-slate-950">{codigo}</td>
      <td className="truncate px-4 py-4 text-slate-700">{material.descricao}</td>
      <td className="px-4 py-4 text-slate-700">{material.bitola || "—"}</td>
      <td className="truncate px-4 py-4 text-slate-700">
        {material.familia || "—"}
      </td>
      <td className="px-4 py-4 text-slate-700">{material.unidade}</td>
      <td className="px-4 py-4 font-medium text-slate-950">
        {formatarQuantidade(material.quantidade)}
      </td>
      <td className="truncate px-4 py-4 font-medium text-slate-700">
        {material.endereco || "—"}
      </td>
      <td className="px-4 py-4">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
            statusStyles[statusAtual]
          }`}
        >
          {statusAtual}
        </span>
      </td>
      <td className="relative px-4 py-4 text-right">
        <button
          type="button"
          aria-label={`Abrir ações de ${material.descricao}`}
          onClick={() =>
            setMenuAberto(menuAberto === material.id ? null : material.id)
          }
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-lg font-semibold leading-none text-slate-600 transition hover:bg-slate-50"
        >
          {"\u22EE"}
        </button>

        {menuAberto === material.id ? (
          <div className="absolute right-4 top-12 z-20 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-xl">
            <Link
              href={`/estoque/materias-primas/${codigoUrl}`}
              className="block px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Editar
            </Link>
            <Link
              href={`/estoque/materias-primas/novo?duplicar=${codigoUrl}`}
              className="block px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Duplicar
            </Link>
            <button
              type="button"
              onClick={() => inativarMaterial(material.id)}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Inativar
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function formatarQuantidade(value: number) {
  return value.toLocaleString("pt-BR");
}
