-- Fase B do modulo Orcamento/Proposta Comercial - Passo 8.
-- Numeracao automatica da Proposta Comercial, mesmo padrao ja usado para
-- projeto/OF (gerar_numero_entidade + trigger before insert). Como nao
-- existe nenhuma tabela para ancorar esse numero (e sem uma linha
-- persistida o numero seria gerado de novo a cada vez que a pagina
-- recarregasse), criamos uma tabela minima "propostas" so para guardar
-- o numero gerado por projeto - sem campos de conteudo (isso continua
-- vindo ao vivo do projeto/projeto_itens). Revisao fica fixa "Rev.00" no
-- frontend (sem workflow ainda), por isso nao vira coluna aqui.
create table if not exists public.propostas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  projeto_id uuid not null references public.projetos(id),
  numero_proposta text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint propostas_empresa_numero_uniq unique (empresa_id, numero_proposta)
);

comment on table public.propostas is
  'Ancora o numero_proposta gerado para cada projeto (1 proposta "atual" por projeto nesta fase). Conteudo da proposta vem ao vivo de projetos/projeto_itens - esta tabela nao duplica dado.';

alter table public.propostas enable row level security;

create policy propostas_select_tenant
  on public.propostas
  for select
  to authenticated
  using (empresa_id = public.empresa_atual_id() and ativo = true and deleted_at is null);

create policy propostas_insert_tenant
  on public.propostas
  for insert
  to authenticated
  with check (empresa_id = public.empresa_atual_id());

create policy propostas_delete_blocked
  on public.propostas
  for delete
  to authenticated
  using (false);

-- Registra 'proposta' como entidade valida de numeracao.
alter table public.numeracao_configuracoes
  drop constraint numeracao_configuracoes_entidade_chk;

alter table public.numeracao_configuracoes
  add constraint numeracao_configuracoes_entidade_chk check (
    entidade in ('projeto', 'of', 'proposta')
  );

create or replace function public.set_proposta_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero_proposta is null or trim(new.numero_proposta) = '' then
    new.numero_proposta := public.gerar_numero_entidade('proposta');
  end if;
  return new;
end;
$$;

comment on function public.set_proposta_numero() is
  'Trigger que atribui numero_proposta automaticamente quando ausente.';

create trigger set_proposta_numero
  before insert on public.propostas
  for each row
  execute function public.set_proposta_numero();

-- Semeia a config de numeracao para entidade='proposta' em cada empresa
-- ativa que ja tenha ao menos um usuario. Formato sugerido: PC-0001
-- (prefixo 'PC-', sem ano, sequencial de 4 digitos comecando em 1).
do $$
declare
  v_empresa record;
  v_created_by uuid;
begin
  for v_empresa in select id from public.empresas where ativo = true loop
    select id
      into v_created_by
      from public.usuarios
     where empresa_id = v_empresa.id
     order by data_criacao asc
     limit 1;

    if v_created_by is null then
      continue;
    end if;

    insert into public.numeracao_configuracoes (
      empresa_id, entidade, prefixo, ano, sequencia_atual, tamanho_sequencia, mascara, created_by
    )
    values (
      v_empresa.id,
      'proposta',
      'PC-',
      null,
      0,
      4,
      'PC-NNNN',
      v_created_by
    )
    on conflict (empresa_id, entidade) do nothing;
  end loop;
end
$$;
