-- Incremento 4D0, segunda fatia — Incremento 1/9: numeração de OF por
-- projeto. Plano aprovado: threaded-cascading-forge (Revisão 5). Substitui,
-- só para ordens_fabricacao, o numerador único por empresa
-- (gerar_numero_entidade('of')) por um contador que reinicia a cada
-- projeto, com formato configurável por empresa e sem fallback silencioso
-- — empresa sem formato configurado não consegue criar OF. Inclui trigger
-- de imutabilidade estrutural de numero_of e o índice único parcial que
-- impede duas OFs-raiz para o mesmo projeto_item_id. Arquivo inteiro é uma
-- transação.

begin;

-- 1. projetos ganha UNIQUE(id, empresa_id) — única mudança autorizada
--    nesta tabela, aditiva (id já é PRIMARY KEY, então a nova constraint
--    não pode invalidar nenhuma linha existente), necessária para a FK
--    composta de numeracao_of_projeto abaixo garantir isolamento
--    estrutural entre empresas (mesmo padrão já usado em toda tabela nova
--    do 4D0 — ordens_fabricacao_id_empresa_uniq, necessidades_of_material_
--    id_empresa_uniq).
alter table public.projetos
  add constraint projetos_id_empresa_uniq unique (id, empresa_id);

-- 2. Configuração de formato de numeração de OF por empresa. Sem
--    fallback: uma empresa sem linha aqui não consegue gerar numero_of —
--    erro explícito em gerar_numero_of, nunca um formato padrão implícito.
create table public.numeracao_of_formato (
  empresa_id uuid primary key references public.empresas(id),
  formato text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

comment on table public.numeracao_of_formato is
  '4D0: formato de numeração de OF por empresa. Sem linha para a empresa = sem numeração possível (gerar_numero_of aborta com erro explícito). Só service_role/seed escreve nesta fatia — nenhuma RPC de autoconfiguração ainda.';
comment on column public.numeracao_of_formato.formato is
  'Aceita só dois tokens reconhecidos: {numero_projeto} e {sequencial:N} (N = largura de zero-padding), cada um exatamente uma vez. Validado por validar_formato_numero_of.';

-- 3. Validação/aplicação do formato — dois tokens reconhecidos, nenhum
--    motor de template genérico.
--
--    CORREÇÃO (achado real em revisão): a largura N de {sequencial:N} é
--    um preenchimento MÍNIMO, nunca um limite — lpad(valor, N, '0')
--    TRUNCA valores mais largos que N (ex.: lpad('10000',4,'0')='1000',
--    cortando o dígito mais significativo e colidindo com o sequencial
--    1000 real do mesmo projeto). Duas defesas, nesta ordem:
--    1) o próprio regex de extração de N aceita só 1-2 dígitos
--       ([1-9][0-9]?) — uma largura absurdamente grande (ex.: 12+
--       dígitos) nunca chega a ser capturada, então nunca é convertida
--       para integer (sem risco de overflow na conversão);
--    2) a largura capturada (agora garantidamente segura para cast,
--       0-99) é checada numericamente contra a faixa 1..10 — coerente
--       com sequencial_atual ser integer (até 10 dígitos). O truncamento
--       em si é resolvido em aplicar_formato_numero_of, usando a largura
--       como MÍNIMO (greatest(N, largura real do valor)), nunca como
--       teto. Tamanho total do formato também limitado (60 caracteres)
--       como defesa adicional contra formato patológico.
create or replace function public.validar_formato_numero_of(p_formato text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_qtd_numero_projeto integer;
  v_qtd_sequencial integer;
  v_sem_tokens text;
  v_largura integer;
begin
  if p_formato is null or length(btrim(p_formato)) = 0 then
    return false;
  end if;

  if length(p_formato) > 60 then
    return false;
  end if;

  select count(*) into v_qtd_numero_projeto from regexp_matches(p_formato, '\{numero_projeto\}', 'g');
  select count(*) into v_qtd_sequencial from regexp_matches(p_formato, '\{sequencial:[1-9][0-9]?\}', 'g');

  if v_qtd_numero_projeto <> 1 or v_qtd_sequencial <> 1 then
    return false;
  end if;

  -- Captura já garantida segura para cast (regex acima só aceita 1-2
  -- dígitos, no máximo 99) — a faixa de negócio real (1..10) é checada
  -- aqui, depois da conversão, nunca antes.
  v_largura := (regexp_match(p_formato, '\{sequencial:([1-9][0-9]?)\}'))[1]::integer;
  if v_largura < 1 or v_largura > 10 then
    return false;
  end if;

  -- Depois de remover os dois tokens reconhecidos (exatamente uma vez
  -- cada, já garantido acima), nenhuma chave { ou } pode sobrar — pega
  -- token não reconhecido ou malformado.
  v_sem_tokens := regexp_replace(
    regexp_replace(p_formato, '\{numero_projeto\}', '', 'g'),
    '\{sequencial:[1-9][0-9]?\}', '', 'g'
  );

  return v_sem_tokens !~ '[{}]';
end;
$$;

comment on function public.validar_formato_numero_of(text) is
  '4D0: valida que o formato contém exatamente um {numero_projeto} e um {sequencial:N} com N em 1..10, sem nenhum outro token de chave, e comprimento total até 60 caracteres.';

-- CORREÇÃO (achado real, confirmado empiricamente contra o vinculado):
-- revogar de public, anon, authenticated NÃO remove o EXECUTE de
-- service_role — Supabase concede EXECUTE a service_role de forma
-- independente do grant a PUBLIC (confirmado testando sync_estado_of(),
-- já em produção desde a primeira fatia com exatamente este padrão de
-- REVOKE incompleto: has_function_privilege('service_role', ...)
-- retorna true mesmo com o REVOKE de public/anon/authenticated já
-- aplicado). As três funções internas desta migration passam a incluir
-- service_role explicitamente em todo REVOKE, mesmo padrão já usado em
-- gerar_numero_of e set_ordem_fabricacao_numero abaixo.
revoke execute on function public.validar_formato_numero_of(text) from public, anon, authenticated, service_role;

alter table public.numeracao_of_formato
  add constraint numeracao_of_formato_formato_valido_chk
    check (public.validar_formato_numero_of(formato));

-- CORREÇÃO (achado real): N é largura MÍNIMA — lpad(valor, greatest(N,
-- comprimento real do valor), '0') nunca trunca, só preenche quando o
-- valor é mais estreito que N. p_sequencial nulo/<1 é rejeitado
-- explicitamente — esta função nunca formata um sequencial inválido,
-- mesmo se chamada fora do caminho normal de gerar_numero_of.
create or replace function public.aplicar_formato_numero_of(p_formato text, p_numero_projeto text, p_sequencial integer)
returns text
language plpgsql
immutable
as $$
declare
  v_largura integer;
  v_resultado text;
begin
  if p_sequencial is null or p_sequencial < 1 then
    raise exception 'aplicar_formato_numero_of: sequencial deve ser um inteiro maior ou igual a 1, recebido %', p_sequencial;
  end if;

  v_largura := (regexp_match(p_formato, '\{sequencial:([1-9][0-9]?)\}'))[1]::integer;
  v_resultado := replace(p_formato, '{numero_projeto}', p_numero_projeto);
  v_resultado := regexp_replace(
    v_resultado,
    '\{sequencial:[1-9][0-9]?\}',
    lpad(p_sequencial::text, greatest(v_largura, length(p_sequencial::text)), '0')
  );
  return v_resultado;
end;
$$;

comment on function public.aplicar_formato_numero_of(text, text, integer) is
  '4D0: substitui {numero_projeto} e {sequencial:N} pelos valores reais. N é largura MÍNIMA (nunca trunca — lpad usa greatest(N, comprimento real)). Rejeita sequencial nulo ou menor que 1.';

revoke execute on function public.aplicar_formato_numero_of(text, text, integer) from public, anon, authenticated, service_role;

-- ACL: config sensível — só SELECT para admin da própria empresa, nenhuma
-- escrita liberada a authenticated (mesmo achado real de pg_default_acl já
-- documentado nas migrations anteriores do 4D0 — authenticated precisa
-- aparecer explicitamente no REVOKE, sempre antes de qualquer GRANT).
alter table public.numeracao_of_formato enable row level security;

create policy numeracao_of_formato_select_admin
  on public.numeracao_of_formato
  for select
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

revoke all on public.numeracao_of_formato from public, anon, authenticated;
grant select on public.numeracao_of_formato to authenticated;

-- 4. Seed — só ENIFER (f835684a-0400-43a5-ba54-dd4629230c3c), formato
--    aprovado explicitamente. NEXOTFE Demo (d7b40f3a-91f9-492a-893e-
--    50770480327b) permanece sem linha, de propósito — criar OF para ela
--    vai falhar com o erro explícito de gerar_numero_of até alguém
--    configurar o formato dela. created_by = Thiago Teodoro
--    (7c2ca3b6-f2bd-4eed-bbdb-5cbb3440a349), admin real de ENIFER.
insert into public.numeracao_of_formato (empresa_id, formato, created_by)
values (
  'f835684a-0400-43a5-ba54-dd4629230c3c',
  '{numero_projeto}-{sequencial:4}',
  '7c2ca3b6-f2bd-4eed-bbdb-5cbb3440a349'
);

-- 5. Contador transacional por empresa+projeto. Nunca decrementado, nunca
--    resetado (cada projeto novo começa do zero, isolado na própria
--    chave empresa+projeto) — número nunca reutilizado por construção,
--    já que só incrementa.
create table public.numeracao_of_projeto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  projeto_id uuid not null,
  sequencial_atual integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.numeracao_of_projeto is
  '4D0: contador do próximo sequencial de numero_of por (empresa_id, projeto_id). Só gerar_numero_of (SECURITY DEFINER) escreve — nenhum GRANT de escrita a authenticated.';

alter table public.numeracao_of_projeto
  add constraint numeracao_of_projeto_empresa_projeto_uniq unique (empresa_id, projeto_id),
  add constraint numeracao_of_projeto_projeto_empresa_fkey
    foreign key (projeto_id, empresa_id) references public.projetos (id, empresa_id),
  add constraint numeracao_of_projeto_sequencial_chk check (sequencial_atual >= 0);

alter table public.numeracao_of_projeto enable row level security;

create policy numeracao_of_projeto_select_admin
  on public.numeracao_of_projeto
  for select
  to authenticated
  using (empresa_id = public.empresa_atual_id() and public.usuario_e_admin());

revoke all on public.numeracao_of_projeto from public, anon, authenticated;
grant select on public.numeracao_of_projeto to authenticated;

-- 6. gerar_numero_of — SECURITY DEFINER: precisa escrever
--    numeracao_of_projeto, que authenticated não pode tocar diretamente.
--    Sem fallback: empresa sem formato configurado aborta com erro
--    explícito, nunca cai para gerar_numero_entidade('of') nem qualquer
--    outro formato implícito. Chamada só pelo trigger
--    set_ordem_fabricacao_numero (ajustado abaixo) — sem GRANT EXECUTE
--    para nenhum papel de cliente, mesmo padrão de função interna já
--    usado em toda a primeira fatia.
create or replace function public.gerar_numero_of(p_projeto_id uuid)
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

  select numero_projeto into v_numero_projeto
  from public.projetos
  where id = p_projeto_id
    and empresa_id = v_empresa_id;

  if not found then
    raise exception 'Projeto % nao encontrado na empresa atual.', p_projeto_id;
  end if;

  -- Auto-provisiona o contador do projeto na primeira OF (mesmo padrão de
  -- ON CONFLICT DO NOTHING já usado em gerar_numero_entidade) — depois
  -- disso, o UPDATE abaixo, filtrado pela chave única
  -- (empresa_id, projeto_id), é o que serializa chamadas concorrentes
  -- para o mesmo projeto (a segunda espera o lock de linha da primeira).
  insert into public.numeracao_of_projeto (empresa_id, projeto_id, sequencial_atual)
  values (v_empresa_id, p_projeto_id, 0)
  on conflict (empresa_id, projeto_id) do nothing;

  update public.numeracao_of_projeto
  set sequencial_atual = sequencial_atual + 1, updated_at = now()
  where empresa_id = v_empresa_id
    and projeto_id = p_projeto_id
  returning sequencial_atual into v_sequencial;

  return public.aplicar_formato_numero_of(v_formato, v_numero_projeto, v_sequencial);
end;
$$;

comment on function public.gerar_numero_of(uuid) is
  '4D0: gera o próximo numero_of para o projeto informado, usando o formato configurado da empresa atual. Sem fallback — aborta se a empresa não tiver formato configurado. Contador transacional por (empresa_id, projeto_id), nunca reutilizado. EXECUTE nunca concedido a nenhum papel de cliente (nem authenticated, nem service_role) — chamada só por set_ordem_fabricacao_numero (também SECURITY DEFINER), nunca diretamente.';

revoke execute on function public.gerar_numero_of(uuid) from public, anon, authenticated, service_role;

-- 7. Trigger de numeração passa a usar gerar_numero_of (por projeto), não
--    mais gerar_numero_entidade('of') (por empresa inteira, sem reset).
--    ordens_fabricacao.projeto_id é NOT NULL — sem ramo de fallback
--    necessário. gerar_numero_entidade('of') e numeracao_configuracoes
--    permanecem intocados (ainda usados por entidade='projeto',
--    fora do escopo desta migration).
--
-- CORREÇÃO (achado real em preflight isolado): SECURITY DEFINER não
-- dispensa QUEM CHAMA a função de precisar de EXECUTE — só define com
-- que privilégio o corpo roda depois de a chamada já ter sido permitida.
-- set_ordem_fabricacao_numero, sendo SECURITY INVOKER (como sempre foi),
-- roda como o papel que insere em ordens_fabricacao (authenticated) — e
-- é authenticated quem precisaria de EXECUTE em gerar_numero_of para
-- chamá-la dali de dentro, mesmo gerar_numero_of sendo DEFINER. Conceder
-- esse EXECUTE a authenticated foi explicitamente rejeitado: permitiria
-- o cliente chamar gerar_numero_of diretamente, consumindo sequenciais
-- e criando lacunas sem nunca criar uma OF. Corrigido tornando também
-- set_ordem_fabricacao_numero SECURITY DEFINER — a chamada interna a
-- gerar_numero_of passa a ser avaliada com o privilégio do DONO de
-- set_ordem_fabricacao_numero (que já tem acesso irrestrito por ser o
-- dono/superusuário da migration), não mais o de authenticated. O
-- trigger continua o único caminho operacional: nenhuma EXECUTE é
-- concedida a nenhum papel de cliente em nenhuma das duas funções (ver
-- REVOKE explícito logo abaixo).
create or replace function public.set_ordem_fabricacao_numero()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.numero_of is null or trim(new.numero_of) = '' then
    new.numero_of := public.gerar_numero_of(new.projeto_id);
  end if;
  return new;
end;
$$;

-- Função pré-existente (criada antes do 4D0, nunca teve REVOKE explícito
-- aplicado) — agora SECURITY DEFINER, precisa da mesma disciplina de ACL
-- já usada em toda função nova do 4D0: revogar de todos os papéis de
-- cliente, incluindo service_role, explicitamente antes de qualquer
-- outra coisa. O mecanismo de trigger não exige EXECUTE do papel que
-- insere — só chamadas diretas (que este REVOKE bloqueia) precisariam.
revoke execute on function public.set_ordem_fabricacao_numero() from public, anon, authenticated, service_role;

-- 8. Imutabilidade estrutural de numero_of — incondicional, para
--    qualquer executor (authenticated, service_role, dono, qualquer
--    função SECURITY DEFINER futura), sem exceção. Sem SECURITY DEFINER
--    aqui de propósito: um trigger BEFORE já dispara para todo executor
--    da instrução UPDATE, mesmo raciocínio já comprovado em
--    bloquear_delete_fisico_of (4D0-A) para DELETE. Dispara sempre que
--    numero_of aparece na cláusula SET, mesmo com valor idêntico ao
--    atual — "nunca alterado por UPDATE" tratado sem exceção de
--    valor-idêntico. numero_of continua livremente preenchível no
--    INSERT (trigger é BEFORE UPDATE OF, não BEFORE INSERT).
create or replace function public.bloquear_alteracao_numero_of()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  raise exception 'ordens_fabricacao: numero_of e imutavel apos a criacao - UPDATE de numero_of nao e permitido, mesmo por funcao SECURITY DEFINER, service_role ou proprietario.';
  return null;
end;
$$;

revoke execute on function public.bloquear_alteracao_numero_of() from public, anon, authenticated, service_role;

create trigger bloquear_alteracao_numero_of
  before update of numero_of on public.ordens_fabricacao
  for each row
  execute function public.bloquear_alteracao_numero_of();

-- 9. Proteção estrutural contra duas OFs-raiz para o mesmo
--    projeto_item_id — filhas de divisão (of_pai_id preenchido, fora
--    desta fatia) não entram nesta restrição, várias podem
--    legitimamente compartilhar a origem conceitual de uma mesma mãe.
create unique index ordens_fabricacao_projeto_item_raiz_uniq
  on public.ordens_fabricacao (projeto_item_id)
  where projeto_item_id is not null and of_pai_id is null;

commit;
