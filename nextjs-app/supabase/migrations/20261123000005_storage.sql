-- Pakistan Jobs Portal — migration 5: Storage buckets and policies.
-- Paths:  resumes/{user_id}/{uuid}.pdf        company-logos/{company_id}/{uuid}.{ext}
--         company-documents/{company_id}/...   blog-images/{uuid}.{ext}
-- Resumes and company documents are PRIVATE: access is only through signed URLs minted by the app
-- using the *signed-in user's* client, so these policies are what authorize the download.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('resumes',           'resumes',           false, 5242880, array['application/pdf']),
  ('company-documents', 'company-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg']),
  ('company-logos',     'company-logos',     true,  1048576, array['image/png', 'image/jpeg', 'image/webp']),
  ('blog-images',       'blog-images',       true,  2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- An employer may read a resume file only if it was submitted with a (non-withdrawn) application to a
-- company where they are owner/recruiter. Admins can read for moderation.
create function public.can_read_resume_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a
    where a.status <> 'withdrawn'
      and a.resume_snapshot ->> 'pdf_path' = p_name
      and (public.is_admin() or public.company_member_role(a.company_id) in ('owner', 'recruiter'))
  )
$$;

create policy resumes_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text and public.has_role('job_seeker'));
create policy resumes_select on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_read_resume_object(name)));
create policy resumes_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy company_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'company-documents' and public.can_manage_company(public.safe_uuid((storage.foldername(name))[1])));
create policy company_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'company-documents' and public.can_manage_company(public.safe_uuid((storage.foldername(name))[1])));
create policy company_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-documents' and public.can_manage_company(public.safe_uuid((storage.foldername(name))[1])));

create policy company_logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'company-logos' and public.can_manage_company(public.safe_uuid((storage.foldername(name))[1])));
create policy company_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'company-logos' and public.can_manage_company(public.safe_uuid((storage.foldername(name))[1])));
create policy company_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-logos' and public.can_manage_company(public.safe_uuid((storage.foldername(name))[1])));

create policy blog_images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'blog-images' and public.is_admin());
create policy blog_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'blog-images' and public.is_admin());
create policy blog_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'blog-images' and public.is_admin());

-- Public buckets are readable by anyone through their public URL; this policy only lets API clients
-- list/RETURN rows (required for uploads that use INSERT ... RETURNING and for upserts).
create policy public_buckets_select on storage.objects for select to anon, authenticated
  using (bucket_id in ('company-logos', 'blog-images'));
