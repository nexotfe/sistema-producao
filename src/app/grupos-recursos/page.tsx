"use client";

import { GruposRecursosHeader } from "@/modules/grupos-recursos/components/GruposRecursosHeader";
import { GruposRecursosTable } from "@/modules/grupos-recursos/components/GruposRecursosTable";
import { useGruposRecursos } from "@/modules/grupos-recursos/hooks/useGruposRecursos";

const colunasVisiveis = {
  codigo: true,
  nome: true,
  unidade: true,
  status: true,
};

export default function GruposRecursosPage() {
  const {
    grupos,
    busca,
    setBusca,
    situacao,
    setSituacao,
    totais,
    loading,
    erro,
    usuario,
    alternarAtivoGrupo,
    excluirGrupo,
  } = useGruposRecursos();

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <GruposRecursosHeader
          usuario={usuario}
          busca={busca}
          setBusca={setBusca}
          situacao={situacao}
          setSituacao={setSituacao}
          totais={totais}
        />

        <GruposRecursosTable
          grupos={grupos}
          loading={loading}
          erro={erro}
          busca={busca}
          colunasVisiveis={colunasVisiveis}
          alternarAtivoGrupo={alternarAtivoGrupo}
          excluirGrupo={excluirGrupo}
        />
      </div>
    </main>
  );
}
