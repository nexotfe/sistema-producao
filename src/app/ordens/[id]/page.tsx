import Link from "next/link";
import { supabase, isSupabaseConfigured } from "../../../lib/supabaseClient";

type OFPageProps = {
  params: {
    id: string;
  };
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

function renderStatusBadge(status: string | null) {
  const definedStatus = status ?? "desconhecido";
  const badgeStyles = {
    planejada: "bg-blue-100 text-blue-700",
    em_producao: "bg-amber-100 text-amber-700",
    concluida: "bg-emerald-100 text-emerald-700",
    suspensa: "bg-rose-100 text-rose-700",
    cancelada: "bg-slate-100 text-slate-700",
    ci_parcial_compra_parcial: "bg-purple-100 text-purple-700",
    ci_total: "bg-teal-100 text-teal-700",
    compra_total: "bg-orange-100 text-orange-700",
    desconhecido: "bg-slate-100 text-slate-700",
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
  const { id } = params;
  const data = await getOFOperationalData(id);

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Supabase não está configurado. Defina as variáveis de ambiente e tente novamente.
        </div>
      </main>
    );
  }

  if (!data || "error" in data) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
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
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/central" className="text-sm font-medium text-slate-700 hover:text-slate-900">
              ← Voltar ao dashboard
            </Link>
            <h1 className="mt-4 text-3xl font-bold text-slate-950">OF {ofData?.numero_of ?? id}</h1>
            <p className="mt-2 text-sm text-slate-500">Tela operacional da ordem de fabricação.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {renderStatusBadge(ofData?.status)}
            {renderStatusBadge(flowData?.status_fluxo)}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Produção</p>
                <p className="mt-2 text-sm text-slate-700">{ofData?.tipo ?? "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Progresso</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{progresso}%</p>
              </div>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progresso}%` }}
              />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Quantidade planejada</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{formatNumber(ofData?.quantidade_planejada)}</p>
                <p className="text-xs text-slate-500">{ofData?.unidade ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Quantidade produzida</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{formatNumber(ofData?.quantidade_produzida)}</p>
                <p className="text-xs text-slate-500">{ofData?.unidade ?? "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Dados da OF</p>
                <dl className="mt-3 grid gap-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-slate-600">BOM</dt>
                    <dd>{flowData?.bom_versao ?? "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-slate-600">Produto</dt>
                    <dd>{flowData?.produto_pn ?? "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-slate-600">Versão BOM</dt>
                    <dd>{flowData?.bom_versao ?? "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-slate-600">Início planejado</dt>
                    <dd>{formatDate(ofData?.data_inicio_planejada)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-slate-600">Conclusão prevista</dt>
                    <dd>{formatDate(ofData?.data_conclusao_planejada)}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Resumo operacional</p>
                <div className="mt-3 grid gap-3 text-sm text-slate-700">
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

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Materiais da OF</h2>
              <p className="mt-2 text-sm text-slate-500">
                Lista de componentes do BOM com estoque, consumo e necessidade de compra.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
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
              <tbody className="divide-y divide-slate-100">
                {detailRows && detailRows.length > 0 ? (
                  detailRows.map((row, index) => (
                    <tr key={`${row.materia_prima_codigo ?? index}-${index}`} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {row.materia_prima_descricao ?? row.componente_tipo ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{row.componente_tipo ?? "—"}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatNumber(row.bom_quantidade)} {row.bom_unidade ?? ""}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{formatNumber(row.estoque_saldo_livre)}</td>
                      <td className="px-3 py-3 text-slate-700">{formatNumber(row.quantidade_consumo_interno)}</td>
                      <td className="px-3 py-3 text-slate-700">{formatNumber(row.quantidade_compra_externa)}</td>
                      <td className="px-3 py-3">{renderStatusBadge(row.status_fluxo)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
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
