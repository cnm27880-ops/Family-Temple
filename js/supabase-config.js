'use strict';

/* ============================================
   天虛宮 — Supabase 後端設定
   --------------------------------------------
   這裡的 URL 與 publishable key 本來就是設計成
   公開放在前端使用，安全性由 Supabase 的 Row Level
   Security（資料表權限政策）把關——請務必依專案內
   提供的 SQL 建立資料表並啟用 RLS。

   若日後更換專案，改這兩個值即可。
   ============================================ */

window.SUPABASE_URL = 'https://kljxjzfbbiinbpzjuaqz.supabase.co';
window.SUPABASE_KEY = 'sb_publishable_5feZ0miZ0EfYL_8BWLUHHg_CbMtI0l0';
