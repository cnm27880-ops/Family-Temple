'use strict';

/* ============================================
   天虛宮 — Supabase 存取層（共用）
   --------------------------------------------
   祈福牆與擲筊頁共用的後端讀寫函式，集中在此，
   避免重複。需先載入 js/supabase-config.js。
   對外提供 window.TempleAPI。
   ============================================ */
(function () {

  var URL = window.SUPABASE_URL;
  var KEY = window.SUPABASE_KEY;
  var REST = (URL || '') + '/rest/v1';
  var ready = !!(URL && KEY);

  function headers(extra) {
    var h = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };
    if (extra) {
      Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    }
    return h;
  }

  // 將資料庫欄位轉為畫面使用的格式
  function normalizePrayer(row) {
    return {
      id: row.id,
      name: row.name,
      content: row.content,
      type: row.type || '純祈願',
      time: row.created_at,
      replies: Array.isArray(row.replies) ? row.replies : []
    };
  }

  // 讀取公開心願（含回應），最新在前
  function fetchPrayers() {
    var url = REST + '/prayers' +
      '?select=id,name,content,type,created_at,replies(author,text,created_at)' +
      '&is_private=eq.false' +
      '&order=created_at.desc';
    return fetch(url, { headers: headers() }).then(function (res) {
      if (!res.ok) { throw new Error('load ' + res.status); }
      return res.json();
    }).then(function (rows) {
      return rows.map(normalizePrayer);
    });
  }

  // 新增一則心願，回傳建立後的資料（含 id 與時間）
  function insertPrayer(payload) {
    return fetch(REST + '/prayers', {
      method: 'POST',
      headers: headers({
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }),
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) { throw new Error('insert ' + res.status); }
      return res.json();
    }).then(function (rows) {
      return normalizePrayer(rows[0]);
    });
  }

  // 新增一則回應
  function insertReply(payload) {
    return fetch(REST + '/replies', {
      method: 'POST',
      headers: headers({
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }),
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) { throw new Error('reply ' + res.status); }
      return res.json();
    });
  }

  window.TempleAPI = {
    ready: ready,
    normalizePrayer: normalizePrayer,
    fetchPrayers: fetchPrayers,
    insertPrayer: insertPrayer,
    insertReply: insertReply
  };

})();
