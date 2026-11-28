-- Pakistan Jobs Portal — migration 3: guard triggers and the SECURITY DEFINER workflow functions.
-- These functions are the ONLY way to change job status, membership, verification, applications and
-- account status. Each one re-checks the caller itself (auth.uid(), role, membership) — never trust a
-- role/company/user id that arrives as an argument without checking it against the session.
--
-- Errors are raised as short machine codes (e.g. 'company_not_verified') that the app maps to
-- localized messages. 42501 = insufficient_privilege.

-- ---------------------------------------------------------------- internal helpers (not callable by clients)
create function public.write_audit(p_action text, p_entity text, p_entity_id uuid, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb))
$$;

create function public.notify_user(p_user uuid, p_type text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, payload) values (p_user, p_type, coalesce(p_payload, '{}'::jsonb))
$$;

create function public.notify_company(p_company uuid, p_type text, p_payload jsonb default '{}'::jsonb, p_include_viewers boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, payload)
  select m.user_id, p_type, coalesce(p_payload, '{}'::jsonb)
  from public.company_members m
  where m.company_id = p_company and (m.role in ('owner', 'recruiter') or p_include_viewers)
$$;

create function public.notify_admins(p_type text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, payload)
  select p.id, p_type, coalesce(p_payload, '{}'::jsonb) from public.profiles p where p.role = 'admin' and p.status = 'active'
$$;

create function public.job_snapshot(p_job uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'job', to_jsonb(j),
    'translations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.job_translations t where t.job_id = j.id))
  from public.jobs j where j.id = p_job
$$;

revoke execute on function public.write_audit(text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_user(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_company(uuid, text, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.notify_admins(text, jsonb) from public, anon, authenticated;
revoke execute on function public.job_snapshot(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- jobs guard triggers
create function public.jobs_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  ignore_keys constant text[] := array['status', 'updated_at', 'featured', 'slug', 'published_at', 'last_approved_at'];
  v_changed boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;   -- SECURITY DEFINER workflow functions / service role / migrations
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.featured then
      raise exception 'forbidden_job_change' using errcode = '42501';
    end if;
    new.published_at := null;
    new.last_approved_at := null;
    new.created_by := auth.uid();
    return new;
  end if;

  -- UPDATE by a client
  if new.company_id <> old.company_id or new.ref_no <> old.ref_no
     or new.created_by is distinct from old.created_by
     or new.published_at is distinct from old.published_at
     or new.last_approved_at is distinct from old.last_approved_at
     or new.status <> old.status or new.featured <> old.featured then
    raise exception 'forbidden_job_change' using errcode = '42501';
  end if;

  v_changed := (to_jsonb(new) - ignore_keys) is distinct from (to_jsonb(old) - ignore_keys);
  if v_changed then
    if old.status = 'archived' or (old.status = 'pending_review' and not public.is_admin()) then
      raise exception 'job_locked' using errcode = 'P0001';
    end if;
    -- Editing a live (approved) or expired job starts a NEW draft revision. The approved public copy in
    -- job_published stays online untouched until an admin approves the revision.
    if old.status in ('approved', 'expired') then
      new.status := 'draft';
    end if;
  end if;
  return new;
end $$;
create trigger jobs_a_guard before insert or update on public.jobs for each row execute function public.jobs_guard();

create function public.jobs_set_slug() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or old.published_at is null then
    new.slug := new.slug_base || '-' || new.ref_no::text;
  else
    new.slug := old.slug;   -- URL stays stable once the job has been published
  end if;
  return new;
end $$;
create trigger jobs_b_slug before insert or update on public.jobs for each row execute function public.jobs_set_slug();
create trigger jobs_c_touch before update on public.jobs for each row execute function public.touch_updated_at();

-- A translation edit counts as a content edit of the job.
create function public.job_translations_after_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return null;
  end if;
  update public.jobs set status = 'draft' where id = coalesce(new.job_id, old.job_id) and status in ('approved', 'expired');
  return null;
end $$;
create trigger job_translations_z_after after insert or update or delete on public.job_translations
  for each row execute function public.job_translations_after_change();

-- ---------------------------------------------------------------- job workflow
create function public.submit_job_for_review(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.jobs; c public.companies;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;
  if not public.current_profile_ok() or not public.can_recruit(j.company_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if j.status not in ('draft', 'rejected', 'changes_requested') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  select * into c from public.companies where id = j.company_id;
  if c.verification_status <> 'verified' then raise exception 'company_not_verified' using errcode = 'P0001'; end if;
  if j.category_id is null then raise exception 'category_required' using errcode = 'P0001'; end if;
  if coalesce(btrim(j.city), '') = '' then raise exception 'location_required' using errcode = 'P0001'; end if;
  if j.deadline is null or j.deadline < public.today_pk() then raise exception 'deadline_required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.job_translations t
                 where t.job_id = j.id and t.locale = j.default_language and char_length(btrim(t.description)) >= 30) then
    raise exception 'content_required' using errcode = 'P0001';
  end if;
  if j.application_method = 'external_url' and j.external_url is null then raise exception 'external_url_required' using errcode = 'P0001'; end if;
  if j.application_method = 'external_email' and j.external_email is null then raise exception 'external_email_required' using errcode = 'P0001'; end if;

  update public.jobs set status = 'pending_review' where id = j.id;
  insert into public.job_reviews (job_id, actor_id, action, from_status, to_status, snapshot)
  values (j.id, auth.uid(), 'submitted', j.status, 'pending_review', public.job_snapshot(j.id));
  perform public.notify_admins('job_submitted', jsonb_build_object('job_id', j.id, 'company_id', j.company_id));
  perform public.write_audit('job.submitted', 'job', j.id, jsonb_build_object('from', j.status));
end $$;

create function public.withdraw_job(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;
  if not public.current_profile_ok() or not public.can_recruit(j.company_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if j.status <> 'pending_review' then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  update public.jobs set status = 'draft' where id = j.id;
  insert into public.job_reviews (job_id, actor_id, action, from_status, to_status) values (j.id, auth.uid(), 'withdrawn', j.status, 'draft');
  perform public.write_audit('job.withdrawn', 'job', j.id);
end $$;

create function public.archive_job(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;
  if not public.current_profile_ok() or not public.can_recruit(j.company_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if j.status = 'archived' then return; end if;
  update public.jobs set status = 'archived' where id = j.id;
  delete from public.job_published where job_id = j.id;      -- archiving takes the live version offline
  insert into public.job_reviews (job_id, actor_id, action, from_status, to_status) values (j.id, auth.uid(), 'archived', j.status, 'archived');
  perform public.write_audit('job.archived', 'job', j.id);
end $$;

create function public.restore_job(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;
  if not public.current_profile_ok() or not public.can_recruit(j.company_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if j.status <> 'archived' then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  update public.jobs set status = 'draft' where id = j.id;
  perform public.write_audit('job.restored', 'job', j.id);
end $$;

-- Copies the approved working copy to the public tables. Internal.
create function public.publish_job_copy(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.job_published (
    job_id, ref_no, slug, company_id, category_id, default_language, sector, employment_type, workplace_type,
    country, province, city, salary_min, salary_max, salary_currency, salary_period, vacancies, deadline,
    application_method, external_url, external_email, screening_questions, source, featured, published_at, approved_at, search_text)
  select j.id, j.ref_no, j.slug, j.company_id, j.category_id, j.default_language, j.sector, j.employment_type, j.workplace_type,
         j.country, j.province, j.city, j.salary_min, j.salary_max, j.salary_currency, j.salary_period, j.vacancies, j.deadline,
         j.application_method, j.external_url, j.external_email, j.screening_questions, j.source, j.featured, j.published_at, now(),
         (select concat_ws(' ', c.name, j.city, j.province, cat.name_en, cat.name_ur,
                 (select string_agg(t.title || ' ' || t.description || ' ' || t.requirements, ' ') from public.job_translations t where t.job_id = j.id))
          from public.companies c left join public.job_categories cat on cat.id = j.category_id where c.id = j.company_id)
  from public.jobs j where j.id = p_job
  on conflict (job_id) do update set
    slug = excluded.slug, category_id = excluded.category_id, default_language = excluded.default_language,
    sector = excluded.sector, employment_type = excluded.employment_type, workplace_type = excluded.workplace_type,
    country = excluded.country, province = excluded.province, city = excluded.city,
    salary_min = excluded.salary_min, salary_max = excluded.salary_max, salary_currency = excluded.salary_currency,
    salary_period = excluded.salary_period, vacancies = excluded.vacancies, deadline = excluded.deadline,
    application_method = excluded.application_method, external_url = excluded.external_url,
    external_email = excluded.external_email, screening_questions = excluded.screening_questions,
    source = excluded.source, featured = excluded.featured, approved_at = excluded.approved_at,
    search_text = excluded.search_text;

  delete from public.job_published_translations where job_id = p_job;
  insert into public.job_published_translations
    (job_id, locale, title, description, responsibilities, requirements, benefits, experience, education, salary_text, how_to_apply)
  select t.job_id, t.locale, t.title, t.description, t.responsibilities, t.requirements, t.benefits, t.experience, t.education, t.salary_text, t.how_to_apply
  from public.job_translations t where t.job_id = p_job;
end $$;
revoke execute on function public.publish_job_copy(uuid) from public, anon, authenticated;

-- Admin-only moderation. p_action: approve | reject | request_changes | unpublish
create function public.review_job(p_job uuid, p_action text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.jobs; c public.companies; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_to public.job_status; v_act public.review_action;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;
  if p_action not in ('approve', 'reject', 'request_changes', 'unpublish') then raise exception 'invalid_action' using errcode = 'P0001'; end if;

  if p_action = 'unpublish' then
    if v_reason is null then raise exception 'reason_required' using errcode = 'P0001'; end if;
    delete from public.job_published where job_id = j.id;
    v_to := 'archived'; v_act := 'unpublished';
  else
    if j.status <> 'pending_review' then raise exception 'invalid_status' using errcode = 'P0001'; end if;
    if p_action in ('reject', 'request_changes') and (v_reason is null or char_length(v_reason) < 3) then
      raise exception 'reason_required' using errcode = 'P0001';
    end if;
    if p_action = 'approve' then
      select * into c from public.companies where id = j.company_id;
      if c.verification_status <> 'verified' then raise exception 'company_not_verified' using errcode = 'P0001'; end if;
      if j.deadline is null or j.deadline < public.today_pk() then raise exception 'deadline_passed' using errcode = 'P0001'; end if;
      update public.jobs set status = 'approved', published_at = coalesce(published_at, now()), last_approved_at = now() where id = j.id;
      perform public.publish_job_copy(j.id);
      v_to := 'approved'; v_act := 'approved';
    elsif p_action = 'reject' then
      v_to := 'rejected'; v_act := 'rejected';
    else
      v_to := 'changes_requested'; v_act := 'changes_requested';
    end if;
  end if;

  if p_action <> 'approve' then
    update public.jobs set status = v_to where id = j.id;
  end if;
  insert into public.job_reviews (job_id, actor_id, action, reason, from_status, to_status, snapshot)
  values (j.id, auth.uid(), v_act, v_reason, j.status, v_to, public.job_snapshot(j.id));
  perform public.notify_company(j.company_id, 'job_' || v_act::text,
    jsonb_build_object('job_id', j.id, 'reason', v_reason));
  perform public.write_audit('job.' || v_act::text, 'job', j.id, jsonb_build_object('reason', v_reason));
end $$;

create function public.set_job_featured(p_job uuid, p_featured boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.jobs set featured = coalesce(p_featured, false) where id = p_job;
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;
  update public.job_published set featured = coalesce(p_featured, false) where job_id = p_job;
  perform public.write_audit('job.featured', 'job', p_job, jsonb_build_object('featured', p_featured));
end $$;

-- Marks approved jobs past their deadline as expired (public pages also filter by deadline, so this is
-- bookkeeping, not a correctness dependency). Service role / cron only.
create function public.expire_jobs() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with e as (
    update public.jobs set status = 'expired' where status = 'approved' and deadline < public.today_pk() returning id
  ) select count(*) into n from e;
  return n;
end $$;
revoke execute on function public.expire_jobs() from public, anon, authenticated;
grant execute on function public.expire_jobs() to service_role;

-- ---------------------------------------------------------------- companies
create function public.create_company(
  p_name text, p_description text, p_industry text, p_website text, p_email text,
  p_phone text, p_country text, p_city text, p_address text, p_size text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_role('employer') then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.companies where created_by = auth.uid()) >= 10 then raise exception 'company_limit' using errcode = 'P0001'; end if;
  insert into public.companies (name, description, industry, website, country, city, size, managed_by, verification_status, created_by)
  values (btrim(p_name), coalesce(p_description, ''), nullif(btrim(p_industry), ''), nullif(btrim(p_website), ''),
          coalesce(nullif(btrim(p_country), ''), 'Pakistan'), nullif(btrim(p_city), ''), nullif(p_size, ''), 'self', 'pending', auth.uid())
  returning id into v_id;
  insert into public.company_private (company_id, email, phone, address)
  values (v_id, nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_address), ''));
  insert into public.company_members (company_id, user_id, role) values (v_id, auth.uid(), 'owner');
  perform public.notify_admins('company_submitted', jsonb_build_object('company_id', v_id));
  perform public.write_audit('company.created', 'company', v_id, jsonb_build_object('managed_by', 'self'));
  return v_id;
end $$;

create function public.admin_create_company(
  p_name text, p_description text, p_industry text, p_website text, p_email text,
  p_phone text, p_country text, p_city text, p_address text, p_size text, p_verified boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.companies (name, description, industry, website, country, city, size, managed_by, verification_status, verified_at, verified_by, created_by)
  values (btrim(p_name), coalesce(p_description, ''), nullif(btrim(p_industry), ''), nullif(btrim(p_website), ''),
          coalesce(nullif(btrim(p_country), ''), 'Pakistan'), nullif(btrim(p_city), ''), nullif(p_size, ''), 'platform',
          case when p_verified then 'verified'::public.company_verification else 'pending'::public.company_verification end,
          case when p_verified then now() end, case when p_verified then auth.uid() end, auth.uid())
  returning id into v_id;
  insert into public.company_private (company_id, email, phone, address)
  values (v_id, nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_address), ''));
  perform public.write_audit('company.created', 'company', v_id, jsonb_build_object('managed_by', 'platform'));
  return v_id;
end $$;

create function public.admin_set_company_verification(p_company uuid, p_status public.company_verification, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.companies; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.companies where id = p_company for update;
  if not found then raise exception 'company_not_found' using errcode = 'P0001'; end if;
  if p_status in ('rejected', 'suspended') and v_note is null then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.companies set verification_status = p_status,
    verified_at = case when p_status = 'verified' then now() else null end,
    verified_by = case when p_status = 'verified' then auth.uid() else null end
  where id = p_company;
  insert into public.company_private (company_id, verification_note) values (p_company, v_note)
  on conflict (company_id) do update set verification_note = excluded.verification_note;
  perform public.notify_company(p_company, 'company_' || p_status::text, jsonb_build_object('company_id', p_company, 'note', v_note), true);
  perform public.write_audit('company.' || p_status::text, 'company', p_company, jsonb_build_object('from', c.verification_status, 'note', v_note));
end $$;

-- Owner re-submits a rejected company for another review.
create function public.resubmit_company_verification(p_company uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.companies;
begin
  select * into c from public.companies where id = p_company for update;
  if not found then raise exception 'company_not_found' using errcode = 'P0001'; end if;
  if public.company_member_role(p_company) is distinct from 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.verification_status <> 'rejected' then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  update public.companies set verification_status = 'pending' where id = p_company;
  perform public.notify_admins('company_submitted', jsonb_build_object('company_id', p_company));
  perform public.write_audit('company.resubmitted', 'company', p_company);
end $$;

-- ---------------------------------------------------------------- membership
create function public.create_company_invitation(p_company uuid, p_email text, p_role public.member_role, p_token_hash text, p_ttl_hours int default 168) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_id uuid;
begin
  if not public.can_manage_company(p_company) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role = 'owner' and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_email !~ '^\S+@\S+\.\S+$' then raise exception 'invalid_email' using errcode = 'P0001'; end if;
  if p_ttl_hours is null or p_ttl_hours < 1 or p_ttl_hours > 720 then raise exception 'invalid_ttl' using errcode = 'P0001'; end if;
  if exists (select 1 from public.company_members m join public.profiles p on p.id = m.user_id
             where m.company_id = p_company and lower(p.email) = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  update public.company_invitations set revoked_at = now()
   where company_id = p_company and email = v_email and accepted_at is null and revoked_at is null;
  insert into public.company_invitations (company_id, email, role, token_hash, invited_by, expires_at)
  values (p_company, v_email, p_role, p_token_hash, auth.uid(), now() + make_interval(hours => p_ttl_hours))
  returning id into v_id;
  perform public.write_audit('company.invited', 'company', p_company, jsonb_build_object('email', v_email, 'role', p_role));
  return v_id;
end $$;

create function public.revoke_company_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.company_invitations;
begin
  select * into i from public.company_invitations where id = p_invitation for update;
  if not found then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;
  if not public.can_manage_company(i.company_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.company_invitations set revoked_at = now() where id = i.id and accepted_at is null and revoked_at is null;
  perform public.write_audit('company.invitation_revoked', 'company', i.company_id, jsonb_build_object('email', i.email));
end $$;

-- The caller must be signed in with the VERIFIED e-mail the invitation was issued to. Every failure mode
-- returns the same error so tokens cannot be probed.
create function public.accept_company_invitation(p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.company_invitations; v_email text; v_role public.user_role;
begin
  if not public.current_profile_ok() then raise exception 'forbidden' using errcode = '42501'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  select * into i from public.company_invitations
   where token_hash = p_token_hash and accepted_at is null and revoked_at is null and expires_at > now() for update;
  if not found or i.email <> v_email then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role = 'job_seeker' then raise exception 'wrong_account_type' using errcode = 'P0001'; end if;
  insert into public.company_members (company_id, user_id, role) values (i.company_id, auth.uid(), i.role)
  on conflict (company_id, user_id) do nothing;
  update public.company_invitations set accepted_at = now(), accepted_by = auth.uid() where id = i.id;
  perform public.notify_company(i.company_id, 'member_joined', jsonb_build_object('company_id', i.company_id, 'user_id', auth.uid()));
  perform public.write_audit('company.invitation_accepted', 'company', i.company_id, jsonb_build_object('role', i.role));
  return i.company_id;
end $$;

create function public.set_member_role(p_company uuid, p_user uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.company_members;
begin
  if not public.can_manage_company(p_company) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role = 'owner' then raise exception 'use_transfer' using errcode = 'P0001'; end if;
  select * into m from public.company_members where company_id = p_company and user_id = p_user for update;
  if not found then raise exception 'member_not_found' using errcode = 'P0001'; end if;
  if m.role = 'owner' and not public.is_admin() then raise exception 'use_transfer' using errcode = 'P0001'; end if;
  update public.company_members set role = p_role where company_id = p_company and user_id = p_user;
  perform public.write_audit('company.member_role', 'company', p_company, jsonb_build_object('user_id', p_user, 'role', p_role));
end $$;

create function public.remove_member(p_company uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.company_members;
begin
  select * into m from public.company_members where company_id = p_company and user_id = p_user for update;
  if not found then raise exception 'member_not_found' using errcode = 'P0001'; end if;
  if p_user = auth.uid() then
    if not public.current_profile_ok() then raise exception 'forbidden' using errcode = '42501'; end if;
  else
    if not public.can_manage_company(p_company) then raise exception 'forbidden' using errcode = '42501'; end if;
    if m.role = 'owner' and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  delete from public.company_members where company_id = p_company and user_id = p_user;   -- last-owner trigger applies
  perform public.write_audit('company.member_removed', 'company', p_company, jsonb_build_object('user_id', p_user));
end $$;

create function public.transfer_company_ownership(p_company uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor_is_owner boolean := coalesce(public.company_member_role(p_company) = 'owner', false);
begin
  if not (v_actor_is_owner or public.is_admin()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.company_members m join public.profiles p on p.id = m.user_id
                 where m.company_id = p_company and m.user_id = p_new_owner and p.role = 'employer' and p.status = 'active') then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  update public.company_members set role = 'owner' where company_id = p_company and user_id = p_new_owner;
  update public.company_members set role = 'recruiter' where company_id = p_company and role = 'owner' and user_id <> p_new_owner;
  perform public.notify_user(p_new_owner, 'ownership_transferred', jsonb_build_object('company_id', p_company));
  perform public.write_audit('company.ownership_transferred', 'company', p_company, jsonb_build_object('new_owner', p_new_owner));
end $$;

create function public.admin_add_member(p_company uuid, p_user uuid, p_role public.member_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user and role = 'employer' and status = 'active') then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  insert into public.company_members (company_id, user_id, role) values (p_company, p_user, p_role)
  on conflict (company_id, user_id) do update set role = excluded.role;
  perform public.notify_user(p_user, 'added_to_company', jsonb_build_object('company_id', p_company, 'role', p_role));
  perform public.write_audit('company.member_added', 'company', p_company, jsonb_build_object('user_id', p_user, 'role', p_role));
end $$;

-- ---------------------------------------------------------------- applications
create function public.apply_to_job(p_job uuid, p_resume uuid, p_cover text default '', p_answers jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); jp public.job_published; r public.resumes; prof public.profiles;
  v_company text; v_title text; v_app uuid; q jsonb; a text; v_snapshot jsonb; v_answers jsonb := coalesce(p_answers, '[]'::jsonb);
begin
  if v_uid is null or not public.has_role('job_seeker') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into jp from public.job_published where job_id = p_job;
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;
  select name into v_company from public.companies where id = jp.company_id and verification_status = 'verified';
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;
  if jp.application_method <> 'internal' then raise exception 'not_internal' using errcode = 'P0001'; end if;
  if jp.deadline < public.today_pk() then raise exception 'job_closed' using errcode = 'P0001'; end if;
  select * into r from public.resumes where id = p_resume and user_id = v_uid;
  if not found then raise exception 'resume_not_found' using errcode = 'P0001'; end if;
  if r.visibility <> 'shareable' then raise exception 'resume_private' using errcode = 'P0001'; end if;
  if jsonb_typeof(v_answers) <> 'array' then raise exception 'invalid_answers' using errcode = 'P0001'; end if;
  if char_length(coalesce(p_cover, '')) > 5000 then raise exception 'cover_too_long' using errcode = 'P0001'; end if;

  for q in select value from jsonb_array_elements(jp.screening_questions) loop
    select x ->> 'answer' into a from jsonb_array_elements(v_answers) x where x ->> 'id' = q ->> 'id' limit 1;
    if coalesce((q ->> 'required')::boolean, false) and coalesce(btrim(a), '') = '' then
      raise exception 'answer_required' using errcode = 'P0001';
    end if;
  end loop;

  select title into v_title from public.job_published_translations where job_id = p_job order by (locale = jp.default_language) desc limit 1;
  select * into prof from public.profiles where id = v_uid;
  v_snapshot := jsonb_build_object(
    'resume_id', r.id, 'title', r.title, 'content', r.content, 'pdf_path', r.pdf_path, 'pdf_name', r.pdf_name,
    'applicant', jsonb_build_object('full_name', prof.full_name, 'email', prof.email, 'phone', prof.phone, 'city', prof.city, 'province', prof.province));

  begin
    insert into public.applications (job_id, company_id, candidate_id, resume_id, job_title, company_name, cover_letter, resume_snapshot)
    values (p_job, jp.company_id, v_uid, r.id, coalesce(v_title, ''), v_company, coalesce(p_cover, ''), v_snapshot)
    returning id into v_app;
  exception when unique_violation then
    raise exception 'already_applied' using errcode = 'P0001';
  end;

  for q in select value from jsonb_array_elements(jp.screening_questions) loop
    select x ->> 'answer' into a from jsonb_array_elements(v_answers) x where x ->> 'id' = q ->> 'id' limit 1;
    insert into public.application_answers (application_id, question_id, question, answer)
    values (v_app, q ->> 'id', coalesce(q ->> 'text', ''), left(coalesce(a, ''), 3000));
  end loop;
  insert into public.application_events (application_id, actor_id, from_status, to_status) values (v_app, v_uid, null, 'submitted');
  perform public.notify_company(jp.company_id, 'application_received', jsonb_build_object('application_id', v_app, 'job_id', p_job));
  return v_app;
end $$;

create function public.set_application_status(p_app uuid, p_status public.application_status) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.applications;
begin
  select * into a from public.applications where id = p_app for update;
  if not found then raise exception 'application_not_found' using errcode = 'P0001'; end if;
  -- Owners and recruiters only. Viewers and admins are read-only here.
  if coalesce(public.company_member_role(a.company_id), 'viewer') not in ('owner', 'recruiter') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('viewed', 'shortlisted', 'interview', 'selected', 'rejected') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  if a.status = 'withdrawn' then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  if a.status = p_status or (p_status = 'viewed' and a.status <> 'submitted') then return; end if;   -- opening a detail page never regresses status
  update public.applications set status = p_status where id = p_app;
  insert into public.application_events (application_id, actor_id, from_status, to_status) values (p_app, auth.uid(), a.status, p_status);
  if p_status <> 'viewed' then
    perform public.notify_user(a.candidate_id, 'application_status', jsonb_build_object('application_id', p_app, 'status', p_status, 'job_title', a.job_title));
  end if;
end $$;

create function public.withdraw_application(p_app uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.applications;
begin
  select * into a from public.applications where id = p_app for update;
  if not found or a.candidate_id <> auth.uid() then raise exception 'application_not_found' using errcode = 'P0001'; end if;
  if not public.current_profile_ok() then raise exception 'forbidden' using errcode = '42501'; end if;
  if a.status = 'withdrawn' then return; end if;
  update public.applications set status = 'withdrawn', withdrawn_at = now(), resume_snapshot = jsonb_build_object('redacted', true) where id = p_app;
  insert into public.application_events (application_id, actor_id, from_status, to_status) values (p_app, auth.uid(), a.status, 'withdrawn');
end $$;

-- External applications are only CLICKS. Nothing here ever creates an `applications` row.
create function public.record_external_click(p_job uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare jp public.job_published;
begin
  select * into jp from public.job_published where job_id = p_job;
  if not found or jp.deadline < public.today_pk() then return; end if;
  if not exists (select 1 from public.companies where id = jp.company_id and verification_status = 'verified') then return; end if;
  if (p_kind = 'url' and jp.application_method <> 'external_url') or (p_kind = 'email' and jp.application_method <> 'external_email')
     or p_kind not in ('url', 'email') then
    return;
  end if;
  insert into public.job_external_clicks (job_id, company_id, candidate_id, kind)
  values (p_job, jp.company_id, case when public.current_profile_ok() then auth.uid() end, p_kind);
end $$;

-- ---------------------------------------------------------------- admin / ops
create function public.set_user_status(p_user uuid, p_status public.account_status) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if p.role = 'admin' or p.id = auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.profiles set status = p_status where id = p_user;
  perform public.write_audit('user.' || p_status::text, 'user', p_user);
end $$;

-- One-off admin provisioning for the site owner. service_role only: public sign-up can never create an admin.
create function public.provision_admin(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.profiles set role = 'admin', status = 'active' where lower(email) = lower(btrim(p_email)) returning id into v_id;
  if v_id is null then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (null, 'admin.provisioned', 'user', v_id, '{}'::jsonb);
  return v_id;
end $$;
revoke execute on function public.provision_admin(text) from public, anon, authenticated;
grant execute on function public.provision_admin(text) to service_role;

create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'employers', (select count(*) from public.profiles where role = 'employer'),
    'candidates', (select count(*) from public.profiles where role = 'job_seeker'),
    'companies', (select count(*) from public.companies),
    'pending_companies', (select count(*) from public.companies where verification_status = 'pending'),
    'jobs', (select count(*) from public.jobs),
    'pending_jobs', (select count(*) from public.jobs where status = 'pending_review'),
    'published_jobs', (select count(*) from public.job_published where deadline >= public.today_pk()),
    'applications', (select count(*) from public.applications),
    'external_clicks', (select count(*) from public.job_external_clicks));
end $$;

create function public.company_report(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_view_company(p_company) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'jobs_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.jobs where company_id = p_company group by status) s),
    'applications_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.applications where company_id = p_company group by status) s),
    'per_job', (select coalesce(jsonb_agg(r order by r.applications desc), '[]'::jsonb) from (
        select j.id as job_id, j.slug, j.status,
               (select title from public.job_translations t where t.job_id = j.id order by (t.locale = j.default_language) desc limit 1) as title,
               (select count(*) from public.applications a where a.job_id = j.id and a.status <> 'withdrawn') as applications,
               (select count(*) from public.job_external_clicks c where c.job_id = j.id) as external_clicks
        from public.jobs j where j.company_id = p_company) r));
end $$;

create function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz; v_hits int;
begin
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_limit;
end $$;
revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- ---------------------------------------------------------------- function privileges
-- Workflow functions require a signed-in user; the functions authorize the caller again internally.
revoke execute on function
  public.submit_job_for_review(uuid), public.withdraw_job(uuid), public.archive_job(uuid), public.restore_job(uuid),
  public.review_job(uuid, text, text), public.set_job_featured(uuid, boolean),
  public.create_company(text, text, text, text, text, text, text, text, text, text),
  public.admin_create_company(text, text, text, text, text, text, text, text, text, text, boolean),
  public.admin_set_company_verification(uuid, public.company_verification, text), public.resubmit_company_verification(uuid),
  public.create_company_invitation(uuid, text, public.member_role, text, int), public.revoke_company_invitation(uuid),
  public.accept_company_invitation(text), public.set_member_role(uuid, uuid, public.member_role),
  public.remove_member(uuid, uuid), public.transfer_company_ownership(uuid, uuid), public.admin_add_member(uuid, uuid, public.member_role),
  public.apply_to_job(uuid, uuid, text, jsonb), public.set_application_status(uuid, public.application_status),
  public.withdraw_application(uuid), public.set_user_status(uuid, public.account_status),
  public.admin_stats(), public.company_report(uuid)
from public, anon;
-- record_external_click stays executable by anon: visitors may click an external apply link without an account.
