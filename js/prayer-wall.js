'use strict';

/* ============================================
   天虛宮 — 祈福牆 JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ========== Content Filter ========== */
  var ContentFilter = {
    patterns: [
      /09\d{8}/,
      /0\d{1,2}-\d{6,8}/,
      /[\w.-]+@[\w.-]+\.\w+/,
      /[A-Z][12]\d{8}/,
      /https?:\/\/|www\./i,
      /\d{8,}/
    ],

    keywords: [
      '幹', '他媽', '去死', '白痴', '智障',
      '加line', '加賴', '私訊', '代辦', '貸款',
      '點我', '限時'
    ],

    check: function (text) {
      var i;
      for (i = 0; i < this.patterns.length; i++) {
        if (this.patterns[i].test(text)) {
          return { pass: false, reason: '內容含有不允許的個人資訊或連結' };
        }
      }
      for (i = 0; i < this.keywords.length; i++) {
        if (text.includes(this.keywords[i])) {
          return { pass: false, reason: '內容含有不適當的詞彙，請修改後再送出' };
        }
      }
      return { pass: true };
    }
  };

  /* ========== Session Rate Limiter ========== */
  var SESSION_LIMIT = 3;
  var SESSION_KEY = 'pw_submit_count';

  function getSessionCount() {
    return parseInt(sessionStorage.getItem(SESSION_KEY) || '0', 10);
  }

  function incrementSessionCount() {
    var count = getSessionCount() + 1;
    sessionStorage.setItem(SESSION_KEY, String(count));
    return count;
  }

  function isRateLimited() {
    return getSessionCount() >= SESSION_LIMIT;
  }

  /* ========== LocalStorage Helpers ========== */
  var STORAGE_KEY = 'pw_prayers';

  function loadPrayers() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function savePrayers(prayers) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prayers));
  }

  /* ========== DOM References ========== */
  var nickInput = document.getElementById('nickInput');
  var wishInput = document.getElementById('wishInput');
  var wishCharCount = document.getElementById('wishCharCount');
  var submitBtn = document.getElementById('submitBtn');
  var formError = document.getElementById('formError');
  var formSuccess = document.getElementById('formSuccess');
  var cardsContainer = document.getElementById('cardsContainer');
  var filterBar = document.getElementById('filterBar');

  /* ========== Navigation ========== */
  var navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', function () {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navToggle.classList.toggle('active');
      navLinks.classList.toggle('active');
    });
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navToggle.classList.remove('active');
        navLinks.classList.remove('active');
      });
    });
  }

  /* ========== Smooth Scroll ========== */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var href = this.getAttribute('href');
      if (!href || href === '#') { e.preventDefault(); return; }
      var target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

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
    div.appendChild(document.createTextNode(str));
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
      '<div class="prayer-card" data-type="' + escapeHtml(data.type) + '" data-id="' + data.id + '">' +
        '<div class="card-side-bar"></div>' +
        '<div class="card-body">' +
          '<div class="card-header">' +
            '<span class="card-name">' + escapeHtml(data.name) + '</span>' +
            '<span class="card-tag">' + escapeHtml(data.type) + '</span>' +
          '</div>' +
          '<p class="card-content">' + escapeHtml(data.content) + '</p>' +
          '<div class="card-footer">' +
            '<span class="card-time">' + formatDate(data.time) + '</span>' +
            '<button class="card-reply-btn">' + replyCountText + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="card-replies">' +
          '<div class="reply-list">' + repliesHtml + '</div>' +
          '<div class="reply-input-area">' +
            '<input type="text" placeholder="給予祝福或鼓勵…" maxlength="80">' +
            '<span class="reply-count">0 / 80</span>' +
            '<button class="reply-submit btn-seal btn-seal--compact">送出</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ========== Load & Display All Cards ========== */
  function loadWall() {
    var prayers = loadPrayers();
    // Only show public prayers
    var publicPrayers = prayers.filter(function (p) { return !p.isPrivate; });

    if (publicPrayers.length === 0) {
      cardsContainer.innerHTML =
        '<div class="pw-empty">' +
          '<span class="pw-empty-icon">🪷</span>' +
          '<p class="pw-empty-text">尚無心願，成為第一位留言的人吧</p>' +
        '</div>';
      return;
    }

    // Sort newest first
    publicPrayers.sort(function (a, b) { return b.time - a.time; });
    var html = '';
    publicPrayers.forEach(function (p) {
      html += renderCard(p);
    });
    cardsContainer.innerHTML = html;
    applyCurrentFilter();
  }

  /* ========== Show Error ========== */
  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
  }

  function hideError() {
    formError.hidden = true;
  }

  function showFieldError(el) {
    el.classList.add('error');
  }

  function clearFieldError(el) {
    el.classList.remove('error');
  }

  /* ========== Show Success ========== */
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
      var nameCheck = ContentFilter.check(name);
      if (!nameCheck.pass) {
        showError(nameCheck.reason);
        showFieldError(nickInput);
        return;
      }

      var contentCheck = ContentFilter.check(content);
      if (!contentCheck.pass) {
        showError(contentCheck.reason);
        showFieldError(wishInput);
        return;
      }

      // 4. Session rate limit
      if (isRateLimited()) {
        showError('您已送出多則心願，請稍後再試');
        submitBtn.disabled = true;
        return;
      }

      // 5. Get visibility
      var visRadio = document.querySelector('input[name="visibility"]:checked');
      var isPrivate = visRadio && visRadio.value === 'private';

      // 6. Build data object
      var prayer = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: name,
        content: content,
        type: '純祈願',
        isPrivate: isPrivate,
        time: Date.now(),
        replies: []
      };

      // 7. Save to localStorage
      var prayers = loadPrayers();
      prayers.push(prayer);
      savePrayers(prayers);

      // 8. Update session count
      incrementSessionCount();
      if (isRateLimited()) {
        submitBtn.disabled = true;
      }

      // 9. Show result
      if (!isPrivate) {
        // Prepend card to wall
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderCard(prayer);
        var newCard = tempDiv.firstChild;

        // Remove empty state if present
        var emptyEl = cardsContainer.querySelector('.pw-empty');
        if (emptyEl) { emptyEl.remove(); }

        cardsContainer.insertBefore(newCard, cardsContainer.firstChild);
        applyCurrentFilter();
        showSuccess('心願已送出，神明已知曉 ✓');
      } else {
        showSuccess('心願已悄悄送達廟方，神明已知曉 ✓');
      }

      // 10. Clear form
      nickInput.value = '';
      wishInput.value = '';
      wishCharCount.textContent = '0';
      var countWrap = wishCharCount.parentElement;
      if (countWrap) { countWrap.classList.remove('near-limit'); }
    });
  }

  /* ========== Filter Logic ========== */
  var activeFilter = '全部';

  function applyCurrentFilter() {
    var cards = cardsContainer.querySelectorAll('.prayer-card');
    cards.forEach(function (card) {
      if (activeFilter === '全部') {
        card.style.display = '';
      } else {
        card.style.display = card.getAttribute('data-type') === activeFilter ? '' : 'none';
      }
    });
  }

  if (filterBar) {
    filterBar.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-btn');
      if (!btn) return;

      filterBar.querySelectorAll('.filter-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-filter');
      applyCurrentFilter();
    });
  }

  /* ========== Reply Toggle & Submit (Event Delegation) ========== */
  if (cardsContainer) {
    // Reply toggle
    cardsContainer.addEventListener('click', function (e) {
      var replyBtn = e.target.closest('.card-reply-btn');
      if (replyBtn) {
        var card = replyBtn.closest('.prayer-card');
        if (!card) return;
        var repliesSection = card.querySelector('.card-replies');
        if (!repliesSection) return;
        repliesSection.classList.toggle('expanded');
        return;
      }

      // Reply submit
      var submitReplyBtn = e.target.closest('.reply-submit');
      if (submitReplyBtn) {
        handleReplySubmit(submitReplyBtn);
      }
    });

    // Reply char counter
    cardsContainer.addEventListener('input', function (e) {
      if (e.target.matches('.reply-input-area input')) {
        var area = e.target.closest('.reply-input-area');
        if (!area) return;
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
    if (!card) return;
    var area = btn.closest('.reply-input-area');
    if (!area) return;
    var input = area.querySelector('input');
    if (!input) return;

    // Remove previous error
    var prevError = area.querySelector('.reply-error');
    if (prevError) { prevError.remove(); }
    input.classList.remove('error');

    var text = input.value.trim();

    // Length check (5–80)
    if (text.length < 5) {
      showReplyError(area, input, '請至少輸入 5 個字');
      return;
    }

    // Content filter
    var check = ContentFilter.check(text);
    if (!check.pass) {
      showReplyError(area, input, check.reason);
      return;
    }

    // Build reply
    var reply = {
      author: '匿名信眾',
      text: text,
      time: Date.now()
    };

    // Save to localStorage
    var cardId = card.getAttribute('data-id');
    var prayers = loadPrayers();
    for (var i = 0; i < prayers.length; i++) {
      if (prayers[i].id === cardId) {
        if (!prayers[i].replies) { prayers[i].replies = []; }
        prayers[i].replies.push(reply);
        break;
      }
    }
    savePrayers(prayers);

    // Add reply to DOM
    var replyList = card.querySelector('.reply-list');
    if (replyList) {
      var replyDiv = document.createElement('div');
      replyDiv.className = 'reply-item';
      replyDiv.innerHTML =
        '<span class="reply-author">' + escapeHtml(reply.author) + '：</span>' +
        escapeHtml(reply.text);
      replyList.appendChild(replyDiv);
    }

    // Update reply count text
    var replyBtnEl = card.querySelector('.card-reply-btn');
    if (replyBtnEl) {
      var count = card.querySelectorAll('.reply-item').length;
      replyBtnEl.textContent = count + ' 則回應';
    }

    // Clear input
    input.value = '';
    var counter = area.querySelector('.reply-count');
    if (counter) {
      counter.textContent = '0 / 80';
      counter.classList.remove('near-limit');
    }
  }

  function showReplyError(area, input, msg) {
    input.classList.add('error');
    var errEl = document.createElement('p');
    errEl.className = 'reply-error';
    errEl.textContent = msg;
    area.appendChild(errEl);
    setTimeout(function () { errEl.remove(); }, 3000);
  }

  /* ========== Initialize ========== */
  loadWall();

  // Disable submit if already rate limited
  if (isRateLimited() && submitBtn) {
    submitBtn.disabled = true;
  }

});
