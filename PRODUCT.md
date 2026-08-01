# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Usuários atuais confirmados:** times de Comercial, operando Orçamento
e Simulação Comercial (aprovação de propostas), dentro da etapa inicial
Cliente → Oportunidade → Orçamento → Projeto.

**Públicos previstos**, ainda não confirmados como usuários
operacionais reais do sistema: Engenharia, Compras, PCP e chão de
fábrica/produção direta, conforme o fluxo oficial completo do Baseline
Operacional (Cliente → Oportunidade → Orçamento → Projeto → Engenharia
→ Compras → Planejamento PCP → Programação Diária → Produção →
Qualidade → Expedição → Entrega → Pós-venda). Essa é a visão
arquitetural do produto, não o estágio funcional atual — ver Operating
Context.

O sistema é multi-tenant: várias empresas industriais distintas usam a
mesma instância, cada uma com seus dados isolados por `empresa_id` e
RLS. A Enifer é uma das empresas piloto/validadoras.

## Product Purpose

NEXOTFE é uma plataforma industrial em construção, destinada a integrar
progressivamente o fluxo de projetos sob encomenda — organizando
informação, construindo cenários e apoiando decisões de quem trabalha
na indústria. A decisão final continua sendo humana; o sistema não
decide por ninguém. Existe para representar o funcionamento real de
uma indústria (manufatura, usinagem, engenharia, suprimentos, PCP,
produção), não para forçar o processo industrial a se adaptar às
limitações do software. Sucesso significa menos retrabalho, dados que
nascem uma única vez e circulam entre módulos, e melhores decisões de
projeto sob encomenda, à medida que cada etapa do fluxo for integrada
ao sistema.

## Positioning

Ao contrário de um ERP genérico de produção seriada ou catálogo fixo,
o Projeto é o núcleo operacional do NEXOTFE: cada novo recurso do
sistema precisa responder "isso melhora o controle de um projeto sob
encomenda?". O Roteiro pertence ao Produto (reaproveitável entre
projetos, não recriado a cada um). A Operação vincula-se a um Recurso
Produtivo (não a uma categoria abstrata de Tecnologia), porque é o
recurso real que a simulação de capacidade precisa para calcular carga
— mas esse vínculo não é garantido em todas as Operações hoje: existem
operações sem Recurso Produtivo vinculado. Vínculo/compatibilidade
completa com recursos é pré-requisito para simulações de capacidade
completas, não um fato já consolidado em toda a base.

## Operating Context

**Visão arquitetural** (fluxo completo, ainda não implementado de
ponta a ponta): Cliente → Oportunidade → Orçamento → Projeto →
Engenharia → Compras → Planejamento PCP → Programação Diária →
Produção → Qualidade → Expedição → Entrega → Pós-venda, conforme o
Baseline Operacional. Módulos previstos: Comercial, Engenharia
(produtos, códigos, BOM, roteiros, documentos técnicos), PCP
(planejamento macro por projeto e programação diária por OF), Compras
(requisições, pedidos, fornecedores, rastreabilidade), Produção,
Estoque, Cadastros Mestres (clientes, fornecedores, colaboradores,
recursos) e Configurações.

**Estágio funcional atual:** Comercial e Simulação Comercial (orçamento,
aprovação de proposta) são as etapas efetivamente operacionais no
sistema hoje.

**Próxima etapa planejada:** Compras.

**Ainda não operacionais de ponta a ponta:** PCP, Produção, Qualidade,
Expedição e chão de fábrica. Podem existir estruturas/telas
relacionadas a esses módulos no código sem que isso equivalha a
operação real ponta a ponta — ver Capabilities and Constraints.

Toda regra de negócio deve nascer documentada em `knowledge/` antes de
virar código. Documentos vigentes mais recentes — PAD, DEC, ADR,
HANDOVER e demais registros formais, incluindo
`knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` — devem ser considerados em
conjunto, sem duplicar regra já registrada em outro; nenhum deles tem
precedência universal presumida sem confirmar sua atualidade caso a
caso.

## Capabilities and Constraints

- Stack existente: Next.js + Supabase (Postgres/RLS), TypeScript.
- Isolamento multi-tenant via `empresa_id` + RLS é obrigatório e deve
  ser testado nos dois sentidos (empresa A não pode ver dado da
  empresa B) sempre que RLS for tocado.
- Processo de desenvolvimento trava escopo por tarefa, exige plano
  aprovado antes de mudanças em schema/múltiplos arquivos, teste com
  dado real (não só typecheck) e checkpoint humano explícito antes de
  qualquer escrita em produção — ver `CLAUDE.md` na raiz do projeto.
- Existem estruturas e telas relacionadas a Ordem de Fabricação, mas
  ainda não existe PCP operacional nem execução produtiva real pelo
  sistema. Roteiro hoje não tem conceito de Quantidade.

## Brand Commitments

Nome do produto: NEXOTFE, construído pelo "Método Nexus". Princípios
de voz herdados do manifesto do produto: simplicidade, clareza,
elegância, integração, evolução contínua, menor retrabalho possível,
reutilização, consistência. Sem logotipo ou identidade visual formal
registrada até o momento.

## Evidence on Hand

Base de conhecimento extensa em `knowledge/` (manifesto, arquitetura de
entidades, padrões de desenvolvimento, auditorias de RLS/migrations,
handovers) e histórico de decisões implementadas e testadas no banco
remoto com dados reais de empresas piloto, sem significar operação
produtiva integral do sistema (ver `git log` e os documentos vigentes
em `knowledge/`). Não há depoimentos de clientes, estudos de caso,
imprensa ou material de marketing — trabalho futuro não deve fabricar
esse tipo de conteúdo.

## Product Principles

1. O processo industrial real dita o software — o software nunca força
   o processo a se adaptar às suas limitações.
2. Uma informação nasce uma única vez e é compartilhada entre módulos;
   duplicidade de dado é para ser eliminada, não tolerada.
3. Simplicidade é eliminar o que não agrega valor — não é sinônimo de
   menos funcionalidade.
4. O sistema organiza, constrói cenário e apoia decisão; a decisão
   final é sempre humana.
5. Isolamento multi-tenant é inegociável: dado de uma empresa nunca
   pode vazar para outra.
