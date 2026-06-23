-- NEXOTFE 1.0 - Baseline SQL
-- Modulo 014: documentacao do catalogo
-- Dependencias: 001..013

begin;

comment on schema public is 'NEXOTFE 1.0: schema operacional multiempresa, com public.usuarios como fonte unica de empresa, papel e permissoes.';

comment on view public.vw_projetos_operacional is 'Leitura operacional de projetos, cliente, itens e OFs.';
comment on view public.vw_engenharia_produtos is 'Leitura de produtos/PNs e disponibilidade de BOM publicada e roteiro ativo.';
comment on view public.vw_of_operacional is 'Leitura operacional de OFs, produto, necessidades e OPs.';
comment on view public.vw_necessidades_materiais_operacional is 'Leitura de necessidades materiais calculadas por OF.';
comment on view public.vw_decisoes_pcp_operacional is 'Leitura de decisoes humanas do PCP por necessidade material.';
comment on view public.vw_estoque_saldos_operacional is 'Leitura de saldo fisico, reservado e livre por material e local.';
comment on view public.vw_reservas_estoque_operacional is 'Leitura de reservas logicas vinculadas a OF e material.';
comment on view public.vw_requisicoes_compra_operacional is 'Leitura de requisicoes de compra e quantidade de itens.';
comment on view public.vw_planejamento_compras_operacional is 'Leitura de planejamentos de compra e origens consolidadas.';
comment on view public.vw_pedidos_compra_operacional is 'Leitura de pedidos de compra por fornecedor e status.';
comment on view public.vw_recebimentos_operacional is 'Leitura de recebimentos, quantidades recebidas e aceitas.';
comment on view public.vw_producao_operacional is 'Leitura de OPs executaveis derivadas da OF e do roteiro.';
comment on view public.vw_apontamentos_producao_operacional is 'Leitura de apontamentos imutaveis de producao.';
comment on view public.vw_qualidade_operacional is 'Leitura de inspecoes, resultados e nao conformidades.';
comment on view public.vw_expedicao_operacional is 'Leitura de produto acabado e quantidades separadas, expedidas e entregues.';
comment on view public.vw_rastreabilidade_projeto is 'Rastreabilidade resumida Cliente/Projeto -> OF -> Produto Acabado -> Entrega.';

comment on function public.empresa_atual_id() is 'Resolve o tenant exclusivamente por public.usuarios e auth.uid().';
comment on function public.usuario_tem_permissao(text) is 'Verifica permissao a partir de public.usuarios.permissoes para o usuario autenticado.';
comment on function public.gerar_numero_entidade(text,integer) is 'Gera numeracao transacional por empresa e entidade.';
comment on function public.registrar_produto_acabado(uuid,text,text) is 'Cria Produto Acabado somente a partir de OF finalizada e liberada pela Qualidade.';
comment on function public.registrar_entrega(uuid,text,text,text,text) is 'Registra confirmacao de entrega e conclui o Projeto quando nao houver Produto Acabado pendente.';

commit;
