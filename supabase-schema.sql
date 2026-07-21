-- ============================================================
-- 天虛宮 祈福牆 — Supabase 資料表與權限設定
-- ------------------------------------------------------------
-- 使用方式：
--   1. 登入 Supabase → 進入你的專案
--   2. 左側選單 SQL Editor → New query
--   3. 貼上本檔全部內容 → 按 Run
-- 執行一次即可。之後祈福牆就會運作。
-- ============================================================

-- 心願表
create table if not exists public.prayers (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null default '虔誠信眾',
  content     text        not null,
  type        text        not null default '純祈願',
  is_private  boolean     not null default false,
  created_at  timestamptz not null default now(),
  constraint content_len check (char_length(content) between 1 and 300),
  constraint name_len    check (char_length(name) <= 30)
);

-- 回應表（每則回應對應一個心願）
create table if not exists public.replies (
  id          uuid primary key default gen_random_uuid(),
  prayer_id   uuid        not null references public.prayers(id) on delete cascade,
  author      text        not null default '匿名信眾',
  text        text        not null,
  created_at  timestamptz not null default now(),
  constraint reply_len check (char_length(text) between 1 and 100)
);

create index if not exists replies_prayer_id_idx on public.replies (prayer_id);

-- 開啟 Row Level Security（沒開的話金鑰等於全開，務必執行）
alter table public.prayers enable row level security;
alter table public.replies enable row level security;

-- ---- 心願的權限政策 ----
-- 任何訪客都可以新增心願
create policy "anyone can insert prayers"
  on public.prayers for insert
  to anon, authenticated
  with check (true);

-- 只能讀取「公開」的心願（私密心願僅廟方可在後台查看）
create policy "read public prayers"
  on public.prayers for select
  to anon, authenticated
  using (is_private = false);

-- ---- 回應的權限政策 ----
-- 任何訪客都可以新增回應
create policy "anyone can insert replies"
  on public.replies for insert
  to anon, authenticated
  with check (true);

-- 只能讀取「公開心願」底下的回應
create policy "read replies of public prayers"
  on public.replies for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.prayers p
      where p.id = replies.prayer_id
        and p.is_private = false
    )
  );

-- ============================================================
-- 廟方如何查看「私密心願」？
--   到 Supabase → Table Editor → prayers 表，可看到全部（含私密）。
--   或用 SQL：  select * from public.prayers where is_private = true;
-- 刪除不當留言：在 Table Editor 直接刪列，或
--   delete from public.prayers where id = '該心願的id';
-- ============================================================
