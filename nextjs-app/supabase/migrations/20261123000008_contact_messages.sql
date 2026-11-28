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
