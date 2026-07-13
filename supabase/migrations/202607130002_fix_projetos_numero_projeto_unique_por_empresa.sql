-- BUG (HTTP 409 ao salvar Orcamento/Projeto): projetos.numero_projeto
-- tinha "unique" GLOBAL (constraint projetos_numero_projeto_key),
-- mas o numero e gerado POR EMPRESA (gerar_numero_entidade, via
-- numeracao_configuracoes com unique (empresa_id, entidade)).
--
-- Toda empresa comeca a numeracao do mesmo ponto (sequencia_atual
-- = -1, ano = '26', mesmo prefixo vazio - ver 202607080007), entao
-- duas empresas diferentes geram exatamente os mesmos numeros
-- (260000, 260001, ...). Com a unique global, a segunda empresa a
-- salvar seu N-esimo projeto colide com o numero ja usado pela
-- primeira empresa e o INSERT e rejeitado com 23505/HTTP 409 -
-- reproduzido em 2026-07-13 simulando o primeiro projeto da Enifer
-- (colide com 260000, ja usado pela NEXOTFE Demo).
--
-- numero_projeto e um identificador dentro do escopo da empresa
-- (como um numero de nota fiscal), nao um identificador global -
-- a unicidade deve ser (empresa_id, numero_projeto).
alter table public.projetos
  drop constraint projetos_numero_projeto_key;

alter table public.projetos
  add constraint projetos_numero_projeto_empresa_key
  unique (empresa_id, numero_projeto);
