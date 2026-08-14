'use strict';

/* ============================================
   天虛宮 — 管理員後台
   --------------------------------------------
   兩個模組：
     1. 神明與廟宇故事：新增／編輯／上下架／刪除，含圖片上傳
     2. 祈福牆管理：列出心願並執行 通過／隱藏／刪除

   資料存取一律透過 js/supabase-admin.js（帶登入者的 token），
   實際權限由資料庫的 RLS 把關，前端只負責畫面。

   畫面一律用 createElement / textContent 組裝，
   信眾寫的內容不會經過 innerHTML。
   ============================================ */
(function () {

  var Auth = window.TempleAuth;
  var Admin = window.TempleAdmin;

  /* ========== DOM References ========== */
  var loginSection = document.getElementById('loginSection');
  var loginForm = document.getElementById('loginForm');
  var loginEmail = document.getElementById('loginEmail');
  var loginPassword = document.getElementById('loginPassword');
  var loginBtn = document.getElementById('loginBtn');
  var loginError = document.getElementById('loginError');

  var dashboard = document.getElementById('dashboard');
  var currentEmail = document.getElementById('currentEmail');
  var logoutBtn = document.getElementById('logoutBtn');

  var tabGods = document.getElementById('tabGods');
  var tabPrayers = document.getElementById('tabPrayers');
  var panelGods = document.getElementById('panelGods');
  var panelPrayers = document.getElementById('panelPrayers');

  // 神明表單
  var godForm = document.getElementById('godForm');
  var godFormTitle = document.getElementById('godFormTitle');
  var godId = document.getElementById('godId');
  var godName = document.getElementById('godName');
  var godRole = document.getElementById('godRole');
  var godStory = document.getElementById('godStory');
  var godStoryCount = document.getElementById('godStoryCount');
  var godOrder = document.getElementById('godOrder');
  var godPublished = document.getElementById('godPublished');
  var godThumb = document.getElementById('godThumb');
  var godImageInput = document.getElementById('godImageInput');
  var godImageClear = document.getElementById('godImageClear');
  var godImageName = document.getElementById('godImageName');
  var godImageUrl = document.getElementById('godImageUrl');
  var godSaveBtn = document.getElementById('godSaveBtn');
  var godResetBtn = document.getElementById('godResetBtn');
  var godFormMessage = document.getElementById('godFormMessage');
  var godList = document.getElementById('godList');

  // 祈福牆
  var prayerFilters = document.getElementById('prayerFilters');
  var prayerList = document.getElementById('prayerList');
  var prayerMessage = document.getElementById('prayerMessage');
  var prayerMoreWrap = document.getElementById('prayerMoreWrap');
  var prayerMoreBtn = document.getElementById('prayerMoreBtn');


  /* ============================================
     共用小工具
     ============================================ */

  /** 顯示訊息條。ok 為 true 時走翡翠色（成功），否則走硃砂（錯誤）。 */
  function showMessage(el, text, ok) {
    if (!el) { return; }
    el.textContent = text;
    el.classList.toggle('ad-message--ok', !!ok);
    el.hidden = false;
  }

  function hideMessage(el) {
    if (el) { el.hidden = true; }
  }

  // 送出中：鎖住按鈕並換掉字樣，完成後用回傳的函式還原
  function busy(btn, label) {
    if (!btn) { return function () {}; }
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    return function () {
      btn.disabled = false;
      btn.textContent = original;
    };
  }

  function formatDateTime(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) { return ''; }
    function pad(n) { return ('0' + n).slice(-2); }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function clearChildren(el) {
    while (el.firstChild) { el.removeChild(el.firstChild); }
  }

  function setPlaceholder(container, text) {
    clearChildren(container);
    var p = document.createElement('p');
    p.className = 'ad-empty';
    p.textContent = text;
    container.appendChild(p);
  }

  function makeChip(text, variant) {
    var span = document.createElement('span');
    span.className = 'ad-chip' + (variant ? ' ad-chip--' + variant : '');
    span.textContent = text;
    return span;
  }

  function makeButton(text, className, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ad-btn' + (className ? ' ' + className : '');
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }


  /* ============================================
     登入 / 登出
     ============================================ */

  function showLogin() {
    if (loginSection) { loginSection.hidden = false; }
    if (dashboard) { dashboard.hidden = true; }
  }

  function showDashboard(user) {
    if (loginSection) { loginSection.hidden = true; }
    if (dashboard) { dashboard.hidden = false; }
    if (currentEmail) {
      currentEmail.textContent = (user && user.email) ? user.email : '（未知帳號）';
    }
    loadGods();
    loadPrayers(true);
  }

  /**
   * 登入後的共同流程：先確認帳號在管理員名單內，
   * 不在名單就直接登出，避免停在一個什麼都做不了的畫面。
   */
  function enterDashboard() {
    return Admin.verifyAdmin().then(function (isAdmin) {
      if (!isAdmin) {
        return Auth.signOut().then(function () {
          throw new Error('此帳號尚未加入管理員名單，請洽廟方系統管理者');
        });
      }
      showDashboard(Auth.currentUser());
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      hideMessage(loginError);

      var email = loginEmail.value.trim();
      var password = loginPassword.value;

      if (!email || !password) {
        showMessage(loginError, '請輸入電子郵件與密碼');
        return;
      }
      if (!Auth || !Auth.ready) {
        showMessage(loginError, '尚未設定 Supabase 後端，請檢查 js/supabase-config.js');
        return;
      }

      var restore = busy(loginBtn, '登入中…');
      Auth.signIn(email, password).then(function () {
        return enterDashboard();
      }).then(function () {
        loginPassword.value = '';
        restore();
      }).catch(function (err) {
        showMessage(loginError, err.message || '登入失敗，請稍後再試');
        restore();
      });
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      var restore = busy(logoutBtn, '登出中…');
      Auth.signOut().then(function () {
        restore();
        showLogin();
        resetGodForm();
      });
    });
  }


  /* ============================================
     分頁切換
     ============================================ */

  function selectTab(which) {
    var isGods = which === 'gods';
    if (tabGods) { tabGods.setAttribute('aria-selected', isGods ? 'true' : 'false'); }
    if (tabPrayers) { tabPrayers.setAttribute('aria-selected', isGods ? 'false' : 'true'); }
    if (panelGods) { panelGods.hidden = !isGods; }
    if (panelPrayers) { panelPrayers.hidden = isGods; }
  }

  if (tabGods) {
    tabGods.addEventListener('click', function () { selectTab('gods'); });
  }
  if (tabPrayers) {
    tabPrayers.addEventListener('click', function () { selectTab('prayers'); });
  }
  selectTab('gods');


  /* ============================================
     模組一：神明與廟宇故事
     ============================================ */

  // 尚未上傳圖片時，圓形縮圖裡的蓮座線稿（頁面初始就有，這裡留一份好還原）
  var THUMB_PLACEHOLDER = godThumb ? godThumb.innerHTML : '';

  // 使用者選了檔案但還沒儲存時暫存在這裡，按下儲存才真的上傳
  var pendingImageFile = null;
  var pendingPreviewUrl = '';

  function releasePreview() {
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = '';
    }
  }

  /** 更新圓形預覽：有圖片網址就放圖，沒有就回到蓮座線稿。 */
  function renderThumb(url) {
    if (!godThumb) { return; }
    if (url) {
      clearChildren(godThumb);
      var img = document.createElement('img');
      img.src = url;
      img.alt = '神像照片預覽';
      godThumb.appendChild(img);
    } else {
      godThumb.innerHTML = THUMB_PLACEHOLDER;
    }
    if (godImageClear) {
      godImageClear.hidden = !url;
    }
  }

  function resetGodForm() {
    if (!godForm) { return; }
    godForm.reset();
    godId.value = '';
    godImageUrl.value = '';
    godOrder.value = '0';
    godPublished.checked = true;
    godStoryCount.textContent = '0';
    godFormTitle.textContent = '新增神明';
    godSaveBtn.textContent = '儲　存';
    godImageName.textContent = '尚未選擇圖片';
    releasePreview();
    pendingImageFile = null;
    renderThumb('');
    hideMessage(godFormMessage);
    // 清掉清單上的「編輯中」標記
    godList.querySelectorAll('.ad-item.is-editing').forEach(function (el) {
      el.classList.remove('is-editing');
    });
  }

  /** 把某一筆神明資料帶進表單編輯。 */
  function editGod(row, itemEl) {
    godId.value = row.id;
    godName.value = row.name || '';
    godRole.value = row.role || '';
    godStory.value = row.story || '';
    godStoryCount.textContent = String((row.story || '').length);
    godOrder.value = String(row.sort_order == null ? 0 : row.sort_order);
    godPublished.checked = row.is_published !== false;
    godImageUrl.value = row.image_url || '';
    godImageName.textContent = row.image_url ? '目前使用已上傳的照片' : '尚未選擇圖片';
    releasePreview();
    pendingImageFile = null;
    renderThumb(row.image_url || '');

    godFormTitle.textContent = '編輯：' + (row.name || '神明');
    godSaveBtn.textContent = '更　新';
    hideMessage(godFormMessage);

    godList.querySelectorAll('.ad-item.is-editing').forEach(function (el) {
      el.classList.remove('is-editing');
    });
    if (itemEl) { itemEl.classList.add('is-editing'); }

    godName.focus();
    godForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** 畫出一筆神明的清單列。 */
  function renderGodItem(row) {
    var item = document.createElement('article');
    item.className = 'ad-item';
    if (row.is_published === false) { item.classList.add('is-muted'); }

    if (row.image_url) {
      var thumb = document.createElement('img');
      thumb.className = 'ad-item-thumb';
      thumb.src = row.image_url;
      thumb.alt = (row.name || '神明') + '照片';
      thumb.loading = 'lazy';
      item.appendChild(thumb);
    }

    var head = document.createElement('div');
    head.className = 'ad-item-head';

    var name = document.createElement('h3');
    name.className = 'ad-item-name';
    name.textContent = row.name || '（未命名）';
    head.appendChild(name);

    if (row.role) {
      var meta = document.createElement('span');
      meta.className = 'ad-item-meta';
      meta.textContent = row.role;
      head.appendChild(meta);
    }

    head.appendChild(makeChip(
      row.is_published === false ? '未發布' : '已發布',
      row.is_published === false ? 'hidden' : 'approved'
    ));
    head.appendChild(makeChip('序 ' + (row.sort_order == null ? 0 : row.sort_order)));
    item.appendChild(head);

    var text = document.createElement('p');
    text.className = 'ad-item-text';
    text.textContent = row.story || '（尚未填寫故事簡介）';
    item.appendChild(text);

    var foot = document.createElement('div');
    foot.className = 'ad-item-foot';

    foot.appendChild(makeButton('編輯', '', function () {
      editGod(row, item);
    }));

    foot.appendChild(makeButton(
      row.is_published === false ? '發布' : '下架',
      row.is_published === false ? 'ad-btn--jade' : 'ad-btn--muted',
      function (e) {
        var restore = busy(e.currentTarget, '處理中…');
        Admin.updateGod(row.id, { is_published: row.is_published === false })
          .then(function () { loadGods(); })
          .catch(function (err) {
            restore();
            showMessage(godFormMessage, err.message || '更新失敗');
          });
      }
    ));

    foot.appendChild(makeButton('刪除', 'ad-btn--danger', function (e) {
      if (!window.confirm('確定要刪除「' + (row.name || '這位神明') + '」嗎？此動作無法復原。')) {
        return;
      }
      var restore = busy(e.currentTarget, '刪除中…');
      Admin.deleteGod(row.id).then(function () {
        // 刪掉的正好是編輯中的那筆，順手把表單清空
        if (godId.value === row.id) { resetGodForm(); }
        loadGods();
      }).catch(function (err) {
        restore();
        showMessage(godFormMessage, err.message || '刪除失敗');
      });
    }));

    item.appendChild(foot);
    return item;
  }

  function loadGods() {
    if (!godList) { return; }
    setPlaceholder(godList, '載入中…');

    Admin.listGods().then(function (rows) {
      if (!rows || rows.length === 0) {
        setPlaceholder(godList, '尚未建立任何神明，請由左側表單新增。\n在此建立第一筆之前，首頁會沿用 content.json 的內容。');
        return;
      }
      clearChildren(godList);
      rows.forEach(function (row) {
        godList.appendChild(renderGodItem(row));
      });
    }).catch(function (err) {
      setPlaceholder(godList, err.message || '神明資料載入失敗');
    });
  }

  /* ---- 圖片挑選 ---- */
  if (godImageInput) {
    godImageInput.addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) { return; }
      releasePreview();
      pendingImageFile = file;
      pendingPreviewUrl = URL.createObjectURL(file);
      godImageName.textContent = file.name;
      renderThumb(pendingPreviewUrl);
      hideMessage(godFormMessage);
    });
  }

  if (godImageClear) {
    godImageClear.addEventListener('click', function () {
      releasePreview();
      pendingImageFile = null;
      godImageInput.value = '';
      godImageUrl.value = '';
      godImageName.textContent = '尚未選擇圖片';
      renderThumb('');
    });
  }

  /* ---- 字數計 ---- */
  if (godStory && godStoryCount) {
    godStory.addEventListener('input', function () {
      godStoryCount.textContent = String(this.value.length);
    });
  }

  if (godResetBtn) {
    godResetBtn.addEventListener('click', resetGodForm);
  }

  /* ---- 儲存 ---- */
  if (godForm) {
    godForm.addEventListener('submit', function (e) {
      e.preventDefault();
      hideMessage(godFormMessage);
      godName.classList.remove('error');

      var name = godName.value.trim();
      if (!name) {
        showMessage(godFormMessage, '請填寫神明名稱');
        godName.classList.add('error');
        godName.focus();
        return;
      }

      var order = parseInt(godOrder.value, 10);
      if (isNaN(order) || order < 0) { order = 0; }

      var restore = busy(godSaveBtn, pendingImageFile ? '上傳中…' : '儲存中…');

      // 有選新圖就先上傳拿到公開網址，沒選就沿用原本的
      var imageStep = pendingImageFile
        ? Admin.uploadImage(pendingImageFile)
        : Promise.resolve(godImageUrl.value || null);

      imageStep.then(function (url) {
        var payload = {
          name: name,
          role: godRole.value.trim() || '陪 祀',
          story: godStory.value.trim(),
          image_url: url || null,
          sort_order: order,
          is_published: !!godPublished.checked
        };
        var editingId = godId.value;
        return editingId
          ? Admin.updateGod(editingId, payload)
          : Admin.createGod(payload);
      }).then(function (saved) {
        var wasEditing = !!godId.value;
        // 先還原按鈕再清表單：resetGodForm 會把按鈕字樣改回「儲存」，
        // 順序顛倒的話會被 restore() 蓋回「更新」。
        restore();
        resetGodForm();
        showMessage(
          godFormMessage,
          '已' + (wasEditing ? '更新' : '新增') + '「' + ((saved && saved.name) || name) + '」，前台重新整理即可看到',
          true
        );
        loadGods();
      }).catch(function (err) {
        restore();
        showMessage(godFormMessage, err.message || '儲存失敗，請稍後再試');
      });
    });
  }


  /* ============================================
     模組二：祈福牆管理
     ============================================ */

  var PRAYER_PAGE_SIZE = 20;
  var prayerStatus = '全部';
  var prayerOffset = 0;
  var prayerLoading = false;

  var STATUS_LABEL = {
    approved: '已通過',
    pending: '待審核',
    hidden: '已隱藏'
  };

  function renderPrayerItem(row) {
    var item = document.createElement('article');
    item.className = 'ad-item';
    if (row.status !== 'approved') { item.classList.add('is-muted'); }

    var head = document.createElement('div');
    head.className = 'ad-item-head';

    var name = document.createElement('h3');
    name.className = 'ad-item-name';
    name.textContent = row.name || '虔誠信眾';
    head.appendChild(name);

    var time = document.createElement('span');
    time.className = 'ad-item-meta';
    time.textContent = formatDateTime(row.created_at);
    head.appendChild(time);

    head.appendChild(makeChip(row.type || '純祈願'));
    head.appendChild(makeChip(
      STATUS_LABEL[row.status] || row.status || '未知',
      row.status
    ));
    if (row.is_private) {
      head.appendChild(makeChip('僅廟方可見', 'private'));
    }
    item.appendChild(head);

    var text = document.createElement('p');
    text.className = 'ad-item-text';
    text.textContent = row.content || '';
    item.appendChild(text);

    // 回應只列出來供判斷，不提供逐則編輯——刪掉心願時會一併清除
    var replies = Array.isArray(row.replies) ? row.replies : [];
    if (replies.length > 0) {
      var replyBox = document.createElement('p');
      replyBox.className = 'ad-item-meta';
      replyBox.textContent = '回應 ' + replies.length + ' 則：' +
        replies.map(function (r) {
          return (r.author || '匿名信眾') + '「' + (r.text || '') + '」';
        }).join('　');
      item.appendChild(replyBox);
    }

    var foot = document.createElement('div');
    foot.className = 'ad-item-foot';

    function statusButton(label, target, className) {
      var btn = makeButton(label, className, function (e) {
        var restore = busy(e.currentTarget, '處理中…');
        Admin.setPrayerStatus(row.id, target).then(function () {
          loadPrayers(true);
        }).catch(function (err) {
          restore();
          showMessage(prayerMessage, err.message || '狀態更新失敗');
        });
      });
      // 已經是該狀態時就不必再按一次
      btn.disabled = row.status === target;
      return btn;
    }

    foot.appendChild(statusButton('審核通過', 'approved', 'ad-btn--jade'));
    foot.appendChild(statusButton('隱藏', 'hidden', 'ad-btn--muted'));

    foot.appendChild(makeButton('刪除', 'ad-btn--danger', function (e) {
      if (!window.confirm('確定要刪除這則心願嗎？底下的回應會一併刪除，且無法復原。')) {
        return;
      }
      var restore = busy(e.currentTarget, '刪除中…');
      Admin.deletePrayer(row.id).then(function () {
        loadPrayers(true);
      }).catch(function (err) {
        restore();
        showMessage(prayerMessage, err.message || '刪除失敗');
      });
    }));

    item.appendChild(foot);
    return item;
  }

  /**
   * 載入一頁心願。
   * @param {boolean} reset true 時清空重載（切換篩選或剛完成操作）
   */
  function loadPrayers(reset) {
    if (!prayerList || prayerLoading) { return; }
    prayerLoading = true;

    if (reset) {
      prayerOffset = 0;
      setPlaceholder(prayerList, '載入中…');
      if (prayerMoreWrap) { prayerMoreWrap.hidden = true; }
    }

    Admin.listPrayers({
      status: prayerStatus,
      limit: PRAYER_PAGE_SIZE,
      offset: prayerOffset
    }).then(function (page) {
      if (reset) { clearChildren(prayerList); }

      if (page.items.length === 0 && prayerOffset === 0) {
        setPlaceholder(prayerList, prayerStatus === '全部'
          ? '目前還沒有任何心願'
          : '此狀態下沒有心願');
      } else {
        page.items.forEach(function (row) {
          prayerList.appendChild(renderPrayerItem(row));
        });
        prayerOffset += page.items.length;
      }

      if (prayerMoreWrap) { prayerMoreWrap.hidden = !page.hasMore; }
      if (prayerMoreBtn) {
        prayerMoreBtn.disabled = false;
        prayerMoreBtn.textContent = '載入更多';
      }
      prayerLoading = false;
      hideMessage(prayerMessage);
    }).catch(function (err) {
      prayerLoading = false;
      if (prayerMoreBtn) {
        prayerMoreBtn.disabled = false;
        prayerMoreBtn.textContent = '載入更多';
      }
      if (prayerOffset === 0) {
        setPlaceholder(prayerList, err.message || '心願載入失敗');
      } else {
        showMessage(prayerMessage, err.message || '載入失敗');
      }
    });
  }

  if (prayerFilters) {
    prayerFilters.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-status]');
      if (!btn) { return; }
      var next = btn.getAttribute('data-status');
      if (next === prayerStatus) { return; }

      prayerFilters.querySelectorAll('button[data-status]').forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      prayerStatus = next;
      loadPrayers(true);
    });
  }

  if (prayerMoreBtn) {
    prayerMoreBtn.addEventListener('click', function () {
      prayerMoreBtn.disabled = true;
      prayerMoreBtn.textContent = '載入中…';
      loadPrayers(false);
    });
  }


  /* ============================================
     啟動
     --------------------------------------------
     重新整理頁面時若 sessionStorage 還有有效的工作階段，
     直接進控制台，不必再登入一次。
     ============================================ */

  if (!Auth || !Admin || !Auth.ready) {
    showLogin();
    showMessage(loginError, '尚未設定 Supabase 後端，請檢查 js/supabase-config.js');
  } else if (Auth.hasStoredSession()) {
    Auth.ensureSession().then(function () {
      return enterDashboard();
    }).catch(function () {
      // token 過期或帳號已被移出名單：回到登入畫面，不特別報錯
      showLogin();
    });
  } else {
    showLogin();
  }

})();
