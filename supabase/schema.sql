-- PromptPilot – Datenbankschema und Zugriffsregeln für Supabase
-- Einmalig im SQL-Editor des Supabase-Projekts ausführen.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- Tabellen

create table if not exists public.prompts (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.categories (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.collections (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists prompts_user_idx      on public.prompts (user_id, updated_at desc);
create index if not exists categories_user_idx   on public.categories (user_id);
create index if not exists collections_user_idx  on public.collections (user_id);

-- ------------------------------------------------- Zugriffsschutz (RLS)
-- Ohne diese Regeln könnte jeder angemeldete Nutzer fremde Daten lesen.

alter table public.prompts     enable row level security;
alter table public.categories  enable row level security;
alter table public.collections enable row level security;

do $$
declare t text;
begin
  foreach t in array array['prompts', 'categories', 'collections'] loop
    execute format('drop policy if exists "%s_select_own" on public.%I', t, t);
    execute format('drop policy if exists "%s_insert_own" on public.%I', t, t);
    execute format('drop policy if exists "%s_update_own" on public.%I', t, t);
    execute format('drop policy if exists "%s_delete_own" on public.%I', t, t);

    execute format(
      'create policy "%s_select_own" on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format(
      'create policy "%s_insert_own" on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format(
      'create policy "%s_update_own" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    execute format(
      'create policy "%s_delete_own" on public.%I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end $$;

-- ------------------------------------------------------ Bildspeicher

insert into storage.buckets (id, name, public)
values ('prompt-bilder', 'prompt-bilder', false)
on conflict (id) do nothing;

-- Jede Datei liegt im Ordner <user_id>/… . Die Regeln erlauben nur den eigenen Ordner.
drop policy if exists "bilder_select_own" on storage.objects;
drop policy if exists "bilder_insert_own" on storage.objects;
drop policy if exists "bilder_update_own" on storage.objects;
drop policy if exists "bilder_delete_own" on storage.objects;

create policy "bilder_select_own" on storage.objects for select
  using (bucket_id = 'prompt-bilder' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "bilder_insert_own" on storage.objects for insert
  with check (bucket_id = 'prompt-bilder' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "bilder_update_own" on storage.objects for update
  using (bucket_id = 'prompt-bilder' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "bilder_delete_own" on storage.objects for delete
  using (bucket_id = 'prompt-bilder' and (storage.foldername(name))[1] = auth.uid()::text);
