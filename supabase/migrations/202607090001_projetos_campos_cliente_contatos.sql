-- Fase B do modulo Projeto - persistencia dos campos "Dados do Cliente"
-- que ate agora eram so visuais (mock, sem coluna). Texto livre por
-- projeto, sem reaproveitamento entre projetos - por isso colunas
-- simples de texto, e nao uma tabela separada de contatos.
--
-- jsonb foi avaliado (ja usado em configuracoes_empresa.valor), mas esse
-- uso e para um blob de configuracao dinamica por chave; aqui os campos
-- sao fixos e conhecidos (nome/email/telefone/setor por contato), e todo
-- o resto da tabela projetos (e do restante do app: itens_industriais,
-- clientes, materias_primas etc.) usa colunas simples - colunas simples
-- mantem o padrao e sao mais faceis de consultar/filtrar isoladamente.
--
-- Tabela projetos ainda com poucas linhas de teste (nenhuma real) -
-- sem risco de migracao de dado.
alter table public.projetos
  add column pedido_compra_cliente text,
  add column documento_cliente text,
  add column contato_comercial_nome text,
  add column contato_comercial_email text,
  add column contato_comercial_telefone text,
  add column contato_comercial_setor text,
  add column contato_tecnico_nome text,
  add column contato_tecnico_email text,
  add column contato_tecnico_telefone text,
  add column contato_tecnico_setor text,
  add column contato_tecnico_2_nome text,
  add column contato_tecnico_2_email text,
  add column contato_tecnico_2_telefone text,
  add column contato_tecnico_2_setor text;

comment on column public.projetos.pedido_compra_cliente is
  'Numero do pedido de compra do cliente para este projeto (texto livre).';

comment on column public.projetos.documento_cliente is
  'Referencia do documento do cliente (OM, Escopo, Contrato, RFQ) - texto livre.';

comment on column public.projetos.contato_comercial_nome is
  'Nome do contato comercial do cliente para este projeto - texto livre, sem cadastro de contatos separado.';
