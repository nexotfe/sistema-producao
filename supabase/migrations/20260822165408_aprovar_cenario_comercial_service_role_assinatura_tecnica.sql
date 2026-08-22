-- DEC-007 §6.2/Fase 8b (continuação) - invalidação automática de
-- cenário comercial aprovado quando a base técnica do projeto muda
-- depois da aprovação (achado do orçamento 260007: R$ 945,00 exibidos
-- como "Ajuste comercial" não eram ajuste real - custo_adicional_total
-- do cenário = 0 - e sim deriva entre o custoTecnicoAtual congelado no
-- snapshot e o custo já recalculado ao vivo pelo Roteiro, depois que a
-- migration 202608220001 parou de congelar custos de projeto não
-- aprovado). Decisão do usuário: um cenário aprovado vira
-- "desatualizado para uso corrente" (nunca apagado - histórico
-- preservado) sempre que a "base técnica" muda, através de uma
-- assinatura estrutural (hash SHA-256) calculada em TypeScript
-- (construirDocumentoAssinaturaTecnica.ts, reaproveita
-- carregarBaseCenarios.ts/carregarContextoCalendario.ts - nenhuma
-- reimplementação em SQL: "motor sem I/O, decisões resolvidas pelo
-- chamador").
--
-- CORREÇÃO DE SEGURANÇA (decisão explícita do usuário, corrigindo uma
-- proposta anterior baseada em current_user - current_user dentro de
-- uma função SECURITY DEFINER é sempre o DONO da função, não distingue
-- uma chamada legítima da Server Action de uma chamada direta de um
-- `authenticated` qualquer): esta migration também migra
-- aprovar_cenario_comercial de "chamável diretamente por authenticated"
-- (design original documentado em 202608180002, com
-- autorização/tenant resolvidos DENTRO da função via
-- usuario_e_admin()/empresa_atual_id()/auth.uid()) para
-- "service_role-only", recebendo p_empresa_id/p_aprovado_por como
-- parâmetros explícitos, validados pela Server Action ANTES de
-- instanciar o client privilegiado - mesmo padrão já usado por
-- aprovar_projeto_com_simulacao_v5 (202608030001) para
-- service_role-only + parâmetro explícito. Diferença deliberada da v5,
-- auditada nesta mesma migration (ver função abaixo): v5 NUNCA exigiu
-- admin (só usuário autenticado com empresa) - aprovar_cenario_comercial
-- SEMPRE exigiu admin (usuario_e_admin()) e continua exigindo, agora
-- validado pela Server Action antes da chamada (usuario_e_admin() seria
-- inútil aqui: sob service_role não há JWT, auth.uid()/empresa_atual_id()/
-- usuario_e_admin() resolveriam null/null/false).
--
-- Por que a assinatura é OPCIONAL na tabela (nullable) mas OBRIGATÓRIA
-- na RPC nova: cenários já aprovados antes desta migration (ex.:
-- 260007) não têm como ser assinados retroativamente sem reconstituir
-- a base técnica EXATA do momento da aprovação original (impossível -
-- o Roteiro já mudou) - ficam com assinatura_tecnica NULL para sempre
-- (nunca um backfill forjado, decisão do usuário). Toda aprovação NOVA,
-- pela RPC nova, é obrigada a gravar uma assinatura válida (64 hex).
--
-- =====================================================================
-- TRANSIÇÃO EM DUAS FASES (correção explícita do usuário, corrigindo o
-- desenho anterior desta mesma migration - que fazia DROP da função
-- antiga na mesma migration que criava a nova, abrindo uma janela
-- evitável em que "Aprovar cenário" ficaria quebrado entre a aplicação
-- da migration e o deploy do código novo):
--
--   FASE 1 (esta migration) - ADITIVA, sem indisponibilidade:
--     - adiciona assinatura_tecnica (nullable, sem backfill);
--     - cria aprovar_cenario_comercial_v2 (NOME NOVO, NUNCA substitui
--       aprovar_cenario_comercial) - service_role-only, parâmetros
--       explícitos;
--     - aprovar_cenario_comercial (RPC ANTIGA, 12 parâmetros) fica
--       INTOCADA - mesmo corpo, mesmo ACL (authenticated), continua
--       funcionando para quem ainda não migrou (código em produção,
--       até o deploy do código novo). As duas RPCs coexistem.
--     Sequência operacional: aplicar só esta migration -> testar o
--     código novo localmente contra o banco atualizado -> deploy do
--     código que chama exclusivamente aprovar_cenario_comercial_v2 ->
--     smoke test read-only em produção.
--
--   FASE 2 (migration FUTURA, separada, NÃO incluída aqui) - só depois
--     de confirmar que produção já chama exclusivamente
--     aprovar_cenario_comercial_v2 e que nenhum código (client/Server
--     Action) ainda referencia a assinatura antiga: revoga e remove
--     aprovar_cenario_comercial (12 parâmetros) definitivamente. Só
--     nesse momento a "janela de indisponibilidade" deixa de existir
--     como preocupação, porque ninguém mais depende da RPC antiga.
-- =====================================================================

-- =====================================================================
-- 1. Coluna nova - nullable, sem backfill (cenários legados permanecem
--    NULL). Formato validado só quando presente. Aditiva: não afeta a
--    RPC antiga (que não referencia esta coluna).
-- =====================================================================

alter table public.cenarios_comerciais_aprovados
  add column assinatura_tecnica text;

alter table public.cenarios_comerciais_aprovados
  add constraint cenarios_comerciais_aprovados_assinatura_tecnica_formato_chk
  check (assinatura_tecnica is null or assinatura_tecnica ~ '^[0-9a-f]{64}$');

comment on column public.cenarios_comerciais_aprovados.assinatura_tecnica is
  'Hash SHA-256 (hex, 64 chars) do DocumentoAssinaturaTecnica (construirDocumentoAssinaturaTecnica.ts) no momento da aprovação - usado para detectar, na leitura (useOrcamento.ts/useProposta.ts, fora desta migration), se a base técnica do projeto mudou depois da aprovação. NULL = cenário aprovado pela RPC antiga (aprovar_cenario_comercial, 12 parâmetros - ex.: 260007) - nunca backfillado (reconstituir a base técnica do momento original é impossível), tratado pelo lado de leitura como sempre desatualizado quando o projeto ainda não está com status=aprovado. Gravado só por aprovar_cenario_comercial_v2 - toda aprovação por ela grava um valor válido, nunca NULL.';

-- =====================================================================
-- 2. RPC NOVA (nome distinto, nunca substitui a antiga) -
--    service_role-only, p_empresa_id/p_aprovado_por/p_assinatura_tecnica
--    explícitos. Autorização (usuário existe, ativo, pertence à
--    empresa informada, é admin) é a MESMA regra hoje aplicada por
--    usuario_e_admin() sobre public.profiles - auditada nesta
--    migration (ver cabeçalho), reproduzida aqui em 4 exceções
--    distintas (nunca uma condição só, para o motivo da rejeição ficar
--    auditável) em vez de reconstruída a partir de auth.uid()/
--    empresa_atual_id(), que sob service_role resolveriam null/null.
-- =====================================================================

create function public.aprovar_cenario_comercial_v2(
  p_empresa_id uuid,
  p_aprovado_por uuid,
  p_projeto_id uuid,
  p_tipo_cenario text,
  p_data_solicitada_cliente date,
  p_prazo_proposto date,
  p_custo_tecnico_atual numeric,
  p_custo_negociacao_material numeric,
  p_custo_hora_adicional numeric,
  p_custo_recurso_temporario numeric,
  p_custo_terceirizacao numeric,
  p_valor_comercial_atual_referencia numeric,
  p_snapshot jsonb,
  p_assinatura_tecnica text,
  p_motivo_substituicao text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_projeto_empresa_id uuid;
  v_perfil_empresa_id uuid;
  v_perfil_nivel_acesso text;
  v_perfil_ativo boolean;
  v_anterior_id uuid;
  v_diferenca_em_dias integer;
  v_custo_adicional_total numeric;
  v_novo_custo_tecnico numeric;
  v_snapshot_final jsonb;
  v_novo_id uuid;
begin
  if p_empresa_id is null then
    raise exception 'p_empresa_id é obrigatório - deve vir de public.profiles do aprovador, resolvido pela Server Action antes da chamada, nunca de parâmetro do navegador.';
  end if;

  if p_aprovado_por is null then
    raise exception 'p_aprovado_por é obrigatório - deve vir de auth.getUser() no servidor, nunca de parâmetro do navegador.';
  end if;

  -- Autorização (4 exceções distintas, cada uma auditável) - reproduz
  -- EXATAMENTE o predicado hoje aplicado por usuario_e_admin() sobre
  -- public.profiles (id = <usuário>, ativo = true, nivel_acesso =
  -- 'admin'), sem introduzir nem afrouxar nenhuma condição.
  select empresa_id, nivel_acesso, ativo
    into v_perfil_empresa_id, v_perfil_nivel_acesso, v_perfil_ativo
  from public.profiles
  where id = p_aprovado_por;

  if not found then
    raise exception 'Usuário aprovador % não possui perfil cadastrado (public.profiles).', p_aprovado_por;
  end if;

  if not v_perfil_ativo then
    raise exception 'Usuário aprovador % está inativo.', p_aprovado_por;
  end if;

  if v_perfil_empresa_id is distinct from p_empresa_id then
    raise exception 'Usuário aprovador % não pertence à empresa informada (p_empresa_id).', p_aprovado_por;
  end if;

  if v_perfil_nivel_acesso is distinct from 'admin' then
    raise exception 'Só administradores podem aprovar um cenário comercial.';
  end if;

  if p_tipo_cenario not in ('atual', 'ajustado') then
    raise exception 'tipo_cenario inválido: % (esperado "atual" ou "ajustado").', p_tipo_cenario;
  end if;

  if p_custo_tecnico_atual < 0 or p_custo_negociacao_material < 0 or p_custo_hora_adicional < 0
     or p_custo_recurso_temporario < 0 or p_custo_terceirizacao < 0 then
    raise exception 'Nenhuma categoria de custo pode ser negativa.';
  end if;

  select empresa_id into v_projeto_empresa_id from public.projetos where id = p_projeto_id;
  if v_projeto_empresa_id is null then
    raise exception 'Projeto % não encontrado.', p_projeto_id;
  end if;
  if v_projeto_empresa_id is distinct from p_empresa_id then
    raise exception 'Projeto % não pertence à empresa informada (p_empresa_id).', p_projeto_id;
  end if;

  -- Assinatura técnica obrigatória e com formato válido em toda
  -- aprovação por esta RPC - nunca NULL, nunca forjada (só cenários
  -- aprovados pela RPC antiga, aprovar_cenario_comercial, ficam com
  -- NULL - ver coluna acima).
  if p_assinatura_tecnica is null or p_assinatura_tecnica !~ '^[0-9a-f]{64}$' then
    raise exception 'p_assinatura_tecnica é obrigatória e precisa ser um hash SHA-256 hexadecimal (64 caracteres).';
  end if;

  -- Datas/somas SÃO verificáveis em SQL - recalculadas aqui, nunca
  -- confiadas a um total pronto vindo do chamador (mesmo que a Server
  -- Action já as tenha calculado do mesmo jeito - defesa em
  -- profundidade, nunca uma segunda fonte de verdade sem checagem).
  v_diferenca_em_dias := p_prazo_proposto - p_data_solicitada_cliente;
  v_custo_adicional_total := p_custo_negociacao_material + p_custo_hora_adicional + p_custo_recurso_temporario + p_custo_terceirizacao;
  v_novo_custo_tecnico := p_custo_tecnico_atual + v_custo_adicional_total;

  if jsonb_typeof(p_snapshot) is distinct from 'object' then
    raise exception 'snapshot precisa ser um objeto JSON.';
  end if;
  if (p_snapshot ->> 'versaoFormato') is distinct from '1' then
    raise exception 'snapshot.versaoFormato precisa ser 1 (versão atual do formato).';
  end if;

  -- MESMA chave de advisory lock da RPC antiga (por projeto, não por
  -- versão de RPC) - as duas RPCs escrevem na mesma tabela e
  -- disputam o mesmo "1 vigente por projeto"; uma aprovação em voo
  -- pela RPC antiga e outra pela nova, para o MESMO projeto, precisam
  -- se serializar uma contra a outra, nunca cada uma com sua própria
  -- trava (o que permitiria as duas correrem em paralelo e colidirem
  -- no fechamento do vigente).
  perform pg_advisory_xact_lock(hashtextextended('cenarios_comerciais_aprovados:' || p_projeto_id::text, 0));

  select id into v_anterior_id
  from public.cenarios_comerciais_aprovados
  where empresa_id = p_empresa_id and projeto_id = p_projeto_id and vigente = true;

  if v_anterior_id is not null and coalesce(btrim(p_motivo_substituicao), '') = '' then
    raise exception 'Motivo obrigatório para substituir o cenário comercial já vigente deste projeto.';
  end if;

  -- aprovado_por/aprovado_em SEMPRE resolvidos a partir dos parâmetros
  -- já validados acima (nunca de auth.uid()/now() implícitos - sob
  -- service_role não há JWT, auth.uid() seria sempre null). O mesmo
  -- par é forçado DENTRO do snapshot logo abaixo, para o JSON nunca
  -- divergir das colunas (ver CHECK _snapshot_forma_chk) mesmo que a
  -- Server Action tenha montado o snapshot com outro valor.
  v_snapshot_final := p_snapshot || jsonb_build_object('aprovadoPor', p_aprovado_por::text, 'aprovadoEm', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  perform set_config('app.aprovacao_cenario_comercial_em_andamento_projeto_id', p_projeto_id::text, true);

  if v_anterior_id is not null then
    update public.cenarios_comerciais_aprovados
    set vigente = false
    where id = v_anterior_id;
  end if;

  insert into public.cenarios_comerciais_aprovados (
    empresa_id, projeto_id, vigente, tipo_cenario, aprovado_por, substituiu_cenario_id, motivo_substituicao,
    data_solicitada_cliente, prazo_proposto, diferenca_em_dias,
    custo_tecnico_atual, custo_negociacao_material, custo_hora_adicional, custo_recurso_temporario, custo_terceirizacao,
    custo_adicional_total, novo_custo_tecnico, valor_comercial_atual_referencia, snapshot, versao_snapshot,
    assinatura_tecnica
  ) values (
    p_empresa_id, p_projeto_id, true, p_tipo_cenario, p_aprovado_por, v_anterior_id, p_motivo_substituicao,
    p_data_solicitada_cliente, p_prazo_proposto, v_diferenca_em_dias,
    p_custo_tecnico_atual, p_custo_negociacao_material, p_custo_hora_adicional, p_custo_recurso_temporario, p_custo_terceirizacao,
    v_custo_adicional_total, v_novo_custo_tecnico, p_valor_comercial_atual_referencia, v_snapshot_final, 1,
    p_assinatura_tecnica
  )
  returning id into v_novo_id;

  return v_novo_id;
end;
$function$;

comment on function public.aprovar_cenario_comercial_v2(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text) is
  'RPC NOVA (Fase 1 da transição - coexiste com aprovar_cenario_comercial, 12 parâmetros, que fica intocada até a Fase 2 remover). Único caminho de escrita PREVISTO para o código novo de cenarios_comerciais_aprovados (DEC-007, Fase 8b). SERVICE_ROLE-ONLY (nunca chamável por authenticated - current_user dentro de SECURITY DEFINER não distingue Server Action de chamada direta, decisão do usuário) - p_empresa_id/p_aprovado_por resolvidos e validados pela Server Action (auth.getUser() + public.profiles) ANTES de instanciar o client privilegiado, nunca de parâmetro implícito de sessão (que sob service_role não existiria). Autorização reproduz EXATAMENTE usuario_e_admin() (profiles: ativo=true, nivel_acesso=admin, empresa_id=p_empresa_id) em 4 exceções distintas e auditáveis - diferente de aprovar_projeto_com_simulacao_v5, que nunca exigiu admin (auditado nesta mesma migration). p_assinatura_tecnica obrigatória (hash SHA-256 hex) em toda aprovação - calculada em TypeScript (construirDocumentoAssinaturaTecnica.ts) sobre a MESMA carga de dados que produziu custo/snapshot, nunca em SQL. MESMA trava de advisory lock (por projeto) da RPC antiga - as duas serializam entre si, nunca correm em paralelo para o mesmo projeto. Só 1 vigente por (empresa_id, projeto_id), motivo obrigatório ao substituir. Verifica o que é verificável em SQL (tenant/permissão/forma das datas/coerência das somas/formato da assinatura) - NUNCA reconstrói nem confirma sozinha a previsão operacional (prazo/horas/custo) nem a assinatura técnica, que só existem calculadas em TypeScript pela Server Action chamadora. Não cria OF, não programa nem reserva capacidade no PCP, não aprova o orçamento em si - só registra a decisão comercial.';

-- `from public` sozinho NÃO bastaria: este projeto tem ALTER DEFAULT
-- PRIVILEGES concedendo EXECUTE em funções novas do schema public
-- diretamente a anon/authenticated/service_role (achado na validação
-- local desta migration - a função nasceu com anon/authenticated no
-- ACL mesmo depois de um `revoke ... from public`, porque essas duas
-- concessões vêm de DEFAULT PRIVILEGES, não de PUBLIC) - por isso
-- revoga de anon/authenticated EXPLICITAMENTE. A RPC ANTIGA
-- (aprovar_cenario_comercial) não é tocada aqui - continua com o ACL
-- original (authenticated), intacta para o código ainda em produção.
revoke all on function public.aprovar_cenario_comercial_v2(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.aprovar_cenario_comercial_v2(uuid, uuid, uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text, text) to service_role;
