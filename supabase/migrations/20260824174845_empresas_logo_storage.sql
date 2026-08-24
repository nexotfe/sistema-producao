-- Logo global por empresa: coluna de referência + bucket dedicado.
--
-- Bucket público (leitura deliberadamente pública - logo não é dado
-- confidencial), mas escrita (INSERT), leitura via RLS (SELECT) e
-- remoção (DELETE) exigem usuario_e_admin() da própria empresa (pasta
-- = empresa_atual_id()), mesmo padrão já usado no bucket
-- itens-industriais-pdfs.
--
-- SELECT aqui NÃO é sobre a leitura pública da imagem (essa continua
-- via URL direta, bucket público, sem RLS) - é pré-requisito real para
-- o próprio DELETE funcionar: confirmado em teste local (container
-- isolado, migration aplicada verbatim) que UPDATE/DELETE em RLS do
-- Postgres exigem visibilidade da linha via uma policy de SELECT
-- aplicável, independente da USING clause da própria policy de
-- DELETE - sem SELECT, um DELETE com policy correta ainda casa zero
-- linhas. A limpeza do arquivo antigo em enviarLogoEmpresa.ts e a
-- remoção em removerLogoEmpresa.ts ficariam mudas em produção sem isto.
--
-- Sem UPDATE: cada substituição sobe um arquivo NOVO (path com UUID,
-- nunca reaproveitado) para eliminar cache de CDN da logo antiga -
-- nunca upsert no mesmo caminho. O antigo é removido à parte, depois
-- de empresas.logo_path já apontar para o novo (ver
-- enviarLogoEmpresa.ts - storage e banco não compartilham transação,
-- por isso a ordem importa e falhas parciais são toleradas ali).
--
-- CHECK abaixo é defesa em profundidade: garante no schema (não só via
-- RLS/aplicação) que uma empresa nunca pode ter logo_path apontando
-- para a pasta de outra empresa, mesmo com update manual/erro de
-- aplicação.

alter table public.empresas
  add column logo_path text;

alter table public.empresas
  add constraint empresas_logo_path_pertence_empresa
  check (logo_path is null or logo_path like id::text || '/%');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'empresas-logos',
  'empresas-logos',
  true,
  2097152, -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp']
);

create policy "nexotfe logos insert admin mesma empresa"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'empresas-logos'
    and (storage.foldername(name))[1] = (public.empresa_atual_id())::text
    and public.usuario_e_admin()
  );

create policy "nexotfe logos select admin mesma empresa"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'empresas-logos'
    and (storage.foldername(name))[1] = (public.empresa_atual_id())::text
    and public.usuario_e_admin()
  );

create policy "nexotfe logos delete admin mesma empresa"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'empresas-logos'
    and (storage.foldername(name))[1] = (public.empresa_atual_id())::text
    and public.usuario_e_admin()
  );
