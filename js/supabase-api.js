'use strict';

/* ============================================
   天虛宮 — Supabase 存取層（共用）
   --------------------------------------------
   首頁、祈福牆、擲筊、點燈頁共用的後端讀寫函式，集中在此，
   避免重複。需先載入 js/supabase-config.js。
   對外提供 window.TempleAPI。

   這裡只放「訪客身分（anon 金鑰）」的公開讀寫。
   後台的登入與管理操作在 js/supabase-admin.js，
   它會沿用本檔匯出的 request / restUrl / baseUrl。
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
   *
   * 審核狀態刻意「不」寫進查詢字串，交給資料庫的 RLS 過濾
   * （政策條件：is_private = false and status = 'approved'）。
   * 這樣做有兩個好處：
   *   · 廟方在後台按下「隱藏」後，前台立刻讀不到，前端不必改
   *   · 尚未執行新版 supabase-schema.sql（還沒有 status 欄位）的
   *     專案不會因為查詢到不存在的欄位而整面壞掉
   * 分頁計數也因此正確——篩選一律發生在資料庫端。
   *
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

  /**
   * 新增一則心願。
   *
   * 公開心願回傳建立後的資料（含 id 與時間），祈福牆才能立刻把卡片插到最前面。
   * 私密心願則改用 return=minimal：RLS 的 select 政策只放行公開心願，
   * 要求回傳內容會因為「寫得進去、但讀不回來」而失敗，
   * 反而讓信眾看到假的錯誤訊息。這種情況回傳 null，呼叫端本來也用不到內容。
   *
   * @param {{name: string, content: string, type: string, is_private: boolean}} payload
   * @returns {Promise<Object|null>} 公開心願為正規化後的資料，私密心願為 null
   */
  function insertPrayer(payload) {
    var wantsRow = !(payload && payload.is_private);

    return request(REST + '/prayers', {
      method: 'POST',
      headers: headers({
        'Content-Type': 'application/json',
        'Prefer': wantsRow ? 'return=representation' : 'return=minimal'
      }),
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) { throw new Error('insert ' + res.status); }
      if (!wantsRow) { return null; }
      return res.json().then(function (rows) {
        return rows && rows[0] ? normalizePrayer(rows[0]) : null;
      });
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

  /* ============================================
     神明與廟宇故事
     --------------------------------------------
     資料來源是 gods_info 表，由後台 admin.html 維護。
     RLS 只放行 is_published = true，所以這裡拿到的
     一定是「已發布」的內容。
     ============================================ */

  // 將資料庫欄位轉為 content.json 的神明格式，
  // 讓 js/main.js 的 renderDeities 兩種來源共用同一套繪製邏輯。
  function normalizeDeity(row) {
    return {
      icon: '',
      name: row.name || '',
      role: row.role || '',
      desc: row.story || '',
      image: row.image_url || ''
    };
  }

  /**
   * 讀取已發布的神明介紹，依後台設定的排序。
   * @returns {Promise<Array>} 沒有資料時回傳空陣列（首頁會退回 content.json）
   */
  function fetchDeities() {
    var url = REST + '/gods_info' +
      '?select=id,name,role,story,image_url,sort_order' +
      '&is_published=eq.true' +
      '&order=sort_order.asc,created_at.asc';

    return request(url, { headers: headers() }).then(function (res) {
      if (!res.ok) { throw new Error('gods ' + res.status); }
      return res.json();
    }).then(function (rows) {
      return rows.map(normalizeDeity);
    });
  }

  window.TempleAPI = {
    ready: ready,
    normalizePrayer: normalizePrayer,
    fetchPrayers: fetchPrayers,
    insertPrayer: insertPrayer,
    insertReply: insertReply,
    insertLamp: insertLamp,
    normalizeDeity: normalizeDeity,
    fetchDeities: fetchDeities,

    // ---- 給 js/supabase-admin.js 沿用的底層工具 ----
    // 後台要帶自己的 Authorization（登入者的 access token），
    // 不能直接用上面那些函式，但逾時處理與網址組法可以共用。
    baseUrl: BASE,
    anonKey: KEY,
    restUrl: function (path) { return REST + path; },
    request: request
  };

})();
