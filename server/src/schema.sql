-- PromptPilot – Datenbankschema für den eigenen Sync-Dienst (PostgreSQL)
-- Wird beim Start automatisch angewendet; mehrfaches Ausführen ist unschädlich.

create table if not exists pp_users (
  id          bigserial primary key,
  google_sub  text not null unique,
  email       text not null,
  name        text not null default '',
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

-- Prompts, Kategorien und Sammlungen liegen als JSON, damit das Feldschema der
-- App sich weiterentwickeln kann, ohne dass der Dienst nachgezogen werden muss.
-- Der zusammengesetzte Primärschlüssel bindet jeden Datensatz fest an ein Konto.

create table if not exists pp_prompts (
  user_id     bigint not null references pp_users (id) on delete cascade,
  id          text not null,
  data        jsonb not null,
  updated_at  bigint not null,
  deleted_at  bigint,
  primary key (user_id, id)
);

create table if not exists pp_categories (
  user_id     bigint not null references pp_users (id) on delete cascade,
  id          text not null,
  data        jsonb not null,
  updated_at  bigint not null,
  deleted_at  bigint,
  primary key (user_id, id)
);

create table if not exists pp_collections (
  user_id     bigint not null references pp_users (id) on delete cascade,
  id          text not null,
  data        jsonb not null,
  updated_at  bigint not null,
  deleted_at  bigint,
  primary key (user_id, id)
);

create table if not exists pp_notes (
  user_id     bigint not null references pp_users (id) on delete cascade,
  id          text not null,
  data        jsonb not null,
  updated_at  bigint not null,
  deleted_at  bigint,
  primary key (user_id, id)
);

create table if not exists pp_images (
  user_id     bigint not null references pp_users (id) on delete cascade,
  id          text not null,
  prompt_id   text not null default '',
  name        text not null default '',
  type        text not null default 'image/jpeg',
  size        integer not null default 0,
  bytes       bytea not null,
  created_at  bigint not null,
  primary key (user_id, id)
);

create index if not exists pp_prompts_updated on pp_prompts (user_id, updated_at);
create index if not exists pp_categories_updated on pp_categories (user_id, updated_at);
create index if not exists pp_collections_updated on pp_collections (user_id, updated_at);
create index if not exists pp_notes_updated on pp_notes (user_id, updated_at);
