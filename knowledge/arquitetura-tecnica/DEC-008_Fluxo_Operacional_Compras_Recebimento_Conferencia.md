# DEC-008 — Decisão de Negócio: Fluxo Operacional de Compras, Recebimento e Conferência

**Data:** 2026-09-15
**Versão:** 1.0
**Status:** Vigente
**Natureza do documento:** decisão de negócio formalizada — registra as
regras do fluxo operacional de Compras (origem da necessidade,
Requisição, Pedido de Compra, aprovação, envio ao fornecedor,
recebimento, conferência, entrada em estoque e custos), não um padrão
de arquitetura técnica cross-cutting como os documentos `PAD-`. Mesma
força de regra permanente que os demais documentos `DEC-` desta pasta:
alterações futuras exigem nova aprovação explícita, não reinterpretação
silenciosa.

**Contexto:** este documento consolida as decisões de negócio tomadas
em conversa dedicada à investigação read-only do estado real do fluxo
de Compras (Incremento 9 — Fatia 2), que confirmou por leitura direta
de migrations e código que hoje: fornecedor em Pedido de Compra é texto
livre sem FK; não existe numeração automática de Pedido; a máquina de
estados real (`rascunho`/`enviado`/`confirmado`/`cancelado`) não cobre
o fluxo completo de emissão/recebimento/conferência; não existe
histórico de mudança de estado nem RPC de cancelamento de Pedido; e
todo o frontend de Compras hoje é mock, sem nenhuma chamada Supabase
real. Este DEC não resolve esses gaps tecnicamente — define a regra de
negócio que os contratos técnicos futuros (migrations, RPCs, RLS, UI)
deverão implementar.

Este documento também resolve, do ponto de vista de negócio, duas
divergências que `knowledge/00-meta/STATUS_FONTES.md` já registrava como
decisões em aberto: a ordem PCP × Compras no fluxo macro (§2 abaixo fixa
que a necessidade sempre passa pelo PCP antes de chegar a Compras) e a
terminologia de Recebimento (§14 fixa Recebimento e Conferência como
etapas distintas, com semânticas próprias). A atualização formal do
próprio `STATUS_FONTES.md` refletindo essa resolução é passo de
execução, fora do escopo desta rodada (só criação deste arquivo foi
autorizada).

---

## 1. Isolamento multiempresa

Todos os dados do domínio de Compras pertencem à empresa. Uma empresa
nunca pode visualizar, selecionar, relacionar ou utilizar fornecedores,
requisições, pedidos, OFs, projetos, categorias, recebimentos,
históricos ou qualquer outro registro pertencente a outra empresa.

Essa garantia deve ser implementada no backend/banco (RLS e/ou
validação nas funções), nunca apenas na interface.

## 2. Origem da necessidade — decisão CI/CE do PCP

Toda matéria-prima necessária para uma OF deve passar pela avaliação do
PCP, que decide entre:

**CI — Consumo Interno.** Significa que o PCP já separou fisicamente o
material para aquela OF. CI gera baixa imediata do estoque; a
quantidade deixa de estar disponível para outras necessidades; o custo
realizado passa para a OF e, consequentemente, para o projeto. CI pode
atender a necessidade total ou parcialmente.

Exemplo: necessidade da OF = 4.500 mm; estoque disponível = 3.000 mm →
CI = 3.000 mm (baixa imediata para a OF); saldo não atendido = 1.500 mm.
A produção pode começar com o material disponível. A continuidade da
produção poderá ocorrer posteriormente pela mesma OF ou por OF
vinculada/filha da original — a mecânica específica de OF pai/filha
**não é decidida por este DEC** (ver §23).

**CE — Compra Externa.** Somente a quantidade não atendida por CI gera
CE. No exemplo acima: necessidade original 4.500 mm, CI 3.000 mm, CE
1.500 mm. O CE cria uma Requisição de Compra numerada para o saldo
externo necessário.

## 3. Requisição de Compra

A Requisição representa uma necessidade, não um Pedido de Compra. Deve
preservar sua origem e rastreabilidade.

Enquanto a quantidade ainda não estiver formalizada em Pedido de
Compra, a Requisição pode ser ajustada. Exemplo: CE inicial = 1.500 mm;
antes da compra aparecem mais 500 mm internamente; o PCP pode utilizar
esses 500 mm por CI e reduzir a necessidade externa para 1.000 mm.

Toda alteração da Requisição deve registrar: valor/quantidade anterior,
valor/quantidade nova, motivo, usuário, data/hora.

Depois que uma parcela da necessidade estiver formalizada em Pedido de
Compra, essa parcela não pode ser livremente alterada como se ainda
estivesse disponível.

## 4. Papel de Compras

Compras recebe as Requisições e decide como comprar. A quantidade
solicitada pelo PCP representa necessidade técnica, não necessariamente
a quantidade comercial que deverá ser adquirida.

Exemplo: Requisição "Aço 4340 Ø2" × 4.500 mm" — Compras pode decidir
adquirir 1 barra de 6.000 mm. Compras também pode agrupar necessidades
(OF X → 4.500 mm; OF Y → 1.200 mm; compra comercial → 6.000 mm). Deve
permanecer rastreável quais necessidades justificaram a decisão de
compra.

Entretanto, o material comprado pertence à empresa, não às OFs. As OFs
justificam a compra; não adquirem propriedade física do material no
recebimento.

## 5. Propriedade do material e estoque

Regra fundamental: **a necessidade da OF justifica a compra, mas o
material comprado pertence à empresa.**

Exemplo: compra = 6.000 mm. Após a conferência e aprovação de cada
item (não no simples recebimento — ver §13 e §16), entrada no estoque
da empresa = 6.000 mm. Posteriormente: OF X recebe fisicamente
4.500 mm → baixa do estoque → custo realizado da OF X; OF Y recebe
1.200 mm → nova baixa → custo realizado da OF Y; saldo de 300 mm
permanece no estoque da empresa.

A ligação Pedido → Requisição → OF serve para justificar a compra,
permitir agrupamento de necessidades, rastrear a decisão, planejamento
de disponibilidade e planejamento de custos. **Essa ligação não
representa propriedade, reserva definitiva ou baixa automática do
estoque.**

## 6. Momento de criação do Pedido de Compra

Antes da criação do Pedido, Compras pode analisar, agrupar, separar,
cotar, comparar fornecedores e ajustar quantidades comerciais.

O Pedido de Compra nasce somente depois que o comprador analisou as
propostas, escolheu o fornecedor, definiu os itens e quantidades
comerciais, e formalizou o Pedido de Compra. Nesse momento nasce
automaticamente o número do Pedido de Compra.

O número deve ser: sequencial por empresa, único dentro da empresa,
automático, imutável, nunca digitado manualmente. Requisição e Pedido
possuem numerações independentes.

## 7. Fornecedor

O cadastro de fornecedores já existe e deve ser reutilizado. O
fornecedor selecionado deve obrigatoriamente pertencer à mesma empresa
do Pedido.

O Pedido deve preservar: `fornecedor_id`; snapshot histórico do nome
utilizado no momento da formalização. Alterações futuras no cadastro do
fornecedor não devem alterar retroativamente Pedidos antigos.

## 8. Aprovação

A aprovação do Pedido é configurável por empresa. Não existe um cargo
global obrigatório para aprovação — cada empresa decide quem pode
aprovar, podendo inclusive permitir que o próprio comprador aprove o
Pedido.

Para a primeira versão, não assumir automaticamente múltiplos níveis de
aprovação, alçadas por valor, múltiplos aprovadores ou hierarquias
complexas — essas funcionalidades podem evoluir futuramente, se
necessárias.

O sistema deve registrar pelo menos: quem criou, quem aprovou,
data/hora, observação quando aplicável.

## 9. Envio ao fornecedor

Depois de aprovado conforme a regra da empresa, o Pedido deve ser
enviado ao fornecedor o mais breve possível.

O sistema deve registrar obrigatoriamente o envio do Pedido ao
fornecedor, incluindo responsável, data/hora, destinatário e versão do
documento enviado.

O envio direto por e-mail a partir do sistema é um objetivo funcional
desejado, mas sua integração técnica permanece decisão posterior.

O documento do Pedido deve conter, quando aplicável: dados da empresa
compradora; número do Pedido; data; fornecedor; itens; códigos;
descrições; quantidades; unidades; NCM; preço unitário; valor total;
condição de pagamento; prazo/data de entrega; endereço/local de
entrega; observações; comprador responsável.

Cotação e Pedido de Compra são documentos distintos.

## 10. Dashboard operacional de Compras

Compras será operado visualmente por um dashboard com cartões. Etapas
técnicas principais (chaves fixas): `requisicao`, `analise`,
`pedido_compra`, `aprovacao`, `recebimento`, `conferencia`.

Os nomes exibidos das colunas podem ser configuráveis por empresa, mas
as chaves técnicas e sua semântica permanecem fixas. Exemplo de nomes
padrão: Requisições → Em análise → Pedido de Compra → Aprovação →
Recebimento → Conferência. Uma empresa poderá exibir outros rótulos,
como Solicitações → Cotação → Ordem de Compra → Autorização → Entrada →
Inspeção, sem alterar a lógica interna.

## 11. Cartões, status e cores

Não criar uma coluna diferente para cada exceção. Separar: etapa
principal (coluna do dashboard); status textual (mostrado no cartão);
badge/cor (situação complementar, exceção ou atenção); próxima ação
(rodapé do cartão); responsável (quem precisa agir).

Exemplo: "Pedido de Compra 000123 — Recebimento", badge amarelo
"Parcial", ou badge vermelho "Quarentena", ou badge verde "Conferido".
Cor nunca deve ser a única informação — sempre deve existir texto
correspondente.

## 12. Confirmação do fornecedor

Depois do envio, informações como aguardando confirmação, confirmado
pelo fornecedor, alteração proposta, divergência de preço ou
divergência de prazo podem ser representadas por status/badge dentro do
cartão, sem obrigatoriamente criar novas colunas.

A confirmação formal do fornecedor pode ser opcional no fluxo, pois nem
todos respondem formalmente.

## 13. Recebimento e Conferência

Recebimento e Conferência são etapas distintas. Recebimento significa
que o material chegou fisicamente à empresa — isso não significa que
ele já esteja liberado.

A Conferência deve funcionar como checklist por item. Exemplos de
checks básicos: Pedido × material recebido; Pedido × NF;
material/especificação; quantidade; unidade/medida; condição física;
documentação/certificados quando aplicável; observações. Cada item pode
resultar em: OK, parcial, divergente. Alguns checks adicionais poderão
ser configuráveis por empresa.

## 14. Recebimento parcial

Se o material chegar parcialmente: registrar quantidade recebida,
registrar saldo pendente, informar PCP e Compras; PCP pode decidir
liberar para produção a quantidade efetivamente recebida e aprovada; o
restante continua pendente.

Recebimento parcial não significa automaticamente bloqueio.

## 15. Divergência e quarentena

Se o material recebido estiver incorreto ou houver divergência
física/documental: registrar obrigatoriamente o problema; identificar
item e quantidade afetada; registrar responsável e data/hora; informar
PCP e Compras; manter o material em quarentena/aguardando decisão; não
disponibilizar como estoque normal até decisão autorizada.

Diferenciar claramente entrega parcial de material incorreto/divergente
— não usar um único status para representar ambos.

## 16. Entrada no estoque

A entrada ocorre por item. Assim que um item ou quantidade de um item
recebe o check de conferido/aprovado, essa quantidade entra no estoque
da empresa. Não é necessário esperar o Pedido inteiro ser concluído.

Um mesmo Pedido pode ter: itens já disponíveis no estoque, itens
parcialmente recebidos, itens ainda pendentes, itens em quarentena.
Registrar: quantidade recebida, quantidade aprovada, quantidade em
quarentena, quantidade pendente, responsável, data/hora.

## 17. Custos

Regra fundamental: **entrada no estoque não é custo realizado da OF.**

Quando o item é conferido: aumenta o estoque da empresa, passa a
compor o valor do estoque, continua pertencendo à empresa. O custo
realizado da OF/projeto ocorre somente quando houver baixa física do
estoque para a OF.

Portanto: Compra → Recebimento → Conferência → Estoque da empresa →
Baixa para OF → custo realizado da OF/projeto. Custo previsto e custo
realizado são conceitos distintos.

## 18. Cancelamento

Requisição e Pedido possuem ciclos de vida independentes.

Uma Requisição cancelada é terminal e nunca é reativada. O
cancelamento exige motivo obrigatório e deve registrar usuário
responsável, data/hora e preservar o histórico anterior. Se a
necessidade voltar a existir após o cancelamento da Requisição, deve
ser criada uma nova Requisição.

Um Pedido cancelado também é terminal e nunca é reativado. Seu
cancelamento exige motivo obrigatório e deve registrar usuário
responsável, data/hora e preservar o histórico anterior. Porém,
cancelar o Pedido não cancela automaticamente a Requisição que
justificou sua criação.

Se determinada quantidade de uma Requisição ainda não tiver sido
atendida, essa quantidade pode permanecer pendente e ser utilizada
posteriormente em outro Pedido de Compra.

O sistema deve preservar a rastreabilidade das parcelas da necessidade
que estiveram associadas a Pedidos posteriormente cancelados.

Se a própria necessidade deixar de existir, a Requisição deve ser
cancelada separadamente, também com motivo obrigatório e registro de
usuário/data-hora.

## 19. Categoria global da empresa

Deve existir conceito de Categoria de custo/compra global para a
empresa, compartilhado pelos módulos. Não criar listas independentes de
categoria em Compras, Formação de Preço, Custos etc.

Exemplos: Matéria-prima, Ferramentas, Serviços de terceiros,
Manutenção, Energia, Água, Aluguel, Gases, Lubrificantes, Escritório,
Limpeza, Transporte/Frete, Software. Cada empresa possui suas próprias
categorias. Categoria deve poder ser inativada sem apagar histórico.

Essa classificação será reutilizada futuramente em Compras, Custos
Industriais, Formação de Preço, Financeiro e indicadores.

Diferenciar: origem/finalidade da compra; categoria do gasto; centro de
custo, quando aplicável.

## 20. Compras sem OF

Nem toda compra nasce de uma OF. São válidas compras para: Projeto,
Manutenção, Limpeza, Escritório, Administrativo, Almoxarifado, outras
necessidades da empresa. Toda compra deve possuir uma origem/finalidade
rastreável.

## 21. Conclusão do Pedido

Concluído representa encerramento operacional. Depois de concluído, o
Pedido não volta ao fluxo normal. O Pedido fica disponível para
histórico/consulta. O fechamento deve preservar dados suficientes para
futura integração com Contas a Pagar.

## 22. Financeiro — fora de escopo

Financeiro/Contas a Pagar está explicitamente fora do escopo atual. O
domínio de Compras deve apenas preservar os dados necessários para
futura integração, como: fornecedor, número do Pedido, valor, condição
de pagamento, NF, categoria, centro de custo, datas, histórico. Não
implementar Financeiro neste incremento.

## 23. Pontos explicitamente ainda não decididos

Este documento não resolve, e não deve ser lido como tendo resolvido,
os pontos abaixo — permanecem **fora do escopo / decisão posterior**:

- OF pai/filha para continuidade de produção após CI parcial;
- estrutura técnica N:N entre requisições e itens de Pedido;
- modelo definitivo de cotações;
- múltiplas alçadas de aprovação por valor;
- múltiplos aprovadores;
- integração técnica com e-mail;
- modelo definitivo de centro de custo;
- integração com Contas a Pagar;
- implementação do estoque;
- nomenclatura completa de todos os estados técnicos internos;
- desenho definitivo da UI;
- forma técnica de calcular/representar necessidade pendente após
  cancelamento (§18).

## 24. Relação com o Incremento 9

Este DEC é a referência de negócio para as próximas fatias do
Incremento 9. Ele não substitui contratos técnicos — migrations, RPCs,
tabelas, constraints, RLS, concorrência, UI e implementação serão
derivadas posteriormente deste documento, em checkpoints próprios.

A Fatia 1 — fechamento ACL de Compras — já está concluída, aplicada em
produção e sincronizada com `main`. Este DEC **não modifica** a Fatia 1.
