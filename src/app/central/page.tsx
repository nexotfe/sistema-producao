"use client";

// Central — navegação Área → Módulo → Ação. A URL (?area=&modulo=) é a
// única fonte de verdade do nível atual — sem estado local próprio que
// possa divergir dela. Cada seleção empilha uma entrada de histórico
// (router.push), então Voltar/Avançar do navegador funcionam como
// navegação normal; atualizar a página relê os mesmos parâmetros e
// reconstrói o mesmo nível. Parâmetro que não corresponde a nenhuma
// área/módulo conhecido é tratado como inválido e volta para a tela
// inicial (nunca renderiza um nível quebrado).
//
// Ver histórico de aprovação visual em /design/central-preview (mockup,
// removido após esta implementação ser aprovada).
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ModuleHeader } from "@/modules/shared/ui/ModuleHeader";
import { ThemeToggle } from "@/modules/shared/ui/ThemeToggle";
import { Card } from "@/modules/shared/ui/Card";
import { Badge } from "@/modules/shared/ui/Badge";
import { AreaTile } from "@/modules/central/components/AreaTile";
import { ModuloRow } from "@/modules/central/components/ModuloRow";
import { AcaoRow } from "@/modules/central/components/AcaoRow";
import { Breadcrumb } from "@/modules/central/components/Breadcrumb";
import { areas } from "@/modules/central/data";
import { useCabecalhoTemporal } from "@/modules/central/hooks/useCabecalhoTemporal";

function construirUrl(areaId: string | null, moduloId: string | null): string {
  if (!areaId) {
    return "/central";
  }

  const params = new URLSearchParams();
  params.set("area", areaId);
  if (moduloId) {
    params.set("modulo", moduloId);
  }

  return `/central?${params.toString()}`;
}

function CentralNavegacao() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const areaParam = searchParams.get("area");
  const moduloParam = searchParams.get("modulo");

  const areaEncontrada = areaParam ? (areas.find((area) => area.id === areaParam) ?? null) : null;
  const moduloEncontrado =
    areaEncontrada && moduloParam
      ? (areaEncontrada.modulos.find((modulo) => modulo.id === moduloParam) ?? null)
      : null;

  // Área presente na URL mas desconhecida, ou módulo presente mas que
  // não pertence à área válida: parâmetro inválido, volta com
  // segurança para a tela inicial (nunca meio-caminho).
  const parametroInvalido =
    (areaParam !== null && areaEncontrada === null) ||
    (areaEncontrada !== null && moduloParam !== null && moduloEncontrado === null);

  // Navegação (efeito colateral) nunca acontece durante o render — só
  // depois de pintar a tela segura, aqui dentro de um efeito.
  useEffect(() => {
    if (parametroInvalido) {
      router.replace("/central");
    }
  }, [parametroInvalido, router]);

  const areaAtual = parametroInvalido ? null : areaEncontrada;
  const moduloAtual = parametroInvalido ? null : moduloEncontrado;

  function selecionarArea(areaId: string) {
    router.push(construirUrl(areaId, null));
  }

  function selecionarModulo(moduloId: string) {
    if (!areaAtual) {
      return;
    }
    router.push(construirUrl(areaAtual.id, moduloId));
  }

  function irParaInicio() {
    router.push("/central");
  }

  function irParaArea() {
    if (!areaAtual) {
      return;
    }
    router.push(construirUrl(areaAtual.id, null));
  }

  const criacoes = moduloAtual?.acoes.filter((acao) => acao.tipo === "criar" && !acao.futuro) ?? [];
  const consultas =
    moduloAtual?.acoes.filter((acao) => acao.tipo === "consultar" && !acao.futuro) ?? [];
  const futuras = moduloAtual?.acoes.filter((acao) => acao.futuro) ?? [];

  return (
    <>
      {areaAtual ? (
        <Breadcrumb area={areaAtual} modulo={moduloAtual} onInicio={irParaInicio} onArea={irParaArea} />
      ) : null}

      <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
        {!areaAtual ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {areas.map((area) => (
              <AreaTile key={area.id} area={area} onSelecionar={() => selecionarArea(area.id)} />
            ))}
          </section>
        ) : !moduloAtual ? (
          <Card title={areaAtual.titulo}>
            <div className="flex flex-col gap-1">
              {areaAtual.modulos.map((modulo) => (
                <ModuloRow
                  key={modulo.id}
                  modulo={modulo}
                  onSelecionar={() => selecionarModulo(modulo.id)}
                />
              ))}
            </div>

            {areaAtual.notaFinal ? (
              <p className="mt-3 border-t border-border-subtle pt-3 text-[13px] text-text-disabled">
                {areaAtual.notaFinal}
              </p>
            ) : null}
          </Card>
        ) : (
          <Card title={moduloAtual.titulo}>
            <div className="flex flex-col gap-4">
              {consultas.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {consultas.map((acao) => (
                    <AcaoRow key={acao.label} acao={acao} />
                  ))}
                </div>
              ) : null}

              {criacoes.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4">
                  {criacoes.map((acao) => (
                    <AcaoRow key={acao.label} acao={acao} />
                  ))}
                </div>
              ) : null}

              {futuras.length > 0 ? (
                <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-4">
                  {futuras.map((acao) => (
                    <AcaoRow key={acao.label} acao={acao} />
                  ))}
                </div>
              ) : null}

              {moduloAtual.acoes.length === 0 ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-border-subtle px-3 py-3">
                  <span className="text-sm text-text-secondary">
                    Área reservada para funcionalidade futura.
                  </span>
                  <Badge variant="neutral">Em desenvolvimento</Badge>
                </div>
              ) : null}

              {moduloAtual.nota ? <p className="text-[13px] text-text-disabled">{moduloAtual.nota}</p> : null}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function CentralNavegacaoFallback() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <p className="px-3 py-3 text-sm text-text-secondary">Carregando…</p>
    </div>
  );
}

export default function CentralPage() {
  const { saudacao, dataExtenso } = useCabecalhoTemporal();

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <ModuleHeader
          themeToggle={<ThemeToggle />}
          title={
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary">{saudacao}</h1>
          }
          subtitle={dataExtenso}
        >
          <p className="mt-1 text-sm italic text-text-secondary">
            Da oportunidade à entrega, cada decisão constrói o resultado.
          </p>
        </ModuleHeader>

        <Suspense fallback={<CentralNavegacaoFallback />}>
          <CentralNavegacao />
        </Suspense>
      </div>
    </main>
  );
}
