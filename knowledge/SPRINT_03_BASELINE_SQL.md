# Sprint 03 — Baseline SQL

**Papel responsável:** Engenharia de Reconstrução  
**Status:** Em execução  
**Início:** 21/06/2026  
**Base oficial:** BASELINE NEXOTFE 1.0

## 1. Objetivo

Construir a primeira representação SQL completa, coerente e reproduzível da Arquitetura NEXOTFE 1.0 em um banco vazio, sem depender da execução sequencial das migrations históricas.

## 2. Princípio de reconstrução

O baseline SQL será derivado da norma e validado contra a fotografia restaurada. Objetos existentes serão reaproveitados somente quando sua responsabilidade, segurança e rastreabilidade forem compatíveis.

A cadeia histórica de 52 migrations é fonte de evidência, não instalador do banco definitivo.

## 3. Escopo

1. classificar todos os objetos restaurados;
2. definir a ordem de criação do schema definitivo;
3. criar baseline SQL executável em banco vazio;
4. criar testes automáticos de estrutura, domínio, segurança e idempotência aplicável;
5. restaurar dados de teste controlados;
6. provar repetibilidade em ambiente PostgreSQL isolado;
7. publicar relatório de validação.

## 4. Classificações

- **PRESERVAR:** responsabilidade e contrato permanecem; o objeto será recriado no baseline com o mesmo papel.
- **TRANSFORMAR:** identidade conceitual é aproveitada, mas estrutura, segurança, estados ou relações serão corrigidos.
- **SUBSTITUIR:** o comportamento atual é incompatível ou existe duplicidade; outro contrato assumirá a responsabilidade.
- **REMOVER:** não pertence ao baseline definitivo ou apresenta risco sem justificativa normativa.

Classificar como preservar não significa copiar o DDL antigo. Todo objeto será declarado novamente no baseline reproduzível.

### Inventário classificado

- 29 tabelas;
- 16 views;
- 23 funções;
- 106 policies;
- 29 triggers;
- 201 constraints nomeadas, desconsiderando 268 marcações de `NOT NULL` catalogadas como atributos de coluna;
- 202 índices;
- 1 sequência;
- 1 enum nativo.

Total: **608 objetos nomeados classificados individualmente**.

Arquivos de evidência:

- `knowledge/SPRINT_03_CLASSIFICACAO_OBJETOS.csv`;
- `knowledge/SPRINT_03_CLASSIFICACAO_OBJETOS_SUBORDINADOS.csv`.

## 5. Ordem obrigatória de construção

1. extensões e schemas controlados;
2. funções utilitárias sem privilégio elevado;
3. núcleo de empresa e usuário;
4. classificações e estados controlados;
5. cadastros administrativos e industriais;
6. Comercial e Engenharia;
7. Roteiro e OF;
8. Necessidades, Decisões PCP e Reservas;
9. Estoque e Requisições;
10. Planejamento e Pedidos de Compra;
11. Produção, Qualidade e Expedição conforme contratos normativos;
12. constraints e índices;
13. funções transacionais e grants;
14. RLS e policies;
15. views de leitura;
16. comentários e validações finais.

RLS será criada depois das tabelas e funções de contexto, mas antes de qualquer aceite do baseline.

## 6. Estratégia dos arquivos SQL

O baseline será mantido separado das migrations evolutivas:

```text
supabase/
  baseline/
    000_baseline_nexotfe_1_0.sql
    tests/
```

As migrations existentes permanecerão intactas durante a reconstrução para fins de auditoria. Nenhuma delas será copiada integralmente para o baseline.

## 7. Testes obrigatórios

### Estrutura

- instalação completa em banco vazio;
- segunda instalação em novo banco produz o mesmo catálogo;
- todas as tabelas, relações, checks, índices, funções, views e triggers esperados existem;
- não existem referências a objetos ausentes.

### Domínio

- Estados Oficiais aceitos e valores não oficiais rejeitados;
- PN único no limite empresarial definido;
- Roteiro publicado imutável;
- OF preserva versão de BOM e Roteiro;
- Necessidade nasce sem decisão automática;
- Decisão PCP preserva histórico e idempotência;
- Reserva não altera quantidade física;
- Consumo físico não ultrapassa reserva válida;
- rastreabilidade OF → necessidade → decisão → reserva/requisição.

### Segurança

- `public.usuarios` é a única autoridade de empresa, papel e permissões;
- `profiles` não existe como fonte de autorização;
- metadata não escolhe tenant;
- dois tenants não acessam nem alteram dados entre si;
- usuário inativo e empresa inativa não obtêm contexto;
- sessão anônima é negada;
- funções privilegiadas possuem grants mínimos e `search_path` seguro;
- todas as tabelas empresariais possuem RLS habilitada e testada.

### Migração

- dados legados válidos possuem destino conhecido;
- divergências de empresa, estado ou identidade geram erro de validação;
- nenhuma transformação descarta dado silenciosamente;
- rollback é ensaiado no ambiente isolado.

## 8. Critérios de conclusão

A Sprint 03 somente termina quando:

- 100% dos objetos restaurados estiverem classificados;
- o baseline instalar em banco vazio sem intervenção manual;
- o catálogo resultante for determinístico;
- todos os testes obrigatórios passarem;
- não houver falha crítica ou alta pendente em RLS ou `SECURITY DEFINER`;
- a fonte única `public.usuarios` estiver comprovada;
- o relatório de diferenças entre baseline esperado e obtido estiver vazio ou formalmente justificado;
- o baseline e os testes estiverem versionados;
- nenhuma alteração tiver sido aplicada ao banco remoto.

## 9. Gate para migrations evolutivas

Migrations evolutivas ficam proibidas até a conclusão formal desta Sprint. Depois disso, toda migration terá como ancestral lógico o baseline SQL NEXOTFE 1.0, e não a sequência histórica auditada.
