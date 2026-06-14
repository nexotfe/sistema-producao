"use client";

import { useState } from "react";

import { ClientesHeader } from "@/modules/clientes/components/ClientesHeader";
import { ClientesTable } from "@/modules/clientes/components/ClientesTable";
import { NovoClienteModal } from "@/modules/clientes/components/NovoClienteModal";
import { useClientes } from "@/modules/clientes/hooks/useClientes";

export default function ClientesPage() {
  const [modalOpen, setModalOpen] = useState(false);

  const [colunasVisiveis, setColunasVisiveis] = useState({
    nomeFantasia: true,
    razaoSocial: true,
    cnpj: true,
    cidade: true,
    status: true,
  });

 const {
  clientes,
  busca,
  setBusca,
  situacao,
  setSituacao,
  totais,
  loading,
  erro,
  usuario,
} = useClientes();

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-5 py-6 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <ClientesHeader
  usuario={usuario}
  busca={busca}
  setBusca={setBusca}
  situacao={situacao}
  setSituacao={setSituacao}
  totais={totais}
  colunasVisiveis={colunasVisiveis}
  setColunasVisiveis={setColunasVisiveis}
  onNovoCliente={() => setModalOpen(true)}
/>

        <ClientesTable
          clientes={clientes}
          loading={loading}
          erro={erro}
          busca={busca}
          colunasVisiveis={colunasVisiveis}
        />

        <NovoClienteModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      </div>
    </main>
  );
}