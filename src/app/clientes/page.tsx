"use client";

import { useState } from "react";

import { ClientesHeader } from "@/modules/clientes/components/ClientesHeader";
import { ClientesTable } from "@/modules/clientes/components/ClientesTable";
import { NovoClienteModal } from "@/modules/clientes/components/NovoClienteModal";
import { useClientes } from "@/modules/clientes/hooks/useClientes";

export default function ClientesPage() {
  const [modalOpen, setModalOpen] = useState(false);

const {
  clientes,

  busca,
  setBusca,

  filtroStatus,
  setFiltroStatus,

  filtroCidade,
  setFiltroCidade,

  cidades,

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

  filtroStatus={filtroStatus}
  setFiltroStatus={setFiltroStatus}

  filtroCidade={filtroCidade}
  setFiltroCidade={setFiltroCidade}

  cidades={cidades}

  onNovoCliente={() => {}}
/>
        
        <ClientesTable
          clientes={clientes}
          loading={loading}
          erro={erro}
          busca={busca}
        />
        
        <NovoClienteModal
  open={modalOpen}
  onClose={() => setModalOpen(false)}
/>
      </div>
    </main>
  );
}