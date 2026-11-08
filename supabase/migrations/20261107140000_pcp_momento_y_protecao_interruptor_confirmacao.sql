-- NEXOTFE — Momento Y: proteção do interruptor dentro de
-- confirmar_necessidades_momento_y (Etapas 63/63A/63B)
--
-- *** MIGRATION CANDIDATA — ARTEFATO DE DESENVOLVIMENTO ***
-- Autorizada exclusivamente para criação e validação em sandbox Docker
-- descartável (CLAUDE.md Regra 2/9, autorização explícita da Etapa
-- 63B: "Autorizada a criação e validação local da migration candidata.
-- Não autorizada a aplicação em produção."). NÃO EXECUTAR contra o
-- banco remoto/produção (`supabase db push` ou equivalente) sem
-- autorização expressa, separada, por escrita específica. Nenhuma
-- linha deste arquivo foi aplicada a nenhum ambiente além do sandbox
-- local descartável até o momento em que este comentário foi escrito.
--
-- Fonte de verdade (Etapa 63B, item 1): corpo integral obtido via
-- pg_get_functiondef direto da produção (--linked) e comparado byte a
-- byte contra o texto já commitado em
-- 20261104120000_pcp_momento_y_confirmacao_necessidades_revisao4.sql.
-- Única divergência encontrada foi cosmética (formatação do cabeçalho
-- da assinatura — CREATE OR REPLACE FUNCTION normalizado pelo
-- pg_get_functiondef vs. a formatação original do autor; `$function$`
-- sem `;` final) — nenhuma diferença de lógica. Esta migration parte,
-- portanto, do texto já correto e vigente em produção, nunca de uma
-- versão anterior.
--
-- Achado de segurança (Etapa 63/63A, confirmado por leitura direta do
-- código em produção + reproduzido empiricamente em sandbox Docker
-- descartável, inclusive sob concorrência real): esta função nunca
-- verificava o interruptor por empresa
-- (pcp.ci_ce_momento_y.ativo, public.configuracoes_empresa) — só a
-- LEITURA (determinar_regime_momento_y_of/sugerir_proposta_momento_y)
-- usa momento_y_ativo_para_empresa, e só como diagnóstico (ver
-- comentário de buscarPropostaMomentoY.ts). Isso significa que, mesmo
-- com o interruptor desligado para uma empresa, qualquer usuário
-- PCP/ADM autorizado podia confirmar necessidades reais (reservar
-- estoque, gerar requisição de compra) chamando esta RPC diretamente —
-- authenticated tem EXECUTE nela, então a proteção que existia (Server
-- Action, Etapa 63) era só de interface, inteiramente contornável por
-- quem tivesse um JWT válido com papel PCP/ADM. Testado e confirmado em
-- sandbox local: com o interruptor desligado, a função ANTES desta
-- migration aceitava a confirmação normalmente (reservou estoque, gerou
-- requisição de compra, marcou a OF como confirmada).
--
-- Alteração: ÚNICO bloco novo, reaproveitando momento_y_ativo_para_empresa
-- (já existente, já usada pela leitura) — nenhuma tabela, função, lock
-- ou coluna nova. Inserido entre a checagem de estado_aprovacao e a de
-- necessidades_confirmadas_em, dentro da MESMA transação já protegida
-- pelo pg_advisory_xact_lock('of-transicao:'||p_of_id) adquirido acima
-- — mesma semântica de concorrência das demais checagens de
-- elegibilidade (estado final/aprovação/já confirmada): um valor lido
-- uma vez dentro da transação.
--
-- Concorrência do PRÓPRIO interruptor (distinto do advisory lock da
-- OF, que serializa transições da OF, nunca o toggle por empresa —
-- não é o mesmo recurso, e esta migration não afirma que um protege o
-- outro): se o interruptor for desligado por um administrador
-- enquanto uma confirmação já passou desta checagem e está em
-- andamento, essa confirmação específica completa normalmente até o
-- fim da sua própria transação — mesmo comportamento de qualquer
-- outra leitura-então-ação dentro de uma transação já em voo em
-- PostgreSQL (read committed), e aceitável aqui: o objetivo desta
-- proteção é impedir que uma confirmação COMECE com o interruptor
-- desligado, nunca interromper uma transação já em andamento no meio.
-- Uma race em sentido contrário (ligar o interruptor um instante
-- depois da checagem falhar) simplesmente faz a PRÓXIMA tentativa de
-- confirmação (nova chamada, nova transação) ver o valor atualizado —
-- comportamento correto e esperado de um toggle de configuração.
--
-- Todo o restante da função (autenticação, papel PCP/ADM, isolamento
-- multiempresa, advisory lock, estados finais/aprovação, confirmação
-- única, releitura/comparação do BOM, consolidação e observações
-- técnicas, reservas CI, geração CE, bloqueio FOR UPDATE do saldo,
-- histórico/rastreabilidade) permanece byte-a-byte idêntico à Revisão
-- 4 (20261104120000) — nada removido, nada reordenado além da inserção
-- do bloco novo.
--
-- OFs em regime legado nunca chamam esta função: determinar_regime_momento_y_of
-- só resolve pendente_momento_y para uma OF que ainda não tem nenhuma
-- linha em necessidades_of_material — toda OF legada já tem essas
-- linhas, geradas por gerar_necessidades_de_of dentro de aprovar_of,
-- muito antes de qualquer confirmação via Momento Y ser cogitada.
-- aprovar_of/decidir_ci_ce_de_of/gerar_necessidades_de_of continuam
-- inteiramente intocadas por esta migration — nenhum comportamento
-- legado muda.
--
-- Testado em sandbox Docker local descartável (Etapa 63B, destruído ao
-- final): interruptor desligado → rejeitado (nenhuma linha gravada,
-- nenhuma reserva, nenhuma requisição); interruptor ligado → confirma
-- normalmente, com CI/CE/atendimento parcial corretos; usuário
-- sem papel PCP/ADM → rejeitado; saldo insuficiente → rejeitado,
-- atômico; BOM alterado entre leitura e confirmação → rejeitado;
-- observações divergentes → rejeitado; duas confirmações disparadas em
-- paralelo de verdade na mesma OF → uma teve sucesso, a outra foi
-- rejeitada com "já confirmado" (lock provado sob concorrência real).
create or replace function public.confirmar_necessidades_momento_y(
  p_of_id uuid,
  p_proposta_original jsonb,
  p_itens_confirmados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_uid uuid;
  v_empresa_id uuid;
  v_of record;
  v_rows integer;
  v_fresco record;
  v_qtd_original numeric;
  v_qtd_count_original integer;
  v_qtd_count_fresco integer;
  v_item record;
  v_unidade_mp text;
  v_necessidade_id uuid;
  v_saldo_livre numeric;
  v_quantidade_ce numeric;
  v_requisicao_id uuid;
  v_total_itens integer := 0;
  v_total_ci integer := 0;
  v_total_ce integer := 0;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'confirmar_necessidades_momento_y: sessao invalida.';
  end if;

  v_empresa_id := public.empresa_atual_id();
  if v_empresa_id is null then
    raise exception 'confirmar_necessidades_momento_y: empresa atual nao encontrada.';
  end if;

  if not (coalesce(public.usuario_e_admin(), false) or coalesce(public.usuario_tem_papel_funcional('pcp'), false)) then
    raise exception 'confirmar_necessidades_momento_y: usuario sem permissao para confirmar necessidades.';
  end if;

  perform 1 from public.ordens_fabricacao where id = p_of_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'confirmar_necessidades_momento_y: OF nao encontrada.';
  end if;

  -- Mesma família de advisory lock de aprovar_of/cancelar_of/liberar_of/
  -- registrar_retirada_material_of — serializa contra qualquer
  -- transição concorrente desta mesma OF, inclusive cancelamento.
  perform pg_advisory_xact_lock(hashtextextended('of-transicao:' || p_of_id::text, 0));

  -- Relê a OF sob o lock — nunca confia na primeira leitura, mesmo
  -- padrão de toda função de transição de OF já existente.
  select * into v_of
  from public.ordens_fabricacao
  where id = p_of_id and empresa_id = v_empresa_id;

  if not found then
    raise exception 'confirmar_necessidades_momento_y: OF % nao encontrada na empresa %.', p_of_id, v_empresa_id;
  end if;

  -- CORRECAO EXPERIMENTAL A (Etapa 9/10/11): antes bloqueava so 'cancelada'.
  -- 2O.5H (posterior a esta candidata) tornou definitivo que OF em
  -- qualquer estado final (concluida/cancelada/desdobrada) fica congelada
  -- operacionalmente - estende aqui pelo mesmo motivo, sem alterar o lock
  -- (of-transicao, ja adquirido acima, ja e suficiente).
  if v_of.estado_execucao in ('cancelada', 'concluida', 'desdobrada') then
    raise exception 'confirmar_necessidades_momento_y: OF % esta em estado final (%) - nao e possivel confirmar necessidades.', p_of_id, v_of.estado_execucao;
  end if;

  if v_of.estado_aprovacao is distinct from 'aprovada' then
    raise exception 'confirmar_necessidades_momento_y: OF % nao esta aprovada.', p_of_id;
  end if;

  -- ETAPA 63B — ÚNICO acréscimo desta migration. Mesma função já usada
  -- pela leitura (momento_y_ativo_para_empresa), chamada aqui dentro do
  -- mesmo lock/transação desta função - nenhum lock novo, nenhuma
  -- tabela nova. Sem isto, a confirmação real nunca dependia do
  -- interruptor - só a interface (Server Action) impedia, e isso era
  -- contornável chamando a RPC diretamente (ver cabeçalho desta
  -- migration para o achado completo).
  if not public.momento_y_ativo_para_empresa(v_empresa_id) then
    raise exception 'confirmar_necessidades_momento_y: confirmacao de materias-primas via Momento Y nao esta habilitada para esta empresa.';
  end if;

  if v_of.necessidades_confirmadas_em is not null then
    raise exception 'confirmar_necessidades_momento_y: OF % ja teve o Momento Y confirmado em % por %.', p_of_id, v_of.necessidades_confirmadas_em, v_of.necessidades_confirmadas_por;
  end if;

  -- =====================================================================
  -- Investigação A — recomputa a proposta ORIGINAL (nunca a lista
  -- editada pelo PCP) o mais tarde possível antes de gravar qualquer
  -- coisa, e compara contra o que o cliente capturou na abertura da
  -- tela. Divergência (material novo/removido ou quantidade sugerida
  -- diferente) = o BOM mudou durante a revisão - recusa, preserva os
  -- dados editados (devolvidos pela exceção) para nova conferência.
  -- =====================================================================
  select count(*) into v_qtd_count_original from jsonb_array_elements(p_proposta_original);

  v_qtd_count_fresco := 0;
  for v_fresco in select * from public.calcular_proposta_bom_of(p_of_id, v_empresa_id)
  loop
    v_qtd_count_fresco := v_qtd_count_fresco + 1;

    select (item->>'quantidade_sugerida')::numeric into v_qtd_original
    from jsonb_array_elements(p_proposta_original) as item
    where (item->>'materia_prima_id')::uuid = v_fresco.materia_prima_id;

    if v_qtd_original is null or v_qtd_original is distinct from v_fresco.quantidade_sugerida then
      raise exception 'confirmar_necessidades_momento_y: a proposta de materiais mudou desde a abertura da tela (material %, sugestao atual %) - releia a proposta antes de confirmar.', v_fresco.materia_prima_id, v_fresco.quantidade_sugerida;
    end if;
  end loop;

  if v_qtd_count_original <> v_qtd_count_fresco then
    raise exception 'confirmar_necessidades_momento_y: a proposta de materiais mudou desde a abertura da tela (quantidade de itens difere: original=%, atual=%) - releia a proposta antes de confirmar.', v_qtd_count_original, v_qtd_count_fresco;
  end if;

  -- =====================================================================
  -- Gravação das necessidades oficiais + decisão CI/CE do PCP, por
  -- material consolidado. Agrupa defensivamente por materia_prima_id -
  -- nunca confia que o cliente já consolidou materiais iguais
  -- (consolidação é regra de negócio aprovada, aplicada aqui, não só
  -- na interface).
  -- =====================================================================
  for v_item in
    select
      x.materia_prima_id,
      x.origem_fornecimento,
      sum(x.quantidade_confirmada) as quantidade_confirmada,
      sum(coalesce(x.quantidade_ci, 0)) as quantidade_ci,
      max(trim(coalesce(x.observacao_tecnica, ''))) as observacao_tecnica,
      count(distinct trim(coalesce(x.observacao_tecnica, ''))) as qtd_observacoes_distintas
    from jsonb_to_recordset(p_itens_confirmados) as x(
      materia_prima_id uuid,
      origem_fornecimento text,
      quantidade_confirmada numeric,
      quantidade_ci numeric,
      observacao_tecnica text
    )
    group by x.materia_prima_id, x.origem_fornecimento
  loop
    -- CORRECAO EXPERIMENTAL B (Etapa 9/10/11): antes concatenava
    -- observacoes divergentes com string_agg. Normalizacao idêntica ao
    -- mock (trim + coalesce para ''; vazio e divergente de preenchido,
    -- nunca tratado como "sem opiniao"). Rejeita explicitamente - nunca
    -- escolhe nem concatena.
    if v_item.qtd_observacoes_distintas > 1 then
      raise exception 'confirmar_necessidades_momento_y: observacoes tecnicas divergentes para o material % (origem %) - revise e unifique antes de confirmar.', v_item.materia_prima_id, v_item.origem_fornecimento;
    end if;

    if v_item.quantidade_confirmada is null or v_item.quantidade_confirmada <= 0 then
      raise exception 'confirmar_necessidades_momento_y: quantidade confirmada invalida para o material %.', v_item.materia_prima_id;
    end if;

    if coalesce(v_item.origem_fornecimento, 'empresa') not in ('empresa', 'cliente') then
      raise exception 'confirmar_necessidades_momento_y: origem_fornecimento invalida (%) para o material % - use ''empresa'' ou ''cliente''.', v_item.origem_fornecimento, v_item.materia_prima_id;
    end if;
    v_item.origem_fornecimento := coalesce(v_item.origem_fornecimento, 'empresa');

    -- REVISÃO 3 (correção H): material fornecido pelo cliente nunca gera
    -- reserva CI nem requisicao CE - mas isso é REJEITADO explicitamente
    -- quando o chamador submete quantidade_ci incompatível (> 0), nunca
    -- corrigido silenciosamente para 0. Ausência de quantidade_ci (NULL)
    -- é tratada como zero implícito - não é uma correção de um valor
    -- incompatível, é a leitura natural de "nada foi informado".
    if v_item.origem_fornecimento = 'cliente' and coalesce(v_item.quantidade_ci, 0) <> 0 then
      raise exception 'confirmar_necessidades_momento_y: material % tem origem_fornecimento=''cliente'' mas quantidade_ci=% - material fornecido pelo cliente nao pode ter reserva CI propria, corrija o formulario antes de confirmar.', v_item.materia_prima_id, v_item.quantidade_ci;
    end if;
    v_item.quantidade_ci := coalesce(v_item.quantidade_ci, 0);

    if v_item.quantidade_ci < 0 or v_item.quantidade_ci > v_item.quantidade_confirmada then
      raise exception 'confirmar_necessidades_momento_y: quantidade CI invalida para o material % (CI=%, confirmado=%) - CI nao pode exceder a quantidade confirmada.', v_item.materia_prima_id, v_item.quantidade_ci, v_item.quantidade_confirmada;
    end if;

    select unidade into v_unidade_mp
    from public.materias_primas
    where id = v_item.materia_prima_id and empresa_id = v_empresa_id;

    if v_unidade_mp is null then
      raise exception 'confirmar_necessidades_momento_y: materia-prima % nao encontrada na empresa %.', v_item.materia_prima_id, v_empresa_id;
    end if;

    insert into public.necessidades_of_material (
      empresa_id, of_id, materia_prima_id, origem_logica, versao,
      versao_anterior_id, quantidade_necessaria, observacao_tecnica, origem_fornecimento, created_by
    ) values (
      v_empresa_id, p_of_id, v_item.materia_prima_id, 'momento_y', 1,
      null, v_item.quantidade_confirmada, v_item.observacao_tecnica, v_item.origem_fornecimento, v_uid
    )
    returning id into v_necessidade_id;

    v_total_itens := v_total_itens + 1;

    if v_item.quantidade_ci > 0 then
      select saldo_livre into v_saldo_livre
      from public.estoque_saldos
      where empresa_id = v_empresa_id and materia_prima_id = v_item.materia_prima_id and local_estoque = 'principal'
      for update;

      v_saldo_livre := coalesce(v_saldo_livre, 0);

      -- Saldo insuficiente na confirmação: recusa explicitamente, nunca
      -- reduz CI/aumenta CE silenciosamente (regra explícita aprovada).
      if v_saldo_livre < v_item.quantidade_ci then
        raise exception 'confirmar_necessidades_momento_y: saldo livre insuficiente para a reserva CI do material % (livre=%, confirmado=%).', v_item.materia_prima_id, v_saldo_livre, v_item.quantidade_ci;
      end if;

      update public.estoque_saldos
        set saldo_reservado = saldo_reservado + v_item.quantidade_ci
        where empresa_id = v_empresa_id and materia_prima_id = v_item.materia_prima_id and local_estoque = 'principal';

      insert into public.estoque_movimentacoes (
        empresa_id, materia_prima_id, local_estoque, tipo_movimento, quantidade,
        projeto_id, of_numero, of_id, necessidade_id, observacoes, created_by
      ) values (
        v_empresa_id, v_item.materia_prima_id, 'principal', 'reserva', v_item.quantidade_ci,
        v_of.projeto_id, v_of.numero_of, p_of_id, v_necessidade_id,
        'Reserva confirmada pelo PCP no Momento Y.', v_uid
      );

      v_total_ci := v_total_ci + 1;
    end if;

    -- Material do cliente: CE próprio sempre zero, mesmo que a
    -- quantidade confirmada seja maior que zero (regra 3) - nunca
    -- calculado por subtração para este caso.
    if v_item.origem_fornecimento = 'cliente' then
      v_quantidade_ce := 0;
    else
      v_quantidade_ce := v_item.quantidade_confirmada - v_item.quantidade_ci;
    end if;

    if v_quantidade_ce > 0 then
      if v_requisicao_id is null then
        insert into public.requisicoes_compra (
          empresa_id, projeto_id, of_numero, of_id, data_necessidade_material, status, observacoes, created_by
        ) values (
          v_empresa_id, v_of.projeto_id, v_of.numero_of, p_of_id, current_date, 'aberta',
          'Requisicao gerada pela confirmacao do Momento Y.', v_uid
        )
        returning id into v_requisicao_id;
      end if;

      insert into public.requisicao_compra_itens (
        empresa_id, requisicao_compra_id, necessidade_id, materia_prima_id,
        quantidade_necessaria, unidade, observacoes, created_by
      ) values (
        v_empresa_id, v_requisicao_id, v_necessidade_id, v_item.materia_prima_id,
        v_quantidade_ce, v_unidade_mp,
        'Compra externa gerada pela confirmacao do Momento Y.', v_uid
      );

      v_total_ce := v_total_ce + 1;
    end if;
  end loop;

  -- =====================================================================
  -- Investigação B — confirmação única: UPDATE condicional (WHERE ...
  -- IS NULL) + checagem de ROW_COUNT=1 é a garantia real, independente
  -- do advisory lock acima (que só evita trabalho duplicado). Mesma
  -- instrução/transação de tudo o que foi gravado acima — uma falha
  -- aqui desfaz também as necessidades/reservas/requisições já
  -- inseridas nesta mesma chamada.
  -- =====================================================================
  update public.ordens_fabricacao
    set necessidades_confirmadas_em = now(),
        necessidades_confirmadas_por = v_uid
    where id = p_of_id
      and empresa_id = v_empresa_id
      and necessidades_confirmadas_em is null;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'confirmar_necessidades_momento_y: falha ao confirmar OF % - o Momento Y foi confirmado por outra operacao durante esta chamada.', p_of_id;
  end if;

  return jsonb_build_object(
    'resultado', 'confirmado',
    'of_id', p_of_id,
    'total_materiais', v_total_itens,
    'total_reservas_ci', v_total_ci,
    'total_itens_requisicao_ce', v_total_ce,
    'requisicao_compra_id', v_requisicao_id
  );
end;
$function$;
