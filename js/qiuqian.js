'use strict';

/* ============================================
   天虛宮 — 線上求籤 JavaScript
   --------------------------------------------
   流程：淨心稟告 → 搖籤筒 → 擲筊確認 → 籤詩
   籤詩內容一律讀自 qiuqian.json，程式不寫死任何籤文。
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ---------- 共用工具（js/temple-common.js） ---------- */
  var Fate = window.TempleFate;

  /* ---------- State ---------- */
  var sticks = [];            // 由 qiuqian.json 載入
  var drawnStick = null;      // 目前抽到的那一支
  var countdownTimer = null;
  var needConfirm = true;     // 是否依傳統擲筊確認

  /* ---------- DOM ---------- */
  var stages = document.querySelectorAll('.qq-stage');
  var countdownNumber = document.getElementById('qqCountdown');
  var skipBtn = document.getElementById('qqSkipBtn');
  var confirmToggle = document.getElementById('qqConfirmToggle');
  var dataNote = document.getElementById('qqDataNote');

  var tube = document.getElementById('qqTube');
  var shakeBtn = document.getElementById('qqShakeBtn');
  var drawnWrap = document.getElementById('qqDrawn');
  var drawnNo = document.getElementById('qqDrawnNo');

  var bagua = document.getElementById('qqBagua');
  var confirmBtn = document.getElementById('qqConfirmBtn');
  var confirmNote = document.getElementById('qqConfirmNote');
  var redrawBtn = document.getElementById('qqRedrawBtn');
  var confirmHint = document.getElementById('qqConfirmHint');

  var slipNo = document.getElementById('qqSlipNo');
  var slipGanzhi = document.getElementById('qqSlipGanzhi');
  var slipLevel = document.getElementById('qqSlipLevel');
  var poemWrap = document.getElementById('qqPoem');
  var meaningWrap = document.getElementById('qqMeaning');
  var meaningText = document.getElementById('qqMeaningText');
  var slipEmpty = document.getElementById('qqSlipEmpty');
  var againBtn = document.getElementById('qqAgainBtn');
  var shareBtn = document.getElementById('qqShareBtn');
  var toast = document.getElementById('qqToast');

  /* ---------- Stage Management ---------- */
  function showStage(n) {
    stages.forEach(function (s) { s.hidden = true; });
    var target = document.querySelector('[data-qq-stage="' + n + '"]');
    if (target) { target.hidden = false; }

    if (n === '1') { startCountdown(); }
    if (n === '2') { resetTube(); }
    if (n === '3') { resetConfirm(); }
  }

  /* ---------- Toast ---------- */
  function showToast(msg) {
    if (!toast) { return; }
    toast.textContent = msg;
    toast.hidden = false;
    void toast.offsetWidth;
    toast.classList.add('visible');
    setTimeout(function () {
      toast.classList.remove('visible');
      setTimeout(function () { toast.hidden = true; }, 400);
    }, 2200);
  }

  /* ============================================
     載入籤詩資料
     ============================================ */
  function isFilled(stick) {
    return !!(stick && Array.isArray(stick.poem) && stick.poem.length > 0);
  }

  fetch('qiuqian.json', { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    })
    .then(function (data) {
      sticks = Array.isArray(data.sticks) ? data.sticks : [];
      reportDataProgress();
    })
    .catch(function (err) {
      if (window.console && console.warn) {
        console.warn('籤詩資料載入失敗（qiuqian.json）：', err);
      }
      if (dataNote) {
        dataNote.textContent = '籤詩資料載入失敗，請稍後重新整理。';
        dataNote.hidden = false;
      }
      if (shakeBtn) { shakeBtn.disabled = true; }
    });

  // 提醒廟方還有多少籤沒填，填完就不再顯示
  function reportDataProgress() {
    if (!dataNote) { return; }
    var filled = sticks.filter(isFilled).length;
    if (sticks.length === 0 || filled === sticks.length) {
      dataNote.hidden = true;
      return;
    }
    dataNote.textContent =
      '籤詩資料建置中：已填 ' + filled + ' / ' + sticks.length +
      ' 首。未填的籤仍可抽出，但籤詩需由廟方在 qiuqian.json 補入。';
    dataNote.hidden = false;
  }

  /* ============================================
     Stage 1: 淨心稟告
     ============================================ */
  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function startCountdown() {
    var count = 10;
    if (!countdownNumber) { return; }
    countdownNumber.textContent = count;
    stopCountdown();

    countdownTimer = setInterval(function () {
      count--;
      countdownNumber.textContent = count;
      if (count <= 0) {
        stopCountdown();
        showStage('2');
      }
    }, 1000);
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', function () {
      stopCountdown();
      showStage('2');
    });
  }

  if (confirmToggle) {
    needConfirm = confirmToggle.checked;
    confirmToggle.addEventListener('change', function () {
      needConfirm = this.checked;
    });
  }

  /* ============================================
     Stage 2: 搖籤筒
     ============================================ */
  function resetTube() {
    if (tube) { tube.classList.remove('shaking'); }
    if (drawnWrap) { drawnWrap.hidden = true; }
    if (shakeBtn) {
      shakeBtn.disabled = false;
      shakeBtn.hidden = false;
    }
  }

  /**
   * 抽一支籤。
   * 每一支等機率——籤詩的吉凶不該被程式偏袒，只有取數的來源
   * 改用 crypto（見 js/temple-common.js 的 TempleFate）。
   */
  function pickStick() {
    if (sticks.length === 0) { return null; }
    var i = Fate
      ? Fate.pickIndex(sticks.length)
      : Math.floor(Math.random() * sticks.length);
    return sticks[i];
  }

  if (shakeBtn) {
    shakeBtn.addEventListener('click', function () {
      if (sticks.length === 0) {
        showToast('籤詩資料尚未載入');
        return;
      }

      shakeBtn.disabled = true;
      shakeBtn.hidden = true;
      if (tube) { tube.classList.add('shaking'); }

      // 搖 2.4 秒後才落出一支籤：搖籤本來就要搖上一陣子，
      // 按完馬上掉籤會像抽獎機
      setTimeout(function () {
        if (tube) { tube.classList.remove('shaking'); }
        drawnStick = pickStick();
        if (!drawnStick) { return; }

        if (drawnNo) { drawnNo.textContent = '第' + drawnStick.no + '籤'; }
        if (drawnWrap) {
          drawnWrap.hidden = false;
          // 重新觸發籤支升起的動畫
          var stickEl = drawnWrap.querySelector('.qq-drawn-stick');
          if (stickEl) {
            stickEl.style.animation = 'none';
            void stickEl.offsetWidth;
            stickEl.style.animation = '';
          }
        }

        // 讓使用者看清落出的籤，再進下一步
        setTimeout(function () {
          if (needConfirm) {
            showStage('3');
          } else {
            renderSlip(drawnStick);
            showStage('4');
          }
        }, 1600);
      }, 2400);
    });
  }

  /* ============================================
     Stage 3: 擲筊確認
     ============================================ */
  function resetConfirm() {
    if (bagua) {
      bagua.classList.remove('bagua-spin');
      bagua.hidden = true;
    }
    if (confirmNote) { confirmNote.hidden = true; }
    if (redrawBtn) { redrawBtn.hidden = true; }
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.hidden = false;
    }
    if (confirmHint && drawnStick) {
      confirmHint.textContent =
        '已求得第 ' + drawnStick.no + ' 籤，請擲筊請示神明此籤是否為您所求';
    }
  }

  function throwToConfirm() {
    confirmBtn.disabled = true;
    confirmBtn.hidden = true;

    if (bagua) {
      bagua.hidden = false;
      void bagua.offsetWidth;
      bagua.classList.add('bagua-spin');
    }

    setTimeout(function () {
      if (bagua) {
        bagua.classList.remove('bagua-spin');
        bagua.hidden = true;
      }

      // 與擲筊頁同一套取數：三分之一為底，再依誠意微調
      var sheng;
      if (Fate) {
        sheng = Fate.weighted({
          sheng: 1 / 3 + Fate.sincerity() * 0.06,
          other: 2 / 3 - Fate.sincerity() * 0.06
        }) === 'sheng';
      } else {
        sheng = Math.random() < 1 / 3;
      }

      if (sheng) {
        if (confirmNote) {
          confirmNote.textContent = '聖筊——神明應允此籤，正為您展開籤詩。';
          confirmNote.hidden = false;
        }
        setTimeout(function () {
          renderSlip(drawnStick);
          showStage('4');
        }, 1200);
      } else {
        if (confirmNote) {
          confirmNote.textContent =
            '非聖筊——神明示意此籤非您所求，請將籤放回，重新搖籤。';
          confirmNote.hidden = false;
        }
        if (redrawBtn) { redrawBtn.hidden = false; }
      }
    }, 2600);
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', throwToConfirm);
  }

  if (redrawBtn) {
    redrawBtn.addEventListener('click', function () {
      drawnStick = null;
      showStage('2');
    });
  }

  /* ============================================
     Stage 4: 呈現籤詩
     ============================================ */
  function renderSlip(stick) {
    if (!stick) { return; }

    if (slipNo) { slipNo.textContent = '第 ' + stick.no + ' 籤'; }
    if (slipGanzhi) { slipGanzhi.textContent = stick.ganzhi || ''; }

    if (slipLevel) {
      if (stick.level) {
        slipLevel.textContent = stick.level;
        slipLevel.hidden = false;
      } else {
        slipLevel.hidden = true;
      }
    }

    // 籤詩四句
    if (poemWrap) {
      poemWrap.textContent = '';
      if (isFilled(stick)) {
        stick.poem.forEach(function (line) {
          var p = document.createElement('p');
          p.className = 'qq-poem-line vertical-text';
          p.textContent = line;
          poemWrap.appendChild(p);
        });
      }
    }

    // 白話解說
    if (meaningWrap && meaningText) {
      if (stick.meaning) {
        meaningText.textContent = stick.meaning;
        meaningWrap.hidden = false;
      } else {
        meaningWrap.hidden = true;
      }
    }

    // 該籤還沒填的話，明確說明要去哪裡補
    if (slipEmpty) {
      if (isFilled(stick)) {
        slipEmpty.hidden = true;
      } else {
        slipEmpty.textContent =
          '本籤（第 ' + stick.no + ' 籤・' + (stick.ganzhi || '') +
          '）的籤詩尚未建置。請廟方於 qiuqian.json 中第 ' + stick.no +
          ' 籤填入 poem 與 meaning。';
        slipEmpty.hidden = false;
      }
    }
  }

  if (againBtn) {
    againBtn.addEventListener('click', function () {
      drawnStick = null;
      showStage('2');
    });
  }

  /* ---------- 分享籤詩 ---------- */
  function slipAsText(stick) {
    var lines = ['天虛宮線上求籤'];
    lines.push('第 ' + stick.no + ' 籤　' + (stick.ganzhi || '') +
      (stick.level ? '　' + stick.level : ''));
    if (isFilled(stick)) {
      lines.push('');
      stick.poem.forEach(function (line) { lines.push(line); });
    }
    if (stick.meaning) {
      lines.push('');
      lines.push('白話參考：' + stick.meaning);
    }
    return lines.join('\n');
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      if (!drawnStick) { return; }
      var text = slipAsText(drawnStick);

      if (navigator.share) {
        navigator.share({
          title: '天虛宮線上求籤',
          text: text,
          url: location.href
        }).catch(function (err) {
          // 使用者取消不需提示
          if (err && err.name === 'AbortError') { return; }
          copyToClipboard(text);
        });
        return;
      }
      copyToClipboard(text);
    });
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('籤詩已複製，可貼給親友 ✓');
      }).catch(function () {
        showToast('無法自動複製，請長按籤詩自行選取');
      });
      return;
    }
    showToast('無法自動複製，請長按籤詩自行選取');
  }

  /* ---------- Seal Stamp Button Effect ---------- */
  document.querySelectorAll('.btn-seal').forEach(function (btn) {
    btn.addEventListener('click', function () {
      this.classList.remove('stamped');
      void this.offsetWidth;
      this.classList.add('stamped');
    });
  });

  /* ---------- Initialize ---------- */
  showStage('1');

});
