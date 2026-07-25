'use strict';

/* ============================================
   天虛宮 — 祈福牆 JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ========== 共用內容守門（js/temple-common.js）========== */
  var Guard = window.TempleGuard;

  // 心願與擲筊儲存寫入同一張表，共用一組次數限制，
  // 避免兩條路徑各自計算而變成兩倍的送出量。
  var writeLimit = Guard
    ? Guard.rateLimiter('prayer_write', 5)
    : { limited: function () { return false; }, record: function () {}, remaining: function () { return 99; } };

  function checkText(text) {
    return Guard ? Guard.check(text) : { pass: true };
  }

  /* ========== Supabase 後端（共用存取層 js/supabase-api.js）========== */
  var api = window.TempleAPI || {};
  var backendReady = !!api.ready;

  /* ========== DOM References ========== */
  var nickInput = document.getElementById('nickInput');
  var wishInput = document.getElementById('wishInput');
  var wishCharCount = document.getElementById('wishCharCount');
  var submitBtn = document.getElementById('submitBtn');
  var formError = document.getElementById('formError');
  var formSuccess = document.getElementById('formSuccess');
  var cardsContainer = document.getElementById('cardsContainer');
  var filterBar = document.getElementById('filterBar');
  var moreWrap = document.getElementById('moreWrap');
  var moreBtn = document.getElementById('moreBtn');

  // 導覽列與平滑捲動已移至 js/layout.js（共用版面）

  /* ========== Scroll Reveal ========== */
  var inkElements = document.querySelectorAll(
    '.ink-reveal, .ink-reveal-left, .ink-reveal-right'
  );
  if (inkElements.length > 0 && 'IntersectionObserver' in window) {
    var inkObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    inkElements.forEach(function (el) { inkObserver.observe(el); });
  }

  /* ========== Seal Stamp Effect ========== */
  document.querySelectorAll('.btn-seal').forEach(function (btn) {
    btn.addEventListener('click', function () {
      this.classList.remove('stamped');
      void this.offsetWidth;
      this.classList.add('stamped');
    });
  });

  /* ========== Char Counter — Wish ========== */
  if (wishInput && wishCharCount) {
    wishInput.addEventListener('input', function () {
      var len = this.value.length;
      wishCharCount.textContent = len;
      var countWrap = wishCharCount.parentElement;
      if (countWrap) {
        countWrap.classList.toggle('near-limit', 150 - len <= 10);
      }
    });
  }

  /* ========== Date Formatter ========== */
  function formatDate(ts) {
    var d = new Date(ts);
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }

  /* ========== Sanitize Text ========== */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str == null ? '' : str));
    return div.innerHTML;
  }

  /* ========== Render Card ========== */
  function renderCard(data) {
    var replyCountText = (data.replies ? data.replies.length : 0) + ' 則回應';
    var repliesHtml = '';
    if (data.replies && data.replies.length > 0) {
      data.replies.forEach(function (r) {
        repliesHtml +=
          '<div class="reply-item">' +
            '<span class="reply-author">' + escapeHtml(r.author) + '：</span>' +
            escapeHtml(r.text) +
          '</div>';
      });
    }

    return (
      '<div class="prayer-card" data-type="' + escapeHtml(data.type) + '" data-id="' + escapeHtml(data.id) + '">' +
        '<div class="card-side-bar"></div>' +
        '<div class="card-body">' +
          '<div class="card-header">' +
            '<span class="card-name">' + escapeHtml(data.name) + '</span>' +
            '<span class="card-tag">' + escapeHtml(data.type) + '</span>' +
          '</div>' +
          '<p class="card-content">' + escapeHtml(data.content) + '</p>' +
          '<div class="card-footer">' +
            '<span class="card-time">' + formatDate(data.time) + '</span>' +
            '<button class="card-reply-btn" aria-expanded="false">💬 ' + replyCountText + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="card-replies">' +
          '<div class="reply-list">' + repliesHtml + '</div>' +
          '<div class="reply-input-area">' +
            '<input type="text" class="reply-name" maxlength="10" ' +
                   'placeholder="暱稱" aria-label="回應者暱稱（可留空）">' +
            '<input type="text" class="reply-text" maxlength="80" ' +
                   'placeholder="給予祝福或鼓勵…" aria-label="回應內容">' +
            '<span class="reply-count">0 / 80</span>' +
            '<button class="reply-submit btn-seal btn-seal--compact">送出</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ========== Wall State ========== */
  var PAGE_SIZE = 12;
  var activeFilter = '全部';
  var offset = 0;
  var loading = false;

  function showWallMessage(icon, text) {
    cardsContainer.innerHTML =
      '<div class="pw-empty">' +
        '<span class="pw-empty-icon">' + icon + '</span>' +
        '<p class="pw-empty-text">' + escapeHtml(text) + '</p>' +
      '</div>';
  }

  function clearWallMessage() {
    var emptyEl = cardsContainer.querySelector('.pw-empty');
    if (emptyEl) { emptyEl.remove(); }
  }

  function setMoreVisible(visible) {
    if (!moreWrap) { return; }
    moreWrap.hidden = !visible;
  }

  /**
   * 載入一頁心願。
   * @param {boolean} reset true 時清空重載（切換分類或首次載入）
   */
  function loadPage(reset) {
    if (!backendReady) {
      showWallMessage('⚠️', '祈福牆尚未設定後端，請聯絡管理者');
      setMoreVisible(false);
      return;
    }
    if (loading) { return; }
    loading = true;

    if (reset) {
      offset = 0;
      showWallMessage('🕯️', '心願載入中…');
      setMoreVisible(false);
    } else if (moreBtn) {
      moreBtn.disabled = true;
      moreBtn.textContent = '載入中…';
    }

    api.fetchPrayers({
      type: activeFilter,
      limit: PAGE_SIZE,
      offset: offset
    }).then(function (page) {
      if (reset) { cardsContainer.innerHTML = ''; }
      clearWallMessage();

      if (page.items.length === 0 && offset === 0) {
        showWallMessage('🪷', activeFilter === '全部'
          ? '尚無心願，成為第一位留言的人吧'
          : '此分類目前還沒有心願');
        setMoreVisible(false);
      } else {
        var html = '';
        page.items.forEach(function (p) { html += renderCard(p); });
        cardsContainer.insertAdjacentHTML('beforeend', html);
        offset += page.items.length;
        setMoreVisible(page.hasMore);
      }

      loading = false;
      if (moreBtn) {
        moreBtn.disabled = false;
        moreBtn.textContent = '載入更多心願';
      }
    }).catch(function (err) {
      if (window.console && console.warn) {
        console.warn('祈福牆載入失敗：', err);
      }
      loading = false;
      if (moreBtn) {
        moreBtn.disabled = false;
        moreBtn.textContent = '載入更多心願';
      }
      if (offset === 0) {
        showWallMessage('⚠️', '心願載入失敗，請稍後重新整理');
        setMoreVisible(false);
      }
    });
  }

  if (moreBtn) {
    moreBtn.addEventListener('click', function () { loadPage(false); });
  }

  /* ========== Show Error / Success ========== */
  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
  }

  function hideError() {
    formError.hidden = true;
  }

  function showFieldError(el) {
    if (el) { el.classList.add('error'); }
  }

  function clearFieldError(el) {
    if (el) { el.classList.remove('error'); }
  }

  function showSuccess(msg) {
    formSuccess.textContent = msg;
    formSuccess.hidden = false;
    void formSuccess.offsetWidth;
    formSuccess.classList.add('visible');

    setTimeout(function () {
      formSuccess.classList.remove('visible');
      setTimeout(function () {
        formSuccess.hidden = true;
      }, 400);
    }, 3000);
  }

  /* ========== Submit Prayer ========== */
  if (submitBtn) {
    submitBtn.addEventListener('click', function (e) {
      e.preventDefault();
      hideError();
      clearFieldError(nickInput);
      clearFieldError(wishInput);

      // 1. Nickname (default if empty)
      var name = nickInput.value.trim();
      if (!name) { name = '虔誠信眾'; }

      // 2. Content length check (at least 10 chars)
      var content = wishInput.value.trim();
      if (content.length < 10) {
        showError('請多說一些讓神明了解您的心意');
        showFieldError(wishInput);
        return;
      }

      // 3. Content filter
      var nameCheck = checkText(name);
      if (!nameCheck.pass) {
        showError(nameCheck.reason);
        showFieldError(nickInput);
        return;
      }

      var contentCheck = checkText(content);
      if (!contentCheck.pass) {
        showError(contentCheck.reason);
        showFieldError(wishInput);
        return;
      }

      // 4. Rate limit
      if (writeLimit.limited()) {
        showError('您已送出多則心願，請稍後再試');
        submitBtn.disabled = true;
        return;
      }

      // 5. Backend ready?
      if (!backendReady) {
        showError('祈福牆尚未設定後端，暫時無法送出');
        return;
      }

      // 6. Get visibility
      var visRadio = document.querySelector('input[name="visibility"]:checked');
      var isPrivate = visRadio && visRadio.value === 'private';

      // 7. Send to backend
      var originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = '稟告中…';

      api.insertPrayer({
        name: name,
        content: content,
        type: '純祈願',
        is_private: isPrivate
      }).then(function (prayer) {
        writeLimit.record();

        if (!isPrivate) {
          // 只有在目前分類看得到這則心願時才插到最前面
          if (activeFilter === '全部' || activeFilter === prayer.type) {
            var tempDiv = document.createElement('div');
            tempDiv.innerHTML = renderCard(prayer);
            var newCard = tempDiv.firstChild;
            clearWallMessage();
            cardsContainer.insertBefore(newCard, cardsContainer.firstChild);
            offset += 1;
          }
          showSuccess('心願已送出，神明已知曉 ✓');
        } else {
          showSuccess('心願已悄悄送達廟方，神明已知曉 ✓');
        }

        // Clear form
        nickInput.value = '';
        wishInput.value = '';
        wishCharCount.textContent = '0';
        var countWrap = wishCharCount.parentElement;
        if (countWrap) { countWrap.classList.remove('near-limit'); }

        // Restore button; keep disabled if rate limited
        submitBtn.textContent = originalLabel;
        submitBtn.disabled = writeLimit.limited();
      }).catch(function (err) {
        if (window.console && console.warn) {
          console.warn('送出心願失敗：', err);
        }
        showError('送出失敗，請稍後再試');
        submitBtn.textContent = originalLabel;
        submitBtn.disabled = false;
      });
    });
  }

  /* ========== Filter（改為向後端查詢，分頁才不會只篩到已載入的部分）========== */
  if (filterBar) {
    filterBar.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-btn');
      if (!btn) { return; }

      var next = btn.getAttribute('data-filter');
      if (next === activeFilter) { return; }

      filterBar.querySelectorAll('.filter-btn').forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      activeFilter = next;
      loadPage(true);
    });
  }

  /* ========== Reply Toggle & Submit (Event Delegation) ========== */
  if (cardsContainer) {
    cardsContainer.addEventListener('click', function (e) {
      var replyBtn = e.target.closest('.card-reply-btn');
      if (replyBtn) {
        var card = replyBtn.closest('.prayer-card');
        if (!card) { return; }
        var repliesSection = card.querySelector('.card-replies');
        if (!repliesSection) { return; }
        var expanded = repliesSection.classList.toggle('expanded');
        replyBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        return;
      }

      var submitReplyBtn = e.target.closest('.reply-submit');
      if (submitReplyBtn) {
        handleReplySubmit(submitReplyBtn);
      }
    });

    // Reply char counter
    cardsContainer.addEventListener('input', function (e) {
      if (e.target.matches('.reply-text')) {
        var area = e.target.closest('.reply-input-area');
        if (!area) { return; }
        var counter = area.querySelector('.reply-count');
        if (counter) {
          var len = e.target.value.length;
          counter.textContent = len + ' / 80';
          counter.classList.toggle('near-limit', 80 - len <= 10);
        }
      }
    });
  }

  function handleReplySubmit(btn) {
    var card = btn.closest('.prayer-card');
    if (!card) { return; }
    var area = btn.closest('.reply-input-area');
    if (!area) { return; }
    var input = area.querySelector('.reply-text');
    var nameField = area.querySelector('.reply-name');
    if (!input) { return; }

    // Remove previous error
    var prevError = area.querySelector('.reply-error');
    if (prevError) { prevError.remove(); }
    input.classList.remove('error');
    if (nameField) { nameField.classList.remove('error'); }

    var text = input.value.trim();
    var author = nameField ? nameField.value.trim() : '';
    if (!author) { author = '匿名信眾'; }

    // Length check (5–80)
    if (text.length < 5) {
      showReplyError(area, input, '請至少輸入 5 個字');
      return;
    }

    // Content filter — 暱稱與內容都要檢查
    var nameCheck = checkText(author);
    if (!nameCheck.pass) {
      showReplyError(area, nameField || input, nameCheck.reason);
      return;
    }

    var check = checkText(text);
    if (!check.pass) {
      showReplyError(area, input, check.reason);
      return;
    }

    if (!backendReady) {
      showReplyError(area, input, '尚未設定後端，暫時無法回應');
      return;
    }

    var cardId = card.getAttribute('data-id');

    // Send to backend
    input.disabled = true;
    btn.disabled = true;

    api.insertReply({
      prayer_id: cardId,
      author: author,
      text: text
    }).then(function () {
      var replyList = card.querySelector('.reply-list');
      if (replyList) {
        var replyDiv = document.createElement('div');
        replyDiv.className = 'reply-item';
        replyDiv.innerHTML =
          '<span class="reply-author">' + escapeHtml(author) + '：</span>' +
          escapeHtml(text);
        replyList.appendChild(replyDiv);
      }

      var replyBtnEl = card.querySelector('.card-reply-btn');
      if (replyBtnEl) {
        var count = card.querySelectorAll('.reply-item').length;
        replyBtnEl.textContent = '💬 ' + count + ' 則回應';
      }

      input.value = '';
      input.disabled = false;
      btn.disabled = false;
      var counter = area.querySelector('.reply-count');
      if (counter) {
        counter.textContent = '0 / 80';
        counter.classList.remove('near-limit');
      }
    }).catch(function (err) {
      if (window.console && console.warn) {
        console.warn('送出回應失敗：', err);
      }
      input.disabled = false;
      btn.disabled = false;
      showReplyError(area, input, '送出失敗，請稍後再試');
    });
  }

  function showReplyError(area, field, msg) {
    if (field) { field.classList.add('error'); }
    var errEl = document.createElement('p');
    errEl.className = 'reply-error';
    errEl.textContent = msg;
    area.appendChild(errEl);
    setTimeout(function () { errEl.remove(); }, 3000);
  }

  /* ========== Initialize ========== */
  loadPage(true);

  if (writeLimit.limited() && submitBtn) {
    submitBtn.disabled = true;
  }

});
