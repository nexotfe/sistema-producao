-- Incremento 4D0-A (2/3) — matriz protegida de combinações válidas entre
-- estado_aprovacao e estado_execucao. Sem isso, o trigger sync_estado_of
-- (migration anterior) aceitaria qualquer par tecnicamente bem-formado, mesmo
-- sem sentido de negócio (ex.: rascunho + em_producao). A checagem é
-- declarativa (FK composta), não lógica dentro do trigger — nenhum caminho de
-- escrita consegue burlar. Plano aprovado: polymorphic-tinkering-lightning
-- (Revisão 5, seção A.1b). Conteúdo da matriz proposto no plano e confirmado
-- pelo usuário sem alteração nos pares. Arquivo inteiro é uma transação.

begin;

create table public.estados_of_combinacoes_validas (
  estado_aprovacao text not null,
  estado_execucao text not null,
  observacao text null,
  primary key (estado_aprovacao, estado_execucao)
);

comment on table public.estados_of_combinacoes_validas is
  '4D0: matriz protegida — únicos pares (estado_aprovacao, estado_execucao) permitidos em ordens_fabricacao. Referenciada por FK composta, não por lógica solta em trigger.';

insert into public.estados_of_combinacoes_validas (estado_aprovacao, estado_execucao, observacao) values
  ('rascunho', 'planejada', 'Estado inicial — ainda editável pelo PCP, nunca em execução.'),

  ('aguardando_auditoria', 'planejada', 'Aguardando revisão/aprovação do PCP.'),
  ('aguardando_auditoria', 'desdobrada', 'Dividida em lotes durante a auditoria, antes da aprovação formal.'),

  ('aprovada', 'planejada', 'Aprovada, ainda não liberada para produção — aprovação e liberação são atos distintos.'),
  ('aprovada', 'liberada', 'Aprovada e liberada, produção pode iniciar.'),
  ('aprovada', 'em_producao', 'Em execução real.'),
  ('aprovada', 'suspensa', 'Execução suspensa temporariamente, aprovação permanece válida.'),
  ('aprovada', 'concluida', 'Execução concluída.'),
  ('aprovada', 'desdobrada', 'Dividida em lotes depois de aprovada (revisão).'),
  ('aprovada', 'cancelada', 'Execução cancelada depois de aprovada — aprovação não é desfeita retroativamente.'),

  ('reprovada', 'planejada', 'Rejeitada na auditoria, nunca chega a executar.'),
  ('reprovada', 'cancelada', 'Rejeitada e formalmente encerrada.'),

  ('cancelada', 'planejada', 'Cancelada antes de qualquer execução real.'),
  ('cancelada', 'desdobrada', 'Cancelada com filhas já existentes (histórico preservado).'),
  ('cancelada', 'cancelada', 'Cancelamento legado — status=''cancelada'' sempre significou a OF inteira encerrada.');

alter table public.estados_of_combinacoes_validas enable row level security;

create policy estados_of_combinacoes_validas_select_authenticated
  on public.estados_of_combinacoes_validas
  for select
  to authenticated
  using (true);

-- Nenhuma policy de INSERT/UPDATE/DELETE para authenticated — escrita só via
-- service_role (fora do RLS), mesmo padrão de papeis_funcionais (migration
-- 4D0-C). Reforçado com REVOKE/GRANT explícitos abaixo — policy não substitui
-- privilégio SQL.
--
-- CORREÇÃO (achado real via has_table_privilege em execução isolada): o
-- schema public tem pg_default_acl concedendo INSERT/UPDATE/DELETE a
-- `authenticated` (e a `anon`) individualmente em toda tabela nova — não só
-- via PUBLIC. "REVOKE ALL FROM PUBLIC, anon" não remove essas concessões
-- individuais de authenticated; um GRANT mais estreito depois não as
-- sobrescreve, só se soma a elas. Por isso authenticated precisa aparecer
-- explicitamente no REVOKE, sempre antes de qualquer GRANT.
revoke all on public.estados_of_combinacoes_validas from public, anon, authenticated;
grant select on public.estados_of_combinacoes_validas to authenticated;

-- status legado ganha o sentinela usado quando o par novo não tem
-- equivalente de 1 valor (já adicionado ao CHECK na migration anterior —
-- aqui só a FK composta que de fato protege a combinação).
alter table public.ordens_fabricacao
  add constraint ordens_fabricacao_estado_par_valido_fkey
    foreign key (estado_aprovacao, estado_execucao)
    references public.estados_of_combinacoes_validas (estado_aprovacao, estado_execucao);

commit;
