"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { Button } from "@/modules/shared/ui/Button";
import { Field } from "@/modules/shared/ui/Field";
import { LogoEmpresa } from "@/modules/empresa/components/LogoEmpresa";
import { useUsuarioEhAdmin } from "@/modules/empresa/hooks/useUsuarioEhAdmin";
import { useEditarIdentidadeEmpresa } from "@/modules/empresa/hooks/useEditarIdentidadeEmpresa";
import { enviarLogoEmpresa } from "@/modules/empresa/lib/enviarLogoEmpresa";
import { removerLogoEmpresa } from "@/modules/empresa/lib/removerLogoEmpresa";
import { BUCKET_LOGOS_EMPRESAS } from "@/modules/empresa/lib/logoEmpresaConfig";
import { supabase } from "@/lib/supabaseClient";

/**
 * Gate de admin: enquanto a permissão não é conhecida ("carregando"),
 * NUNCA renderiza o formulário nem o redirecionamento - só um estado
 * neutro. Só decide entre formulário e redirecionamento depois de saber
 * o resultado real (mesmo padrão de 3 estados terminais de
 * AuthGate.tsx: nunca um "meio-termo" onde o conteúdo protegido aparece
 * antes da decisão estar pronta).
 */
export default function EditarIdentidadeEmpresaPage() {
  const router = useRouter();
  const admin = useUsuarioEhAdmin();

  useEffect(() => {
    if (admin.status === "ok" && !admin.ehAdmin) {
      router.replace("/configuracoes/empresa");
    }
  }, [admin, router]);

  if (admin.status === "carregando") {
    return <EstadoNeutro mensagem="Verificando permissão..." />;
  }

  if (admin.status === "erro") {
    return <EstadoNeutro mensagem={admin.mensagem} erro />;
  }

  if (!admin.ehAdmin) {
    // Redirecionamento já disparado no efeito acima - este ramo nunca
    // renderiza o formulário, nem por um instante.
    return <EstadoNeutro mensagem="Redirecionando..." />;
  }

  return <FormularioIdentidadeEmpresa />;
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

function FormularioIdentidadeEmpresa() {
  const router = useRouter();
  const {
    estadoCarregamento,
    mensagemCarregamento,
    logoUrl: logoUrlInicial,
    nome,
    setNome,
    cnpj,
    setCnpj,
    inscricaoEstadual,
    setInscricaoEstadual,
    endereco,
    setEndereco,
    telefone,
    setTelefone,
    email,
    setEmail,
    site,
    setSite,
    salvando,
    erro,
    avisoSite,
    sucesso,
    salvar,
  } = useEditarIdentidadeEmpresa();

  // Logo é operação independente dos campos de identidade acima: falha
  // aqui nunca aparenta que os demais campos também falharam (e
  // vice-versa) - estado próprio, nunca compartilhado com
  // salvando/erro/avisoSite do formulário de identidade.
  const [logoUrl, setLogoUrl] = useState<string | null>(logoUrlInicial);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [removendoLogo, setRemovendoLogo] = useState(false);
  const [erroLogo, setErroLogo] = useState<string | null>(null);
  const [avisoLogo, setAvisoLogo] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  // Ajuste de estado durante o render (mesmo padrão já usado em
  // proposta-comercial/page.tsx para nomeVendedor/responsavelNome) - sem
  // useEffect: sincroniza logoUrl com o valor vindo do carregamento
  // assíncrono só na transição em que logoUrlInicial muda (chega do
  // fetch), nunca de novo depois - upload/remoção passam a governar
  // logoUrl sozinhos a partir daí.
  const [logoUrlInicialAnterior, setLogoUrlInicialAnterior] = useState(logoUrlInicial);
  if (logoUrlInicial !== logoUrlInicialAnterior) {
    setLogoUrlInicialAnterior(logoUrlInicial);
    setLogoUrl(logoUrlInicial);
  }

  async function handleEnviarLogo(arquivo: File) {
    setEnviandoLogo(true);
    setErroLogo(null);
    setAvisoLogo(null);

    const resultado = await enviarLogoEmpresa(supabase, arquivo);

    setEnviandoLogo(false);

    if (resultado.status === "ok") {
      const { data } = supabase.storage.from(BUCKET_LOGOS_EMPRESAS).getPublicUrl(resultado.logoPath);
      setLogoUrl(data.publicUrl);
      if (resultado.avisoArquivoOrfao) {
        setAvisoLogo(resultado.avisoArquivoOrfao);
      }
      return;
    }

    if (resultado.status === "arquivo_invalido") {
      setErroLogo(resultado.mensagem);
      return;
    }

    if (resultado.status === "sem_empresa") {
      setErroLogo("Nenhuma empresa vinculada ao seu usuário.");
      return;
    }

    setErroLogo(resultado.mensagem);
  }

  async function handleRemoverLogo() {
    setRemovendoLogo(true);
    setErroLogo(null);
    setAvisoLogo(null);

    const resultado = await removerLogoEmpresa(supabase);

    setRemovendoLogo(false);

    if (resultado.status === "ok") {
      setLogoUrl(null);
      if (resultado.avisoArquivoOrfao) {
        setAvisoLogo(resultado.avisoArquivoOrfao);
      }
      return;
    }

    if (resultado.status === "sem_logo") {
      setLogoUrl(null);
      return;
    }

    if (resultado.status === "sem_empresa") {
      setErroLogo("Nenhuma empresa vinculada ao seu usuário.");
      return;
    }

    setErroLogo(resultado.mensagem);
  }

  if (estadoCarregamento === "carregando") {
    return <EstadoNeutro mensagem="Carregando dados da empresa..." />;
  }

  if (estadoCarregamento === "sem_empresa") {
    return <EstadoNeutro mensagem="Nenhuma empresa vinculada ao seu usuário." />;
  }

  if (estadoCarregamento === "erro") {
    return <EstadoNeutro mensagem={mensagemCarregamento ?? "Erro ao carregar os dados da empresa."} erro />;
  }

  async function handleSalvar() {
    const ok = await salvar();
    if (ok) {
      router.push("/configuracoes/empresa");
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <ModuleBackLink href="/configuracoes/empresa" label="Configurações da empresa" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
              Editar dados da empresa
            </h1>
            <p className="mt-2 text-[13.5px] text-text-secondary">
              Identidade e logo usadas na Central e na Proposta Comercial.
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <Card titulo="Logo">
            <div className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center">
              <LogoEmpresa logoUrl={logoUrl} nomeEmpresa={nome || "Empresa"} size="md" />

              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={inputArquivoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const arquivo = event.target.files?.[0];
                    event.target.value = "";
                    if (arquivo) {
                      handleEnviarLogo(arquivo);
                    }
                  }}
                />

                <Button
                  variant="secondary"
                  disabled={enviandoLogo || removendoLogo}
                  onClick={() => inputArquivoRef.current?.click()}
                >
                  {enviandoLogo ? "Enviando..." : logoUrl ? "Trocar logo" : "Enviar logo"}
                </Button>

                {logoUrl ? (
                  <Button variant="danger" disabled={enviandoLogo || removendoLogo} onClick={handleRemoverLogo}>
                    {removendoLogo ? "Removendo..." : "Remover logo"}
                  </Button>
                ) : null}
              </div>
            </div>

            {erroLogo ? (
              <p className="px-6 pb-5 text-[13.5px] font-medium text-status-danger-text">{erroLogo}</p>
            ) : null}
            {avisoLogo ? (
              <p className="px-6 pb-5 text-[13.5px] font-medium text-status-warning-text">{avisoLogo}</p>
            ) : null}
          </Card>

          <Card titulo="Dados cadastrais">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Nome" value={nome} onChange={(event) => setNome(event.target.value)} />
              <Field label="CNPJ" value={cnpj} onChange={(event) => setCnpj(event.target.value)} />
              <Field
                label="Inscrição estadual"
                value={inscricaoEstadual}
                onChange={(event) => setInscricaoEstadual(event.target.value)}
              />
              <Field label="Endereço" value={endereco} onChange={(event) => setEndereco(event.target.value)} />
            </div>
          </Card>

          <Card titulo="Contato">
            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <Field label="Telefone" value={telefone} onChange={(event) => setTelefone(event.target.value)} />
              <Field label="E-mail" value={email} onChange={(event) => setEmail(event.target.value)} />
              <Field label="Site" value={site} onChange={(event) => setSite(event.target.value)} />
            </div>
          </Card>

          {erro ? <p className="text-[13.5px] font-medium text-status-danger-text">{erro}</p> : null}
          {avisoSite ? (
            <p className="text-[13.5px] font-medium text-status-warning-text">{avisoSite}</p>
          ) : null}
          {sucesso && !erro ? (
            <p className="text-[13.5px] font-medium text-status-success-text">Dados da empresa salvos.</p>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => router.push("/configuracoes/empresa")}>
              Cancelar
            </Button>

            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar dados da empresa"}
            </Button>
          </div>
        </section>
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
