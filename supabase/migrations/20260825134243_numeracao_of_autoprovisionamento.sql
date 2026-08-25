-- Fecha a causa raiz do P0 de numeracao de Ordens de Fabricacao: nenhuma
-- empresa tinha (nem teria automaticamente no futuro) uma linha em
-- numeracao_configuracoes para entidade='of'. Confirmado por leitura direta
-- de set_ordem_fabricacao_numero() -> gerar_numero_entidade('of'): a
-- funcao lanca excecao quando a config nao existe. Nao basta inserir 2
-- linhas para as empresas atuais - isso corrigiria so o presente.
--
-- Duas camadas redundantes, mesmo raciocinio de defesa em profundidade
-- ja usado no fix de RLS de recursos_produtivos:
--
-- Camada 1 (caminho normal): trigger AFTER INSERT em empresas, mesmo
-- padrao ja estabelecido por trg_empresas_criar_capacidade_versao
-- (SECURITY DEFINER, INSERT ... ON CONFLICT DO NOTHING - idempotente por
-- construcao). Cria numeracao_configuracoes para 'projeto' e 'of' -
-- NUNCA 'proposta' (orfa, tabela propostas morta, nao deve ser
-- perpetuada para empresas novas).
--
-- Camada 2 (rede de seguranca): gerar_numero_entidade() se autocura na
-- primeira chamada real se a config ainda nao existir - cobre as 2
-- empresas atuais (criadas antes desta migration) sem precisar de
-- backfill manual, e qualquer caminho futuro que por algum motivo nao
-- passe pelo trigger da Camada 1.
--
-- Continuidade (NAO adivinha nunca):
-- - 'projeto': linhas existentes (2 hoje, 1 por empresa) sao preservadas
--   byte a byte - ON CONFLICT DO NOTHING nunca toca uma linha ja
--   existente. Empresa nova sem numero_projeto historico comeca do 0 -
--   nao ha o que reconciliar.
-- - 'of' sem ordens_fabricacao historicas: comeca do 0 (primeira geracao
--   produz OF-000001) - e o estado real das 2 empresas hoje (0 OFs).
-- - 'of' COM ordens_fabricacao historicas (cenario futuro, ex.: import
--   de dados antigos antes desta migration rodar): reconstroi
--   sequencia_atual a partir do MAIOR sufixo numerico valido apos o
--   prefixo 'OF-'. Se qualquer numero_of da empresa nao bater com esse
--   formato exato (^OF-[0-9]+$), a funcao ABORTA com excecao
--   diagnostica - nunca extrai "todos os digitos" as cegas (isso
--   confundiria projeto '260011' = ano 26 + sequencia 0011 com uma
--   sequencia 260011, por exemplo - por isso o formato de projeto nunca
--   e recalculado, so preservado).
--
-- Truncamento (achado desta auditoria, corrigido junto): lpad() do
-- Postgres TRUNCA pela direita quando o valor de entrada e maior que o
-- tamanho alvo - confirmado empiricamente: lpad('1000000',6,'0') e
-- lpad('1000001',6,'0') retornam o MESMO '100000', colidindo dois
-- numeros diferentes. Trocado o calculo da largura para
-- greatest(tamanho_sequencia, length(sequencia::text)) - preenche com
-- zero quando curto, nunca corta quando longo (cresce para OF-1000000
-- em vez de colidir).
--
-- Formato de OF (decisao de negocio confirmada): prefixo 'OF-',
-- sequencia de 6 digitos, sem ano, sem reinicio anual - mascara
-- permanece so descritiva nesta etapa (ja era assim antes: a coluna
-- mascara nunca e parseada em gerar_numero_entidade, so documenta).
--
-- Unicidade: UNIQUE(empresa_id, numero_of) em ordens_fabricacao, ausente
-- ate agora - a checagem de duplicidade historica ANTES de criar a
-- constraint aborta com diagnostico explicito se encontrar qualquer
-- duplicidade (nunca deixa o erro generico do Postgres ser a unica
-- pista).
--
-- Atomicidade (achado confirmado em teste isolado antes desta versao):
-- psql/supabase db query --file NAO envolve o script inteiro numa
-- transacao por padrao - cada instrucao comita separadamente. Sem o
-- BEGIN/COMMIT explicito abaixo, uma falha na pre-checagem (ou em
-- qualquer outro ponto) deixaria as instrucoes seguintes (funcoes,
-- trigger) aplicadas mesmo com a migration "tendo falhado" - exatamente
-- o cenario de alteracao parcial que esta migration existe para evitar
-- em outro nivel. Confirmado empiricamente: sem este BEGIN/COMMIT, uma
-- tentativa com duplicidade historica bloqueava so' a constraint,
-- deixando gerar_numero_entidade substituida e o trigger de empresas
-- criado mesmo assim.

begin;

-- ============================================================
-- 1. Falha explicita se ja existir duplicidade de numero_of por
--    empresa, ANTES de tentar criar a constraint de unicidade.
-- ============================================================
do $$
declare
  v_dup record;
  v_total_duplicados int := 0;
begin
  for v_dup in
    select empresa_id, numero_of, count(*) as ocorrencias
    from public.ordens_fabricacao
    group by empresa_id, numero_of
    having count(*) > 1
  loop
    v_total_duplicados := v_total_duplicados + 1;
    raise warning 'numero_of duplicado: empresa_id=%, numero_of=%, ocorrencias=%',
      v_dup.empresa_id, v_dup.numero_of, v_dup.ocorrencias;
  end loop;

  if v_total_duplicados > 0 then
    raise exception 'Existem % combinacao(oes) de empresa_id+numero_of duplicadas em ordens_fabricacao - corrija manualmente antes de aplicar UNIQUE(empresa_id, numero_of)', v_total_duplicados;
  end if;
end $$;

alter table public.ordens_fabricacao
  add constraint ordens_fabricacao_empresa_numero_uniq unique (empresa_id, numero_of);

-- ============================================================
-- 2. gerar_numero_entidade: autocura (Camada 2) + fim do
--    truncamento silencioso.
-- ============================================================
create or replace function public.gerar_numero_entidade(p_entidade text)
 returns text
 language plpgsql
as $function$
declare
  v_empresa_id uuid := public.empresa_atual_id();
  v_config record;
  v_seq text;
  v_prefixo_of constant text := 'OF-';
  v_sequencia_inicial integer;
begin
  if v_empresa_id is null then
    raise exception 'Empresa atual nao encontrada.';
  end if;

  if p_entidade = 'of' and not exists (
    select 1 from public.numeracao_configuracoes
     where empresa_id = v_empresa_id and entidade = 'of'
  ) then
    if exists (
      select 1 from public.ordens_fabricacao
       where empresa_id = v_empresa_id
         and numero_of !~ ('^' || v_prefixo_of || '[0-9]+$')
    ) then
      raise exception 'numero_of em formato nao reconhecido para empresa % (esperado %<sequencia numerica>) - autoprovisionamento de numeracao abortado, corrija manualmente antes de gerar novos numeros de OF', v_empresa_id, v_prefixo_of;
    end if;

    select coalesce(max(substring(numero_of from length(v_prefixo_of) + 1)::integer), 0)
      into v_sequencia_inicial
      from public.ordens_fabricacao
     where empresa_id = v_empresa_id;

    insert into public.numeracao_configuracoes
      (empresa_id, entidade, prefixo, ano, tamanho_sequencia, mascara, sequencia_atual, created_by)
    values
      (v_empresa_id, 'of', v_prefixo_of, null, 6, 'OF-NNNNNN', v_sequencia_inicial, auth.uid())
    on conflict (empresa_id, entidade) do nothing;
  elsif p_entidade = 'projeto' and not exists (
    select 1 from public.numeracao_configuracoes
     where empresa_id = v_empresa_id and entidade = 'projeto'
  ) then
    -- Empresa nova sem numero_projeto historico - nao ha o que
    -- reconciliar, comeca do 0. Config ja existente NUNCA cai aqui
    -- (o "not exists" acima e falso), preservada byte a byte.
    insert into public.numeracao_configuracoes
      (empresa_id, entidade, prefixo, ano, tamanho_sequencia, mascara, sequencia_atual, created_by)
    values
      (v_empresa_id, 'projeto', null, to_char(current_date, 'YY'), 6, 'AANNNNNN', 0, auth.uid())
    on conflict (empresa_id, entidade) do nothing;
  end if;

  select * into v_config
    from public.numeracao_configuracoes
   where empresa_id = v_empresa_id
     and entidade = p_entidade
     and ativo = true
   limit 1;

  if not found then
    raise exception 'Configuracao de numeracao nao encontrada para entidade %', p_entidade;
  end if;

  update public.numeracao_configuracoes
     set sequencia_atual = sequencia_atual + 1, updated_at = now()
   where id = v_config.id
   returning sequencia_atual into v_config.sequencia_atual;

  -- Nunca trunca: a largura de preenchimento e o MAIOR entre a
  -- configurada e o tamanho real do numero - lpad so completa com
  -- zero quando o numero e mais curto que isso.
  v_seq := lpad(
    v_config.sequencia_atual::text,
    greatest(v_config.tamanho_sequencia, length(v_config.sequencia_atual::text)),
    '0'
  );

  return concat_ws('', coalesce(v_config.prefixo, ''), coalesce(v_config.ano, ''), v_seq);
end;
$function$;

-- ============================================================
-- 3. Trigger de autoprovisionamento na criacao de empresa
--    (Camada 1) - mesmo padrao ja usado por
--    trg_empresas_criar_capacidade_versao.
-- ============================================================
create or replace function public.trg_empresas_criar_numeracao_padrao()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.numeracao_configuracoes
    (empresa_id, entidade, prefixo, ano, tamanho_sequencia, mascara, sequencia_atual, created_by)
  values
    (new.id, 'projeto', null, to_char(current_date, 'YY'), 6, 'AANNNNNN', 0, coalesce(new.created_by, auth.uid()))
  on conflict (empresa_id, entidade) do nothing;

  insert into public.numeracao_configuracoes
    (empresa_id, entidade, prefixo, ano, tamanho_sequencia, mascara, sequencia_atual, created_by)
  values
    (new.id, 'of', 'OF-', null, 6, 'OF-NNNNNN', 0, coalesce(new.created_by, auth.uid()))
  on conflict (empresa_id, entidade) do nothing;

  return new;
end;
$function$;

create trigger empresas_criar_numeracao_padrao
  after insert on public.empresas
  for each row execute function public.trg_empresas_criar_numeracao_padrao();

-- ============================================================
-- 4. Backfill IMEDIATO das empresas ja existentes. Nao depende da
--    Camada 2 (autocura na primeira chamada real) para as empresas
--    atuais - a config 'of' passa a existir e ser verificavel por
--    SELECT direto assim que esta migration termina, sem depender de
--    nenhuma chamada de gerar_numero_entidade acontecer primeiro. A
--    Camada 2 continua existindo como rede de seguranca (empresa
--    futura cujo trigger nao tenha disparado por algum motivo,
--    config apagada depois), nao como o unico mecanismo para as
--    empresas de hoje.
-- ============================================================
do $$
declare
  v_empresa record;
  v_sequencia_inicial integer;
  v_prefixo_of constant text := 'OF-';
  v_created_by uuid;
begin
  for v_empresa in select id, created_by from public.empresas loop
    continue when exists (
      select 1 from public.numeracao_configuracoes
       where empresa_id = v_empresa.id and entidade = 'of'
    );

    if exists (
      select 1 from public.ordens_fabricacao
       where empresa_id = v_empresa.id
         and numero_of !~ ('^' || v_prefixo_of || '[0-9]+$')
    ) then
      raise exception 'numero_of em formato nao reconhecido para empresa % (esperado %<sequencia numerica>) - backfill de numeracao abortado, corrija manualmente antes de aplicar esta migration', v_empresa.id, v_prefixo_of;
    end if;

    select coalesce(max(substring(numero_of from length(v_prefixo_of) + 1)::integer), 0)
      into v_sequencia_inicial
      from public.ordens_fabricacao
     where empresa_id = v_empresa.id;

    v_created_by := coalesce(
      v_empresa.created_by,
      (select id from public.profiles where empresa_id = v_empresa.id order by created_at limit 1)
    );

    if v_created_by is null then
      raise exception 'Nao foi possivel determinar created_by para o backfill de numeracao da empresa % (sem created_by e sem nenhum profile) - corrija manualmente', v_empresa.id;
    end if;

    insert into public.numeracao_configuracoes
      (empresa_id, entidade, prefixo, ano, tamanho_sequencia, mascara, sequencia_atual, created_by)
    values
      (v_empresa.id, 'of', v_prefixo_of, null, 6, 'OF-NNNNNN', v_sequencia_inicial, v_created_by)
    on conflict (empresa_id, entidade) do nothing;
  end loop;
end $$;

commit;
