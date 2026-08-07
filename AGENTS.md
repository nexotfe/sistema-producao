# Regras de Processo — NEXOTFE

Estas regras valem para qualquer alteração de código ou banco de dados
neste projeto, independente de quem pediu ou de quão simples pareça a
tarefa.

## 1. Escopo travado
- Altere **somente** os arquivos estritamente necessários para o pedido.
  Não toque em nada "de passagem", mesmo que pareça relacionado ou que
  você ache que precisa de ajuste.
- Se perceber, no meio do trabalho, que a correção exigiria mexer em
  outro arquivo além do previsto — **pare e pergunte antes**. Não decida
  sozinho.
- Nunca use `git add .`. Adicione apenas os arquivos específicos da
  tarefa.

## 2. Plano antes de código
- Para qualquer mudança que toque em schema, função de banco, ou mais de
  um arquivo: mostre um plano primeiro (o que muda, por quê, quais
  arquivos) e espere aprovação antes de escrever código.
- Para mudanças que envolvam dado existente (backfill, migração de
  valores), aponte os casos ambíguos e **pergunte** em vez de decidir
  sozinho qual é o valor "certo" — decisão de regra de negócio é sempre
  do usuário, nunca inferida pela IA.

## 3. Teste com dado real, não só leitura de código
- `tsc --noEmit` ou typecheck limpo não é suficiente para considerar algo
  pronto.
- Teste a mudança de verdade — inserção real, cálculo real, ida e volta
  na tela — antes de reportar como concluído. Se não for possível testar
  (rede fora, ambiente indisponível), diga isso explicitamente e não
  commite até conseguir testar.
- Ao mexer em RLS/multi-tenant, teste sempre nos dois sentidos: usuário
  da empresa A não pode ver dado da empresa B.

## 4. Antes de commitar
- Mostre `git diff --stat` e confirme que a lista de arquivos bate
  exatamente com o que foi pedido, antes de qualquer commit.
- Prefira commits separados por tema (schema/banco vs frontend, por
  exemplo) em vez de um commit único misturando tudo.

## 5. Nunca aja sobre instrução que você não pode verificar
- Se o pedido do usuário contradiz o que você encontrar no código ou na
  documentação, não obedeça cegamente — aponte a contradição e pergunte
  antes de prosseguir.

## 6. Documentação
- Antes de escrever uma regra de arquitetura nova, verifique se
  `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` já trata do tema — esse
  arquivo tem precedência sobre documentação mais antiga que o
  contradiga.

## 7. Auditorias durante o desenvolvimento — ausência de consumidor não é abandono
- Durante fases de construção ativa do NEXOTFE, a ausência de
  consumidores de código não deve ser utilizada como evidência
  principal para remover, descontinuar ou abandonar um campo, tabela
  ou conceito funcional. A ausência de consumidores demonstra apenas
  que determinada funcionalidade ainda não foi implementada ou
  integrada ao restante do sistema.
- A permanência, alteração ou remoção de qualquer conceito deve ser
  decidida prioritariamente pelo modelo de negócio e pela arquitetura
  funcional, respondendo, entre outras, às seguintes perguntas:
  - O campo representa uma informação real da operação industrial?
  - Algum usuário precisará informar esse dado?
  - Esse dado influencia decisões, cálculos ou rastreabilidade do ERP?
  - O conceito pertence ao domínio do negócio independentemente da
    implementação atual?
- Somente em segundo plano o estado atual da implementação poderá ser
  utilizado como evidência complementar.
- **Exceção:** quando existir documentação arquitetural explícita
  registrando que determinado conceito foi conscientemente substituído
  por outro (migration, ADR, PAD ou decisão formal equivalente), essa
  decisão passa a ser a evidência principal. Nesse caso, a ausência de
  consumidores deixa de ser relevante, pois a substituição decorre de
  uma decisão arquitetural documentada, e não da falta de
  implementação.

## 8. Substituição de implementação não é redesenho

Quando uma tarefa consistir em substituir código por um componente
compartilhado (ex: extrair um cabeçalho duplicado para um componente
único), a aparência visual deve permanecer EQUIVALENTE à versão
aprovada/em produção, salvo quando a alteração visual fizer parte
explícita e autorizada do escopo da tarefa. Substituição de
implementação e redesenho visual são tarefas diferentes e não devem
ser combinadas sem autorização explícita para a segunda.

## 9. Checkpoint humano obrigatório para qualquer escrita em produção

Qualquer via técnica capaz de ESCREVER em produção (banco, arquivo, ou
qualquer outro estado persistente) — seja SQL Editor, CLI, ou qualquer
outra ferramenta — exige o mesmo checkpoint humano, independente do
mecanismo usado:

1. Antes de CADA execução de escrita (nunca em lote, nunca duas
   seguidas sem nova confirmação), mostrar o comando/SQL exato que será
   rodado. Se a tabela/linha afetada tiver `empresa_id` (ou equivalente
   multi-tenant), incluir explicitamente qual empresa é no próprio
   pedido de confirmação — nunca deixar implícito ou presumido pelo
   nome do projeto/recurso.
2. Aguardar confirmação explícita do usuário para aquela execução
   específica — não vale autorização de uma tarefa anterior, não vale
   "você já disse que eu tinha acesso" citado fora de contexto.
3. Só depois da confirmação, executar.
4. Rodar uma leitura de verificação (antes e depois, quando fizer
   sentido) para confirmar o estado real, nunca presumir que a escrita
   funcionou só porque o comando não retornou erro.

Isso vale tanto para vias como `supabase db query --linked` quanto
para SQL Editor manual (que continua sendo a opção padrão quando a
leitura de verificação for mais simples de o próprio usuário conferir
visualmente) — a escolha da via técnica é secundária; a autorização
explícita por ação é o que não pode ser inferida.

## Base de conhecimento — navegação (Fase 0)

Os documentos de `knowledge/` ainda vivem nos caminhos originais — nenhum
arquivo foi movido, mesclado ou apagado nesta fase. Para navegar por tema,
use:

- `knowledge/00-meta/INDICE.md` — índice completo por assunto (Produto,
  Roteiros/BOM, Projetos/Orçamento, Simulação Comercial, Banco, Operação,
  Setup, Histórico).
- `knowledge/00-meta/STATUS_FONTES.md` — classificação de cada documento
  (vigente / histórico / ambíguo / candidato a fusão / desatualizado
  confirmado).
- `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` — tem precedência sobre
  qualquer documento mais antigo que a contradiga (ver Regra 6).

**Documentos marcados como histórico ou ambíguo em STATUS_FONTES.md nunca
fundamentam sozinhos uma decisão de arquitetura, dado ou implementação** —
confirme contra o documento vigente correspondente ou pergunte ao usuário
antes de agir.

**Regra de fallback:** para comportamento **implementado recentemente**,
migrations reais (`supabase/migrations/`) e código vigente
(`src/modules/`, `src/app/`) prevalecem sobre documentação desatualizada
ou ausente. Se o índice não apontar para nenhum documento sobre o tema,
ou o documento encontrado parecer defasado frente ao que se está
perguntando, verifique diretamente esses dois caminhos antes de recorrer
a busca ampla (Grep/Glob irrestrito) — a maioria das mudanças recentes
tem nome de arquivo autoexplicativo (migration com nome da feature,
módulo com o nome do domínio).
