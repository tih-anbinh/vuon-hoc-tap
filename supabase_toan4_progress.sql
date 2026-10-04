-- ============================================================
-- Vườn Toán Lớp 4 — Bảng THI ĐUA / theo dõi tiến trình học
-- Chạy: Supabase → SQL Editor → New query → dán toàn bộ → Run
-- (App toan4.html dùng bảng riêng: toan4_progress.
--  Đăng nhập/hồ sơ VẪN dùng chung bảng toan3_profiles với toan3/tiengviet3.)
-- ============================================================

-- 1) Bảng tiến trình (mỗi user 1 dòng)
create table if not exists public.toan4_progress (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text default '',
  stars         jsonb not null default '{}',   -- sao mỗi phần
  best          jsonb not null default '{}',   -- % cao nhất mỗi phần
  unlocked      int  not null default 1,       -- phần đang mở
  streak        int  not null default 0,       -- chuỗi ngày
  last_day      date,
  total_stars   int  not null default 0,
  total_minutes int  not null default 0,       -- tổng phút đã học
  daily         jsonb not null default '{}',   -- {"2026-10-04": 15, ...} phút mỗi ngày
  ex_correct    int  not null default 0,       -- số câu đúng (Luyện tập)
  xp            int  not null default 0,       -- điểm kinh nghiệm (level)
  xu            int  not null default 0,       -- xu thưởng
  updated_at    timestamptz not null default now()
);

-- 1b) Nếu bảng đã tạo TRƯỚC ĐÓ (thiếu cột) thì thêm cột (an toàn, chạy nhiều lần được).
--     LƯU Ý: app upsert cả các cột dưới đây; nếu thiếu bất kỳ cột nào, TOÀN BỘ upsert bị từ chối
--     (PostgREST PGRST204) và phần "Thi đua"/số phút sẽ KHÔNG cập nhật lên server.
alter table public.toan4_progress add column if not exists full_name     text default '';
alter table public.toan4_progress add column if not exists stars         jsonb not null default '{}';
alter table public.toan4_progress add column if not exists best          jsonb not null default '{}';
alter table public.toan4_progress add column if not exists unlocked      int  not null default 1;
alter table public.toan4_progress add column if not exists streak        int  not null default 0;
alter table public.toan4_progress add column if not exists last_day      date;
alter table public.toan4_progress add column if not exists total_stars   int  not null default 0;
alter table public.toan4_progress add column if not exists total_minutes int  not null default 0;
alter table public.toan4_progress add column if not exists daily         jsonb not null default '{}';
alter table public.toan4_progress add column if not exists ex_correct    int  not null default 0;
alter table public.toan4_progress add column if not exists xp            int  not null default 0;
alter table public.toan4_progress add column if not exists xu            int  not null default 0;
alter table public.toan4_progress add column if not exists updated_at    timestamptz not null default now();

-- 2) Bật RLS
alter table public.toan4_progress enable row level security;

-- 3) Ai đã đăng nhập đều XEM được bảng thi đua (chỉ đọc)
drop policy if exists "toan4 progress read all" on public.toan4_progress;
create policy "toan4 progress read all" on public.toan4_progress
  for select using (auth.uid() is not null);

-- 4) Chỉ được TẠO/SỬA dòng của chính mình
drop policy if exists "toan4 progress insert own" on public.toan4_progress;
create policy "toan4 progress insert own" on public.toan4_progress
  for insert with check (auth.uid() = id);

drop policy if exists "toan4 progress update own" on public.toan4_progress;
create policy "toan4 progress update own" on public.toan4_progress
  for update using (auth.uid() = id);

-- ============================================================
-- Xong! App sẽ tự tạo/đồng bộ dòng tiến trình khi bé đăng nhập & học.
-- Bảng "Thi đua" trong app đọc toàn bộ bảng này để so sánh giữa các bé.
-- ============================================================
