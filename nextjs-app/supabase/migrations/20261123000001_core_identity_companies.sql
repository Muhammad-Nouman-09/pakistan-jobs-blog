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
