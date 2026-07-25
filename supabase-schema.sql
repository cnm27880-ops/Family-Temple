-- ============================================================
-- 天虛宮 — Supabase 資料表與權限設定
-- ------------------------------------------------------------
-- 使用方式：
--   1. 登入 Supabase → 進入你的專案
--   2. 左側選單 SQL Editor → New query
--   3. 貼上本檔全部內容 → 按 Run
--
-- 本檔可以重複執行（政策都會先 drop 再重建），
-- 之後若內容有更新，直接整份重跑一次即可。
-- ============================================================


-- ============================================================
-- 一、祈福牆
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

-- 分類白名單：避免有人直接呼叫 API 塞進奇怪的分類，讓祈福牆的篩選失效。
-- 若這段執行失敗，表示現有資料裡有不在清單中的分類，先查出來改掉再重跑：
--   select distinct type from public.prayers;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prayers_type_allowed'
  ) then
    alter table public.prayers
      add constraint prayers_type_allowed
      check (type in ('純祈願', '聖筊', '笑筊', '陰筊'));
  end if;
end $$;

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

-- 祈福牆改為分頁載入（依時間新到舊），補一個索引讓翻頁不會愈翻愈慢
create index if not exists prayers_public_created_idx
  on public.prayers (created_at desc)
  where is_private = false;

-- 開啟 Row Level Security（沒開的話金鑰等於全開，務必執行）
alter table public.prayers enable row level security;
alter table public.replies enable row level security;

-- ---- 心願的權限政策 ----
-- 任何訪客都可以新增心願
drop policy if exists "anyone can insert prayers" on public.prayers;
create policy "anyone can insert prayers"
  on public.prayers for insert
  to anon, authenticated
  with check (true);

-- 只能讀取「公開」的心願（私密心願僅廟方可在後台查看）
drop policy if exists "read public prayers" on public.prayers;
create policy "read public prayers"
  on public.prayers for select
  to anon, authenticated
  using (is_private = false);

-- ---- 回應的權限政策 ----
-- 任何訪客都可以新增回應
drop policy if exists "anyone can insert replies" on public.replies;
create policy "anyone can insert replies"
  on public.replies for insert
  to anon, authenticated
  with check (true);

-- 只能讀取「公開心願」底下的回應
drop policy if exists "read replies of public prayers" on public.replies;
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
-- 二、線上點燈登記
-- ------------------------------------------------------------
-- 這張表存的是信眾的姓名與聯絡方式（個人資料），
-- 所以刻意設計成「只能寫入、不能讀取」：
--   · 有 insert 政策  → 訪客可以送出登記
--   · 沒有 select 政策 → 任何人（包含送出者本人）都讀不回來
-- 只有廟方在 Supabase 後台看得到。
-- 前端因此必須用 Prefer: return=minimal 送出，不能要求回傳資料。
-- ============================================================

create table if not exists public.lamp_registrations (
  id          uuid primary key default gen_random_uuid(),
  lamp_type   text        not null,
  name        text        not null,
  birth_date  text,
  contact     text        not null,
  note        text,
  created_at  timestamptz not null default now(),
  -- 燈別清單要與 diandeng.html 的選項一致，改一邊時記得改另一邊
  constraint lamp_type_allowed check (lamp_type in ('光明燈', '太歲燈', '平安燈')),
  constraint lamp_name_len    check (char_length(name) between 1 and 20),
  constraint lamp_contact_len check (char_length(contact) between 1 and 50),
  constraint lamp_birth_len   check (birth_date is null or char_length(birth_date) <= 30),
  constraint lamp_note_len    check (note is null or char_length(note) <= 100)
);

create index if not exists lamp_registrations_created_idx
  on public.lamp_registrations (created_at desc);

alter table public.lamp_registrations enable row level security;

-- 任何訪客都可以送出登記
drop policy if exists "anyone can insert lamp registrations" on public.lamp_registrations;
create policy "anyone can insert lamp registrations"
  on public.lamp_registrations for insert
  to anon, authenticated
  with check (true);

-- 注意：這裡故意「不」建立 select 政策。
-- 若哪天替它加上 select 政策，信眾的姓名與電話就會變成公開資料。


-- ============================================================
-- 廟方日常維護
-- ------------------------------------------------------------
-- 查看私密心願：
--   select * from public.prayers where is_private = true order by created_at desc;
--
-- 查看點燈登記（或到 Table Editor → lamp_registrations 直接看）：
--   select created_at, lamp_type, name, birth_date, contact, note
--     from public.lamp_registrations
--    order by created_at desc;
--
-- 刪除不當留言（底下的回應會一併刪除）：
--   delete from public.prayers where id = '該心願的id';
--
-- 點燈登記處理完後，若要清除留存的個人資料：
--   delete from public.lamp_registrations where id = '該筆登記的id';
-- ============================================================
