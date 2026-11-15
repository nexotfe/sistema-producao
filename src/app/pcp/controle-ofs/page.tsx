"use client";

// NEXOTFE — Controle de OFs (PCP), rota oficial. Integração do
// protótipo aprovado (/design/pcp-controle-of-preview) ao sistema real,
// usando as Server Actions já existentes e em produção
// (consultarOfsPcpAction/buscarOfsPcp, Etapa 46).
//
// OBS (migration 20261110090000, validada em sandbox e aplicada em
// produção): lembrete real, persistido em ordens_fabricacao.
// observacao_pcp, editável só enquanto a OF estiver no grupo visual
// "Aguardando" e só por quem tem pcp.editar_observacao_of. A escrita
// passa exclusivamente por atualizarObservacaoPcpOfAction/
// atualizar_observacao_pcp_of (RPC) - nunca um UPDATE direto. A
// permissão também é checada aqui só para decidir o que mostrar -
// quem decide de verdade, sempre, é a RPC no servidor.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ModuleBackButton } from "@/modules/shared/navigation/ModuleBackButton";
import { Select } from "@/modules/shared/ui/Select";
import { Badge, type BadgeVariant } from "@/modules/shared/ui/Badge";
import { Button } from "@/modules/shared/ui/Button";
import { EmptyState } from "@/modules/shared/ui/EmptyState";
import { Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from "@/modules/shared/ui/Table";
import { consultarOfsPcpAction, type ResultadoConsultaOfsPcp } from "@/modules/pcp/actions/consultarOfsPcpAction";
import { consultarPermissaoObservacaoPcpOfAction } from "@/modules/pcp/actions/consultarPermissaoObservacaoPcpOfAction";
import { atualizarObservacaoPcpOfAction, type MotivoRejeicaoObservacaoPcpOf } from "@/modules/pcp/actions/atualizarObservacaoPcpOfAction";
import { ROTULOS_STATUS_SIMPLIFICADO, rotuloSimplificadoOf, detalheTecnicoStatusOf, type RotuloStatusSimplificado } from "@/modules/pcp/lib/buscarOfsPcp";

const LIMITE_OBSERVACAO_PCP = 120;

const MENSAGEM_ERRO_OBSERVACAO: Record<MotivoRejeicaoObservacaoPcpOf, string> = {
  sem_permissao: "Você não tem permissão para editar esta observação.",
  situacao_nao_permitida: "Esta OF não está mais aguardando liberação — recarregue a lista.",
  of_nao_encontrada: "OF não encontrada.",
  empresa_invalida: "Falha de autorização.",
  erro_desconhecido: "Não foi possível salvar agora. Tente novamente.",
};

function mensagemErroSalvarObservacao(
  motivo: "nao_autenticado" | "texto_muito_longo" | "gravacao_incerta" | MotivoRejeicaoObservacaoPcpOf,
): string {
  if (motivo === "nao_autenticado") return "Sessão não autenticada — recarregue a página.";
  if (motivo === "texto_muito_longo") return `Texto muito longo (máx. ${LIMITE_OBSERVACAO_PCP} caracteres).`;
  if (motivo === "gravacao_incerta") return "Não foi possível confirmar a gravação — recarregue a lista antes de tentar de novo.";
  return MENSAGEM_ERRO_OBSERVACAO[motivo];
}

function CelulaObservacaoPcp({
  ofId,
  numeroOf,
  valorInicial,
  editavel,
}: {
  ofId: string;
  numeroOf: string;
  valorInicial: string | null;
  editavel: boolean;
}) {
  const [texto, setTexto] = useState(valorInicial ?? "");
  // Último valor confirmado pelo servidor - a comparação para decidir
  // se grava é sempre contra ESTE valor, nunca contra o `valorInicial`
  // da primeira renderização (senão uma 2ª saída do campo sem nova
  // alteração gravaria de novo).
  const [ultimoConfirmado, setUltimoConfirmado] = useState(valorInicial ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const salvandoRef = useRef(false);

  if (!editavel) {
    return <span className="text-text-secondary">{valorInicial || "—"}</span>;
  }

  async function salvarSeAlterado() {
    // Guarda simples contra chamada concorrente para a MESMA OF (ex.:
    // Enter dispara blur, que dispara este mesmo handler de novo).
    if (salvandoRef.current || texto === ultimoConfirmado) return;
    salvandoRef.current = true;
    setErro(null);
    const resultado = await atualizarObservacaoPcpOfAction(ofId, texto);
    salvandoRef.current = false;
    if (!resultado.ok) {
      setSalvo(false);
      setErro(mensagemErroSalvarObservacao(resultado.motivo));
      return;
    }
    setUltimoConfirmado(texto);
    setSalvo(true);
  }

  return (
    <div className="flex min-w-[200px] flex-col gap-1">
      <input
        type="text"
        value={texto}
        maxLength={LIMITE_OBSERVACAO_PCP}
        onChange={(e) => {
          setTexto(e.target.value);
          setSalvo(false);
          setErro(null);
        }}
        onBlur={salvarSeAlterado}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        aria-label={`Observação do PCP para a OF ${numeroOf}`}
        className="h-8 w-full rounded-[8px] border border-border bg-surface-elevated px-2.5 text-[12.5px] text-text-primary outline-none transition focus-visible:border-action-primary focus-visible:ring-[3px] focus-visible:ring-focus-ring"
      />
      {erro ? <span className="text-[11px] font-semibold text-status-danger-text">{erro}</span> : null}
      {salvo && !erro ? <span className="text-[11px] text-text-disabled">Salvo</span> : null}
    </div>
  );
}

const TAMANHO_PAGINA = 20;

const VARIANTE_SITUACAO: Record<RotuloStatusSimplificado, BadgeVariant> = {
  Aguardando: "warning",
  Liberada: "success",
  "Em produção": "neutral",
  Concluída: "success",
  Cancelada: "danger",
  Desdobrada: "neutral",
};

const OPCOES_SITUACAO = [
  { value: "", label: "Todas as OFs" },
  ...ROTULOS_STATUS_SIMPLIFICADO.map((rotulo) => ({ value: rotulo, label: rotulo })),
];

export default function ControleOfsPcpPage() {
  const [situacaoFiltro, setSituacaoFiltro] = useState<RotuloStatusSimplificado | "">("");
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [resultado, setResultado] = useState<ResultadoConsultaOfsPcp | null>(null);
  const [podeEditarObservacao, setPodeEditarObservacao] = useState(false);

  useEffect(() => {
    let cancelado = false;
    consultarPermissaoObservacaoPcpOfAction().then((resposta) => {
      if (!cancelado && resposta.ok) setPodeEditarObservacao(resposta.podeEditarObservacao);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    consultarOfsPcpAction(situacaoFiltro ? { statusSimplificado: [situacaoFiltro] } : {}, pagina, TAMANHO_PAGINA).then((resposta) => {
      if (!cancelado) {
        setResultado(resposta);
        setCarregando(false);
      }
    });
    return () => {
      cancelado = true;
    };
  }, [situacaoFiltro, pagina]);

  const totalPaginas =
    resultado?.ok && resultado.resultado.totalRegistros > 0 ? Math.ceil(resultado.resultado.totalRegistros / TAMANHO_PAGINA) : 0;

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <ModuleBackButton label="PCP" fallbackHref="/central" />
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface-elevated px-4 text-sm font-semibold text-text-primary transition hover:bg-border-subtle"
            >
              Início
            </Link>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-disabled">PCP</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">Controle de OFs</h1>
            </div>

            <div className="w-56">
              <Select
                label="Situação"
                value={situacaoFiltro}
                onChange={(e) => {
                  setCarregando(true);
                  setSituacaoFiltro(e.target.value as RotuloStatusSimplificado | "");
                  setPagina(1);
                }}
                options={OPCOES_SITUACAO}
              />
            </div>
          </div>
        </header>

        <Table>
          <TableHead>
            <TableHeaderCell>OF</TableHeaderCell>
            <TableHeaderCell>Projeto</TableHeaderCell>
            <TableHeaderCell>Situação</TableHeaderCell>
            <TableHeaderCell>OBS</TableHeaderCell>
          </TableHead>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell>
                  <span className="text-[12.5px] text-text-secondary">Carregando…</span>
                </TableCell>
                <TableCell>{""}</TableCell>
                <TableCell>{""}</TableCell>
                <TableCell>{""}</TableCell>
              </TableRow>
            ) : null}

            {!carregando && resultado && !resultado.ok ? (
              <TableRow>
                <TableCell>
                  <span className="text-[12.5px] text-status-danger-text">
                    {resultado.motivo === "filtro_invalido"
                      ? `Filtro inválido (${resultado.campo}).`
                      : resultado.motivo === "nao_autenticado"
                        ? "Sessão não autenticada."
                        : "Falha técnica ao consultar as OFs."}
                  </span>
                </TableCell>
                <TableCell>{""}</TableCell>
                <TableCell>{""}</TableCell>
                <TableCell>{""}</TableCell>
              </TableRow>
            ) : null}

            {!carregando && resultado?.ok
              ? resultado.resultado.linhas.map((linha) => {
                  const statusRotulo = rotuloSimplificadoOf(linha.estadoAprovacao, linha.estadoExecucao);
                  const statusDetalhe = detalheTecnicoStatusOf(linha.estadoAprovacao, linha.estadoExecucao);

                  return (
                    <TableRow key={linha.ofId}>
                      <TableCell>
                        <Link href={`/ordens/${linha.ofId}`} className="font-semibold text-action-primary hover:underline">
                          {linha.numeroOf}
                        </Link>
                      </TableCell>
                      <TableCell>{linha.numeroProjeto ?? "—"}</TableCell>
                      <TableCell>
                        {statusRotulo ? (
                          <span title={statusDetalhe}>
                            <Badge variant={VARIANTE_SITUACAO[statusRotulo]}>{statusRotulo}</Badge>
                          </span>
                        ) : (
                          <span title={statusDetalhe} className="text-text-secondary">
                            {linha.estadoAprovacao} / {linha.estadoExecucao}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {statusRotulo === "Aguardando" ? (
                          <CelulaObservacaoPcp
                            ofId={linha.ofId}
                            numeroOf={linha.numeroOf}
                            valorInicial={linha.observacaoPcp}
                            editavel={podeEditarObservacao}
                          />
                        ) : (
                          <span className="text-text-secondary">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              : null}
          </TableBody>
        </Table>

        {!carregando && resultado?.ok && resultado.resultado.linhas.length === 0 ? (
          <EmptyState
            title="Nenhuma OF encontrada"
            description={situacaoFiltro ? "Nenhuma OF corresponde a esta situação." : "Esta empresa ainda não tem nenhuma OF cadastrada."}
          />
        ) : null}

        {resultado?.ok && resultado.resultado.totalRegistros > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-text-secondary">
            <span>
              {resultado.resultado.totalRegistros} OF{resultado.resultado.totalRegistros === 1 ? "" : "s"} encontrada
              {resultado.resultado.totalRegistros === 1 ? "" : "s"} — página {pagina} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={pagina <= 1}
                onClick={() => {
                  setCarregando(true);
                  setPagina((p) => Math.max(1, p - 1));
                }}
              >
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={pagina >= totalPaginas}
                onClick={() => {
                  setCarregando(true);
                  setPagina((p) => p + 1);
                }}
              >
                Próxima
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
