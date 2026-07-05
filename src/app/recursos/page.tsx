"use client";

import { RecursosHeader } from "@/modules/recursos/components/RecursosHeader";
import { RecursosTable } from "@/modules/recursos/components/RecursosTable";
import { useRecursos } from "@/modules/recursos/hooks/useRecursos";

const colunasVisiveis = {
  codigo: true,
  nome: true,
  grupo: true,
  valorHora: true,
  setor: false,
  capacidade: true,
  status: true,
};

export default function RecursosPage() {
  const {
    recursos,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
    usuario,
  } = useRecursos();

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <RecursosHeader
          usuario={usuario}
          busca={busca}
          setBusca={setBusca}
          situacao={situacao}
          setSituacao={setSituacao}
          totais={totais}
        />

        <RecursosTable
          recursos={recursos}
          loading={loading}
          erro={erro}
          busca={busca}
          colunasVisiveis={colunasVisiveis}
        />
      </div>
    </main>
  );
}
