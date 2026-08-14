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
--
-- 章節：
--   一、管理員身分（後台 admin.html 的登入權限來源）
--   二、祈福牆（心願 / 回應 / 審核狀態）
--   三、線上點燈登記
--   四、神明與廟宇故事（後台可編輯，首頁動態讀取）
--   五、圖片儲存（Storage bucket 與權限）
--   六、廟方日常維護
-- ============================================================


-- ============================================================
-- 一、管理員身分
-- ------------------------------------------------------------
-- 後台 admin.html 使用 Supabase Auth（電子郵件／密碼）登入。
-- 但「登入過」不等於「是廟方人員」——只要專案開放註冊，
-- 任何人都能拿到一組 authenticated 身分。因此另外用這張表
-- 白名單化：只有列在 temple_admins 裡的帳號才算管理員，
-- 後面所有寫入政策都以 public.is_temple_admin() 把關。
--
-- ★ 強烈建議：Supabase → Authentication → Sign In / Providers
--   關閉「Allow new users to sign up」，帳號一律由廟方在後台
--   手動新增（Authentication → Users → Add user）。
-- ============================================================

create table if not exists public.temple_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.temple_admins enable row level security;

-- 判斷「目前這位登入者是不是廟方管理員」。
-- security definer：讓政策內部查得到這張表，不會被自身的 RLS 擋住。
create or replace function public.is_temple_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.temple_admins a
    where a.user_id = auth.uid()
  );
$$;

-- 登入者只能看到「自己那一列」，用來讓後台確認身分。
-- 名單本身不對外公開，也不允許任何人自行新增／修改（避免自封管理員），
-- 新增管理員請用本檔最後「六、廟方日常維護」的 SQL。
drop policy if exists "admin can read own row" on public.temple_admins;
create policy "admin can read own row"
  on public.temple_admins for select
  to authenticated
  using (user_id = auth.uid());


-- ============================================================
-- 二、祈福牆
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

-- ---- 審核狀態（後台祈福牆管理用）----------------------------
--   approved（預設）：公開顯示於祈福牆
--   hidden          ：廟方隱藏，前台讀不到，後台仍看得到
--   pending         ：等待審核，前台讀不到
--
-- 預設值刻意留 'approved'，維持「信眾送出後立刻上牆」的既有行為，
-- 廟方只需要在後台把不當留言按「隱藏」即可。
--
-- ★ 若想改成「先審後貼」（送出後不立刻顯示）：
--     alter table public.prayers alter column status set default 'pending';
--   同時必須把 js/supabase-api.js 的 insertPrayer 改成
--   Prefer: return=minimal——因為新資料立刻就讀不回來了，
--   要求回傳內容會失敗。
alter table public.prayers
  add column if not exists status text not null default 'approved';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prayers_status_allowed'
  ) then
    alter table public.prayers
      add constraint prayers_status_allowed
      check (status in ('pending', 'approved', 'hidden'));
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

-- 祈福牆改為分頁載入（依時間新到舊），補一個索引讓翻頁不會愈翻愈慢。
-- 加入 status 後，前台實際掃描的是「公開且已通過」的心願，
-- 因此把舊的部分索引換成含 status 的版本。
drop index if exists public.prayers_public_created_idx;
create index if not exists prayers_visible_created_idx
  on public.prayers (created_at desc)
  where is_private = false and status = 'approved';

-- 後台會依審核狀態列出心願，補一個對應的索引
create index if not exists prayers_status_created_idx
  on public.prayers (status, created_at desc);

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

-- 只能讀取「公開且已審核通過」的心願
-- （私密心願與被隱藏的留言僅廟方可在後台查看）
drop policy if exists "read public prayers" on public.prayers;
create policy "read public prayers"
  on public.prayers for select
  to anon, authenticated
  using (is_private = false and status = 'approved');

-- 管理員：可讀取全部心願（含私密與已隱藏），並可改狀態、刪除
drop policy if exists "admin can read all prayers" on public.prayers;
create policy "admin can read all prayers"
  on public.prayers for select
  to authenticated
  using (public.is_temple_admin());

drop policy if exists "admin can update prayers" on public.prayers;
create policy "admin can update prayers"
  on public.prayers for update
  to authenticated
  using (public.is_temple_admin())
  with check (public.is_temple_admin());

drop policy if exists "admin can delete prayers" on public.prayers;
create policy "admin can delete prayers"
  on public.prayers for delete
  to authenticated
  using (public.is_temple_admin());

-- ---- 回應的權限政策 ----
-- 任何訪客都可以新增回應
drop policy if exists "anyone can insert replies" on public.replies;
create policy "anyone can insert replies"
  on public.replies for insert
  to anon, authenticated
  with check (true);

-- 只能讀取「公開且已通過的心願」底下的回應
drop policy if exists "read replies of public prayers" on public.replies;
create policy "read replies of public prayers"
  on public.replies for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.prayers p
      where p.id = replies.prayer_id
        and p.is_private = false
        and p.status = 'approved'
    )
  );

-- 管理員：可讀取與刪除全部回應（隱藏心願時底下的回應也要看得到）
drop policy if exists "admin can read all replies" on public.replies;
create policy "admin can read all replies"
  on public.replies for select
  to authenticated
  using (public.is_temple_admin());

drop policy if exists "admin can delete replies" on public.replies;
create policy "admin can delete replies"
  on public.replies for delete
  to authenticated
  using (public.is_temple_admin());


-- ============================================================
-- 三、線上點燈登記
-- ------------------------------------------------------------
-- 這張表存的是信眾的姓名與聯絡方式（個人資料），
-- 所以刻意設計成「訪客只能寫入、不能讀取」：
--   · 有 insert 政策            → 訪客可以送出登記
--   · anon 沒有 select 政策     → 送出者本人也讀不回來
--   · 只有管理員有 select 政策  → 廟方登入後才看得到
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

-- 注意：這裡故意「不」給 anon 建立 select 政策。
-- 若哪天替它加上不限身分的 select 政策，信眾的姓名與電話就會變成公開資料。
-- 底下這條限定 is_temple_admin()，未登入或非管理員一樣讀不到。
drop policy if exists "admin can read lamp registrations" on public.lamp_registrations;
create policy "admin can read lamp registrations"
  on public.lamp_registrations for select
  to authenticated
  using (public.is_temple_admin());

drop policy if exists "admin can delete lamp registrations" on public.lamp_registrations;
create policy "admin can delete lamp registrations"
  on public.lamp_registrations for delete
  to authenticated
  using (public.is_temple_admin());


-- ============================================================
-- 四、神明與廟宇故事
-- ------------------------------------------------------------
-- 首頁「神明介紹」原本寫死在 content.json，要改字得動檔案、
-- 提交、等部署。改為由這張表提供之後，廟方可直接在 admin.html
-- 新增／編輯／上下架，存檔即時反映在首頁。
--
-- 相容性：這張表沒有資料（或尚未建立）時，首頁會自動退回
-- content.json 的內容，不會開天窗。
-- ============================================================

create table if not exists public.gods_info (
  id           uuid primary key default gen_random_uuid(),
  name         text        not null,
  role         text        not null default '陪 祀',
  story        text        not null default '',
  image_url    text,
  sort_order   integer     not null default 0,
  is_published boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint gods_name_len  check (char_length(name) between 1 and 30),
  constraint gods_role_len  check (char_length(role) <= 20),
  constraint gods_story_len check (char_length(story) <= 2000),
  constraint gods_image_len check (image_url is null or char_length(image_url) <= 500)
);

-- 首頁依 sort_order 由小到大排列，同序時以建立時間為準
create index if not exists gods_info_published_order_idx
  on public.gods_info (sort_order asc, created_at asc)
  where is_published = true;

-- updated_at 自動更新，後台不必自己送這個欄位
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gods_info_touch_updated_at on public.gods_info;
create trigger gods_info_touch_updated_at
  before update on public.gods_info
  for each row execute function public.touch_updated_at();

alter table public.gods_info enable row level security;

-- 訪客只讀得到「已發布」的神明
drop policy if exists "read published gods" on public.gods_info;
create policy "read published gods"
  on public.gods_info for select
  to anon, authenticated
  using (is_published = true);

-- 管理員：讀寫全部（含未發布的草稿）
drop policy if exists "admin can read all gods" on public.gods_info;
create policy "admin can read all gods"
  on public.gods_info for select
  to authenticated
  using (public.is_temple_admin());

drop policy if exists "admin can insert gods" on public.gods_info;
create policy "admin can insert gods"
  on public.gods_info for insert
  to authenticated
  with check (public.is_temple_admin());

drop policy if exists "admin can update gods" on public.gods_info;
create policy "admin can update gods"
  on public.gods_info for update
  to authenticated
  using (public.is_temple_admin())
  with check (public.is_temple_admin());

drop policy if exists "admin can delete gods" on public.gods_info;
create policy "admin can delete gods"
  on public.gods_info for delete
  to authenticated
  using (public.is_temple_admin());


-- ============================================================
-- 五、圖片儲存（Storage）
-- ------------------------------------------------------------
-- 後台上傳的神像／廟宇照片放在 temple-images 這個 bucket。
-- bucket 設為 public：檔案網址可以直接放進 <img src>，
-- 前台不必帶金鑰，也不用簽名網址。上傳則限管理員。
--
-- 檔案網址格式：
--   https://<專案>.supabase.co/storage/v1/object/public/temple-images/<路徑>
--
-- ※ 若這一節因權限問題執行失敗（部分專案不允許在 SQL Editor
--   直接改 storage 的政策），改用畫面操作即可：
--   Storage → New bucket → 名稱 temple-images、勾選 Public bucket，
--   再到該 bucket 的 Policies 依下面四條政策的條件建立。
-- ============================================================

insert into storage.buckets (id, name, public)
values ('temple-images', 'temple-images', true)
on conflict (id) do update set public = true;

-- 任何人都可以讀取（bucket 已是 public，這條是讓 API 列檔也能通）
drop policy if exists "public read temple images" on storage.objects;
create policy "public read temple images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'temple-images');

-- 只有管理員能上傳／覆蓋／刪除
drop policy if exists "admin can upload temple images" on storage.objects;
create policy "admin can upload temple images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'temple-images' and public.is_temple_admin());

drop policy if exists "admin can update temple images" on storage.objects;
create policy "admin can update temple images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'temple-images' and public.is_temple_admin())
  with check (bucket_id = 'temple-images' and public.is_temple_admin());

drop policy if exists "admin can delete temple images" on storage.objects;
create policy "admin can delete temple images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'temple-images' and public.is_temple_admin());


-- ============================================================
-- 六、廟方日常維護
-- ------------------------------------------------------------
-- ★ 新增一位後台管理員（三步驟）：
--   1. Supabase → Authentication → Users → Add user
--      填入電子郵件與密碼（記得勾 Auto Confirm User）
--   2. 回到 SQL Editor，把下面的信箱換成剛剛建立的那組後執行：
--        insert into public.temple_admins (user_id, email)
--        select id, email from auth.users
--         where email = 'temple-admin@example.com'
--        on conflict (user_id) do nothing;
--   3. 打開網站的 admin.html，用該帳號登入
--
-- ★ 移除管理員（帳號留著，只是不再有後台權限）：
--        delete from public.temple_admins where email = 'temple-admin@example.com';
--
-- 查看目前的管理員名單：
--   select email, created_at from public.temple_admins order by created_at;
--
-- 查看私密心願：
--   select * from public.prayers where is_private = true order by created_at desc;
--
-- 查看被隱藏的心願：
--   select created_at, name, content from public.prayers
--    where status = 'hidden' order by created_at desc;
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
