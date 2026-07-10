-- Fase B do modulo Projeto - Passo 4: numeracao automatica de numero_projeto,
-- seguindo o mesmo padrao ja usado para ordens_fabricacao (numero_of):
-- gerar_numero_entidade() (criada em 202606050034) + trigger before insert.
--
-- 1) numeracao_configuracoes_sequencia_chk exigia sequencia_atual >= 0.
-- Para o primeiro numero gerado ser 260000 (nao 260001), a config precisa
-- comecar em -1 (gerar_numero_entidade incrementa antes de usar). Tabela
-- ainda vazia em toda a base (nenhuma config de 'of' existe hoje tambem),
-- entao relaxar para >= -1 nao quebra nenhuma linha existente.
alter table public.numeracao_configuracoes
  drop constraint numeracao_configuracoes_sequencia_chk;

alter table public.numeracao_configuracoes
  add constraint numeracao_configuracoes_sequencia_chk check (
    sequencia_atual >= -1 and tamanho_sequencia > 0
  );

-- 2) Semeia a config de numeracao para entidade='projeto' em cada empresa
-- ativa que ja tenha ao menos um usuario (mesmo criterio de created_by
-- usado em 202607070002). Formato: ano (26) + sequencial de 4 digitos.
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
      'projeto',
      null,
      '26',
      -1,
      4,
      'AANNNN',
      v_created_by
    )
    on conflict (empresa_id, entidade) do nothing;
  end loop;
end
$$;

-- 3) Trigger analogo ao set_ordem_fabricacao_numero: preenche numero_projeto
-- automaticamente quando ausente.
create or replace function public.set_projeto_numero()
returns trigger
language plpgsql
as $$
begin
  if new.numero_projeto is null or trim(new.numero_projeto) = '' then
    new.numero_projeto := public.gerar_numero_entidade('projeto');
  end if;
  return new;
end;
$$;

comment on function public.set_projeto_numero() is
  'Trigger que atribui numero_projeto automaticamente quando ausente.';

create trigger set_projeto_numero
  before insert on public.projetos
  for each row
  execute function public.set_projeto_numero();
