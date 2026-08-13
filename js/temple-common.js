'use strict';

/* ============================================
   天虛宮 — 共用工具（內容守門 / 送出頻率 / 無障礙彈窗）
   --------------------------------------------
   祈福牆、擲筊、點燈三處都會讓訪客送出文字，
   檢查規則集中在這裡，改一次三處同步。

   對外提供：
     window.TempleGuard  — 內容過濾與送出頻率限制
     window.TempleModal  — 可用鍵盤操作的確認彈窗
     window.TempleFate   — 擲筊、抽籤的取數
   ============================================ */
(function () {

  /* ============================================
     TempleGuard — 內容守門
     ============================================ */

  // 全形數字/英文轉半形，並移除零寬字元，
  // 避免有人用「０９１２…」或夾雜隱形字元繞過檢查。
  function normalize(text) {
    return String(text == null ? '' : text)
      // 全形 ！ 到 ～ 對應半形，位移固定為 0xFEE0
      .replace(/[！-～]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      })
      // 零寬空白、零寬連字與 BOM
      .replace(/[\u200B-\u200D\uFEFF]/g, '');
  }

  // 再把空白與分隔符號拿掉，抓「0 9 1 2-3 4 5…」這類拆開寫的號碼
  function compact(text) {
    return normalize(text).replace(/[\s.\-_、･·／/\\|]/g, '');
  }

  // 個人資訊與外部連結。
  // tight 為 false 的規則只檢查原文——因為 compact() 會把分隔符號拿掉，
  // 若對壓縮後的文字套用「長數字串」規則，連「2026/01/15」這種日期
  // 都會被誤擋。
  var CONTACT_PATTERNS = [
    { re: /09\d{8}/, reason: '請勿填寫手機號碼', tight: true },
    { re: /0\d{1,2}-\d{6,8}/, reason: '請勿填寫電話號碼', tight: false },
    { re: /0\d{8,9}/, reason: '請勿填寫電話號碼', tight: true },
    { re: /[\w.+-]+@[\w-]+\.[\w.]+/, reason: '請勿填寫電子郵件', tight: false },
    { re: /[A-Z][12]\d{8}/, reason: '請勿填寫身分證字號', tight: true },
    { re: /\d{8,}/, reason: '請勿填寫過長的數字串', tight: false }
  ];

  var LINK_PATTERNS = [
    { re: /https?:\/\//i, reason: '請勿填寫網址連結', tight: false },
    { re: /www\./i, reason: '請勿填寫網址連結', tight: false },
    { re: /[\w-]+\.(com|net|org|tw|cc|io|me|link)\b/i, reason: '請勿填寫網址連結', tight: false }
  ];

  // 辱罵與廣告招攬用語
  var KEYWORDS = [
    '幹', '他媽', '去死', '白痴', '智障',
    '加line', '加賴', '加微信', '私訊', '私聊',
    '代辦', '貸款', '博弈', '博彩', '娃娃機',
    '點我', '限時', '免費領', '包養', '兼職日領'
  ];

  /**
   * 檢查訪客送出的文字。
   * @param {string} text 待檢查文字
   * @param {{allowContact?: boolean}} [opts] allowContact 為 true 時放行電話/信箱
   *        （點燈登記需要留聯絡方式）
   * @returns {{pass: boolean, reason?: string}}
   */
  function check(text, opts) {
    var options = opts || {};
    var plain = normalize(text);
    var tight = compact(text);
    var lower = plain.toLowerCase();
    var lowerTight = tight.toLowerCase();
    var i;

    var patterns = LINK_PATTERNS.slice();
    if (!options.allowContact) {
      patterns = patterns.concat(CONTACT_PATTERNS);
    }

    for (i = 0; i < patterns.length; i++) {
      var rule = patterns[i];
      if (rule.re.test(plain) || (rule.tight && rule.re.test(tight))) {
        return { pass: false, reason: rule.reason };
      }
    }

    for (i = 0; i < KEYWORDS.length; i++) {
      var kw = KEYWORDS[i].toLowerCase();
      if (lower.indexOf(kw) !== -1 || lowerTight.indexOf(kw) !== -1) {
        return { pass: false, reason: '內容含有不適當的詞彙，請修改後再送出' };
      }
    }

    return { pass: true };
  }

  /* ============================================
     送出頻率限制
     --------------------------------------------
     瀏覽器端的限制只能擋住隨手連續送出，擋不住
     刻意繞過的人——真正的防濫用要靠 Supabase 端的
     規則。這裡的用途是降低誤觸與洗版。
     ============================================ */

  var STORE_PREFIX = 'temple_rate_';

  function readStamps(key) {
    try {
      var raw = window.localStorage.getItem(STORE_PREFIX + key);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(function (n) {
        return typeof n === 'number' && isFinite(n);
      }) : [];
    } catch (e) {
      return [];
    }
  }

  function writeStamps(key, stamps) {
    try {
      window.localStorage.setItem(STORE_PREFIX + key, JSON.stringify(stamps));
    } catch (e) {
      /* 無痕模式或空間不足：放棄記錄，不影響送出 */
    }
  }

  /**
   * 建立一個時間窗內的次數限制器。
   * @param {string} key 儲存用的識別名稱
   * @param {number} limit 時間窗內允許的次數
   * @param {number} [windowMs] 時間窗長度，預設 1 小時
   */
  function rateLimiter(key, limit, windowMs) {
    var span = windowMs || 60 * 60 * 1000;

    function fresh() {
      var cutoff = Date.now() - span;
      return readStamps(key).filter(function (t) { return t > cutoff; });
    }

    return {
      // 是否已達上限
      limited: function () {
        return fresh().length >= limit;
      },
      // 記錄一次送出
      record: function () {
        var stamps = fresh();
        stamps.push(Date.now());
        writeStamps(key, stamps);
        return stamps.length;
      },
      // 還可以送出幾次
      remaining: function () {
        return Math.max(0, limit - fresh().length);
      }
    };
  }

  window.TempleGuard = {
    check: check,
    normalize: normalize,
    rateLimiter: rateLimiter
  };

  /* ============================================
     TempleModal — 可用鍵盤操作的確認彈窗
     --------------------------------------------
     替既有的彈窗補上 dialog 語意、Esc 關閉、
     焦點鎖在彈窗內、關閉後把焦點還給原本的按鈕。
     ============================================ */

  var FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  /**
   * 把一個既有的彈窗元素包成可無障礙操作的物件。
   * @param {HTMLElement} root 彈窗最外層（帶 hidden 屬性者）
   * @param {{labelledBy?: string, onClose?: Function}} [opts]
   */
  function createModal(root, opts) {
    if (!root) { return null; }
    var options = opts || {};
    var box = root.querySelector('.confirm-modal-box') || root.firstElementChild;
    var backdrop = root.querySelector('.confirm-modal-backdrop');
    var lastFocused = null;

    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    if (options.labelledBy) {
      root.setAttribute('aria-labelledby', options.labelledBy);
    }
    if (box && !box.hasAttribute('tabindex')) {
      box.setAttribute('tabindex', '-1');
    }

    function focusables() {
      if (!box) { return []; }
      return Array.prototype.filter.call(
        box.querySelectorAll(FOCUSABLE),
        function (el) { return el.offsetParent !== null || el === document.activeElement; }
      );
    }

    function onKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') { return; }

      var items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        if (box) { box.focus(); }
        return;
      }
      var first = items[0];
      var last = items[items.length - 1];
      // 讓 Tab 在彈窗內循環，不會跑到底層頁面
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function open() {
      lastFocused = document.activeElement;
      root.hidden = false;
      document.addEventListener('keydown', onKeydown, true);
      var items = focusables();
      if (items.length > 0) {
        items[0].focus();
      } else if (box) {
        box.focus();
      }
    }

    function close() {
      root.hidden = true;
      document.removeEventListener('keydown', onKeydown, true);
      if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
      }
      lastFocused = null;
      if (typeof options.onClose === 'function') { options.onClose(); }
    }

    if (backdrop) {
      backdrop.addEventListener('click', close);
    }

    return { open: open, close: close, isOpen: function () { return !root.hidden; } };
  }

  window.TempleModal = { create: createModal };

  /* ============================================
     TempleFate — 擲筊與抽籤的取數
     --------------------------------------------
     兩件事：

     1. 亂數改用 crypto.getRandomValues。Math.random 的實作是可預測的
        偽亂數，同一輪操作裡連著取值容易出現肉眼可見的規律；問神的
        結果用它取，說不過去。

     2. 「誠意」會微幅影響筊象的分布。實際到廟裡，匆匆忙忙擲一筊，
        與淨心稟告、靜候片刻後再擲，本來就是兩種心境；這裡把停留
        時間與擲筊前的靜止時間換算成 0～1 的誠意值，讓聖筊的機率
        從三分之一最多升到約 0.39。

        幅度刻意壓在一成以內，而且不對使用者宣告——它是讓結果不至於
        淪為純骰子的暗紋，不是可以操作的機制。三種筊象在任何情況下
        都保有相當的機率，不會出現「等久一點就必定聖筊」。
     ============================================ */

  var startedAt = Date.now();
  var lastMoveAt = Date.now();
  var moves = 0;

  function noteMove() {
    lastMoveAt = Date.now();
    moves++;
  }

  ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (evt) {
    window.addEventListener(evt, noteMove, { passive: true });
  });

  function clamp01(n) {
    if (!isFinite(n)) { return 0; }
    return n < 0 ? 0 : (n > 1 ? 1 : n);
  }

  // 亂數來源：優先 crypto，環境不支援時才退回 Math.random
  function randomUint32() {
    var c = window.crypto || window.msCrypto;
    if (c && typeof c.getRandomValues === 'function') {
      var buf = new Uint32Array(1);
      c.getRandomValues(buf);
      return buf[0];
    }
    return Math.floor(Math.random() * 4294967296);
  }

  // [0, 1) 的浮點數
  function random() {
    return randomUint32() / 4294967296;
  }

  /**
   * [0, n) 的整數，且各數等機率。
   * 直接取餘數會讓前幾個數字略多一點（2^32 不能被 n 整除），
   * 所以把落在尾端不完整區段的取值丟掉重取。
   */
  function pickIndex(n) {
    var count = Math.floor(n);
    if (!(count > 0)) { return 0; }
    var limit = Math.floor(4294967296 / count) * count;
    var v = randomUint32();
    var guard = 0;
    while (v >= limit && guard < 64) {
      v = randomUint32();
      guard++;
    }
    return v % count;
  }

  /** 在頁面停留多久（0～1，三分鐘為滿） */
  function dwell() {
    return clamp01((Date.now() - startedAt) / (3 * 60 * 1000));
  }

  /** 擲之前靜候了多久（0～1，八秒為滿） */
  function stillness() {
    return clamp01((Date.now() - lastMoveAt) / 8000);
  }

  /** 誠意值（0～1）：停留時間與靜候各半 */
  function sincerity() {
    return clamp01(dwell() * 0.5 + stillness() * 0.5);
  }

  /**
   * 依權重抽出一個鍵。
   * @param {Object} weights 例如 { sheng: .36, xiao: .32, yin: .32 }
   * @returns {string|null}
   */
  function weighted(weights) {
    var keys = Object.keys(weights || {});
    var total = 0;
    var i;
    for (i = 0; i < keys.length; i++) {
      var w = weights[keys[i]];
      if (typeof w === 'number' && w > 0) { total += w; }
    }
    if (total <= 0) { return keys.length ? keys[pickIndex(keys.length)] : null; }

    var roll = random() * total;
    for (i = 0; i < keys.length; i++) {
      var v = weights[keys[i]];
      if (typeof v !== 'number' || v <= 0) { continue; }
      roll -= v;
      if (roll <= 0) { return keys[i]; }
    }
    return keys[keys.length - 1];
  }

  window.TempleFate = {
    random: random,
    pickIndex: pickIndex,
    weighted: weighted,
    sincerity: sincerity,
    dwell: dwell,
    stillness: stillness,
    moves: function () { return moves; }
  };

})();
