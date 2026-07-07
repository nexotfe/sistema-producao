NEXOTFE — Registro de Sessão

Data: 06/07/2026
Escopo: Bloco Comercial — Produto, Roteiro, Projeto, Orçamento (Fase A)
Status: Fase A (visual/mockada) concluída e congelada nas 3 telas principais


1. Objetivo da sessão

Auditar o estado real do bloco Comercial (Produto → Projeto → Roteiro → Orçamento),
alinhar regras de negócio que estavam divergentes ou não documentadas, e revisar
visualmente (Fase A, sem conexão real com banco) as páginas de Projeto, Orçamento
e Roteiro antes de avançar para dados reais (Fase B).


2. Achado crítico de auditoria: banco remoto divergente do repositório


O banco Supabase remoto (xttyiffmtsmraqroalrb) não corresponde a
supabase/baseline/ nem 100% a supabase/migrations/.
10 tabelas existem no remoto sem CREATE TABLE versionado no repositório
(clientes, credenciais, empresas, funcionarios, grupos_recursos,
movimentacoes_estoque, profiles, recursos_produtivos,
tecnologias_aplicadas, usuarios) — provavelmente criadas direto no
SQL Editor do Supabase Studio.
Duas tabelas de movimentação de estoque coexistem (estoque_movimentacoes e
movimentacoes_estoque) — indício de duplicação acidental. Não resolvido
ainda, fica como pendência.
projetos.status no remoto usa valores diferentes dos arquivos de migration
versionados. Confirmado e mapeado (ver seção 4).
Decisão: reconciliação completa do repositório (snapshot do estado real)
foi identificada como necessária, mas não é bloqueante e foi adiada —
os CRUDs de Clientes, Colaboradores e Recursos Produtivos já funcionam em
produção normalmente.


2.1 Correção de segurança aplicada (RLS)


boms e bom_itens estavam sem RLS habilitado, com anon tendo grant
de escrita/leitura irrestrito. Corrigido — RLS habilitado, 4 policies
"mesma empresa" e triggers de auditoria replicados em ambas.
Varredura completa nas 33 tabelas de public: identificado que 15 tabelas
tinham policies sem TO authenticated explícito (proteção implícita via
NULL, mais frágil). Corrigido — todas as 33 tabelas hoje têm RLS
habilitado e policies restritas explicitamente a authenticated.



3. Estrutura real confirmada no banco (achados úteis)

Conceito de negócioTabela real no bancoProdutoitens_industriais (já tem codigo_ncm, unidade, ativo, pdf_tecnico_path, revisao_desenho, valor_referencia)Estrutura do Produto (BOM)boms + bom_itens (já suporta matéria-prima OU subconjunto via componente_tipo, com constraint que impede os dois ao mesmo tempo)Operações do Roteiro (Engenharia + Produção)Criada nesta sessão: bom_operacoesServiços de Terceiros do RoteiroCriada nesta sessão: bom_servicos_terceirosTransportes do RoteiroCriada nesta sessão: bom_transportesTecnologia/Recurso com custo-horatecnologias_aplicadas (já existe, 11 linhas reais)Projetoprojetos (campo tipo já cobre Natureza: fabricacao/desenvolvimento/servico/industrializacao)Numeração automática configurável por empresanumeracao_configuracoes + função gerar_numero_entidade() (já existe, mas projeto ainda não está registrado nela — pendência de Fase B)Revisão do Produtorevisoes_itens (já existe, com vigência e aprovação — decidido reaproveitar)

Migrations aplicadas nesta sessão (via psql direto no remoto, já que a CLI
está dessincronizada):


202607060002_boms_bom_itens_rls.sql
202607060003_normaliza_policies_to_authenticated.sql
Migration de criação de bom_operacoes, bom_servicos_terceiros, bom_transportes



4. Decisões de negócio consolidadas

4.1 Produto


Representa qualquer item de fabricação — desenho de cliente ou da biblioteca
interna de engenharia. Não existe tabela de desenho separada: desenho = produto.
Campo de revisão simples (revisao_desenho) já existe; decisão: reaproveitar
também revisoes_itens (histórico completo, vigência, aprovação) de forma
simples, sem exigir fluxo de aprovação na tela por enquanto.
Catálogo reutilizável entre projetos/clientes.


4.2 Roteiro = Estrutura (BOM) + Ficha Técnica de Produção


Não é módulo independente — vive dentro do Produto.
Roteiro pertence ao Produto (não ao item de projeto). Um produto pode ter
vários Roteiros/versões (boms.versao).
Estrutura multinível (BOM) nasce do encadeamento Roteiro → consome Produto
→ esse Produto tem seu próprio Roteiro, recursivamente (sem limite de
profundidade). Reaproveitável entre projetos — não precisa remontar a árvore
a cada projeto.
Cada nível pode ter roteiro próprio: item-folha consome matéria-prima real;
item-montagem tem roteiro de montagem, consumindo os produtos-filho como
insumo (bom_itens.componente_tipo = 'subconjunto').
Custo de cada item = custo do seu próprio roteiro (recursivo, bottom-up).
Composição do Roteiro (6 blocos confirmados na tela):

Engenharia (só aparece quando Natureza = Desenvolvimento)
Matérias-primas
Operações (produção)
Serviços de Terceiros
Transportes
Resumo de Custos Industriais (consolidação automática, nunca manual)





4.3 Numeração de Operações — OP vs OF


OF (Ordem de Fabricação): entidade de produção real, nasce do projeto
aprovado, entra na fila do PCP. Não muda.
OP (Ordem de Produção): cada etapa dentro do Roteiro (OP10, OP20...).
Toda OF herda as OPs do roteiro que a originou.
Regra de numeração: OP nunca repete dentro do mesmo produto, mesmo entre
os blocos Engenharia e Operações — os dois compartilham a mesma sequência.
Tecnicamente, ambos os blocos vivem na mesma tabela (bom_operacoes), com
campo diferenciando engenharia/produção para fins de exibição.
Bloco Engenharia só existe quando Natureza do projeto = Desenvolvimento.


4.4 Natureza do Projeto e regra de custo de matéria-prima

NaturezaTem roteiro?Matéria-prima entra no custo?FabricaçãoSimSimDesenvolvimentoSim (macro/estimado — usa status='rascunho')SimIndustrializaçãoSimNão (material é do cliente) — regra vale para todo o projetoServiçoÀs vezesSe houver, sim

Pendente de teste obrigatório: validar que o cálculo de custo realmente
exclui matéria-prima quando Natureza = Industrialização, assim que houver
caso real para testar (Fase B).

4.5 Projeto


Numeração automática, configurável por empresa (ex: 260001,
OM01-2001) — usar a função gerar_numero_entidade() já existente,
registrando projeto em numeracao_configuracoes (ainda não registrado).
Status: mapear cancelado (nome no banco) → label "Reprovado" na
interface (sem alterar o valor armazenado).
Projeto reprovado nunca é excluído e pode ser duplicado para originar
uma cotação nova.
"Nº do Pedido" não fica no card Resumo Operacional — já existe em Dados do
Cliente (Pedido de Compra do Cliente), evitando duplicidade.
Resumo Operacional (só populado quando status = aprovado; senão, "—"):

Nº de Produtos (conta projeto_itens / estrutura real)
Nº de OFs (conta ordens_fabricacao)
Custo Estimado (do roteiro — placeholder até Roteiro estar em Fase B)
Custo Real (de apontamento de produção — placeholder até módulo Produção existir)



Mecanismo de "Duplicar" já existe funcionando em Matéria-Prima
(?duplicar=<id>) — reaproveitar o mesmo padrão para Projeto e Produto
(hoje só visual, sem onClick, nessas duas telas).


4.6 Orçamento


Herda dados do Projeto (somente leitura).
Tabela de itens: Descrição | Código | Revisão | Qtd | Roteiro | Custo |
Impostos | Lucro | Total | Estrutura.
Preço nunca digitado manualmente — sempre Custo → Carga Tributária →
Margem de Lucro → Preço de Venda.
Margem de lucro: sugestão configurável, ajustável pelo orçamentista por
orçamento.
Carga tributária: sugerida pela Natureza do projeto, ajustável pelo
orçamentista.


4.7 Conceito futuro registrado (não implementar ainda)

Cenários de Fabricação — entre Orçamento finalizado e envio da Proposta:
simulação de capacidade/fila de máquina para responder "conseguimos entregar
na data?", considerando:


Buffer de segurança sobre a data de necessidade do cliente.
Eficiência por tipo de recurso (ex.: 75% engenharia, 85% produção, 75% montagem).
Lógica base FIFO, mas não rígida — PCP pode reordenar, desde que registre o motivo.
Orçamentista pode testar alternativas (hora extra, terceirização, remanejo)
para aproximar da data desejada pelo cliente.



5. Telas Fase A — congeladas hoje

✅ Produto (/produtos/novo e variações) — Identificação, card Revisões,
Roteiro Vigente com botão de atalho, Observações.

✅ Projeto (/projeto) — Identificação (Natureza com 4 opções, Status com
label "Reprovado"), Dados do Cliente, Observações, Resumo Operacional novo
(condicionado a status Aprovado).

✅ Orçamento (/projetos/novo) — Resumo do Projeto herdado, Itens do
projeto (com coluna Revisão, quebra de texto em 2 linhas, respiro correto na
coluna Estrutura), Margem de Lucro, Carga Tributária.

✅ Roteiro (/roteiros/[pn]) — 6 blocos confirmados, numeração de OP
corrigida sem colisão.


6. Próximos passos (Fase B)

Ordem definida: Produto → Roteiro → Projeto → Orçamento, testando CRUD
completo + cálculo (incluindo cenário de Industrialização) antes de avançar
para o próximo módulo.

Pendências técnicas conhecidas para Fase B:


Registrar projeto em numeracao_configuracoes e ativar numeração automática.
Implementar "Duplicar" real em Projeto e Produto (reaproveitando padrão de Matéria-Prima).
Conectar card de Revisões do Produto a revisoes_itens real.
Implementar cálculo recursivo de custo (bottom-up) via bom_itens + bom_operacoes.
Implementar exclusão de matéria-prima do custo quando Natureza = Industrialização.
Resolver contagens reais do Resumo Operacional do Projeto (Nº Produtos, Nº OFs).
(Sem urgência) Reconciliar divergência entre banco remoto e repositório versionado.