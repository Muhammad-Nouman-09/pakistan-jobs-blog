-- ===== migrations/20261123000001_core_identity_companies.sql =====
-- Pakistan Jobs Portal — migration 1: enums, identity, categories, companies, memberships.
-- Conventions
--   * Every table has RLS enabled (policies live in migration 4).
--   * Privileged state changes (job status, membership, verification, applications) are only possible
--     through SECURITY DEFINER functions (migration 3); direct client writes are denied by RLS + guard triggers.
--   * "client" == the Postgres roles `anon` / `authenticated` (what PostgREST uses for browser/user JWTs).

-- ---------------------------------------------------------------- enums
create type public.user_role           as enum ('admin', 'employer', 'job_seeker');
create type public.account_status      as enum ('active', 'suspended');
create type public.company_verification as enum ('pending', 'verified', 'rejected', 'suspended');
create type public.company_managed_by  as enum ('self', 'platform');
create type public.member_role         as enum ('owner', 'recruiter', 'viewer');
create type public.job_status          as enum ('draft', 'pending_review', 'approved', 'rejected', 'changes_requested', 'expired', 'archived');
create type public.employment_type     as enum ('full_time', 'part_time', 'contract', 'internship', 'temporary', 'freelance');
create type public.workplace_type      as enum ('onsite', 'remote', 'hybrid');
create type public.application_method  as enum ('internal', 'external_url', 'external_email');
create type public.job_sector          as enum ('government', 'private');
create type public.application_status  as enum ('submitted', 'viewed', 'shortlisted', 'interview', 'selected', 'rejected', 'withdrawn');
create type public.resume_visibility   as enum ('private', 'shareable');
create type public.post_status         as enum ('draft', 'published', 'archived');
create type public.review_action       as enum ('submitted', 'approved', 'rejected', 'changes_requested', 'withdrawn', 'unpublished', 'archived');
create type public.locale_code         as enum ('en', 'ur');

-- ---------------------------------------------------------------- small helpers
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- "Today" for deadlines is Pakistan time, not UTC.
create function public.today_pk() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Karachi')::date
$$;

create function public.slugify(p_text text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')), ''), '')
$$;

create function public.safe_uuid(p_text text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  role             public.user_role      not null default 'job_seeker',
  status           public.account_status not null default 'active',
  email            text                  not null,
  full_name        text                  not null default '' check (char_length(full_name) <= 120),
  phone            text check (phone is null or char_length(phone) <= 40),
  city             text check (city is null or char_length(city) <= 80),
  province         text check (province is null or char_length(province) <= 80),
  preferred_locale public.locale_code    not null default 'en',
  created_at       timestamptz           not null default now(),
  updated_at       timestamptz           not null default now()
);
create index profiles_role_status_idx on public.profiles (role, status);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- authorization helpers
-- Active = profile not suspended AND e-mail confirmed. Used by every policy so a suspended or
-- unverified account can do nothing protected, even with a still-valid JWT.
create function public.current_profile_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid() and p.status = 'active' and u.email_confirmed_at is not null
  )
$$;

create function public.has_role(p_role public.user_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid() and p.status = 'active' and u.email_confirmed_at is not null and p.role = p_role
  )
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('admin')
$$;

-- New auth users get a profile. The role comes from sign-up metadata but is WHITELISTED:
-- 'admin' can never be requested from the client.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, role, email, full_name)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'employer' then 'employer'::public.user_role
         else 'job_seeker'::public.user_role end,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users for each row execute function public.sync_profile_email();

-- Clients may edit only their own harmless profile fields. Role / status / e-mail / id are immutable from
-- the client; role changes only through provision_admin() (service role), status through set_user_status().
create function public.profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id <> old.id or new.email <> old.email or new.role <> old.role or new.status <> old.status then
      raise exception 'forbidden_profile_change' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_a_guard before update on public.profiles for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------- categories
create table public.job_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_en    text not null check (char_length(name_en) between 2 and 120),
  name_ur    text check (name_ur is null or char_length(name_ur) <= 120),
  sort_order int  not null default 100,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- companies
create table public.companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 2 and 150),
  slug                text not null unique,
  description         text not null default '' check (char_length(description) <= 5000),
  logo_path           text check (logo_path is null or char_length(logo_path) <= 300),
  industry            text check (industry is null or char_length(industry) <= 100),
  website             text check (website is null or (website ~* '^https?://[^\s]+$' and char_length(website) <= 300)),
  country             text not null default 'Pakistan' check (char_length(country) <= 80),
  city                text check (city is null or char_length(city) <= 80),
  size                text check (size is null or size in ('1-10', '11-50', '51-200', '201-500', '501-1000', '1000+')),
  managed_by          public.company_managed_by  not null default 'self',
  verification_status public.company_verification not null default 'pending',
  verified_at         timestamptz,
  verified_by         uuid references public.profiles (id) on delete set null,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index companies_status_idx on public.companies (verification_status);
create index companies_created_by_idx on public.companies (created_by);
create trigger companies_touch before update on public.companies for each row execute function public.touch_updated_at();

-- Contact details and moderation notes are NOT public (the public company page never shows them).
create table public.company_private (
  company_id        uuid primary key references public.companies (id) on delete cascade,
  email             text check (email is null or email ~ '^\S+@\S+\.\S+$'),
  phone             text check (phone is null or char_length(phone) <= 40),
  address           text check (address is null or char_length(address) <= 400),
  verification_note text check (verification_note is null or char_length(verification_note) <= 1000)
);

create function public.set_company_slug() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := coalesce(nullif(public.slugify(new.name), ''), 'company') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;
  return new;
end $$;
create trigger companies_b_slug before insert on public.companies for each row execute function public.set_company_slug();

-- ---------------------------------------------------------------- company membership
create table public.company_members (
  company_id uuid        not null references public.companies (id) on delete cascade,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  role       public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user_idx on public.company_members (user_id);
create index company_members_company_role_idx on public.company_members (company_id, role);

create table public.company_invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  email       text not null check (email = lower(email) and email ~ '^\S+@\S+\.\S+$'),
  role        public.member_role not null,
  token_hash  text not null unique check (char_length(token_hash) = 64),   -- sha256 hex; the raw token is never stored
  invited_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index company_invitations_company_idx on public.company_invitations (company_id);
create index company_invitations_email_idx on public.company_invitations (email);

create table public.company_verification_documents (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  storage_path text not null unique check (char_length(storage_path) <= 400),
  file_name    text not null check (char_length(file_name) <= 200),
  doc_type     text not null default 'registration' check (doc_type in ('registration', 'tax', 'authorization', 'other')),
  created_at   timestamptz not null default now()
);
create index company_docs_company_idx on public.company_verification_documents (company_id);

-- Membership helpers (need company_members to exist).
create function public.company_member_role(p_company uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.company_members m
  where m.company_id = p_company and m.user_id = auth.uid() and public.current_profile_ok()
$$;
create function public.can_view_company(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.company_member_role(p_company) is not null, false)
$$;
create function public.can_recruit(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: company_member_role() is NULL for non-members, and `if not NULL` would silently pass in plpgsql.
  select coalesce(public.is_admin() or public.company_member_role(p_company) in ('owner', 'recruiter'), false)
$$;
create function public.can_manage_company(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_admin() or public.company_member_role(p_company) = 'owner', false)
$$;

-- Clients (owners) may edit descriptive fields only. Verification state, managed_by and provenance are
-- admin/RPC-controlled.
create function public.companies_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if tg_op = 'INSERT' then
      raise exception 'forbidden_company_change' using errcode = '42501';
    end if;
    if new.verification_status <> old.verification_status or new.managed_by <> old.managed_by
       or new.verified_at is distinct from old.verified_at or new.verified_by is distinct from old.verified_by
       or new.created_by is distinct from old.created_by or new.slug <> old.slug then
      raise exception 'forbidden_company_change' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger companies_a_guard before insert or update on public.companies for each row execute function public.companies_guard();

-- Never drop the last owner of a company (cascade deletes of the company itself are fine).
create function public.company_members_keep_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if exists (select 1 from public.companies c where c.id = old.company_id)
       and not exists (select 1 from public.company_members m
                       where m.company_id = old.company_id and m.role = 'owner' and m.user_id <> old.user_id) then
      raise exception 'last_owner' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger company_members_a_keep_owner before update or delete on public.company_members
  for each row execute function public.company_members_keep_owner();

alter table public.profiles                      enable row level security;
alter table public.job_categories                enable row level security;
alter table public.companies                     enable row level security;
alter table public.company_private               enable row level security;
alter table public.company_members               enable row level security;
alter table public.company_invitations           enable row level security;
alter table public.company_verification_documents enable row level security;

-- ===== migrations/20261123000002_jobs_applications_content.sql =====
-- Pakistan Jobs Portal — migration 2: jobs (working copy + public copy), reviews, applications,
-- resumes, saved jobs, notifications, blog, settings, audit, rate limits.

-- ---------------------------------------------------------------- jobs (the employer's WORKING copy)
-- `jobs` is what employers edit. `job_published` (below) is the last APPROVED public copy. Public pages
-- read only job_published, so an edit never changes what visitors see until an admin re-approves it.
create table public.jobs (
  id                  uuid primary key default gen_random_uuid(),
  ref_no              bigint generated always as identity unique,
  company_id          uuid not null references public.companies (id) on delete cascade,
  category_id         uuid references public.job_categories (id) on delete set null,
  created_by          uuid references public.profiles (id) on delete set null,
  slug_base           text not null default 'job' check (slug_base ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug_base) <= 100),
  slug                text unique,                        -- slug_base || '-' || ref_no (set by trigger)
  status              public.job_status not null default 'draft',
  default_language    public.locale_code not null default 'en',
  sector              public.job_sector not null default 'private',
  employment_type     public.employment_type not null default 'full_time',
  workplace_type      public.workplace_type  not null default 'onsite',
  country             text not null default 'Pakistan' check (char_length(country) <= 80),
  province            text check (province is null or char_length(province) <= 80),
  city                text check (city is null or char_length(city) <= 80),
  salary_min          numeric(12, 2) check (salary_min is null or salary_min >= 0),
  salary_max          numeric(12, 2) check (salary_max is null or salary_max >= 0),
  salary_currency     text not null default 'PKR' check (salary_currency ~ '^[A-Z]{3}$'),
  salary_period       text not null default 'month' check (salary_period in ('hour', 'day', 'month', 'year', 'project')),
  vacancies           int  not null default 1 check (vacancies between 1 and 10000),
  deadline            date,
  application_method  public.application_method not null default 'internal',
  external_url        text check (external_url is null or (external_url ~* '^https?://[^\s]+$' and char_length(external_url) <= 500)),
  external_email      text check (external_email is null or external_email ~ '^\S+@\S+\.\S+$'),
  screening_questions jsonb not null default '[]'::jsonb
                      check (jsonb_typeof(screening_questions) = 'array' and jsonb_array_length(screening_questions) <= 10),
  source              text check (source is null or char_length(source) <= 300),
  featured            boolean not null default false,       -- admin-only (guard trigger)
  published_at        timestamptz,                          -- first approval
  last_approved_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint jobs_salary_range check (salary_min is null or salary_max is null or salary_min <= salary_max)
);
create index jobs_company_status_idx on public.jobs (company_id, status);
create index jobs_status_deadline_idx on public.jobs (status, deadline);
create index jobs_created_by_idx on public.jobs (created_by);
create index jobs_category_idx on public.jobs (category_id);

create table public.job_translations (
  job_id           uuid not null references public.jobs (id) on delete cascade,
  locale           public.locale_code not null,
  title            text not null check (char_length(title) between 3 and 200),
  description      text not null default '' check (char_length(description) <= 20000),
  responsibilities text not null default '' check (char_length(responsibilities) <= 10000),
  requirements     text not null default '' check (char_length(requirements) <= 10000),
  benefits         text not null default '' check (char_length(benefits) <= 10000),
  experience       text not null default '' check (char_length(experience) <= 500),
  education        text not null default '' check (char_length(education) <= 500),
  salary_text      text not null default '' check (char_length(salary_text) <= 300),
  how_to_apply     text not null default '' check (char_length(how_to_apply) <= 5000),
  updated_at       timestamptz not null default now(),
  primary key (job_id, locale)
);
create trigger job_translations_touch before update on public.job_translations for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- public (approved) copy
create table public.job_published (
  job_id              uuid primary key references public.jobs (id) on delete cascade,
  ref_no              bigint not null,
  slug                text   not null unique,
  company_id          uuid   not null references public.companies (id) on delete cascade,
  category_id         uuid references public.job_categories (id) on delete set null,
  default_language    public.locale_code not null,
  sector              public.job_sector not null,
  employment_type     public.employment_type not null,
  workplace_type      public.workplace_type not null,
  country             text not null,
  province            text,
  city                text,
  salary_min          numeric(12, 2),
  salary_max          numeric(12, 2),
  salary_currency     text not null,
  salary_period       text not null,
  vacancies           int  not null,
  deadline            date not null,
  application_method  public.application_method not null,
  external_url        text,
  external_email      text,
  screening_questions jsonb not null default '[]'::jsonb,
  source              text,
  featured            boolean not null default false,
  published_at        timestamptz not null,
  approved_at         timestamptz not null default now(),
  search_text         text not null default '',
  search_tsv          tsvector generated always as (to_tsvector('simple', search_text)) stored
);
create index job_published_tsv_idx on public.job_published using gin (search_tsv);
create index job_published_deadline_idx on public.job_published (deadline);
create index job_published_company_idx on public.job_published (company_id);
create index job_published_category_idx on public.job_published (category_id);
create index job_published_location_idx on public.job_published (province, city);
create index job_published_listing_idx on public.job_published (featured desc, published_at desc);
create index job_published_ref_idx on public.job_published (ref_no);

create table public.job_published_translations (
  job_id           uuid not null references public.job_published (job_id) on delete cascade,
  locale           public.locale_code not null,
  title            text not null,
  description      text not null default '',
  responsibilities text not null default '',
  requirements     text not null default '',
  benefits         text not null default '',
  experience       text not null default '',
  education        text not null default '',
  salary_text      text not null default '',
  how_to_apply     text not null default '',
  primary key (job_id, locale)
);

-- Append-only review history. Written only by the review/submit functions.
create table public.job_reviews (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      public.review_action not null,
  reason      text check (reason is null or char_length(reason) <= 2000),
  from_status public.job_status,
  to_status   public.job_status,
  snapshot    jsonb,
  created_at  timestamptz not null default now()
);
create index job_reviews_job_idx on public.job_reviews (job_id, created_at desc);

create table public.job_external_clicks (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  company_id   uuid not null references public.companies (id) on delete cascade,
  candidate_id uuid references public.profiles (id) on delete set null,
  kind         text not null check (kind in ('url', 'email')),
  created_at   timestamptz not null default now()
);
create index job_clicks_job_idx on public.job_external_clicks (job_id);
create index job_clicks_company_idx on public.job_external_clicks (company_id, created_at desc);

-- ---------------------------------------------------------------- candidates & resumes
create table public.candidate_profiles (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  headline       text not null default '' check (char_length(headline) <= 160),
  summary        text not null default '' check (char_length(summary) <= 3000),
  skills         text[] not null default '{}' check (cardinality(skills) <= 50),
  education      jsonb not null default '[]'::jsonb check (jsonb_typeof(education) = 'array'),
  experience     jsonb not null default '[]'::jsonb check (jsonb_typeof(experience) = 'array'),
  certifications jsonb not null default '[]'::jsonb check (jsonb_typeof(certifications) = 'array'),
  projects       jsonb not null default '[]'::jsonb check (jsonb_typeof(projects) = 'array'),
  languages      jsonb not null default '[]'::jsonb check (jsonb_typeof(languages) = 'array'),
  updated_at     timestamptz not null default now()
);
create trigger candidate_profiles_touch before update on public.candidate_profiles for each row execute function public.touch_updated_at();

create table public.resumes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  is_default boolean not null default false,
  visibility public.resume_visibility not null default 'private',
  -- builder sections: personal, summary, education[], experience[], skills[], certifications[], projects[], languages[]
  content    jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object' and pg_column_size(content) < 200000),
  pdf_path   text check (pdf_path is null or char_length(pdf_path) <= 300),
  pdf_name   text check (pdf_name is null or char_length(pdf_name) <= 200),
  pdf_size   int  check (pdf_size is null or pdf_size between 1 and 5242880),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resumes_user_idx on public.resumes (user_id);
create unique index resumes_one_default_idx on public.resumes (user_id) where is_default;
create trigger resumes_touch before update on public.resumes for each row execute function public.touch_updated_at();

create table public.saved_jobs (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  job_id     uuid not null references public.jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
create index saved_jobs_job_idx on public.saved_jobs (job_id);

-- ---------------------------------------------------------------- applications (internal only)
create table public.applications (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs (id) on delete restrict,
  company_id      uuid not null references public.companies (id) on delete restrict,
  candidate_id    uuid not null references public.profiles (id) on delete cascade,
  resume_id       uuid references public.resumes (id) on delete set null,
  job_title       text not null,                        -- display snapshots, stable if the job/company changes
  company_name    text not null,
  cover_letter    text not null default '' check (char_length(cover_letter) <= 5000),
  resume_snapshot jsonb,                                -- resume content + applicant contact at submission time
  status          public.application_status not null default 'submitted',
  submitted_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  withdrawn_at    timestamptz
);
-- One live application per candidate+job. A withdrawn application frees the slot (explicit resubmission policy).
create unique index applications_one_live_idx on public.applications (job_id, candidate_id) where status <> 'withdrawn';
create index applications_company_status_idx on public.applications (company_id, status, submitted_at desc);
create index applications_candidate_idx on public.applications (candidate_id, submitted_at desc);
create index applications_job_idx on public.applications (job_id);
create trigger applications_touch before update on public.applications for each row execute function public.touch_updated_at();

create table public.application_answers (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  question_id    text not null,
  question       text not null,
  answer         text not null default '' check (char_length(answer) <= 3000)
);
create index application_answers_app_idx on public.application_answers (application_id);

create table public.application_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  actor_id       uuid references public.profiles (id) on delete set null,
  from_status    public.application_status,
  to_status      public.application_status not null,
  created_at     timestamptz not null default now()
);
create index application_events_app_idx on public.application_events (application_id, created_at);

-- Employer-only notes: candidates can never read these (no policy grants them).
create table public.application_notes (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  company_id     uuid not null references public.companies (id) on delete cascade,
  author_id      uuid not null references public.profiles (id) on delete cascade,
  note           text not null check (char_length(note) between 1 and 3000),
  created_at     timestamptz not null default now()
);
create index application_notes_app_idx on public.application_notes (application_id);

-- ---------------------------------------------------------------- notifications, audit, settings, rate limits
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (char_length(type) <= 60),
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null check (char_length(action) <= 80),
  entity_type text not null check (char_length(entity_type) <= 60),
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);

create table public.site_settings (
  key        text primary key check (key in ('general', 'seo', 'adsense')),
  value      jsonb not null default '{}'::jsonb check (jsonb_typeof(value) = 'object'),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

-- ---------------------------------------------------------------- blog
create table public.blog_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_en    text not null check (char_length(name_en) between 2 and 120),
  name_ur    text check (name_ur is null or char_length(name_ur) <= 120),
  sort_order int not null default 100
);

create table public.blog_posts (
  id                  uuid primary key default gen_random_uuid(),
  category_id         uuid references public.blog_categories (id) on delete set null,
  author_id           uuid references public.profiles (id) on delete set null,
  status              public.post_status not null default 'draft',
  featured_image_path text check (featured_image_path is null or char_length(featured_image_path) <= 300),
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index blog_posts_status_idx on public.blog_posts (status, published_at desc);
create index blog_posts_category_idx on public.blog_posts (category_id);
create trigger blog_posts_touch before update on public.blog_posts for each row execute function public.touch_updated_at();

create table public.blog_post_translations (
  post_id         uuid not null references public.blog_posts (id) on delete cascade,
  locale          public.locale_code not null,
  slug            text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  title           text not null check (char_length(title) between 3 and 200),
  excerpt         text not null default '' check (char_length(excerpt) <= 500),
  content         text not null default '' check (char_length(content) <= 100000),
  seo_title       text check (seo_title is null or char_length(seo_title) <= 70),
  seo_description text check (seo_description is null or char_length(seo_description) <= 170),
  updated_at      timestamptz not null default now(),
  primary key (post_id, locale),
  unique (locale, slug)
);
create trigger blog_post_translations_touch before update on public.blog_post_translations for each row execute function public.touch_updated_at();

create function public.blog_posts_publish_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;
create trigger blog_posts_a_publish before insert or update on public.blog_posts for each row execute function public.blog_posts_publish_guard();

alter table public.jobs                       enable row level security;
alter table public.job_translations           enable row level security;
alter table public.job_published              enable row level security;
alter table public.job_published_translations enable row level security;
alter table public.job_reviews                enable row level security;
alter table public.job_external_clicks        enable row level security;
alter table public.candidate_profiles         enable row level security;
alter table public.resumes                    enable row level security;
alter table public.saved_jobs                 enable row level security;
alter table public.applications               enable row level security;
alter table public.application_answers        enable row level security;
alter table public.application_events         enable row level security;
alter table public.application_notes          enable row level security;
alter table public.notifications              enable row level security;
alter table public.audit_logs                 enable row level security;
alter table public.site_settings              enable row level security;
alter table public.rate_limits                enable row level security;
alter table public.blog_categories            enable row level security;
alter table public.blog_posts                 enable row level security;
alter table public.blog_post_translations     enable row level security;

-- ===== migrations/20261123000003_workflow_functions.sql =====
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

-- ===== migrations/20261123000004_rls_policies.sql =====
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

-- ===== migrations/20261123000005_storage.sql =====
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

-- ===== migrations/20261123000006_seed_reference_data.sql =====
-- Pakistan Jobs Portal — migration 6: reference data (categories, blog categories, default settings).
-- Urdu names are drafted UI labels and should be reviewed by a native speaker (see docs/i18n in context.md).

insert into public.job_categories (slug, name_en, name_ur, sort_order) values
  ('government-administration', 'Government & Administration', 'سرکاری و انتظامی', 10),
  ('education-teaching',        'Education & Teaching',        'تعلیم و تدریس', 20),
  ('engineering-technical',     'Engineering & Technical',     'انجینئرنگ و تکنیکی', 30),
  ('clerical-office',           'Clerical & Office',           'کلیریکل و دفتری', 40),
  ('information-technology',    'Information Technology',      'انفارمیشن ٹیکنالوجی', 50),
  ('healthcare',                'Healthcare & Medical',        'صحت و طب', 60),
  ('sales-marketing',           'Sales & Marketing',           'سیلز اور مارکیٹنگ', 70),
  ('accounting-finance',        'Accounting & Finance',        'اکاؤنٹنگ اور فنانس', 80),
  ('police-security',           'Police, Army & Security',     'پولیس، فوج اور سکیورٹی', 90),
  ('driving-logistics',         'Driving & Logistics',         'ڈرائیونگ اور لاجسٹکس', 100),
  ('hospitality',               'Hospitality & Food',          'مہمان نوازی اور کھانا', 110),
  ('construction-labour',       'Construction & Labour',       'تعمیرات اور مزدوری', 120),
  ('other',                     'Other',                       'دیگر', 999)
on conflict (slug) do nothing;

insert into public.blog_categories (slug, name_en, name_ur, sort_order) values
  ('career-guides',          'Career Guides',          'کیریئر گائیڈز', 10),
  ('interview-preparation',  'Interview Preparation',  'انٹرویو کی تیاری', 20),
  ('resume-writing',         'Resume Writing',         'ریزیومے لکھنا', 30),
  ('salary-guides',          'Salary Guides',          'تنخواہ گائیڈز', 40),
  ('education-guides',       'Education Guides',       'تعلیمی گائیڈز', 50),
  ('job-search-tips',        'Job Search Tips',        'ملازمت تلاش کرنے کے مشورے', 60)
on conflict (slug) do nothing;

insert into public.site_settings (key, value) values
  ('general', '{"siteName":"Pakistan Jobs Blog","contactEmail":"","supportPhone":"","twitter":"","facebook":""}'),
  ('seo',     '{"defaultTitle":"Pakistan Jobs Blog — Govt & Private Jobs in Pakistan","defaultDescription":"Government and private jobs in Pakistan, checked against official advertisements, with real last dates and direct apply links.","ogImage":""}'),
  ('adsense', '{"enabled":false,"publisherId":"","slots":{"topBanner":"","inFeed":"","inArticle":"","sidebar":""},"adsTxt":""}')
on conflict (key) do nothing;

-- ===== migrations/20261123000007_save_job.sql =====
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

-- ===== migrations/20261123000008_contact_messages.sql =====
-- Pakistan Jobs Portal — migration 8: contact form inbox.
-- Visitors are anonymous, so inserts happen ONLY from the server (service role) after rate limiting and a
-- honeypot check; there is deliberately no insert policy for anon/authenticated. Admins read/triage.

create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 100),
  email      text not null check (email ~ '^\S+@\S+\.\S+$' and char_length(email) <= 200),
  subject    text not null check (char_length(subject) between 1 and 200),
  message    text not null check (char_length(message) between 1 and 5000),
  locale     public.locale_code not null default 'en',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);
alter table public.contact_messages enable row level security;

create policy contact_messages_admin_select on public.contact_messages for select using (public.is_admin());
create policy contact_messages_admin_update on public.contact_messages for update using (public.is_admin()) with check (public.is_admin());
create policy contact_messages_admin_delete on public.contact_messages for delete using (public.is_admin());

revoke all on public.contact_messages from anon;
revoke insert on public.contact_messages from authenticated;
revoke update on public.contact_messages from authenticated;
grant update (read_at) on public.contact_messages to authenticated;

-- ===== reload API schema cache =====
notify pgrst, 'reload schema';
