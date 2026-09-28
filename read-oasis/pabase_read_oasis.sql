-- ============================================================
-- Read Oasis - optional cloud sync of the local progress store
-- Run once: Supabase -> SQL Editor -> New query -> paste -> Run
-- Same project as toan3/tiengviet3; uses the same auth.users accounts.
-- One row per parent account. No child name, birth date or voice is stored
-- (the app never collects them). Recordings are never synced.
-- ============================================================

create table if not exists public.ro_progress (
  id            uuid primary key references auth.users(id) on delete cascade,
  store         jsonb not null default '{}',   -- whole ProgressStore document (settings, books, attempts, ledger, observations)
  store_version int   not null default 1,
  updated_at    timestamptz not null default now()
);

alter table public.ro_progress enable row level security;

-- Only the owner can read or write their row (no leaderboard / cross-family reads).
drop policy if exists "ro progress select own" on public.ro_progress;
create policy "ro progress select own" on public.ro_progress
  for select using (auth.uid() = id);

drop policy if exists "ro progress insert own" on public.ro_progress;
create policy "ro progress insert own" on public.ro_progress
  for insert with check (auth.uid() = id);

drop policy if exists "ro progress update own" on public.ro_progress;
create policy "ro progress update own" on public.ro_progress
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "ro progress delete own" on public.ro_progress;
create policy "ro progress delete own" on public.ro_progress
  for delete using (auth.uid() = id);

-- Optional: keep updated_at honest even if a client forgets it.
create or replace function public.ro_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists ro_progress_touch on public.ro_progress;
create trigger ro_progress_touch before update on public.ro_progress
  for each row execute function public.ro_touch_updated_at();

-- ============================================================
-- Done. In the app: parent.html -> Cloud tab -> sign in -> enable "Cloud sync".
-- ============================================================
