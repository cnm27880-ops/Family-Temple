'use strict';

/* ============================================
   天虛宮 — Supabase 存取層（共用）
   --------------------------------------------
   祈福牆、擲筊、點燈頁共用的後端讀寫函式，集中在此，
   避免重複。需先載入 js/supabase-config.js。
   對外提供 window.TempleAPI。
   ============================================ */
(function () {

  var BASE = window.SUPABASE_URL;
  var KEY = window.SUPABASE_KEY;
  var REST = (BASE || '') + '/rest/v1';
  var ready = !!(BASE && KEY);

  function headers(extra) {
    var h = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };
    if (extra) {
      Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    }
    return h;
  }

  /**
   * 帶逾時的 fetch。
   * 網路不通時 fetch 可能一直不回應，畫面就會卡在「載入中…」，
   * 因此統一設一個上限，逾時就當作失敗，讓呼叫端顯示錯誤訊息。
   */
  var TIMEOUT_MS = 12000;

  function request(url, opts) {
    if (typeof AbortController === 'undefined') {
      return fetch(url, opts);
    }

    var controller = new AbortController();
    var merged = { signal: controller.signal };
    if (opts) {
      Object.keys(opts).forEach(function (k) { merged[k] = opts[k]; });
    }

    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

    return fetch(url, merged).then(function (res) {
      clearTimeout(timer);
      return res;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
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

  /**
   * 讀取公開心願（含回應），最新在前。
   * 一次只取一頁，避免心願累積後首次載入變慢。
   * @param {{type?: string, limit?: number, offset?: number}} [opts]
   *        type 為「全部」或未給時不篩選分類
   * @returns {Promise<{items: Array, hasMore: boolean}>}
   */
  function fetchPrayers(opts) {
    var options = opts || {};
    var limit = options.limit || 12;
    var offset = options.offset || 0;

    var url = REST + '/prayers' +
      '?select=id,name,content,type,created_at,replies(author,text,created_at)' +
      '&is_private=eq.false';

    if (options.type && options.type !== '全部') {
      url += '&type=eq.' + encodeURIComponent(options.type);
    }

    // 多取一筆用來判斷還有沒有下一頁，不需另外查總數
    url += '&order=created_at.desc' +
      '&offset=' + offset +
      '&limit=' + (limit + 1);

    return request(url, { headers: headers() }).then(function (res) {
      if (!res.ok) { throw new Error('load ' + res.status); }
      return res.json();
    }).then(function (rows) {
      var hasMore = rows.length > limit;
      return {
        items: rows.slice(0, limit).map(normalizePrayer),
        hasMore: hasMore
      };
    });
  }

  // 新增一則心願，回傳建立後的資料（含 id 與時間）
  function insertPrayer(payload) {
    return request(REST + '/prayers', {
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
    return request(REST + '/replies', {
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

  /**
   * 新增一筆點燈登記。
   * 這張表刻意「只能寫入、不能讀取」（RLS 沒有 select 政策），
   * 所以必須用 return=minimal——若要求回傳資料會因無讀取權而失敗。
   */
  function insertLamp(payload) {
    return request(REST + '/lamp_registrations', {
      method: 'POST',
      headers: headers({
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }),
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) { throw new Error('lamp ' + res.status); }
      return true;
    });
  }

  window.TempleAPI = {
    ready: ready,
    normalizePrayer: normalizePrayer,
    fetchPrayers: fetchPrayers,
    insertPrayer: insertPrayer,
    insertReply: insertReply,
    insertLamp: insertLamp
  };

})();
