-- Sincroniza numeracao_configuracoes.sequencia_atual de 11 para 12 para a
-- ENIFER (entidade='projeto'), fechando a lacuna criada por uma insercao
-- manual de numero_projeto='260012' que bypassou set_projeto_numero()
-- (o trigger so age quando numero_projeto chega NULL/vazio na linha
-- inserida - um valor ja preenchido pula gerar_numero_entidade() inteira,
-- entao o contador nunca avancou). Root cause confirmado por investigacao
-- read-only real: numeracao_configuracoes.updated_at ficou parado no
-- instante exato de criacao do projeto 260011 (ultimo numero realmente
-- auto-gerado), enquanto o 260012 foi criado 5 dias depois sem tocar o
-- contador - toda tentativa seguinte de criar projeto recalcula "260012"
-- de novo e colide com projetos_numero_projeto_empresa_key (23505).
--
-- Fail-closed QUANDO A ENIFER EXISTE neste ambiente: qualquer premissa que
-- nao bater aborta via RAISE EXCEPTION, revertendo a transacao inteira
-- antes do COMMIT - nunca corrige as cegas, nunca assume que o estado
-- investigado ainda vale no momento da aplicacao real.
--
-- Fail-OPEN (RAISE NOTICE, sem erro, sem alteracao) QUANDO A ENIFER NAO
-- EXISTE neste ambiente - correcao desta rodada (revisao humana explicita,
-- Opcao B): o UUID e hardcoded (nunca nome/e-mail, que podem mudar ou nao
-- existir da mesma forma em outro ambiente) e essa migration entra na
-- cadeia PERMANENTE de migrations do projeto - sem essa distincao, ela
-- quebraria TODO "supabase db reset" local, clone novo do repositorio ou
-- CI que reconstrua o banco do zero (nenhum desses ambientes tem o dado
-- real da ENIFER) - confirmado empiricamente nesta rodada com um Postgres
-- descartavel fabricado sem essa empresa. A distincao e estritamente entre
-- "empresa nao existe aqui" (ambiente diferente, nada a fazer, sem erro) e
-- "empresa existe mas o estado diverge do investigado" (configuracao
-- ausente/duplicada/inativa/formula diferente/numero ja avancado - todos
-- estes CONTINUAM abortando via excecao, exatamente como antes).
--
-- Escopo desta migration, deliberadamente limitado (revisao humana
-- explicita): SOMENTE a sincronizacao pontual do contador da ENIFER.
-- NAO inclui (ficam para migrations/mudancas separadas, em checkpoints
-- proprios): bloqueio de numero_projeto explicito no fluxo normal,
-- procedimento administrativo de importacao excepcional, nem a mensagem
-- de erro traduzida na interface.
begin;

do $$
declare
  -- ID imutavel da ENIFER, ja confirmado por investigacao read-only real
  -- contra o vinculado - nao resolvido por e-mail/nome aqui (poderiam
  -- mudar ou nao existir da mesma forma em outro ambiente).
  v_empresa_id constant uuid := 'f835684a-0400-43a5-ba54-dd4629230c3c';

  v_empresa_existe boolean;
  v_config_id uuid;
  v_sequencia_atual int;
  v_ativo boolean;
  v_prefixo text;
  v_ano text;
  v_tamanho_sequencia int;
  v_mascara text;
  v_total_configs int;
  v_maior_numero text;
  v_numero_previsto text;
  v_existe_260013 boolean;
  v_linhas_atualizadas int;
  v_sequencia_pos_update int;
begin
  -- 0. Fail-OPEN: se a empresa (pelo UUID imutavel) nao existe NESTE
  -- ambiente, nao ha nada da ENIFER para corrigir aqui - termina sem
  -- erro, sem tocar em nada, ANTES de qualquer lock. Isso preserva
  -- "supabase db reset"/CI/clone novo funcionando normalmente. Se a
  -- empresa EXISTIR, cai no fluxo fail-closed de sempre (passos 1-7
  -- abaixo), sem excecao alguma.
  select exists(
    select 1 from public.empresas where id = v_empresa_id
  ) into v_empresa_existe;

  if not v_empresa_existe then
    raise notice 'Empresa (UUID %) nao existe neste ambiente - nada da ENIFER para corrigir aqui (ambiente sem esse dado, ex.: local/CI/banco novo). Migration concluida SEM ALTERACAO.', v_empresa_id;
    return;
  end if;

  -- 1. Empresa existe: dai em diante, TODAS as premissas sao obrigatorias
  -- - qualquer divergencia aborta a transacao inteira (fail-closed).
  -- Bloqueia INSERT/UPDATE/DELETE concorrente em projetos pelo resto
  -- desta transacao (SHARE conflita com ROW EXCLUSIVE, o modo que
  -- INSERT/UPDATE/DELETE tomam - SELECTs de outras sessoes continuam
  -- livres). NOWAIT: se outra sessao ja segura lock incompativel, aborta
  -- IMEDIATAMENTE em vez de esperar - uma correcao de producao nunca deve
  -- ficar pendurada.
  lock table public.projetos in share mode nowait;

  select count(*) into v_total_configs
    from public.numeracao_configuracoes
   where empresa_id = v_empresa_id and entidade = 'projeto';
  if v_total_configs <> 1 then
    raise exception 'Esperava exatamente 1 configuracao de numeracao para projeto, encontrei % - abortando.', v_total_configs;
  end if;

  -- 2. Trava a propria linha da config (FOR UPDATE NOWAIT) - impede outra
  -- sessao de tambem tentar corrigir/incrementar ao mesmo tempo; aborta
  -- na hora se ja estiver travada em vez de esperar.
  select id, sequencia_atual, ativo, prefixo, ano, tamanho_sequencia, mascara
    into v_config_id, v_sequencia_atual, v_ativo, v_prefixo, v_ano, v_tamanho_sequencia, v_mascara
    from public.numeracao_configuracoes
   where empresa_id = v_empresa_id and entidade = 'projeto'
   for update nowait;

  -- 3. Valida a FORMULA INTEIRA (nao so sequencia_atual) contra o que a
  -- investigacao confirmou - qualquer campo divergente aborta, nunca
  -- presume que nada mudou desde a investigacao.
  if v_ativo is not true then
    raise exception 'Configuracao de numeracao nao esta ativa - abortando.';
  end if;
  if v_sequencia_atual <> 11 then
    raise exception 'sequencia_atual esperada=11, encontrada=% - estado mudou desde a investigacao, abortando.', v_sequencia_atual;
  end if;
  if coalesce(v_prefixo, '') <> '' then
    raise exception 'prefixo esperado vazio/nulo, encontrado=% - abortando (formula pode ter mudado).', v_prefixo;
  end if;
  if v_ano is distinct from '26' then
    raise exception 'ano esperado=26, encontrado=% - abortando.', v_ano;
  end if;
  if v_tamanho_sequencia <> 4 then
    raise exception 'tamanho_sequencia esperado=4, encontrado=% - abortando.', v_tamanho_sequencia;
  end if;
  if v_mascara is distinct from 'AANNNN' then
    raise exception 'mascara esperada=AANNNN, encontrada=% - abortando.', v_mascara;
  end if;

  -- 4. Recalcula pela formula COMPLETA (com greatest(), replicando
  -- exatamente a logica vigente de gerar_numero_entidade()) e confere
  -- contra o 260012 ja existente - nunca chama a funcao real (que tem
  -- efeito colateral de incrementar), so reproduz o calculo em SQL puro.
  v_numero_previsto := concat_ws('', v_prefixo, v_ano,
    lpad((v_sequencia_atual + 1)::text,
         greatest(v_tamanho_sequencia, length((v_sequencia_atual + 1)::text)),
         '0'));
  if v_numero_previsto <> '260012' then
    raise exception 'Formula completa preve numero=% (esperava 260012, o ja existente) - formula pode ter mudado desde a investigacao, abortando.', v_numero_previsto;
  end if;

  -- 5. Reconfirma o maior numero regular e a ausencia de 260013 - AGORA
  -- com o lock de tabela ja tomado no passo 1, entao nenhuma insercao
  -- concorrente pode ter acontecido entre esta checagem e o UPDATE abaixo.
  select max(numero_projeto) into v_maior_numero
    from public.projetos
   where empresa_id = v_empresa_id and numero_projeto ~ '^26[0-9]{4}$';
  if v_maior_numero is distinct from '260012' then
    raise exception 'maior numero_projeto regular esperado=260012, encontrado=% - abortando.', v_maior_numero;
  end if;

  select exists(
    select 1 from public.projetos
     where empresa_id = v_empresa_id and numero_projeto = '260013'
  ) into v_existe_260013;
  if v_existe_260013 then
    raise exception '260013 ja existe - premissa de proximo numero livre invalida, abortando.';
  end if;

  -- 6. UPDATE guardado - exclusivamente de 11 para 12, nunca um valor
  -- calculado/generico.
  update public.numeracao_configuracoes
     set sequencia_atual = 12,
         updated_at = now()
   where id = v_config_id
     and sequencia_atual = 11;

  get diagnostics v_linhas_atualizadas = row_count;
  if v_linhas_atualizadas <> 1 then
    raise exception 'UPDATE afetou % linha(s), esperava exatamente 1 - abortando.', v_linhas_atualizadas;
  end if;

  -- 7. Pos-verificacao DENTRO da mesma transacao, antes do commit - nunca
  -- presume que o UPDATE fez o esperado so porque o rowcount bateu.
  select sequencia_atual into v_sequencia_pos_update
    from public.numeracao_configuracoes
   where id = v_config_id;
  if v_sequencia_pos_update <> 12 then
    raise exception 'Pos-verificacao: sequencia_atual=% apos o UPDATE, esperava 12 - abortando.', v_sequencia_pos_update;
  end if;

  raise notice 'OK: numeracao_configuracoes da ENIFER (entidade=projeto) sincronizada de 11 para 12 - formula completa validada, lock de concorrencia mantido durante toda a transacao, pos-verificacao confirmada. Proxima criacao de projeto pela interface deve receber 260013.';
end $$;

commit;
