-- Corrige vazamento entre empresas (tenants): policies que usam
-- usuario_e_admin() sem tambem exigir empresa_id = empresa_atual_id()
-- deixam qualquer admin (de QUALQUER empresa) enxergar/alterar linhas
-- de TODAS as empresas, ja que usuario_e_admin() so verifica se o
-- usuario atual e admin da propria empresa - nao restringe a QUAL
-- empresa a linha pertence.
--
-- Encontrado ao testar login da Enifer (segunda empresa real do
-- sistema): GET /usuarios como admin da Enifer trazia tambem usuarios
-- da NEXOTFE Demo.
--
-- Varredura de toda policy que usa usuario_e_admin() (pg_policies)
-- encontrou 3 tabelas com o mesmo padrao de falha: usuarios,
-- credenciais e recursos_produtivos. Todas as demais ja faziam
-- "empresa_id = empresa_atual_id() AND usuario_e_admin()" corretamente
-- (padrao seguro, usado como referencia aqui).

-- usuarios: SELECT proprio perfil OU admin da MESMA empresa.
drop policy "Usuarios podem ver o proprio perfil" on public.usuarios;

create policy "Usuarios podem ver o proprio perfil"
  on public.usuarios
  for select
  to authenticated
  using (
    id = auth.uid()
    or (usuario_e_admin() and empresa_id = empresa_atual_id())
  );

-- usuarios: policy ALL (insert/update/delete) tambem sem escopo de
-- empresa - mesmo corrigindo a policy de SELECT acima, esta continuaria
-- permitindo um admin da Enifer alterar/excluir usuarios da NEXOTFE
-- Demo (e via OR de policies permissivas, tambem re-abriria o SELECT).
drop policy "Admins gerenciam usuarios" on public.usuarios;

create policy "Admins gerenciam usuarios"
  on public.usuarios
  for all
  to authenticated
  using (usuario_e_admin() and empresa_id = empresa_atual_id())
  with check (usuario_e_admin() and empresa_id = empresa_atual_id());

-- credenciais: mesmo padrao, nas 4 policies (select/insert/update/delete).
drop policy "Usuarios veem credenciais sob responsabilidade" on public.credenciais;

create policy "Usuarios veem credenciais sob responsabilidade"
  on public.credenciais
  for select
  to authenticated
  using (
    usuario_responsavel = auth.uid()
    or (usuario_e_admin() and empresa_id = empresa_atual_id())
  );

drop policy "Usuarios criam credenciais para si" on public.credenciais;

create policy "Usuarios criam credenciais para si"
  on public.credenciais
  for insert
  to authenticated
  with check (
    usuario_responsavel = auth.uid()
    or (usuario_e_admin() and empresa_id = empresa_atual_id())
  );

drop policy "Usuarios atualizam suas credenciais" on public.credenciais;

create policy "Usuarios atualizam suas credenciais"
  on public.credenciais
  for update
  to authenticated
  using (
    usuario_responsavel = auth.uid()
    or (usuario_e_admin() and empresa_id = empresa_atual_id())
  )
  with check (
    usuario_responsavel = auth.uid()
    or (usuario_e_admin() and empresa_id = empresa_atual_id())
  );

drop policy "Usuarios removem suas credenciais" on public.credenciais;

create policy "Usuarios removem suas credenciais"
  on public.credenciais
  for delete
  to authenticated
  using (
    usuario_responsavel = auth.uid()
    or (usuario_e_admin() and empresa_id = empresa_atual_id())
  );

-- recursos_produtivos: policy de UPDATE sem escopo de empresa (a de
-- DELETE ja estava correta).
drop policy "nexotfe recursos produtivos update criador ou admin" on public.recursos_produtivos;

create policy "nexotfe recursos produtivos update criador ou admin"
  on public.recursos_produtivos
  for update
  to authenticated
  using (
    created_by = auth.uid()
    or (usuario_e_admin() and empresa_id = empresa_atual_id())
  )
  with check (
    created_by = auth.uid()
    or (usuario_e_admin() and empresa_id = empresa_atual_id())
  );
