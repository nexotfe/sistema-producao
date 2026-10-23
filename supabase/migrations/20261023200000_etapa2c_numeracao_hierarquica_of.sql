-- NEXOTFE-PCP-ETAPA2C: numeração hierárquica de OF-filha/neta.
--
-- OF-raiz: inalterado, continua usando numeracao_of_projeto (por projeto).
-- OF-filha/neta: numero_do_pai + '-' + segmento sequencial próprio do pai,
-- largura mínima fixa de 2 dígitos, nunca trunca (greatest(2, len)).
-- Decisão do usuário: nenhum campo de largura configurável nesta etapa.
--
-- Retrabalho (of_origem_retrabalho_id) e substituta (of_substitui_id) NÃO
-- entram nesta árvore - continuam chamando gerar_numero_of com
-- p_of_pai_id = null, recebendo número de raiz, exatamente como hoje.
--
-- Zero interpretação textual de numero_of para parentesco: a relação é
-- sempre of_pai_id (uuid); numero_of só é composto na criação, nunca lido
-- de volta para decidir hierarquia.
begin;

create table public.numeracao_of_filha (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  of_pai_id uuid not null,
  sequencial_atual integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint numeracao_of_filha_empresa_pai_uniq unique (empresa_id, of_pai_id),
  constraint numeracao_of_filha_pai_empresa_fkey
    foreign key (of_pai_id, empresa_id) references public.ordens_fabricacao (id, empresa_id),
  constraint numeracao_of_filha_sequencial_chk check (sequencial_atual >= 0)
);

comment on table public.numeracao_of_filha is
  'ETAPA2C: contador do próximo segmento sequencial de numero_of por (empresa_id, of_pai_id). Só gerar_numero_of (SECURITY DEFINER) escreve - nenhum GRANT de escrita a authenticated. Nunca decrementado, nunca resetado, nunca reutilizado - mesmo princípio de numeracao_of_projeto.';

alter table public.numeracao_of_filha enable row level security;

create policy numeracao_of_filha_select_admin
  on public.numeracao_of_filha
  for select
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

revoke all on public.numeracao_of_filha from public, anon, authenticated;
grant select on public.numeracao_of_filha to authenticated;

-- Substitui gerar_numero_of(uuid) por gerar_numero_of(uuid, uuid) -
-- assinatura antiga é DROPada explicitamente para nunca deixar as duas
-- convivendo (ambiguidade de overload com 1 argumento). Único chamador
-- (o trigger, alterado nesta mesma migration) nunca teve EXECUTE
-- concedido a nenhum papel de cliente - substituição é segura.
drop function public.gerar_numero_of(uuid);

create or replace function public.gerar_numero_of(p_projeto_id uuid, p_of_pai_id uuid)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_formato text;
  v_numero_projeto text;
  v_sequencial integer;
  v_pai record;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  select formato into v_formato
  from public.numeracao_of_formato
  where empresa_id = v_empresa_id;

  if not found then
    raise exception 'Formato de numeracao de OF nao configurado para a empresa % - configure antes de criar OFs.', v_empresa_id;
  end if;

  if p_of_pai_id is null then
    -- OF-raiz: comportamento INALTERADO desde 20260828090000.
    select numero_projeto into v_numero_projeto
    from public.projetos
    where id = p_projeto_id and empresa_id = v_empresa_id;

    if not found then
      raise exception 'Projeto % nao encontrado na empresa atual.', p_projeto_id;
    end if;

    insert into public.numeracao_of_projeto (empresa_id, projeto_id, sequencial_atual)
    values (v_empresa_id, p_projeto_id, 0)
    on conflict (empresa_id, projeto_id) do nothing;

    update public.numeracao_of_projeto
    set sequencial_atual = sequencial_atual + 1, updated_at = now()
    where empresa_id = v_empresa_id and projeto_id = p_projeto_id
    returning sequencial_atual into v_sequencial;

    return public.aplicar_formato_numero_of(v_formato, v_numero_projeto, v_sequencial);
  end if;

  -- OF-filha/neta: busca o PAI validando empresa EXPLICITAMENTE (nunca
  -- confiar só na FK composta, que só é avaliada no fim do INSERT).
  select id, numero_of, projeto_id into v_pai
  from public.ordens_fabricacao
  where id = p_of_pai_id and empresa_id = v_empresa_id;

  if v_pai.id is null then
    raise exception 'gerar_numero_of: OF-pai % nao encontrada na empresa atual.', p_of_pai_id;
  end if;

  if v_pai.projeto_id is distinct from p_projeto_id then
    raise exception 'gerar_numero_of: projeto do filho (%) diverge do projeto da OF-pai % (%).', p_projeto_id, p_of_pai_id, v_pai.projeto_id;
  end if;

  insert into public.numeracao_of_filha (empresa_id, of_pai_id, sequencial_atual)
  values (v_empresa_id, p_of_pai_id, 0)
  on conflict (empresa_id, of_pai_id) do nothing;

  update public.numeracao_of_filha
  set sequencial_atual = sequencial_atual + 1, updated_at = now()
  where empresa_id = v_empresa_id and of_pai_id = p_of_pai_id
  returning sequencial_atual into v_sequencial;

  -- Largura minima fixa de 2 digitos, nunca truncada (99 -> "99", 100 -> "100").
  return v_pai.numero_of || '-' || lpad(v_sequencial::text, greatest(2, length(v_sequencial::text)), '0');
end;
$$;

comment on function public.gerar_numero_of(uuid, uuid) is
  'ETAPA2C: gera o próximo numero_of. p_of_pai_id nulo = OF-raiz (contador por projeto, inalterado). p_of_pai_id preenchido = OF-filha/neta (numero_do_pai + segmento próprio, largura mínima 2, nunca trunca). Valida explicitamente que o pai pertence à mesma empresa e ao mesmo projeto do filho - nunca confia apenas na FK composta. Zero interpretação textual de numero_of para parentesco. EXECUTE nunca concedido a nenhum papel de cliente - chamada só por set_ordem_fabricacao_numero (também SECURITY DEFINER).';

revoke execute on function public.gerar_numero_of(uuid, uuid) from public, anon, authenticated, service_role;

-- Trigger: unica mudanca e passar new.of_pai_id junto. BEFORE INSERT ja
-- garante que new.of_pai_id e o valor literal fornecido pelo chamador do
-- INSERT, disponivel independente da ordem de disparo frente a
-- validar_e_resolver_of_pai (que so calcula of_raiz_id, nunca altera
-- of_pai_id).
create or replace function public.set_ordem_fabricacao_numero()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.numero_of is null or trim(new.numero_of) = '' then
    new.numero_of := public.gerar_numero_of(new.projeto_id, new.of_pai_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.set_ordem_fabricacao_numero() from public, anon, authenticated, service_role;

commit;
