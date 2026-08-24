"use client";

import Link from "next/link";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { buttonClassName } from "@/modules/shared/ui/Button";
import { LogoEmpresa } from "@/modules/empresa/components/LogoEmpresa";
import { useIdentidadeEmpresaAtual } from "@/modules/empresa/hooks/useIdentidadeEmpresaAtual";
import { useUsuarioEhAdmin } from "@/modules/empresa/hooks/useUsuarioEhAdmin";

export default function ConfiguracoesEmpresaPage() {
  const identidade = useIdentidadeEmpresaAtual();
  const admin = useUsuarioEhAdmin();

  if (identidade.status === "carregando") {
    return <EstadoNeutro mensagem="Carregando dados da empresa..." />;
  }

  if (identidade.status === "sem_empresa") {
    return <EstadoNeutro mensagem="Nenhuma empresa vinculada ao seu usuário." />;
  }

  if (identidade.status === "erro") {
    return <EstadoNeutro mensagem={identidade.mensagem} erro />;
  }

  const dados = identidade.identidade;
  const podeEditar = admin.status === "ok" && admin.ehAdmin;

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ModuleBackLink href="/central" label="Central" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <LogoEmpresa logoUrl={dados.logoUrl} nomeEmpresa={dados.nome} size="md" />
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
                  {dados.nome}
                </h1>
                <p className="mt-2 text-[13.5px] text-text-secondary">
                  Identidade e logo usadas na Central e na Proposta Comercial.
                </p>
              </div>
            </div>

            {podeEditar ? (
              <Link href="/configuracoes/empresa/editar" className={buttonClassName("primary")}>
                Editar
              </Link>
            ) : null}
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Dados cadastrais">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="CNPJ" value={dados.cnpj} />
              <Info label="Inscrição estadual" value={dados.inscricaoEstadual} />
              <Info label="Endereço" value={dados.endereco} />
            </div>
          </Card>

          <Card titulo="Contato">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Telefone" value={dados.telefone} />
              <Info label="E-mail" value={dados.email} />
              <Info label="Site" value={dados.site} />
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}

function EstadoNeutro({ mensagem, erro = false }: { mensagem: string; erro?: boolean }) {
  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <p
          className={
            erro
              ? "text-[13.5px] font-medium text-status-danger-text"
              : "text-[13.5px] text-text-secondary"
          }
        >
          {mensagem}
        </p>
      </div>
    </main>
  );
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface">
      <div className="border-b border-border-subtle px-6 py-5">
        <h2 className="text-[15px] font-semibold text-text-primary">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text-disabled">
        {label}
      </p>
      <p className="mt-2 text-[13.5px] font-medium leading-6 text-text-primary">
        {value || "Não informado"}
      </p>
    </div>
  );
}
