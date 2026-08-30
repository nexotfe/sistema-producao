-- Incremento 4D0, segunda fatia — Incremento 3/9: trava integral de
-- escrita direta em ordens_fabricacao + fechamento do bypass de
-- numero_of + descontinuação por ACL das duas funções legadas de
-- criação/decisão de material.
--
-- Auditoria prévia (2026-08-30, leitura real contra o banco vinculado):
-- hoje NENHUM consumidor real em src/ escreve diretamente em
-- ordens_fabricacao (só 4 leituras confirmadas, todas SELECT); a única
-- escrita direta na tabela vem da função legada
-- criar_ordem_fabricacao_operacional, sem nenhum chamador encontrado em
-- src/ nem em outra função SQL. Manter qualquer exceção de coluna
-- aberta hoje seria manter uma porta sem consumidor legítimo. Por isso
-- o fechamento é total, sem exceção por coluna — nenhuma coluna
-- continua com escrita direta liberada para authenticated/anon/
-- service_role. O sistema fica intencionalmente sem caminho de criação
-- de OF até a RPC oficial de um incremento futuro. Nenhuma RPC de
-- negócio nova é criada aqui — só ACL e o fechamento estrutural do
-- numero_of. Arquivo inteiro é uma transação.

begin;

-- 1. Trava integral de escrita direta — TODOS os privilégios de tabela,
--    não uma lista enumerada. CORREÇÃO (achado real, revisão do
--    usuário): um REVOKE enumerado (INSERT/UPDATE/DELETE/TRUNCATE/
--    REFERENCES) deixaria de fora TRIGGER (instalar lógica na tabela —
--    contradiz diretamente "ninguém contorna o fluxo") e MAINTAIN
--    (privilégio real nesta versão — PostgreSQL 17.6 — confirmado
--    empiricamente que authenticated já o possui hoje via o grant de
--    tabela default). REVOKE ALL PRIVILEGES elimina esses e qualquer
--    outro privilégio de tabela esquecido, atual ou futuro, sem
--    depender de enumerar cada um. Confirmado por leitura antes desta
--    correção: não existe nenhum GRANT explícito por coluna
--    (pg_attribute.attacl nulo em todas as colunas) — o REVOKE de
--    tabela inteira é suficiente, nenhum REVOKE adicional por coluna é
--    necessário. authenticated mantém só SELECT, via GRANT explícito
--    logo abaixo, sujeito à RLS já existente
--    (ordens_fabricacao_select_tenant) — não tocada nesta migration.
--    postgres e o proprietário da tabela não são afetados por nenhum
--    REVOKE FROM PUBLIC/anon/authenticated/service_role.
revoke all privileges on table public.ordens_fabricacao
  from public, anon, authenticated, service_role;

grant select on table public.ordens_fabricacao
  to authenticated;

comment on table public.ordens_fabricacao is
  '4D0, segunda fatia — Incremento 3: TODOS os privilégios de tabela (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN e qualquer outro) revogados de public/anon/authenticated/service_role via REVOKE ALL PRIVILEGES. authenticated mantém só SELECT, concedido explicitamente, sujeito à RLS existente. Toda criação/alteração de OF passa a exigir uma futura RPC SECURITY DEFINER (fora do escopo desta migration) — até lá, não há caminho de criação de OF para nenhum papel de cliente, intencionalmente.';

-- 2. Fechamento do bypass de numero_of (P0). Confirmado mecanicamente
--    antes desta migration: numero_of não tem default de coluna (NULL
--    se omitido do INSERT) e set_ordem_fabricacao_numero é o único
--    trigger, entre os BEFORE INSERT de ordens_fabricacao (ordem real
--    de disparo, alfabética: set_ordem_fabricacao_numero, depois
--    sync_estado_of, depois validar_e_resolver_of_pai), que toca essa
--    coluna — os outros dois não a referenciam. Até aqui, um numero_of
--    fornecido no INSERT prevalecia (a condição só agia quando
--    nulo/vazio) — bypass real do numerador do Incremento 1. Agora
--    sobrescreve sempre, incondicionalmente: nenhum valor fornecido
--    pelo cliente jamais prevalece, nem mesmo depois que uma futura RPC
--    SECURITY DEFINER for o único caminho de INSERT em produção.
create or replace function public.set_ordem_fabricacao_numero()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  new.numero_of := public.gerar_numero_of(new.projeto_id);
  return new;
end;
$$;

comment on function public.set_ordem_fabricacao_numero() is
  '4D0, Incremento 3: numero_of é sempre gerado no servidor via gerar_numero_of — nenhum valor fornecido pelo cliente no INSERT jamais prevalece (fecha o bypass P0 encontrado na auditoria: antes só agia quando o valor vinha nulo/vazio).';

-- 3. Descontinuação por ACL das duas funções legadas — corpos
--    preservados (nenhuma alteração de lógica), só o EXECUTE é
--    revogado. Auditoria não encontrou nenhum consumidor real em src/
--    nem em outra função SQL para nenhuma das duas. A futura criação
--    oficial de OF será uma RPC nova — criar_ordem_fabricacao_operacional
--    não é reativada porque embute o fluxo automático de CI/CE
--    (consumo interno / requisição de compra automáticos) que contraria
--    o processo já aprovado para as próximas fatias.
revoke execute on function public.criar_ordem_fabricacao_operacional(uuid, uuid, uuid, uuid, numeric, text, date, date, text, text)
  from public, anon, authenticated, service_role;

revoke execute on function public.processar_necessidade_material(uuid, text, uuid, numeric, text, numeric, text, date, text)
  from public, anon, authenticated, service_role;

commit;
