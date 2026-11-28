-- Pakistan Jobs Portal — migration 4: Row Level Security policies, grants, public search functions.
-- Rule of thumb: NO client write policy exists for job status, memberships, verification, applications,
-- notifications (insert), audit logs or rate limits. Those only change through migration-3 functions.

-- ---------------------------------------------------------------- policy helpers
create function public.job_company_id(p_job uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select company_id from public.jobs where id = p_job
$$;
create function public.job_editable(p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.jobs j where j.id = p_job
                 and (j.status in ('draft', 'rejected', 'changes_requested', 'approved', 'expired')
                      or (j.status = 'pending_review' and public.is_admin())))
$$;
create function public.company_is_verified(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.companies c where c.id = p_company and c.verification_status = 'verified')
$$;
create function public.shares_company_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_members a join public.company_members b on a.company_id = b.company_id
                 where a.user_id = auth.uid() and b.user_id = p_user and public.current_profile_ok())
$$;

-- ---------------------------------------------------------------- profiles
create policy profiles_select_own    on public.profiles for select using (id = (select auth.uid()));
create policy profiles_select_admin  on public.profiles for select using (public.is_admin());
create policy profiles_select_team   on public.profiles for select using (public.shares_company_with(id));
create policy profiles_update_own    on public.profiles for update using (id = (select auth.uid()) and public.current_profile_ok())
                                                              with check (id = (select auth.uid()));

-- ---------------------------------------------------------------- categories
create policy job_categories_read   on public.job_categories for select using (true);
create policy job_categories_admin  on public.job_categories for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- companies
create policy companies_select on public.companies for select using (verification_status = 'verified' or public.can_view_company(id));
create policy companies_insert_admin on public.companies for insert with check (public.is_admin());
create policy companies_update on public.companies for update using (public.can_manage_company(id)) with check (public.can_manage_company(id));
create policy companies_delete_admin on public.companies for delete using (public.is_admin());

create policy company_private_select on public.company_private for select using (public.can_view_company(company_id));
create policy company_private_insert on public.company_private for insert with check (public.can_manage_company(company_id));
create policy company_private_update on public.company_private for update using (public.can_manage_company(company_id)) with check (public.can_manage_company(company_id));

create policy company_members_select on public.company_members for select
  using (user_id = (select auth.uid()) or public.can_view_company(company_id));

create policy company_invitations_select on public.company_invitations for select using (public.can_manage_company(company_id));

create policy company_docs_select on public.company_verification_documents for select using (public.can_manage_company(company_id));
create policy company_docs_insert on public.company_verification_documents for insert
  with check (public.can_manage_company(company_id) and uploaded_by = (select auth.uid()));
create policy company_docs_delete on public.company_verification_documents for delete using (public.can_manage_company(company_id));

-- ---------------------------------------------------------------- jobs
create policy jobs_select on public.jobs for select using (public.can_view_company(company_id));
create policy jobs_insert on public.jobs for insert with check (public.can_recruit(company_id) and status = 'draft');
create policy jobs_update on public.jobs for update using (public.can_recruit(company_id)) with check (public.can_recruit(company_id));
create policy jobs_delete on public.jobs for delete
  using (public.can_recruit(company_id) and status in ('draft', 'rejected', 'changes_requested', 'archived'));

create policy job_translations_select on public.job_translations for select using (public.can_view_company(public.job_company_id(job_id)));
create policy job_translations_insert on public.job_translations for insert
  with check (public.can_recruit(public.job_company_id(job_id)) and public.job_editable(job_id));
create policy job_translations_update on public.job_translations for update
  using (public.can_recruit(public.job_company_id(job_id)) and public.job_editable(job_id))
  with check (public.can_recruit(public.job_company_id(job_id)) and public.job_editable(job_id));
create policy job_translations_delete on public.job_translations for delete
  using (public.can_recruit(public.job_company_id(job_id)) and public.job_editable(job_id));

-- Public copy: anyone may read approved jobs of VERIFIED companies. Nobody writes it directly.
create policy job_published_read on public.job_published for select using (public.company_is_verified(company_id));
create policy job_published_translations_read on public.job_published_translations for select
  using (exists (select 1 from public.job_published jp where jp.job_id = job_published_translations.job_id));

create policy job_reviews_select on public.job_reviews for select using (public.can_view_company(public.job_company_id(job_id)));
create policy job_clicks_select on public.job_external_clicks for select using (public.can_recruit(company_id));

-- ---------------------------------------------------------------- candidates
create policy candidate_profiles_select on public.candidate_profiles for select using (user_id = (select auth.uid()));
create policy candidate_profiles_insert on public.candidate_profiles for insert
  with check (user_id = (select auth.uid()) and public.has_role('job_seeker'));
create policy candidate_profiles_update on public.candidate_profiles for update
  using (user_id = (select auth.uid()) and public.has_role('job_seeker')) with check (user_id = (select auth.uid()));

create policy resumes_select on public.resumes for select using (user_id = (select auth.uid()));
create policy resumes_insert on public.resumes for insert with check (user_id = (select auth.uid()) and public.has_role('job_seeker'));
create policy resumes_update on public.resumes for update
  using (user_id = (select auth.uid()) and public.has_role('job_seeker')) with check (user_id = (select auth.uid()));
create policy resumes_delete on public.resumes for delete using (user_id = (select auth.uid()));

create policy saved_jobs_select on public.saved_jobs for select using (user_id = (select auth.uid()));
create policy saved_jobs_insert on public.saved_jobs for insert
  with check (user_id = (select auth.uid()) and public.has_role('job_seeker')
              and exists (select 1 from public.job_published jp where jp.job_id = saved_jobs.job_id));
create policy saved_jobs_delete on public.saved_jobs for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- applications
-- Candidate: own rows. Company: owners/recruiters (+ admin read-only for moderation). Viewers: NO access.
create policy applications_select on public.applications for select
  using (candidate_id = (select auth.uid()) or public.can_recruit(company_id));
create policy application_answers_select on public.application_answers for select
  using (exists (select 1 from public.applications a where a.id = application_answers.application_id));
create policy application_events_select on public.application_events for select
  using (exists (select 1 from public.applications a where a.id = application_events.application_id));

create policy application_notes_select on public.application_notes for select using (public.can_recruit(company_id));
create policy application_notes_insert on public.application_notes for insert
  with check (public.can_recruit(company_id) and author_id = (select auth.uid())
              and exists (select 1 from public.applications a where a.id = application_notes.application_id and a.company_id = application_notes.company_id));
create policy application_notes_delete on public.application_notes for delete using (author_id = (select auth.uid()));

-- ---------------------------------------------------------------- notifications, audit, settings, blog
create policy notifications_select on public.notifications for select using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete using (user_id = (select auth.uid()));

create policy audit_logs_select on public.audit_logs for select using (public.is_admin());

create policy site_settings_read  on public.site_settings for select using (true);
create policy site_settings_admin on public.site_settings for all using (public.is_admin()) with check (public.is_admin());

create policy blog_categories_read  on public.blog_categories for select using (true);
create policy blog_categories_admin on public.blog_categories for all using (public.is_admin()) with check (public.is_admin());
create policy blog_posts_read  on public.blog_posts for select using ((status = 'published' and published_at <= now()) or public.is_admin());
create policy blog_posts_admin on public.blog_posts for all using (public.is_admin()) with check (public.is_admin());
create policy blog_translations_read on public.blog_post_translations for select
  using (exists (select 1 from public.blog_posts p where p.id = blog_post_translations.post_id));
create policy blog_translations_admin on public.blog_post_translations for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- grants (defense in depth on top of RLS)
revoke all on all tables in schema public from anon;
revoke update on public.profiles from authenticated;
grant  update (full_name, phone, city, province, preferred_locale) on public.profiles to authenticated;
revoke update on public.notifications from authenticated;
grant  update (read_at) on public.notifications to authenticated;
revoke insert, update, delete on public.audit_logs, public.rate_limits, public.job_published, public.job_published_translations,
  public.job_reviews, public.job_external_clicks, public.applications, public.application_answers, public.application_events,
  public.company_members, public.company_invitations from authenticated;
revoke all on public.rate_limits from authenticated;

-- What anonymous visitors may read (rows are further limited by the policies above).
grant select on public.job_categories, public.job_published, public.job_published_translations,
  public.blog_categories, public.blog_posts, public.blog_post_translations, public.site_settings to anon;
grant select (id, name, slug, description, logo_path, industry, website, country, city, size, created_at, verification_status)
  on public.companies to anon;

-- ---------------------------------------------------------------- public read API (SECURITY INVOKER: RLS applies)
create function public.search_jobs(
  p_q text default null, p_locale public.locale_code default 'en', p_category text default null,
  p_province text default null, p_city text default null, p_employment public.employment_type default null,
  p_workplace public.workplace_type default null, p_sector public.job_sector default null,
  p_salary_min numeric default null, p_company uuid default null, p_featured_only boolean default false,
  p_sort text default 'latest', p_limit int default 20, p_offset int default 0
) returns table (
  job_id uuid, slug text, ref_no bigint, title text, title_locale public.locale_code,
  company_id uuid, company_name text, company_slug text, company_logo text,
  category_slug text, category_name text, sector public.job_sector,
  employment_type public.employment_type, workplace_type public.workplace_type,
  city text, province text, salary_min numeric, salary_max numeric, salary_currency text, salary_period text, salary_text text,
  vacancies int, deadline date, featured boolean, published_at timestamptz, application_method public.application_method,
  total_count bigint
)
language sql stable set search_path = '' as $$
  with base as (
    select jp.job_id, jp.slug, jp.ref_no, tl.title, tl.locale as title_locale,
           c.id as company_id, c.name as company_name, c.slug as company_slug, c.logo_path as company_logo,
           cat.slug as category_slug,
           case when p_locale = 'ur' then coalesce(cat.name_ur, cat.name_en) else cat.name_en end as category_name,
           jp.sector, jp.employment_type, jp.workplace_type, jp.city, jp.province,
           jp.salary_min, jp.salary_max, jp.salary_currency, jp.salary_period, tl.salary_text,
           jp.vacancies, jp.deadline, jp.featured, jp.published_at, jp.application_method,
           case when nullif(btrim(p_q), '') is null then 0
                else ts_rank(jp.search_tsv, websearch_to_tsquery('simple', p_q)) end as rank
    from public.job_published jp
    join public.companies c on c.id = jp.company_id and c.verification_status = 'verified'
    left join public.job_categories cat on cat.id = jp.category_id
    left join lateral (
      select t.title, t.locale, t.salary_text from public.job_published_translations t
      where t.job_id = jp.job_id order by (t.locale = p_locale) desc, (t.locale = jp.default_language) desc limit 1
    ) tl on true
    where jp.deadline >= public.today_pk()
      and (nullif(btrim(p_q), '') is null or jp.search_tsv @@ websearch_to_tsquery('simple', p_q))
      and (p_category is null or cat.slug = p_category)
      and (p_province is null or lower(jp.province) = lower(p_province))
      and (p_city is null or lower(jp.city) = lower(p_city))
      and (p_employment is null or jp.employment_type = p_employment)
      and (p_workplace is null or jp.workplace_type = p_workplace)
      and (p_sector is null or jp.sector = p_sector)
      and (p_salary_min is null or coalesce(jp.salary_max, jp.salary_min) >= p_salary_min)
      and (p_company is null or jp.company_id = p_company)
      and (not coalesce(p_featured_only, false) or jp.featured)
  )
  select b.job_id, b.slug, b.ref_no, b.title, b.title_locale, b.company_id, b.company_name, b.company_slug, b.company_logo,
         b.category_slug, b.category_name, b.sector, b.employment_type, b.workplace_type, b.city, b.province,
         b.salary_min, b.salary_max, b.salary_currency, b.salary_period, b.salary_text,
         b.vacancies, b.deadline, b.featured, b.published_at, b.application_method,
         count(*) over () as total_count
  from base b
  order by
    case when p_sort = 'deadline' then b.deadline end asc nulls last,
    case when p_sort = 'salary' then coalesce(b.salary_max, b.salary_min) end desc nulls last,
    case when p_sort = 'relevance' then b.rank end desc nulls last,
    case when p_sort = 'latest' then b.featured::int end desc,
    b.published_at desc, b.job_id
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;

create function public.list_companies(p_q text default null, p_limit int default 24, p_offset int default 0)
returns table (id uuid, slug text, name text, description text, logo_path text, industry text, city text, size text, website text, open_jobs int, total_count bigint)
language sql stable set search_path = '' as $$
  select c.id, c.slug, c.name, left(c.description, 300), c.logo_path, c.industry, c.city, c.size, c.website,
         (select count(*)::int from public.job_published jp where jp.company_id = c.id and jp.deadline >= public.today_pk()),
         count(*) over ()
  from public.companies c
  where c.verification_status = 'verified'
    and (nullif(btrim(p_q), '') is null or c.name ilike '%' || replace(replace(btrim(p_q), '%', ''), '_', '') || '%')
  order by 10 desc, c.name
  limit least(greatest(coalesce(p_limit, 24), 1), 60) offset greatest(coalesce(p_offset, 0), 0)
$$;

create function public.job_facets(p_locale public.locale_code default 'en') returns jsonb
language sql stable set search_path = '' as $$
  with live as (
    select jp.* from public.job_published jp
    where jp.deadline >= public.today_pk() and public.company_is_verified(jp.company_id)
  )
  select jsonb_build_object(
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('value', city, 'count', n) order by n desc, city), '[]'::jsonb)
               from (select city, count(*) n from live where city is not null group by city) s),
    'provinces', (select coalesce(jsonb_agg(jsonb_build_object('value', province, 'count', n) order by n desc, province), '[]'::jsonb)
               from (select province, count(*) n from live where province is not null group by province) s),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'count', n) order by n desc, name), '[]'::jsonb)
               from (select cat.slug, case when p_locale = 'ur' then coalesce(cat.name_ur, cat.name_en) else cat.name_en end as name, count(*) n
                     from live join public.job_categories cat on cat.id = live.category_id group by cat.slug, cat.name_en, cat.name_ur) s),
    'totals', jsonb_build_object('jobs', (select count(*) from live), 'vacancies', (select coalesce(sum(vacancies), 0) from live),
                                 'government', (select count(*) from live where sector = 'government')))
$$;

grant execute on function public.search_jobs(text, public.locale_code, text, text, text, public.employment_type, public.workplace_type, public.job_sector, numeric, uuid, boolean, text, int, int) to anon, authenticated;
grant execute on function public.list_companies(text, int, int) to anon, authenticated;
grant execute on function public.job_facets(public.locale_code) to anon, authenticated;
