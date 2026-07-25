'use strict';

/* ============================================
   天虛宮 — 線上點燈登記 JavaScript
   --------------------------------------------
   這頁會收集信眾的姓名與聯絡方式，資料表刻意設為
   「只能寫入、不能讀取」（RLS 沒有 select 政策），
   訪客送出後連自己都讀不回來，只有廟方在後台看得到。
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ---------- 共用工具 ---------- */
  var Guard = window.TempleGuard;
  var api = window.TempleAPI || {};
  var backendReady = !!api.ready;

  var submitLimit = Guard
    ? Guard.rateLimiter('lamp_register', 3)
    : { limited: function () { return false; }, record: function () {} };

  function checkText(text, opts) {
    return Guard ? Guard.check(text, opts) : { pass: true };
  }

  /* ---------- DOM ---------- */
  var form = document.getElementById('lampForm');
  var nameInput = document.getElementById('lampName');
  var birthInput = document.getElementById('lampBirth');
  var contactInput = document.getElementById('lampContact');
  var noteInput = document.getElementById('lampNote');
  var noteCount = document.getElementById('lampNoteCount');
  var agreeInput = document.getElementById('lampAgree');
  var submitBtn = document.getElementById('lampSubmit');
  var errorEl = document.getElementById('lampError');
  var successEl = document.getElementById('lampSuccess');

  /* ---------- Scroll Reveal ---------- */
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

  /* ---------- Seal Stamp Effect ---------- */
  document.querySelectorAll('.btn-seal').forEach(function (btn) {
    btn.addEventListener('click', function () {
      this.classList.remove('stamped');
      void this.offsetWidth;
      this.classList.add('stamped');
    });
  });

  /* ---------- 備註字數 ---------- */
  if (noteInput && noteCount) {
    noteInput.addEventListener('input', function () {
      var len = this.value.length;
      noteCount.textContent = len;
      var wrap = noteCount.parentElement;
      if (wrap) {
        wrap.classList.toggle('near-limit', 100 - len <= 10);
      }
    });
  }

  /* ---------- 訊息 ---------- */
  function showError(msg, field) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    if (field) {
      field.classList.add('error');
      field.focus();
    }
  }

  function clearErrors() {
    errorEl.hidden = true;
    [nameInput, birthInput, contactInput, noteInput].forEach(function (el) {
      if (el) { el.classList.remove('error'); }
    });
  }

  function showSuccess(msg) {
    successEl.textContent = msg;
    successEl.hidden = false;
    void successEl.offsetWidth;
    successEl.classList.add('visible');
  }

  /* ---------- 送出 ---------- */
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors();

      var lampRadio = form.querySelector('input[name="lampType"]:checked');
      var lampType = lampRadio ? lampRadio.value : '';
      var name = nameInput.value.trim();
      var birth = birthInput.value.trim();
      var contact = contactInput.value.trim();
      var note = noteInput.value.trim();

      // 1. 燈別
      if (!lampType) {
        showError('請選擇燈別');
        return;
      }

      // 2. 姓名
      if (name.length < 2) {
        showError('請填寫信眾姓名（至少 2 個字）', nameInput);
        return;
      }
      var nameCheck = checkText(name);
      if (!nameCheck.pass) {
        showError('姓名欄位' + nameCheck.reason, nameInput);
        return;
      }

      // 3. 聯絡方式——這一欄本來就是要留電話或信箱，
      //    所以放行聯絡資訊，但仍擋掉網址與廣告字詞。
      if (contact.length < 6) {
        showError('請填寫可聯繫的手機號碼或電子郵件', contactInput);
        return;
      }
      var contactCheck = checkText(contact, { allowContact: true });
      if (!contactCheck.pass) {
        showError('聯絡方式' + contactCheck.reason, contactInput);
        return;
      }

      // 4. 生辰與備註（不需要填聯絡資訊的欄位）
      if (birth) {
        var birthCheck = checkText(birth, { allowContact: true });
        if (!birthCheck.pass) {
          showError('生辰欄位' + birthCheck.reason, birthInput);
          return;
        }
      }
      if (note) {
        var noteCheck = checkText(note);
        if (!noteCheck.pass) {
          showError('備註欄位' + noteCheck.reason, noteInput);
          return;
        }
      }

      // 5. 同意條款
      if (agreeInput && !agreeInput.checked) {
        showError('請先閱讀並同意個人資料使用方式');
        agreeInput.focus();
        return;
      }

      // 6. 送出頻率
      if (submitLimit.limited()) {
        showError('您已送出多筆登記，請稍後再試，或直接與廟方聯繫');
        return;
      }

      // 7. 後端
      if (!backendReady) {
        showError('點燈登記尚未設定後端，請直接與廟方聯繫');
        return;
      }

      var originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = '登記中…';

      api.insertLamp({
        lamp_type: lampType,
        name: name,
        birth_date: birth || null,
        contact: contact,
        note: note || null
      }).then(function () {
        submitLimit.record();

        // 表單收起，改顯示完成訊息——避免使用者重複送出
        form.reset();
        if (noteCount) { noteCount.textContent = '0'; }
        submitBtn.textContent = originalLabel;
        submitBtn.disabled = true;
        showSuccess('登記已送達廟方 ✓ 廟方將透過您留的聯絡方式與您確認。');
      }).catch(function (err) {
        if (window.console && console.warn) {
          console.warn('點燈登記送出失敗：', err);
        }
        submitBtn.textContent = originalLabel;
        submitBtn.disabled = false;
        showError('送出失敗，請稍後再試，或直接與廟方聯繫');
      });
    });
  }

  /* ---------- 已達上限就先停用 ---------- */
  if (submitLimit.limited() && submitBtn) {
    submitBtn.disabled = true;
    showError('您已送出多筆登記，請稍後再試，或直接與廟方聯繫');
  }

});
