-- Pakistan Jobs Portal — migration 7: atomic job save.
-- SECURITY INVOKER on purpose: it runs with the CALLER's rights, so Row Level Security and the jobs guard
-- trigger apply exactly as for direct writes (a recruiter can only save jobs of their own company, a viewer
-- or outsider is refused, editing an approved job starts a new draft revision). The benefit is atomicity:
-- the job row and its translations are saved in one transaction.
--
-- p_fields: whitelisted job columns (any other key is ignored).
-- p_translations: { "en": { title, description, ... }, "ur": { ... } } — only the locales present are kept;
--                 other-language translations that are absent are deleted (the default language can't be).

create function public.save_job(p_id uuid, p_company uuid, p_fields jsonb, p_translations jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_lang public.locale_code := coalesce(nullif(p_fields ->> 'default_language', '')::public.locale_code, 'en');
  v_loc text;
  v_tr jsonb;
begin
  if jsonb_typeof(p_translations) <> 'object' or not (p_translations ? v_lang::text) then
    raise exception 'content_required' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.jobs (
      company_id, category_id, slug_base, default_language, sector, employment_type, workplace_type, country, province, city,
      salary_min, salary_max, salary_currency, salary_period, vacancies, deadline, application_method, external_url,
      external_email, screening_questions, source)
    values (
      p_company, nullif(p_fields ->> 'category_id', '')::uuid, coalesce(nullif(p_fields ->> 'slug_base', ''), 'job'), v_lang,
      coalesce(nullif(p_fields ->> 'sector', ''), 'private')::public.job_sector,
      coalesce(nullif(p_fields ->> 'employment_type', ''), 'full_time')::public.employment_type,
      coalesce(nullif(p_fields ->> 'workplace_type', ''), 'onsite')::public.workplace_type,
      coalesce(nullif(p_fields ->> 'country', ''), 'Pakistan'), nullif(p_fields ->> 'province', ''), nullif(p_fields ->> 'city', ''),
      nullif(p_fields ->> 'salary_min', '')::numeric, nullif(p_fields ->> 'salary_max', '')::numeric,
      coalesce(nullif(p_fields ->> 'salary_currency', ''), 'PKR'), coalesce(nullif(p_fields ->> 'salary_period', ''), 'month'),
      coalesce(nullif(p_fields ->> 'vacancies', '')::int, 1), nullif(p_fields ->> 'deadline', '')::date,
      coalesce(nullif(p_fields ->> 'application_method', ''), 'internal')::public.application_method,
      nullif(p_fields ->> 'external_url', ''), nullif(p_fields ->> 'external_email', ''),
      coalesce(p_fields -> 'screening_questions', '[]'::jsonb), nullif(p_fields ->> 'source', ''))
    returning id into v_id;
  else
    update public.jobs set
      category_id = nullif(p_fields ->> 'category_id', '')::uuid,
      slug_base = coalesce(nullif(p_fields ->> 'slug_base', ''), slug_base),
      default_language = v_lang,
      sector = coalesce(nullif(p_fields ->> 'sector', ''), 'private')::public.job_sector,
      employment_type = coalesce(nullif(p_fields ->> 'employment_type', ''), 'full_time')::public.employment_type,
      workplace_type = coalesce(nullif(p_fields ->> 'workplace_type', ''), 'onsite')::public.workplace_type,
      country = coalesce(nullif(p_fields ->> 'country', ''), 'Pakistan'),
      province = nullif(p_fields ->> 'province', ''), city = nullif(p_fields ->> 'city', ''),
      salary_min = nullif(p_fields ->> 'salary_min', '')::numeric, salary_max = nullif(p_fields ->> 'salary_max', '')::numeric,
      salary_currency = coalesce(nullif(p_fields ->> 'salary_currency', ''), 'PKR'),
      salary_period = coalesce(nullif(p_fields ->> 'salary_period', ''), 'month'),
      vacancies = coalesce(nullif(p_fields ->> 'vacancies', '')::int, 1), deadline = nullif(p_fields ->> 'deadline', '')::date,
      application_method = coalesce(nullif(p_fields ->> 'application_method', ''), 'internal')::public.application_method,
      external_url = nullif(p_fields ->> 'external_url', ''), external_email = nullif(p_fields ->> 'external_email', ''),
      screening_questions = coalesce(p_fields -> 'screening_questions', '[]'::jsonb), source = nullif(p_fields ->> 'source', '')
    where id = v_id;
    if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;   -- RLS hides other companies' jobs
  end if;

  for v_loc, v_tr in select key, value from jsonb_each(p_translations) loop
    continue when v_loc not in ('en', 'ur');
    insert into public.job_translations (job_id, locale, title, description, responsibilities, requirements, benefits, experience, education, salary_text, how_to_apply)
    values (v_id, v_loc::public.locale_code, v_tr ->> 'title', coalesce(v_tr ->> 'description', ''), coalesce(v_tr ->> 'responsibilities', ''),
            coalesce(v_tr ->> 'requirements', ''), coalesce(v_tr ->> 'benefits', ''), coalesce(v_tr ->> 'experience', ''),
            coalesce(v_tr ->> 'education', ''), coalesce(v_tr ->> 'salary_text', ''), coalesce(v_tr ->> 'how_to_apply', ''))
    on conflict (job_id, locale) do update set
      title = excluded.title, description = excluded.description, responsibilities = excluded.responsibilities,
      requirements = excluded.requirements, benefits = excluded.benefits, experience = excluded.experience,
      education = excluded.education, salary_text = excluded.salary_text, how_to_apply = excluded.how_to_apply;
  end loop;

  delete from public.job_translations where job_id = v_id and locale <> v_lang and not (p_translations ? (locale::text));
  return v_id;
end $$;

revoke execute on function public.save_job(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_job(uuid, uuid, jsonb, jsonb) to authenticated;
