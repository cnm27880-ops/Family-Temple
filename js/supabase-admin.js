'use strict';

/* ============================================
   天虛宮 — 後台存取層（僅 admin.html 載入）
   --------------------------------------------
   兩個部分：
     window.TempleAuth  — Supabase Auth 登入／登出／工作階段
     window.TempleAdmin — 需要管理員身分的讀寫（神明、祈福牆、圖片）

   全站的 CSP 是 script-src 'self'，不能載入 supabase-js CDN，
   因此這裡直接呼叫 Supabase 的 REST 端點（auth / rest / storage）。
   底層的 request 與網址組法沿用 js/supabase-api.js。

   需先載入：js/supabase-config.js → js/supabase-api.js → 本檔
   ============================================ */
(function () {

  var API = window.TempleAPI || {};
  var BASE = API.baseUrl || '';
  var KEY = API.anonKey || '';
  var request = API.request || window.fetch.bind(window);
  var ready = !!(BASE && KEY);

  // 圖片 bucket，需與 supabase-schema.sql 的第五節一致
  var BUCKET = 'temple-images';

  /* ============================================
     工作階段（session）
     --------------------------------------------
     存在 sessionStorage：關掉分頁就登出，比 localStorage
     適合後台。access token 有效期預設一小時，過期時用
     refresh token 換新的，換不到就要求重新登入。
     ============================================ */

  var STORAGE_KEY = 'temple_admin_session';
  var session = null;   // { access_token, refresh_token, expires_at, user }

  function readStoredSession() {
    try {
      var raw = window.sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeStoredSession(value) {
    try {
      if (value) {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } else {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      // 隱私模式下 sessionStorage 可能不可寫，登入仍可用，只是不留存
    }
  }

  // Supabase 回傳的 expires_in 是秒數，換算成絕對時間比較好判斷
  function adoptSession(data) {
    if (!data || !data.access_token) { return null; }
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      // 提前 60 秒視為過期，避免請求送到一半才失效
      expires_at: Date.now() + ((data.expires_in || 3600) - 60) * 1000,
      user: data.user || null
    };
    writeStoredSession(session);
    return session;
  }

  function clearSession() {
    session = null;
    writeStoredSession(null);
  }

  function isExpired() {
    return !session || !session.expires_at || Date.now() >= session.expires_at;
  }

  function authUrl(path) {
    return BASE + '/auth/v1' + path;
  }

  function authHeaders(extra) {
    var h = { 'apikey': KEY, 'Content-Type': 'application/json' };
    if (extra) {
      Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    }
    return h;
  }

  // 把 Supabase Auth 的英文錯誤換成信眾／廟方看得懂的訊息
  function authErrorMessage(status, body) {
    var msg = (body && (body.error_description || body.msg || body.message)) || '';
    if (status === 400 && /invalid login/i.test(msg)) {
      return '電子郵件或密碼不正確';
    }
    if (status === 400 && /email not confirmed/i.test(msg)) {
      return '此帳號尚未完成驗證，請至 Supabase 後台確認帳號';
    }
    if (status === 429) {
      return '嘗試次數過多，請稍候再試';
    }
    if (status === 0) {
      return '無法連線至後端，請檢查網路';
    }
    return msg || ('登入失敗（' + status + '）');
  }

  /** 以電子郵件／密碼登入，成功後工作階段留在記憶體與 sessionStorage。 */
  function signIn(email, password) {
    if (!ready) {
      return Promise.reject(new Error('後端尚未設定'));
    }
    return request(authUrl('/token?grant_type=password'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var err = new Error(authErrorMessage(res.status, body));
          err.status = res.status;
          throw err;
        }
        return adoptSession(body);
      });
    });
  }

  /** 用 refresh token 換一組新的 access token。失敗時清掉工作階段。 */
  function refresh() {
    var stored = session || readStoredSession();
    if (!stored || !stored.refresh_token) {
      clearSession();
      return Promise.reject(new Error('工作階段已過期，請重新登入'));
    }
    return request(authUrl('/token?grant_type=refresh_token'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: stored.refresh_token })
    }).then(function (res) {
      if (!res.ok) {
        clearSession();
        throw new Error('工作階段已過期，請重新登入');
      }
      return res.json();
    }).then(function (body) {
      return adoptSession(body);
    });
  }

  /**
   * 取得可用的工作階段：記憶體裡沒有就讀 sessionStorage，
   * 過期就自動換發。開啟頁面時用來判斷「是否已登入」。
   */
  function ensureSession() {
    if (!session) { session = readStoredSession(); }
    if (!session) {
      return Promise.reject(new Error('尚未登入'));
    }
    if (isExpired()) {
      return refresh();
    }
    return Promise.resolve(session);
  }

  /** 登出：通知後端撤銷 token，無論成敗都清掉本機的工作階段。 */
  function signOut() {
    var token = session && session.access_token;
    clearSession();
    if (!token) { return Promise.resolve(); }
    return request(authUrl('/logout'), {
      method: 'POST',
      headers: authHeaders({ 'Authorization': 'Bearer ' + token })
    }).then(function () { return true; }, function () { return true; });
  }

  function currentUser() {
    return session && session.user ? session.user : null;
  }

  window.TempleAuth = {
    ready: ready,
    signIn: signIn,
    signOut: signOut,
    ensureSession: ensureSession,
    currentUser: currentUser,
    hasStoredSession: function () { return !!readStoredSession(); }
  };


  /* ============================================
     管理員專用的資料存取
     --------------------------------------------
     每個請求都帶登入者的 access token，實際能不能寫入
     由資料庫的 RLS（is_temple_admin()）決定，
     前端的身分檢查只是為了給出友善的畫面。
     ============================================ */

  /**
   * 帶著登入身分呼叫 Supabase。401 時換發 token 再重試一次。
   * opts.noTimeout：圖片上傳這類可能超過共用逾時（12 秒）的請求用，
   * 改走原生 fetch，不套用中止計時器。
   */
  function authedFetch(url, opts, retried) {
    return ensureSession().then(function (s) {
      var options = { headers: {} };
      var noTimeout = !!(opts && opts.noTimeout);
      if (opts) {
        Object.keys(opts).forEach(function (k) {
          if (k !== 'noTimeout') { options[k] = opts[k]; }
        });
      }
      var h = { 'apikey': KEY, 'Authorization': 'Bearer ' + s.access_token };
      if (opts && opts.headers) {
        Object.keys(opts.headers).forEach(function (k) { h[k] = opts.headers[k]; });
      }
      options.headers = h;

      var send = noTimeout ? window.fetch.bind(window) : request;
      return send(url, options).then(function (res) {
        // token 剛好在請求途中失效：換發後重試一次，避免使用者白操作一輪
        if (res.status === 401 && !retried) {
          return refresh().then(function () {
            return authedFetch(url, opts, true);
          });
        }
        return res;
      });
    });
  }

  // PostgREST 失敗時盡量把原因翻成中文，其餘照原樣帶出以便排查
  function restError(res, fallback) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('沒有權限執行此操作，請確認帳號已加入管理員名單');
      }
      if (res.status === 404 && /gods_info/.test(String(body.message || ''))) {
        throw new Error('尚未建立 gods_info 資料表，請先執行 supabase-schema.sql');
      }
      throw new Error(body.message || body.hint || (fallback + '（' + res.status + '）'));
    });
  }

  function jsonOrThrow(res, fallback) {
    if (!res.ok) { return restError(res, fallback); }
    return res.json();
  }

  /**
   * 確認目前登入者是否在管理員名單內。
   * temple_admins 的 RLS 只讓人讀到自己那一列，
   * 因此查得到 = 是管理員。
   */
  function verifyAdmin() {
    var user = currentUser();
    if (!user || !user.id) {
      return Promise.reject(new Error('尚未登入'));
    }
    var url = API.restUrl('/temple_admins?select=user_id&user_id=eq.' +
      encodeURIComponent(user.id) + '&limit=1');
    return authedFetch(url, {}).then(function (res) {
      if (res.status === 404) {
        throw new Error('尚未建立 temple_admins 資料表，請先執行 supabase-schema.sql');
      }
      return jsonOrThrow(res, '身分驗證失敗');
    }).then(function (rows) {
      return Array.isArray(rows) && rows.length > 0;
    });
  }


  /* ---------- 神明與廟宇故事 ---------- */

  /** 列出全部神明（含未發布的草稿），依後台排序。 */
  function listGods() {
    var url = API.restUrl('/gods_info' +
      '?select=id,name,role,story,image_url,sort_order,is_published,updated_at' +
      '&order=sort_order.asc,created_at.asc');
    return authedFetch(url, {}).then(function (res) {
      return jsonOrThrow(res, '神明資料載入失敗');
    });
  }

  /** 新增一位神明，回傳建立後的資料。 */
  function createGod(payload) {
    return authedFetch(API.restUrl('/gods_info'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return jsonOrThrow(res, '新增失敗');
    }).then(function (rows) { return rows[0]; });
  }

  /** 更新指定神明的欄位，回傳更新後的資料。 */
  function updateGod(id, payload) {
    var url = API.restUrl('/gods_info?id=eq.' + encodeURIComponent(id));
    return authedFetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return jsonOrThrow(res, '更新失敗');
    }).then(function (rows) { return rows[0]; });
  }

  function deleteGod(id) {
    var url = API.restUrl('/gods_info?id=eq.' + encodeURIComponent(id));
    return authedFetch(url, {
      method: 'DELETE',
      headers: { 'Prefer': 'return=minimal' }
    }).then(function (res) {
      if (!res.ok) { return restError(res, '刪除失敗'); }
      return true;
    });
  }


  /* ---------- 祈福牆管理 ---------- */

  /**
   * 列出心願（管理員可看到私密與已隱藏的）。
   * @param {{status?: string, limit?: number, offset?: number}} [opts]
   *        status 為 '全部' 或未給時不篩選
   * @returns {Promise<{items: Array, hasMore: boolean}>}
   */
  function listPrayers(opts) {
    var options = opts || {};
    var limit = options.limit || 20;
    var offset = options.offset || 0;

    var url = API.restUrl('/prayers' +
      '?select=id,name,content,type,status,is_private,created_at,replies(id,author,text)');

    if (options.status && options.status !== '全部') {
      url += '&status=eq.' + encodeURIComponent(options.status);
    }

    // 多取一筆用來判斷還有沒有下一頁，不需另外查總數
    url += '&order=created_at.desc' +
      '&offset=' + offset +
      '&limit=' + (limit + 1);

    return authedFetch(url, {}).then(function (res) {
      return jsonOrThrow(res, '心願載入失敗');
    }).then(function (rows) {
      var hasMore = rows.length > limit;
      return { items: rows.slice(0, limit), hasMore: hasMore };
    });
  }

  /** 設定審核狀態：approved（通過）／hidden（隱藏）／pending（待審）。 */
  function setPrayerStatus(id, status) {
    var url = API.restUrl('/prayers?id=eq.' + encodeURIComponent(id));
    return authedFetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ status: status })
    }).then(function (res) {
      return jsonOrThrow(res, '狀態更新失敗');
    }).then(function (rows) { return rows[0]; });
  }

  /** 刪除心願（資料庫的外鍵是 on delete cascade，底下回應會一併刪除）。 */
  function deletePrayer(id) {
    var url = API.restUrl('/prayers?id=eq.' + encodeURIComponent(id));
    return authedFetch(url, {
      method: 'DELETE',
      headers: { 'Prefer': 'return=minimal' }
    }).then(function (res) {
      if (!res.ok) { return restError(res, '刪除失敗'); }
      return true;
    });
  }


  /* ---------- 圖片上傳（Storage） ---------- */

  var IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  var MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // 5 MB

  // 檔名只留英數與 .-_，中文檔名或空白會讓網址難讀也容易出錯
  function safeFileName(name) {
    var dot = String(name || '').lastIndexOf('.');
    var ext = dot > -1 ? String(name).slice(dot + 1).toLowerCase() : 'jpg';
    if (!/^[a-z0-9]{1,5}$/.test(ext)) { ext = 'jpg'; }
    var stamp = Date.now().toString(36);
    var rand = Math.random().toString(36).slice(2, 8);
    return stamp + '-' + rand + '.' + ext;
  }

  /**
   * 上傳圖片到 temple-images bucket，回傳可直接放進 <img src> 的公開網址。
   * @param {File} file
   * @returns {Promise<string>} 公開網址
   */
  function uploadImage(file) {
    if (!file) {
      return Promise.reject(new Error('請先選擇圖片'));
    }
    if (IMAGE_TYPES.indexOf(file.type) === -1) {
      return Promise.reject(new Error('僅支援 JPG／PNG／WebP／GIF 圖片'));
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return Promise.reject(new Error('圖片請控制在 5 MB 以內'));
    }

    var path = 'gods/' + safeFileName(file.name);
    var url = BASE + '/storage/v1/object/' + BUCKET + '/' + path;

    return authedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': file.type,
        'x-upsert': 'true'
      },
      body: file,
      // 大圖在慢速網路可能超過共用的 12 秒逾時，這裡不設中止計時器
      noTimeout: true
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (res.status === 400 && /bucket not found/i.test(String(body.message || ''))) {
            throw new Error('找不到 temple-images 儲存空間，請先執行 supabase-schema.sql 第五節');
          }
          if (res.status === 401 || res.status === 403) {
            throw new Error('沒有上傳權限，請確認帳號已加入管理員名單');
          }
          throw new Error(body.message || ('圖片上傳失敗（' + res.status + '）'));
        });
      }
      return BASE + '/storage/v1/object/public/' + BUCKET + '/' + path;
    });
  }

  window.TempleAdmin = {
    ready: ready,
    bucket: BUCKET,
    verifyAdmin: verifyAdmin,
    listGods: listGods,
    createGod: createGod,
    updateGod: updateGod,
    deleteGod: deleteGod,
    listPrayers: listPrayers,
    setPrayerStatus: setPrayerStatus,
    deletePrayer: deletePrayer,
    uploadImage: uploadImage
  };

})();
