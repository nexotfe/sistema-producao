-- Incremento 4A (de 4A-4D) do fluxo vertical de Compras - ver "Desenho
-- Tecnico - Fluxo Vertical de Compras" (parte 8) e sua revisao com as
-- 3 correcoes obrigatorias (idempotencia real, garantia estrutural,
-- imutabilidade comprovada no banco). Este incremento cria SOMENTE o
-- cadastro de conversao por materia-prima - nenhuma coluna nova nas 4
-- tabelas do pipeline de Compras (isso e o 4B), nenhuma RPC (4C),
-- nenhuma tela (4D). A tabela termina VAZIA - nenhuma conversao e
-- presumida ou semeada nesta migration.
--
-- Pre-requisito descoberto durante o desenho, nao previsto no escopo
-- original do 4A, confirmado com o usuario antes de escrever: a FK
-- composta que garante que materia_prima_id pertence a mesma empresa
-- da linha de conversao exige UNIQUE(id, empresa_id) em
-- materias_primas, que ainda nao existia (materias_primas so tinha
-- PRIMARY KEY(id), UNIQUE(empresa_id, codigo) e
-- UNIQUE(empresa_id, descricao)). Decisao do usuario: adicionar essa
-- constraint aqui, aditiva, sem alterar nenhum dado - mesmo padrao ja
-- usado quando recursos_produtivos e bom_itens precisaram virar alvo
-- de FK composta.
--
-- As 3 FKs compostas (materia_prima_id, unidade_tecnica_id,
-- unidade_compra_id) garantem estruturalmente que os tres pertencem a
-- mesma empresa da linha de conversao - nenhuma delas depende de
-- validacao futura em RPC para isolamento (a RPC do 4C ainda vai
-- validar por robustez de diagnostico, mas a garantia real e daqui).
--
-- BEGIN/COMMIT explicito: mesma licao das migrations anteriores.

begin;

-- ============================================================
-- 0. Pre-requisito: UNIQUE(id, empresa_id) em materias_primas
-- ============================================================

-- Pre-checagem de duplicidade antes de criar a constraint - mesma
-- disciplina ja aplicada na migration de numeracao de OF, mesmo que
-- aqui seja estruturalmente impossivel falhar (id ja e PRIMARY KEY,
-- entao duas linhas nunca podem compartilhar o mesmo id, com ou sem
-- empresa_id igual) - nunca presumir, sempre verificar antes de criar
-- uma constraint nova.
do $$
declare
  v_dup record;
  v_total_dup int := 0;
begin
  for v_dup in
    select id, empresa_id, count(*) as ocorrencias
    from public.materias_primas
    group by id, empresa_id
    having count(*) > 1
  loop
    v_total_dup := v_total_dup + 1;
    raise warning 'duplicidade em (id, empresa_id) de materias_primas: id=%, empresa_id=%, ocorrencias=%',
      v_dup.id, v_dup.empresa_id, v_dup.ocorrencias;
  end loop;

  if v_total_dup > 0 then
    raise exception 'Existem % duplicidade(s) em (id, empresa_id) de materias_primas - corrija manualmente antes de aplicar UNIQUE(id, empresa_id)', v_total_dup;
  end if;
end $$;

alter table public.materias_primas
  add constraint materias_primas_id_empresa_uniq unique (id, empresa_id);

comment on constraint materias_primas_id_empresa_uniq on public.materias_primas is
  'Alvo da FK composta de materia_prima_unidade_conversoes.materia_prima_id - garante que uma conversao so pode referenciar materia-prima da mesma empresa. Adicionada no Incremento 4A do fluxo vertical de Compras.';

-- ============================================================
-- 1. Tabela materia_prima_unidade_conversoes
-- ============================================================
create table public.materia_prima_unidade_conversoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  materia_prima_id uuid not null,
  unidade_tecnica_id uuid not null,
  unidade_compra_id uuid not null,
  rendimento_tecnico_por_unidade_comprada numeric not null,
  multiplo_minimo_compra numeric not null default 1,
  admite_fracao boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),

  constraint mp_unidade_conv_rendimento_chk
    check (rendimento_tecnico_por_unidade_comprada > 0),
  constraint mp_unidade_conv_multiplo_chk
    check (multiplo_minimo_compra > 0),
  -- admite_fracao=false exige multiplo inteiro; admite_fracao=true
  -- permite qualquer valor positivo (inclusive fracionario).
  constraint mp_unidade_conv_fracao_chk
    check (admite_fracao or multiplo_minimo_compra = floor(multiplo_minimo_compra)),

  -- As 3 FKs compostas abaixo sao a garantia estrutural de isolamento
  -- por empresa - nenhuma linha de conversao pode referenciar
  -- materia-prima, unidade tecnica ou unidade de compra de empresa
  -- diferente da sua propria. Mesmo padrao ja em producao desde a
  -- Etapa 1 (unidades_medida_id_empresa_uniq,
  -- recurso_produtivo_compatibilidades).
  constraint mp_unidade_conv_materia_prima_fkey
    foreign key (materia_prima_id, empresa_id)
    references public.materias_primas (id, empresa_id),
  constraint mp_unidade_conv_unidade_tecnica_fkey
    foreign key (unidade_tecnica_id, empresa_id)
    references public.unidades_medida (id, empresa_id),
  constraint mp_unidade_conv_unidade_compra_fkey
    foreign key (unidade_compra_id, empresa_id)
    references public.unidades_medida (id, empresa_id)
);

comment on table public.materia_prima_unidade_conversoes is
  'Cadastro por empresa de como uma materia-prima e comprada quando a unidade de compra difere da unidade tecnica (ex.: necessidade em kg, compra em barra). Chave logica: empresa + materia-prima + unidade tecnica + unidade de compra. Nunca ha DELETE fisico - desativar (ativo=false) preserva o historico e libera a chave para uma nova conversao ativa. Parte do Incremento 4A do fluxo vertical de Compras (parte 8 do desenho de Cadastro de Unidades por Empresa).';

comment on column public.materia_prima_unidade_conversoes.rendimento_tecnico_por_unidade_comprada is
  'Quanto de unidade tecnica 1 unidade de compra rende (ex.: 1 barra rende 6 metros -> 6). Usado por decidir_compra_planejamento (Incremento 4C) para calcular quantidade_planejada_compra = CEIL((quantidade_necessaria/rendimento)/multiplo)*multiplo.';
comment on column public.materia_prima_unidade_conversoes.multiplo_minimo_compra is
  'Lote/multiplo minimo de compra, na unidade de compra. Aplica-se mesmo quando unidade_compra_id = unidade_tecnica_id (ex.: kg vendido so em sacos de 25kg). Inteiro obrigatorio quando admite_fracao=false (ver mp_unidade_conv_fracao_chk).';
comment on column public.materia_prima_unidade_conversoes.ativo is
  'Nunca ha exclusao fisica. Desativar uma linha (ativo=false) libera a chave (empresa, materia_prima, unidade_tecnica, unidade_compra) para uma nova linha ativa, sem apagar a anterior - historico preservado, inclusive para pedidos ja gerados que congelaram os valores desta linha.';

-- Indice unico PARCIAL: no maximo 1 linha ATIVA por chave logica -
-- desativar e recriar preserva o historico (a linha antiga inativa
-- continua existindo, so sai do escopo deste indice).
create unique index mp_unidade_conv_chave_ativa_uniq
  on public.materia_prima_unidade_conversoes
     (empresa_id, materia_prima_id, unidade_tecnica_id, unidade_compra_id)
  where ativo = true;

create index mp_unidade_conv_empresa_material_idx
  on public.materia_prima_unidade_conversoes (empresa_id, materia_prima_id);

-- ============================================================
-- 2. RLS - leitura para toda empresa, escrita so admin
-- ============================================================
alter table public.materia_prima_unidade_conversoes enable row level security;

-- Sem filtro por ativo: uma conversao desativada continua sendo a
-- explicacao correta de um pedido historico que ja a usou - mesma
-- logica ja aplicada em unidades_medida (Etapa 1).
create policy mp_unidade_conv_select_tenant
  on public.materia_prima_unidade_conversoes
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and deleted_at is null
  );

create policy mp_unidade_conv_insert_tenant
  on public.materia_prima_unidade_conversoes
  for insert
  to authenticated
  with check (
    empresa_id = public.empresa_atual_id()
    and created_by = auth.uid()
    and public.usuario_e_admin()
  );

-- USING e WITH CHECK identicos (empresa + admin), conforme exigido
-- explicitamente: USING controla quais linhas EXISTENTES podem ser
-- alvo do UPDATE, WITH CHECK controla se a linha RESULTANTE ainda e
-- valida - sem WITH CHECK repetindo a checagem de empresa, seria
-- possivel usar UPDATE para mover a linha para outra empresa (testado
-- explicitamente no preflight positivo).
create policy mp_unidade_conv_update_tenant
  on public.materia_prima_unidade_conversoes
  for update
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and deleted_at is null
    and public.usuario_e_admin()
  )
  with check (
    empresa_id = public.empresa_atual_id()
    and public.usuario_e_admin()
  );

-- Sem policy de DELETE de proposito - "DELETE impossivel" aqui se
-- refere aos papeis normais da aplicacao (anon, authenticated). O
-- dono da tabela (postgres, que roda migrations/backfills) e
-- service_role continuam privilegiados e sempre contornam RLS - isso
-- e uma propriedade do Postgres, nao algo que esta migration tenta
-- (nem deveria tentar) revogar. A protecao real contra escrita
-- indevida por esses papeis privilegiados e disciplina operacional
-- (checkpoint humano ja em vigor para qualquer escrita em producao),
-- nao uma constraint de banco.
--
-- Permissoes de tabela reduzidas ao minimo necessario, mesmo padrao
-- ja usado em unidades_medida (Etapa 1): revoga o GRANT ALL padrao do
-- Supabase e concede de volta so select/insert/update a authenticated.
revoke all on public.materia_prima_unidade_conversoes from public;
revoke all on public.materia_prima_unidade_conversoes from anon;
revoke all on public.materia_prima_unidade_conversoes from authenticated;
grant select, insert, update on public.materia_prima_unidade_conversoes to authenticated;

commit;
