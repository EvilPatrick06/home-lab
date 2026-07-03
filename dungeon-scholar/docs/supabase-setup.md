# Supabase + GitHub OAuth setup (one-time)

Follow this checklist once. After it's done, fill in `.env.local`
(see `.env.example`) and the app will be able to sign in.

> **Before you start:** figure out your deployed URL. It's
> `https://<your-github-username>.github.io/<your-repo-name>/` — the
> trailing slash is part of the path and matters.
>
> Worked examples used below:
> - **Owner of this template** (repo `home-lab`, user `evilpatrick06`)
>   → `https://evilpatrick06.github.io/home-lab/`
> - **Fork following the default README** (repo `dungeon-scholar`, user
>   `<your-username>`) → `https://<your-username>.github.io/dungeon-scholar/`
>
> Anywhere this doc shows `https://<your-username>.github.io/<your-repo>/`,
> substitute *your* URL. Anywhere it shows the literal
> `https://evilpatrick06.github.io/home-lab/`, that's the worked
> example — replace it for your own deploy.

## 1. Create Supabase project

1. Go to https://supabase.com → New Project.
2. Pick a name (e.g. `dungeon-scholar-prod`), strong DB password, region close to you.
3. Wait ~2 min for provisioning.

## 2. Run schema SQL

Supabase dashboard → SQL Editor → New query. Paste and run:

```sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  github_login text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table saves (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  data         jsonb not null,
  updated_at   timestamptz not null default now(),
  schema_ver   int not null default 1
);

alter table profiles enable row level security;
alter table saves    enable row level security;

create policy "own profile" on profiles for all
  using (auth.uid() = id)        with check (auth.uid() = id);
create policy "own save"    on saves    for all
  using (auth.uid() = user_id)   with check (auth.uid() = user_id);

-- Enable Realtime so signed-in clients receive cross-device live updates.
alter publication supabase_realtime add table saves;

-- Make saves.updated_at SERVER-authoritative. Without this trigger the
-- column keeps whatever stamp the pushing device's wall clock minted, and a
-- device with a skewed clock can make its newer save look older than another
-- device's last sync. The app compares stamps for identity (not ordering),
-- so it works either way — but the trigger removes client clocks from the
-- picture entirely and is strongly recommended.
create or replace function public.touch_saves_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger saves_touch_updated_at
  before insert or update on saves
  for each row execute function public.touch_saves_updated_at();
```

If you set up the project before this Realtime line existed, run that single
`alter publication ...` statement on its own in the SQL editor — it's a no-op
if the table is already in the publication.

Likewise, if you set up the project before the `touch_saves_updated_at`
trigger existed, run the `create or replace function ... create trigger ...`
block above once in the SQL editor. Existing rows need no backfill: the
trigger re-stamps each row on its next write, and the client records whatever
stamp the row actually holds.

## 3. Register a GitHub OAuth app

1. https://github.com/settings/developers → OAuth Apps → New.
2. Application name: `Dungeon Scholar`
3. Homepage URL: `https://<your-username>.github.io/<your-repo>/`
   (e.g. `https://evilpatrick06.github.io/home-lab/`)
4. Authorization callback URL: copy from Supabase dashboard →
   Authentication → Providers → GitHub. It will look like
   `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Click "Register application", then "Generate a new client secret".
6. Note the Client ID and Client secret.

## 4. Configure GitHub provider in Supabase

Supabase dashboard → Authentication → Providers → GitHub:
- Enabled: ON
- Paste Client ID + Client secret from step 3.
- Save.

## 5. Set redirect URLs

Supabase dashboard → Authentication → URL Configuration:
- **Site URL:** `https://<your-username>.github.io/<your-repo>/`
  (e.g. `https://evilpatrick06.github.io/home-lab/`)
- **Redirect URLs (one per line):**
  ```
  https://<your-username>.github.io/<your-repo>/
  http://localhost:5173/
  ```
- Save.

## 6. Capture the project keys

Supabase dashboard → Project Settings → API:
- Project URL (something like `https://xxx.supabase.co`) → `VITE_SUPABASE_URL`
- `anon` public key (long JWT) → `VITE_SUPABASE_PUBLISHABLE_KEY`

Put both in `dungeon-scholar/.env.local` (gitignored — see `.env.example`).

## 7. Add the same values as GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions → New repository secret:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

(The deploy workflow will inject these at build time.)

## 8. Verify Row Level Security

**Do not skip this.** Without RLS active on the `saves` table, every signed-in
user can read and overwrite every other user's saves — silently (the app still
works). Run this in the SQL editor:

```sql
select c.relname as table, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('profiles', 'saves');
```

Both rows must show `rls_enabled = t`. If either is `f`, re-run the
`alter table … enable row level security;` lines from step 2.

The app also probes for this at runtime: if a signed-in user can read another
user's row, a red **"Cloud misconfiguration"** banner appears at the top of the
screen. Note the banner can only fire once a *second* user's row exists in the
table — the SQL check above is the reliable one.
