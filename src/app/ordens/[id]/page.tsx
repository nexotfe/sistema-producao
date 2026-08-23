import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { supabase, isSupabaseConfigured } from "../../../lib/supabaseClient";

type OFPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type OFDetailRow = {
  materia_prima_codigo: string | null;
  materia_prima_descricao: string | null;
  componente_tipo: string | null;
  bom_quantidade: number | null;
  bom_unidade: string | null;
  estoque_saldo_livre: number | null;
  quantidade_consumo_interno: number | null;
  quantidade_compra_externa: number | null;
  status_fluxo: string | null;
};

type OFFlowData = {
  of_id: string;
  numero_of: string;
  produto_pn: string | null;
  produto_descricao: string | null;
  bom_versao: string | null;
  total_demanda_bom: number | null;
  total_estoque_livre: number | null;
  total_consumo_interno: number | null;
  total_compra_externa: number | null;
  status_fluxo: string | null;
  status_operacional: string | null;
  tipo: string | null;
  quantidade_planejada: number | null;
  quantidade_produzida: number | null;
  unidade: string | null;
  data_inicio_planejada: string | null;
  data_conclusao_planejada: string | null;
};

async function getOFOperationalData(ofId: string) {
  if (!isSupabaseConfigured) {
    return null;
  }

  const [ofRes, flowRes, detailsRes] = await Promise.all([
    supabase
      .from("ordens_fabricacao")
      .select(
        "id,numero_of,projeto_id,produto_id,bom_id,status,tipo,quantidade_planejada,quantidade_produzida,unidade,data_inicio_planejada,data_conclusao_planejada"
      )
      .eq("id", ofId)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("vw_of_fluxo_operacional")
      .select(
        "of_id,numero_of,produto_pn,produto_descricao,bom_versao,total_demanda_bom,total_estoque_livre,total_consumo_interno,total_compra_externa,status_fluxo"
      )
      .eq("of_id", ofId)
      .single(),
    supabase
      .from("vw_of_consumo_detalhado")
      .select(
        "materia_prima_codigo,materia_prima_descricao,componente_tipo,bom_quantidade,bom_unidade,estoque_saldo_livre,quantidade_consumo_interno,quantidade_compra_externa,status_fluxo"
      )
      .eq("of_id", ofId),
  ]);

  const error = ofRes.error ?? flowRes.error ?? detailsRes.error;
  if (error && error.code !== "PGRST116") {
    return { error: error.message };
  }

  const ofData = ofRes.data;
  const flowData = flowRes.data as OFFlowData | null;
  const detailRows = detailsRes.data as OFDetailRow[] | null;

  return {
    ofData,
    flowData,
    detailRows,
  };
}

function renderStatusBadge(status: string | null | undefined) {
  const definedStatus = status ?? "desconhecido";
  const badgeStyles = {
    planejada: "bg-status-info-bg text-status-info-text",
    em_producao: "bg-status-warning-bg text-status-warning-text",
    concluida: "bg-status-success-bg text-status-success-text",
    suspensa: "bg-status-danger-bg text-status-danger-text",
    cancelada: "bg-border-subtle text-text-secondary",
    ci_parcial_compra_parcial: "bg-purple-100 text-purple-700",
    ci_total: "bg-teal-100 text-teal-700",
    compra_total: "bg-orange-100 text-orange-700",
    desconhecido: "bg-border-subtle text-text-secondary",
  } as Record<string, string>;

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeStyles[definedStatus] ?? badgeStyles.desconhecido}`}>
      {definedStatus.replace(/_/g, " ")}
    </span>
  );
}

function formatNumber(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

export default async function OFOperationalPage({ params }: OFPageProps) {
  const { id } = await params;
  const data = await getOFOperationalData(id);

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-status-warning-border bg-status-warning-bg p-6 text-sm text-status-warning-text">
          Supabase não está configurado. Defina as variáveis de ambiente e tente novamente.
        </div>
      </main>
    );
  }

  if (!data || "error" in data) {
    return (
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-status-danger-border bg-status-danger-bg p-6 text-sm text-status-danger-text">
          Falha ao carregar os dados da OF. {data?.error ?? ""}
        </div>
      </main>
    );
  }

  const { ofData, flowData, detailRows } = data;
  const progresso = ofData?.quantidade_planejada
    ? Math.min(
        100,
        Math.round(((ofData.quantidade_produzida ?? 0) / ofData.quantidade_planejada) * 100)
      )
    : 0;

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <ModuleBackLink href="/central" label="Dashboard" />
            <h1 className="mt-4 text-3xl font-bold text-text-primary">OF {ofData?.numero_of ?? id}</h1>
            <p className="mt-2 text-sm text-text-secondary">Tela operacional da ordem de fabricação.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {renderStatusBadge(ofData?.status)}
            {renderStatusBadge(flowData?.status_fluxo)}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">Produção</p>
                <p className="mt-2 text-sm text-text-primary">{ofData?.tipo ?? "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">Progresso</p>
                <p className="mt-2 text-lg font-semibold text-text-primary">{progresso}%</p>
              </div>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-action-primary transition-all duration-300"
                style={{ width: `${progresso}%` }}
              />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border-subtle bg-border-subtle p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">Quantidade planejada</p>
                <p className="mt-2 text-lg font-semibold text-text-primary">{formatNumber(ofData?.quantidade_planejada)}</p>
                <p className="text-xs text-text-secondary">{ofData?.unidade ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-border-subtle p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">Quantidade produzida</p>
                <p className="mt-2 text-lg font-semibold text-text-primary">{formatNumber(ofData?.quantidade_produzida)}</p>
                <p className="text-xs text-text-secondary">{ofData?.unidade ?? "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
            <div className="grid gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">Dados da OF</p>
                <dl className="mt-3 grid gap-2 text-sm text-text-primary">
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-text-secondary">Projeto</dt>
                    <dd>
                      {ofData?.projeto_id ? (
                        <EntityLink type="projeto" id={ofData.projeto_id}>
                          {ofData.projeto_id}
                        </EntityLink>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-text-secondary">BOM</dt>
                    <dd>{flowData?.bom_versao ?? "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-text-secondary">Produto</dt>
                    <dd>
                      {flowData?.produto_pn ? (
                        <EntityLink type="item" id={flowData.produto_pn}>
                          {flowData.produto_pn}
                        </EntityLink>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-text-secondary">Versão BOM</dt>
                    <dd>{flowData?.bom_versao ?? "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-text-secondary">Início planejado</dt>
                    <dd>{formatDate(ofData?.data_inicio_planejada)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-text-secondary">Conclusão prevista</dt>
                    <dd>{formatDate(ofData?.data_conclusao_planejada)}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-border-subtle p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">Resumo operacional</p>
                <div className="mt-3 grid gap-3 text-sm text-text-primary">
                  <div className="flex items-center justify-between">
                    <span>Total demanda BOM</span>
                    <strong>{formatNumber(flowData?.total_demanda_bom)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Estoque livre</span>
                    <strong>{formatNumber(flowData?.total_estoque_livre)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Consumo interno</span>
                    <strong>{formatNumber(flowData?.total_consumo_interno)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Compra externa</span>
                    <strong>{formatNumber(flowData?.total_compra_externa)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Materiais da OF</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Lista de componentes do BOM com estoque, consumo e necessidade de compra.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border-subtle bg-border-subtle text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-3 py-3 font-semibold">Material</th>
                  <th className="px-3 py-3 font-semibold">Tipo</th>
                  <th className="px-3 py-3 font-semibold">Qtd BOM</th>
                  <th className="px-3 py-3 font-semibold">Estoque livre</th>
                  <th className="px-3 py-3 font-semibold">Consumo interno</th>
                  <th className="px-3 py-3 font-semibold">Compra externa</th>
                  <th className="px-3 py-3 font-semibold">Status fluxo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {detailRows && detailRows.length > 0 ? (
                  detailRows.map((row, index) => (
                    <tr key={`${row.materia_prima_codigo ?? index}-${index}`} className="hover:bg-border-subtle">
                      <td className="px-3 py-3 font-medium text-text-primary">
                        {row.materia_prima_descricao ?? row.componente_tipo ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-text-primary">{row.componente_tipo ?? "—"}</td>
                      <td className="px-3 py-3 text-text-primary">
                        {formatNumber(row.bom_quantidade)} {row.bom_unidade ?? ""}
                      </td>
                      <td className="px-3 py-3 text-text-primary">{formatNumber(row.estoque_saldo_livre)}</td>
                      <td className="px-3 py-3 text-text-primary">{formatNumber(row.quantidade_consumo_interno)}</td>
                      <td className="px-3 py-3 text-text-primary">{formatNumber(row.quantidade_compra_externa)}</td>
                      <td className="px-3 py-3">{renderStatusBadge(row.status_fluxo)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-text-secondary">
                      Nenhum material encontrado para esta OF.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
