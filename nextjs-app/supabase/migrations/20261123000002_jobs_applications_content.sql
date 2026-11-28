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
