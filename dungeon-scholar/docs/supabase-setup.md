# Supabase + GitHub OAuth setup (one-time)

Follow this checklist once. After it's done, fill in `.env.local`
(see `.env.example`) and the app will be able to sign in.

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
```

## 3. Register a GitHub OAuth app

1. https://github.com/settings/developers → OAuth Apps → New.
2. Application name: `Dungeon Scholar`
3. Homepage URL: `https://evilpatrick06.github.io/home-lab/`
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
- **Site URL:** `https://evilpatrick06.github.io/home-lab/`
- **Redirect URLs (one per line):**
  ```
  https://evilpatrick06.github.io/home-lab/
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
