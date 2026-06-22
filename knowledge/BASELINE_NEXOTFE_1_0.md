# BASELINE NEXOTFE 1.0

**Instituído em:** 21/06/2026  
**Status:** Oficial — ponto de partida da implementação  
**Natureza:** baseline documental, normativo e diagnóstico  
**Algoritmo de integridade:** SHA-256

## 1. Finalidade

O BASELINE NEXOTFE 1.0 consolida a arquitetura congelada, a fotografia verificável do banco anterior e as auditorias realizadas sobre essa fotografia.

Este baseline passa a ser o único ponto de partida autorizado para preparar o banco definitivo. Nenhuma migration nova deve ser desenhada tomando apenas o banco atual, uma migration antiga ou uma tela existente como verdade isolada.

## 2. Regra fundamental

O baseline separa duas naturezas de evidência:

1. **Norma:** define como o NEXOTFE 1.0 deve funcionar.
2. **Estado restaurado e auditorias:** demonstram o que existe, o que pode ser preservado e o que precisa ser corrigido.

O banco restaurado é evidência histórica e matéria-prima de migração. Ele não substitui o Livro Mestre nem passa a ser considerado arquitetura aprovada por estar incluído neste baseline.

Em caso de divergência, prevalece esta ordem:

1. Livro Mestre e coleção normativa congelada;
2. Contratos Técnicos, incluindo o Estudo Técnico 001;
3. Plano Diretor e Plano Executivo;
4. decisões arquiteturais expressamente registradas;
5. auditorias do banco restaurado;
6. catálogo e backup, como evidência do estado anterior.

## 3. Composição oficial

### 3.1 Fonte normativa

- coleção canônica do Livro Mestre, capítulos 00–07 e 99;
- Arquitetura Geral;
- Arquitetura de Dados;
- Estados Oficiais;
- Padrão Oficial de Classificações;
- Dicionário Industrial;
- Princípios Arquiteturais;
- Estudo Técnico 001;
- Plano Diretor de Implementação;
- Plano Executivo de Implementação.

Os documentos canônicos e seus hashes são controlados por `knowledge/livro-arquitetura-funcional/MANIFESTO_BASELINE_NORMATIVO_NEXOTFE_1_0.md`.

### 3.2 Fotografia do banco anterior

- backup `nexotfe_public_20260621_000436.dump`;
- restauração validada em ambiente PostgreSQL isolado;
- catálogo completo do schema restaurado;
- tabelas, colunas, views, funções, constraints, índices, triggers, policies, enums, sequências e contagens.

Identidade do backup:

| Atributo | Valor |
|---|---|
| Tamanho | 314.214 bytes |
| SHA-256 | `0dcfed1e178992ae8f740fbc1523ff3cb451088cd0a4dc1dbafeaf00ef70459e` |
| Escopo | Schema `public` |

Limitação conhecida: o backup não contém uma cópia integral dos schemas internos gerenciados pelo Supabase, como `auth` e `storage`. A restauração utilizou estruturas mínimas de suporte para validar o schema `public`. Portanto, nenhuma conclusão sobre configuração interna completa do projeto Supabase deve ser inferida desse dump.

### 3.3 Auditorias

- auditoria completa das migrations;
- auditoria das funções `SECURITY DEFINER`;
- auditoria completa das 106 policies RLS;
- comparação do banco restaurado com os documentos normativos;
- matrizes técnicas em CSV que sustentam cada conclusão.

## 4. Decisões vinculantes consolidadas

### 4.1 Autoridade de usuário e tenant

Existe uma única fonte oficial para empresa, papel e permissões:

- `public.usuarios` é a autoridade de negócio;
- `auth.users` é exclusivamente a identidade autenticada;
- `public.profiles` é legado e não pode participar da autorização definitiva;
- fallback entre `profiles`, `usuarios`, metadata ou qualquer outra fonte é proibido;
- metadata fornecida pelo usuário não pode escolher empresa, papel ou permissão;
- divergências legadas devem ser detectadas e migradas explicitamente, nunca resolvidas silenciosamente em execução.

### 4.2 Segurança

- toda tabela empresarial deve possuir isolamento por empresa comprovado;
- RLS deve ser validada com dois tenants, usuário sem acesso, usuário inativo e empresa inativa;
- `SECURITY DEFINER` exige grants mínimos, objetos qualificados e `search_path` seguro;
- policies permissivas amplas não podem neutralizar regras restritivas;
- relações entre tabelas devem preservar também a consistência de `empresa_id`.

### 4.3 Fluxo industrial

- a decisão de estoque ou compra pertence ao PCP e deve ser persistida;
- Reserva é lógica e não é movimentação física;
- Consumo é evento físico distinto da Reserva;
- Roteiro → Necessidade → Decisão PCP → Reserva/Requisição é um contrato obrigatório;
- views calculadas não substituem entidades transacionais, autoria, estados ou histórico.

### 4.4 Migrations

- a cadeia histórica atual não será tratada como baseline reproduzível sem saneamento;
- nenhuma migration antiga será aplicada cegamente;
- o baseline SQL definitivo ainda deverá ser escrito e validado em ambiente descartável;
- toda transformação de dados deve possuir pré-condições, verificação posterior e estratégia de rollback.

## 5. Diagnóstico incorporado

O baseline reconhece formalmente:

- 29 tabelas, 16 views, 23 funções, 106 policies, 117 FKs e 29 triggers no banco restaurado;
- 52 migrations auditadas, sendo 12 críticas e 21 de risco alto;
- 9 funções `SECURITY DEFINER` auditadas, com 2 críticas;
- 20 policies RLS críticas e 31 de risco alto;
- 46 conceitos de domínio comparados: 5 atendidos, 20 parciais, 18 ausentes e 3 incompatíveis;
- nenhum dos 9 ciclos de Estados Oficiais integralmente aderente no banco restaurado.

Esses números descrevem a fotografia atual e não constituem metas de permanência no banco definitivo.

## 6. O que este baseline autoriza

O BASELINE NEXOTFE 1.0 autoriza:

- elaborar o desenho técnico do baseline SQL definitivo;
- classificar objetos como preservar, transformar, substituir ou remover;
- preparar migrations novas e reproduzíveis em ambiente isolado;
- preparar testes de esquema, RLS, funções, domínio e migração;
- construir o mapa de transformação dos dados existentes.

## 7. O que este baseline não autoriza

O baseline não autoriza, por si só:

- aplicar migrations no Supabase;
- alterar o banco remoto;
- aceitar policies ou funções existentes sem correção;
- promover `profiles` como segunda fonte de autorização;
- converter automaticamente Reserva em Consumo;
- alterar a Arquitetura NEXOTFE 1.0;
- descartar dados existentes sem plano aprovado e backup verificável.

## 8. Controle de integridade

O inventário de arquivos, tamanhos e hashes está em `knowledge/BASELINE_NEXOTFE_1_0_MANIFESTO.csv`.

Regras:

1. qualquer diferença de hash deve ser investigada antes do uso;
2. correção em auditoria deve gerar nova revisão do manifesto;
3. mudança normativa exige o processo formal de evolução da arquitetura;
4. novos artefatos de implementação não alteram retroativamente esta fotografia;
5. segredos e a `DATABASE_URL` nunca integram o baseline.

## 9. Critério para iniciar o baseline SQL definitivo

O desenho do baseline SQL pode começar quando:

- este manifesto estiver salvo e versionado;
- todas as fontes listadas estiverem disponíveis;
- a equipe aceitar as decisões vinculantes desta seção;
- cada objeto atual possuir destino explícito: preservar, transformar, substituir ou remover;
- a estratégia para dados legados e rollback estiver documentada.

## 10. Declaração oficial

A partir desta data, o **BASELINE NEXOTFE 1.0** é o ponto oficial de partida para a implementação definitiva.

O baseline é composto pela arquitetura congelada, pelo estado restaurado verificável e pelas auditorias consolidadas. Ele preserva o trabalho útil já realizado sem transformar desvios históricos em regras arquiteturais.

