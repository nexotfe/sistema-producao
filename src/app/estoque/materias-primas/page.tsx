"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

const materials = [
  {
    code: "MP-001",
    description: "SAE 1045 redondo",
    dimension: "Ø 50 x 3000 mm",
    gauge: "50 mm",
    family: "Aço carbono",
    unit: "metro",
    quantity: "18.000",
    address: "ALM01-R5-E3/P6/4",
    status: "Ativo",
  },
  {
    code: "MP-002",
    description: "Chapa aço carbono 12mm",
    dimension: "1200 x 3000 mm",
    gauge: "12 mm",
    family: "Chapas",
    unit: "chapa",
    quantity: "12",
    address: "ALM01-R2-E1/P1/2",
    status: "Ativo",
  },
  {
    code: "MP-003",
    description: "Alumínio 7075 bloco",
    dimension: "200 x 150 x 80 mm",
    gauge: "80 mm",
    family: "Alumínio",
    unit: "peça",
    quantity: "6",
    address: "ALM02-R1-E4/P2/1",
    status: "Ativo",
  },
  {
    code: "MP-004",
    description: "Barra inox 304",
    dimension: "Ø 25 x 6000 mm",
    gauge: "25 mm",
    family: "Inox",
    unit: "barra",
    quantity: "9",
    address: "ALM01-R4-E2/P5/3",
    status: "Inativo",
  },
];

const statusStyles = {
  Ativo: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Inativo: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

export default function RawMaterialsPage() {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const [statusPorCodigo, setStatusPorCodigo] = useState<Record<string, string>>(
    {},
  );

  function inativarMaterial(codigo: string) {
    /*
      Registros mestres nunca devem ser excluídos fisicamente.
      A inativação preserva rastreabilidade industrial para compras, estoque,
      consumo, projetos, ordens de fabricação e relatórios.
    */
    setStatusPorCodigo((atual) => ({
      ...atual,
      [codigo]: "Inativo",
    }));
    setMenuAberto(null);
  }

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
            <div>
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
          </div>

          <div className="overflow-x-auto">
            {/*
              Estrutura preparada para futura configuração de colunas por setor:
              colunas visíveis, colunas ocultas e ordem das colunas.
              Exemplos futuros: metalurgia pode priorizar Bitola e Dimensão;
              química pode priorizar Concentração e Pureza; alimentos podem
              priorizar Lote e Validade.
            */}
            <table className="w-full min-w-[1260px] table-fixed text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="w-[9%] px-4 py-3">Código</th>
                  <th className="w-[22%] px-4 py-3">Descrição</th>
                  <th className="w-[9%] px-4 py-3">Bitola</th>
                  <th className="w-[13%] px-4 py-3">Dimensão</th>
                  <th className="w-[13%] px-4 py-3">Família</th>
                  <th className="w-[9%] px-4 py-3">Unidade</th>
                  <th className="w-[10%] px-4 py-3">Quantidade</th>
                  <th className="w-[15%] px-4 py-3">Endereço</th>
                  <th className="w-[10%] px-4 py-3">Status</th>
                  <th className="w-[5%] px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materials.map((material) => {
                  const statusAtual =
                    statusPorCodigo[material.code] ?? material.status;

                  return (
                  <tr key={material.code} className="transition hover:bg-slate-50">
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      {material.code}
                    </td>
                    <td className="truncate px-4 py-4 text-slate-700">
                      {material.description}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {material.gauge}
                    </td>
                    <td className="truncate px-4 py-4 text-slate-700">
                      {material.dimension}
                    </td>
                    <td className="truncate px-4 py-4 text-slate-700">
                      {material.family}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{material.unit}</td>
                    <td className="px-4 py-4 font-medium text-slate-950">
                      {material.quantity}
                    </td>
                    <td className="truncate px-4 py-4 font-medium text-slate-700">
                      {material.address}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                          statusStyles[
                            statusAtual as keyof typeof statusStyles
                          ]
                        }`}
                      >
                        {statusAtual}
                      </span>
                    </td>
                    <td className="relative px-4 py-4 text-right">
                      <button
                        type="button"
                        aria-label={`Abrir ações de ${material.description}`}
                        onClick={() =>
                          setMenuAberto((atual) =>
                            atual === material.code ? null : material.code,
                          )
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-lg font-semibold leading-none text-slate-600 transition hover:bg-slate-50"
                      >
                        {"\u22EE"}
                      </button>

                      {menuAberto === material.code ? (
                        <div className="absolute right-4 top-12 z-20 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-xl">
                        <Link
                          href={`/estoque/materias-primas/${material.code}`}
                          className="block px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          Editar
                        </Link>
                        {/*
                          TODO: duplicar futuramente copiando as informações
                          técnicas, exceto o identificador primário Código.
                        */}
                        <Link
                          href={`/estoque/materias-primas/novo?duplicar=${material.code}`}
                          className="block px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          Duplicar
                        </Link>
                        <button
                          type="button"
                          onClick={() => inativarMaterial(material.code)}
                          className="block w-full px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          Inativar
                        </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
