-- Etapa 1 (de 8) do rollout de Cadastro de Unidades por Empresa - ver
-- desenho tecnico "Cadastro de Unidades por Empresa" (parte 4). Cria
-- SOMENTE a tabela de catalogo + isolamento + autoprovisionamento.
-- Nenhuma das 9 tabelas existentes (materias_primas, itens_industriais,
-- bom_itens, ordens_fabricacao, consumos_internos,
-- requisicao_compra_itens, planejamentos_compra,
-- planejamento_compra_origens, pedido_compra_itens) e alterada nesta
-- migration - unidade_id chega em cada uma nas Etapas 2-4, aditivo,
-- sem tocar a coluna de texto unidade existente.
--
-- Semente inicial (decisao de negocio confirmada pelo usuario em
-- 2026-08-25): as 9 unidades ja usadas de fato em pelo menos uma das 9
-- tabelas, mais mm e cm - que ja fazem parte do CHECK aceito por
-- bom_itens e sao unidades legitimas, mesmo sem registro historico
-- ainda. Todas nascem ATIVAS, incluindo mm/cm - nao ha razao de
-- negocio para nascerem inativas, e cada empresa pode desativar depois
-- o que nao usa (Etapa 5, tela de cadastro).
--
-- unidade_id nas tabelas de Compras (Etapa 4) e a correcao dos CHECKs
-- divergentes la (litro/unidade fora do vocabulario atual de compras)
-- ficam para quando a Etapa 4 for de fato implementada - la sim havera
-- uma janela transitoria aceitando os valores antigos antes de trocar
-- para o catalogo com FK composta, conforme decisao ja registrada. Nao
-- antecipada aqui.
--
-- Mesmo padrao de defesa em profundidade ja usado no autoprovisionamento
-- de numeracao_configuracoes: Camada 1 (trigger AFTER INSERT em
-- empresas, SECURITY DEFINER, ON CONFLICT DO NOTHING - idempotente por
-- construcao) cobre toda empresa futura; backfill imediato (nao
-- preguicoso) cobre as empresas ja existentes sem depender de nenhuma
-- chamada futura. Aqui nao existe Camada 2 (autocura em runtime) porque,
-- diferente de gerar_numero_entidade(), nao ha nenhuma funcao que crie
-- uma unidade sob demanda na primeira leitura - o catalogo e sempre
-- povoado de antemao.
--
-- BEGIN/COMMIT explicito: mesma licao confirmada empiricamente na
-- migration de numeracao de OF - supabase db query --file nao envolve o
-- arquivo inteiro numa transacao por padrao.

begin;

-- ============================================================
-- 1. Tabela unidades_medida
-- ============================================================
create table public.unidades_medida (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  codigo text not null,
  nome_exibicao text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  -- codigo e a chave estavel que as Etapas 2-4 vao persistir nas FKs das
  -- 9 tabelas consumidoras - precisa ser normalizado na entrada, nunca
  -- reconciliado depois: minusculo, sem espaco, so [a-z0-9_]. O regex
  -- ja exige pelo menos 1 caractere (+), entao cobre "nao vazio" junto.
  constraint unidades_medida_codigo_chk check (codigo ~ '^[a-z0-9_]+$'),
  -- nome_exibicao <> '' sozinho deixaria passar uma string so de
  -- espacos (' ' <> '' e verdadeiro) - btrim fecha essa lacuna.
  constraint unidades_medida_nome_exibicao_chk check (btrim(nome_exibicao) <> ''),
  -- Alvo da FK composta que as Etapas 2-4 vao criar em cada uma das 9
  -- tabelas (mesmo padrao ja usado por recursos_produtivos_id_empresa_uniq
  -- e simulacao_comercial): impossivel uma linha de outra tabela
  -- referenciar uma unidade de empresa diferente da sua propria.
  constraint unidades_medida_id_empresa_uniq unique (id, empresa_id),
  -- codigo unico por empresa, entre nao-excluidas (nunca ha exclusao
  -- fisica de fato - deleted_at existe so por convencao com o resto do
  -- schema, ver comentario da tabela).
  constraint unidades_medida_empresa_codigo_unique unique (empresa_id, codigo)
);

comment on table public.unidades_medida is
  'Catalogo de unidades de medida, isolado por empresa (nao compartilhado entre tenants). codigo e o identificador interno estavel consumido pelas 9 tabelas do sistema que hoje guardam unidade como texto solto (materias_primas, itens_industriais, bom_itens, ordens_fabricacao, consumos_internos, requisicao_compra_itens, planejamentos_compra, planejamento_compra_origens, pedido_compra_itens) - a migracao dessas colunas para unidade_id (FK composta contra id+empresa_id) acontece nas Etapas 2-4 do rollout, nao aqui. Nunca ha DELETE fisico: desativacao via ativo=false, a linha permanece para nao quebrar FK de registro historico que ja a referencia. deleted_at/deleted_by existem so por convencao com o resto do schema (ex: numeracao_configuracoes) - nao ha caminho de aplicacao que os preencha hoje.';

comment on column public.unidades_medida.codigo is
  'Identificador interno estavel (ex: kg, metro, peca) - nunca exibido diretamente ao usuario, e o valor persistido nas FKs das 9 tabelas consumidoras (Etapas 2-4).';
comment on column public.unidades_medida.nome_exibicao is
  'Rotulo exibido nas telas - editavel pela empresa sem afetar codigo nem nenhum dado ja gravado nas tabelas consumidoras.';
comment on column public.unidades_medida.ordem is
  'Posicao de exibicao nas listas de selecao (Etapa 5) - menor primeiro, sem exigencia de contiguidade.';

create index unidades_medida_empresa_ordem_idx
  on public.unidades_medida (empresa_id, ordem);

create trigger set_unidades_medida_updated_at
  before update on public.unidades_medida
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- 2. RLS - isolamento por empresa, escrita restrita a admin
-- ============================================================
alter table public.unidades_medida enable row level security;

-- Sem filtro por ativo aqui de proposito: uma unidade desativada
-- continua sendo a unidade certa de um registro historico que ja a usa
-- (materia-prima, item de roteiro, etc.) - esconder via RLS quebraria a
-- tela de edicao desse registro. O filtro por ativo e responsabilidade
-- da CONSULTA que povoa uma lista de NOVA selecao (Etapa 5/7), nao da
-- policy de leitura.
create policy unidades_medida_select_tenant
  on public.unidades_medida
  for select
  to authenticated
  using (
    empresa_id = public.empresa_atual_id()
    and deleted_at is null
  );

create policy unidades_medida_insert_tenant
  on public.unidades_medida
  for insert
  to authenticated
  with check (
    empresa_id = public.empresa_atual_id()
    and created_by = auth.uid()
    and public.usuario_e_admin()
  );

create policy unidades_medida_update_tenant
  on public.unidades_medida
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

-- Sem policy de DELETE (nao ha operacao DELETE permitida a nenhum
-- role - RLS so importa para comandos que a role tem privilegio de
-- executar; sem GRANT nenhum de DELETE, o comando e recusado antes de
-- qualquer policy ser avaliada, tornando uma policy "using (false)"
-- redundante aqui).
--
-- Permissoes de tabela reduzidas ao minimo necessario: revoga
-- explicitamente o GRANT ALL que o Supabase aplica por padrao a
-- schema public (ver default privileges do projeto) e concede de volta
-- somente select/insert/update a authenticated - nunca delete, nunca
-- nenhum privilegio a anon (RLS ja bloquearia anon de qualquer forma,
-- por nenhuma policy ter `to anon`, mas o GRANT em si tambem e negado
-- agora, defesa em profundidade na camada de privilegios do SQL, antes
-- da RLS).
revoke all on public.unidades_medida from public;
revoke all on public.unidades_medida from anon;
revoke all on public.unidades_medida from authenticated;
grant select, insert, update on public.unidades_medida to authenticated;

-- ============================================================
-- 3. Autoprovisionamento - Camada 1 (trigger em empresas)
-- ============================================================
create or replace function public.trg_empresas_criar_unidades_medida_padrao()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.unidades_medida
    (empresa_id, codigo, nome_exibicao, ordem, ativo, created_by)
  values
    (new.id, 'kg', 'Quilograma', 1, true, coalesce(new.created_by, auth.uid())),
    (new.id, 'metro', 'Metro', 2, true, coalesce(new.created_by, auth.uid())),
    (new.id, 'barra', 'Barra', 3, true, coalesce(new.created_by, auth.uid())),
    (new.id, 'chapa', 'Chapa', 4, true, coalesce(new.created_by, auth.uid())),
    (new.id, 'peca', 'Peça', 5, true, coalesce(new.created_by, auth.uid())),
    (new.id, 'conjunto', 'Conjunto', 6, true, coalesce(new.created_by, auth.uid())),
    (new.id, 'unidade', 'Unidade', 7, true, coalesce(new.created_by, auth.uid())),
    (new.id, 'litro', 'Litro', 8, true, coalesce(new.created_by, auth.uid())),
    (new.id, 'pacote', 'Pacote', 9, true, coalesce(new.created_by, auth.uid())),
    (new.id, 'mm', 'Milímetro', 10, true, coalesce(new.created_by, auth.uid())),
    (new.id, 'cm', 'Centímetro', 11, true, coalesce(new.created_by, auth.uid()))
  on conflict (empresa_id, codigo) do nothing;

  return new;
end;
$function$;

comment on function public.trg_empresas_criar_unidades_medida_padrao() is
  'Camada 1 do autoprovisionamento de unidades_medida: semeia o catalogo padrao (11 unidades, todas ativas) para toda empresa nova. SECURITY DEFINER porque a policy de insert normal exige usuario_e_admin() - a criacao de empresa nao necessariamente e feita por um admin ja vinculado a ela. ON CONFLICT DO NOTHING torna a insercao idempotente por construcao. EXECUTE revogado de public/anon/authenticated logo abaixo - utilizavel somente pelo mecanismo de trigger, nunca por chamada direta.';

-- Funcao privilegiada (SECURITY DEFINER): search_path ja fixado acima
-- (`set search_path to 'public'`) contra sequestro de search_path.
-- EXECUTE revogado de todo role que nao seja o dono/trigger - so o
-- mecanismo de trigger AFTER INSERT em empresas pode dispara-la. Mesmo
-- sem este revoke, o Postgres ja recusaria uma chamada direta via SQL
-- (funcao com RETURNS trigger so pode ser invocada como trigger) - o
-- revoke abaixo e uma segunda camada explicita na privilegios, nao a
-- unica.
revoke execute on function public.trg_empresas_criar_unidades_medida_padrao() from public;
revoke execute on function public.trg_empresas_criar_unidades_medida_padrao() from anon;
revoke execute on function public.trg_empresas_criar_unidades_medida_padrao() from authenticated;

create trigger empresas_criar_unidades_medida_padrao
  after insert on public.empresas
  for each row execute function public.trg_empresas_criar_unidades_medida_padrao();

-- ============================================================
-- 4. Backfill IMEDIATO das empresas ja existentes - nao depende de
--    nenhuma chamada futura, verificavel por SELECT direto assim que
--    esta migration termina (mesmo raciocinio da migration de
--    numeracao de OF).
-- ============================================================
do $$
declare
  v_empresa record;
  v_created_by uuid;
begin
  for v_empresa in select id, created_by from public.empresas loop
    v_created_by := coalesce(
      v_empresa.created_by,
      (select id from public.profiles where empresa_id = v_empresa.id order by created_at limit 1)
    );

    if v_created_by is null then
      raise exception 'Nao foi possivel determinar created_by para o backfill de unidades_medida da empresa % (sem created_by e sem nenhum profile) - corrija manualmente', v_empresa.id;
    end if;

    insert into public.unidades_medida
      (empresa_id, codigo, nome_exibicao, ordem, ativo, created_by)
    values
      (v_empresa.id, 'kg', 'Quilograma', 1, true, v_created_by),
      (v_empresa.id, 'metro', 'Metro', 2, true, v_created_by),
      (v_empresa.id, 'barra', 'Barra', 3, true, v_created_by),
      (v_empresa.id, 'chapa', 'Chapa', 4, true, v_created_by),
      (v_empresa.id, 'peca', 'Peça', 5, true, v_created_by),
      (v_empresa.id, 'conjunto', 'Conjunto', 6, true, v_created_by),
      (v_empresa.id, 'unidade', 'Unidade', 7, true, v_created_by),
      (v_empresa.id, 'litro', 'Litro', 8, true, v_created_by),
      (v_empresa.id, 'pacote', 'Pacote', 9, true, v_created_by),
      (v_empresa.id, 'mm', 'Milímetro', 10, true, v_created_by),
      (v_empresa.id, 'cm', 'Centímetro', 11, true, v_created_by)
    on conflict (empresa_id, codigo) do nothing;
  end loop;
end $$;

commit;
