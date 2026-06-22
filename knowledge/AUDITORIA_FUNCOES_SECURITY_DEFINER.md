# Auditoria das Funções `SECURITY DEFINER` — NEXOTFE

**Data:** 21/06/2026  
**Escopo:** nove funções do schema `public` restaurado  
**Método:** análise estática de definições, dependências, triggers e policies  
**Alterações realizadas:** nenhuma

## 1. Conclusão executiva

As funções `SECURITY DEFINER` atuais não estão prontas para serem incorporadas ao baseline definitivo sem correções.

O maior risco é de isolamento multiempresa:

- `handle_new_auth_user()` aceita `empresa_slug` proveniente de `raw_user_meta_data`, conteúdo controlável pelo usuário durante cadastro;
- `empresa_atual_id()` utiliza duas fontes de tenant e permite que um `profile` inativo caia para o registro de `usuarios`;
- `set_empresa_id_from_usuario()` aceita `empresa_id` fornecido pelo chamador quando ele não é nulo.

Como `empresa_atual_id()` participa de 67 policies e 12 funções, uma falha nela se propaga por praticamente todo o controle multiempresa.

## 2. Limitações da evidência

O backup utilizado contém somente o schema `public` e foi criado sem privilégios. Portanto não foi possível comprovar:

- owner real das funções no Supabase;
- grants `EXECUTE` para `PUBLIC`, `anon`, `authenticated` e `service_role`;
- trigger real de `handle_new_auth_user()` no schema `auth`;
- ACLs das tabelas e sequences envolvidas.

Esses pontos permanecem gates obrigatórios. A ausência no backup não significa ausência no Supabase.

## 3. Controles positivos existentes

- Todas as nove funções fixam algum `search_path`.
- Consultas centrais usam referências explícitas como `public.profiles`, `public.empresas` e `auth.uid()`.
- `usuario_empresa_atual()` exige usuário, profile e empresa ativos.
- `usuario_e_admin()` exige profile ativo e nível `admin`.
- `proximo_codigo_empresa()` usa sequence, evitando `max(codigo)+1`.
- `validar_movimentacao_estoque()` impede relacionar item de outra empresa ao `empresa_id` do movimento.

Esses pontos são aproveitáveis, mas não neutralizam os riscos abaixo.

## 4. Riscos sistêmicos

### 4.1 Grants desconhecidos

PostgreSQL pode conceder `EXECUTE` a `PUBLIC` por padrão quando uma função é criada, salvo revogação explícita. Como os grants não estão no backup e não existem migrations locais para essas funções, não há evidência de menor privilégio.

Funções auxiliares como `proximo_codigo_empresa()` e `gerar_slug_empresa_unico()` não devem ser RPCs públicas. Funções de trigger também não devem possuir concessões além das necessárias ao mecanismo que as executa.

### 4.2 `search_path=public`

As nove funções usam exclusivamente `search_path=public`. Há qualificação explícita dos objetos mais importantes, reduzindo o risco, mas o padrão ainda é mais amplo que o necessário para funções privilegiadas.

Recomendação: qualificar todos os objetos e adotar `search_path` mínimo e imutável, preferencialmente vazio quando tecnicamente possível ou limitado a schemas confiáveis. Confirmar também que usuários de API não possuem `CREATE` no schema `public`.

### 4.3 Owner privilegiado desconhecido

`SECURITY DEFINER` executa com os privilégios do owner. O owner deve ser uma role `NOLOGIN`, controlada e com privilégios mínimos. Não foi possível confirmar essa condição no catálogo restaurado porque `--no-owner` foi usado intencionalmente.

### 4.4 Duas fontes de identidade empresarial

`profiles` e `usuarios` armazenam `empresa_id` e nível de acesso. Essa duplicação permite divergência e torna autorização dependente da precedência usada por cada função.

### Decisão normativa para o baseline

A autoridade de contexto será única:

- `public.usuarios` é a fonte oficial do vínculo do usuário com a empresa, do papel e das permissões;
- `auth.users` fornece somente identidade e autenticação; não decide empresa, papel ou permissão de negócio;
- `public.profiles` é estrutura legada e não poderá participar de RLS, autorização ou resolução de tenant no baseline definitivo;
- nenhuma função poderá usar fallback entre fontes;
- divergência existente entre `profiles` e `usuarios` deverá ser detectada e tratada durante a migração, nunca resolvida silenciosamente em tempo de execução.

Essa decisão não autoriza alteração imediata do banco. Ela é um requisito de desenho e teste do baseline definitivo.

## 5. Auditoria individual

### 5.1 `empresa_atual_id()` — CRÍTICA

Uso observado:

- 67 policies;
- 12 funções;
- base do isolamento multiempresa atual.

Problemas:

1. Consulta primeiro `profiles` apenas quando `ativo=true`.
2. Se o profile estiver inativo, usa `usuarios.empresa_id` sem condição equivalente de atividade.
3. Assim, desativar o profile pode não revogar o tenant do usuário.
4. Não valida `empresas.ativo`.
5. Não detecta divergência entre `profiles.empresa_id` e `usuarios.empresa_id`; apenas prioriza uma fonte.

Recomendação:

- definir uma única fonte normativa para tenant e papel;
- retornar tenant somente para vínculo e empresa ativos;
- falhar de forma segura diante de divergência;
- retornar `NULL` para sessão anônima, usuário desativado ou empresa desativada;
- testar todas as 67 policies após a correção.

### 5.2 `handle_new_auth_user()` — CRÍTICA

Problemas:

1. Lê `empresa_slug` de `new.raw_user_meta_data`.
2. Metadados informados durante signup não constituem autorização confiável.
3. Um usuário pode tentar indicar o slug de outra empresa e receber registros em `usuarios` e `profiles` naquele tenant.
4. Na ausência do slug, direciona usuários para `nexotfe-demo`, podendo misturar cadastros independentes.
5. Se nem a empresa indicada nem a demo existirem, o cadastro falha por `empresa_id NOT NULL`.
6. `ON CONFLICT DO NOTHING` pode conservar registros divergentes em vez de reconciliar ou rejeitar.
7. O trigger em `auth.users` não está presente no backup `public`; sua instalação real não foi comprovada.

Recomendação:

- nunca derivar tenant de metadado livre do usuário;
- aceitar somente vínculo empresarial previamente autorizado pelo backend;
- tornar o provisionamento idempotente com validação de consistência;
- registrar falhas e tentativas de vínculo inválido;
- confirmar trigger, owner e grants diretamente no Supabase.

### 5.3 `usuario_e_admin()` — ALTA

Uso observado: 22 policies.

Pontos positivos:

- exige `profiles.ativo=true`;
- exige `nivel_acesso='admin'`;
- associa profile ao tenant resolvido.

Riscos:

- herda integralmente as falhas de `empresa_atual_id()`;
- não exige empresa ativa;
- não detecta divergência de papel entre `usuarios` e `profiles`;
- uma alteração nessa função modifica simultaneamente 22 decisões de autorização.

Recomendação: corrigir em conjunto com o resolvedor de tenant e criar testes matriciais por papel, tenant e estado ativo/inativo.

### 5.4 `set_empresa_id_from_usuario()` — ALTA

Usada por quatro triggers de inserção.

Problema central:

```text
se empresa_id for nulo → preencher com empresa atual
se empresa_id vier informado → aceitar sem validação
```

Hoje a RLS bloqueia parte dos valores indevidos, mas a função privilegiada não deve depender exclusivamente de uma policy externa para preservar tenant.

Recomendação:

- sempre impor o tenant da sessão ou rejeitar divergência;
- rejeitar quando não houver tenant válido;
- não aceitar `empresa_id` arbitrário de payload;
- testar chamadas por usuário comum, admin, service role e sessão sem usuário.

### 5.5 `preparar_empresa_saas()` — ALTA

Executada antes de inserções e alterações de `empresas`.

Riscos:

- apenas gera `codigo` quando nulo; não impede alteração posterior;
- apenas define `plano='starter'` quando vazio; aceita qualquer plano fornecido;
- a policy de update da empresa não restringe colunas, permitindo que admin do tenant tente alterar plano, código e slug;
- depende de duas funções privilegiadas globais.

Recomendação:

- tratar código como imutável após criação;
- impedir alteração de plano por fluxo comum de tenant;
- validar conjunto permitido de planos;
- separar claramente campos autogerados de campos editáveis.

### 5.6 `gerar_slug_empresa_unico(...)` — MÉDIA

Pontos positivos:

- normaliza o slug;
- exclui a própria empresa durante atualização;
- a unique constraint continua sendo proteção final.

Riscos:

- se possuir `EXECUTE` público, permite sondar colisões globais de slug fora da RLS;
- o parâmetro `empresa_id_atual` é confiado ao chamador;
- duas transações concorrentes ainda podem escolher o mesmo slug e uma falhar na unique constraint;
- classificação `STABLE` merece confirmação diante da leitura global usada por trigger de escrita.

Recomendação: restringir execução à função de preparação e testar concorrência; não expor como RPC de API.

### 5.7 `proximo_codigo_empresa()` — MÉDIA

Ponto positivo: `nextval()` oferece sequência atômica.

Risco: com `EXECUTE` indevido, qualquer chamador pode consumir números da sequence global sem criar empresa, causando lacunas e potencial abuso operacional.

Recomendação: execução apenas pelo fluxo interno autorizado; confirmar owner e ACL da sequence.

### 5.8 `validar_movimentacao_estoque()` — MÉDIA

Ponto positivo: exige que o item pertença ao mesmo `empresa_id` do movimento.

Riscos:

- não compara `new.empresa_id` com o tenant da sessão;
- aceita item inativo, verificando apenas `deleted_at IS NULL`;
- depende da RLS para impedir tenant arbitrário;
- mensagem de erro diz “empresa atual”, mas a comparação é com o valor fornecido em `new.empresa_id`.

Recomendação: validar explicitamente tenant, estado do item e contexto operacional permitido.

### 5.9 `usuario_empresa_atual()` — BAIXA

É a função mais coerente do conjunto:

- limita por `auth.uid()`;
- exige profile ativo;
- exige empresa ativa;
- retorna apenas o contexto do próprio usuário.

Pendências:

- confirmar `EXECUTE` somente para papéis necessários;
- confirmar owner mínimo;
- alinhar com a fonte única de tenant decidida para `empresa_atual_id()`;
- testar sessão anônima e vínculo inconsistente.

## 6. Ordem recomendada de correção

1. Auditar grants e owners reais no Supabase.
2. Bloquear ingresso em tenant por `raw_user_meta_data`.
3. Definir fonte única de tenant e papel.
4. Corrigir `empresa_atual_id()` e `usuario_e_admin()` conjuntamente.
5. Corrigir `set_empresa_id_from_usuario()` para impor tenant.
6. Proteger campos empresariais sensíveis em `preparar_empresa_saas()`.
7. Restringir helpers globais de slug e sequência.
8. Endurecer `search_path` de todas as funções.
9. Validar triggers reais, especialmente `auth.users`.
10. Executar testes de RLS e concorrência antes do baseline definitivo.

## 7. Testes mínimos obrigatórios

### Tenant e cadastro

- signup com slug de outra empresa não cria vínculo;
- signup sem vínculo autorizado falha de forma controlada;
- profile inativo não recebe tenant por fallback de `usuarios`;
- empresa inativa não produz tenant nem autorização admin;
- divergência entre `profiles` e `usuarios` é detectada;
- sessão anônima retorna contexto vazio e nunca privilégios.

### Escrita multiempresa

- payload com `empresa_id` de outro tenant é rejeitado;
- payload com `empresa_id` nulo recebe somente o tenant correto;
- service role possui comportamento explícito e testado;
- movimento não aceita item inativo, removido ou de outra empresa.

### Privilégios

- `PUBLIC` e `anon` não executam helpers internos;
- `authenticated` executa apenas funções públicas previstas;
- trigger functions não aparecem como RPCs utilizáveis;
- owner das funções é `NOLOGIN` e possui apenas privilégios necessários;
- usuários de API não possuem `CREATE` no schema `public`.

### Concorrência

- códigos empresariais permanecem únicos sob criação simultânea;
- slugs concorrentes resultam em comportamento determinístico;
- falha parcial de provisionamento não deixa `usuarios` e `profiles` divergentes.

## 8. Decisão final

| Classificação | Quantidade |
|---|---:|
| Crítica | 2 |
| Alta | 3 |
| Média | 3 |
| Baixa | 1 |

**Funções aptas para baseline sem ajuste:** nenhuma.  
**Função conceitualmente mais próxima do aceitável:** `usuario_empresa_atual()`.  
**Correções bloqueantes:** `handle_new_auth_user()`, `empresa_atual_id()` e validação de grants/owners.

Nenhuma função foi alterada e nenhum comando foi executado no banco.
