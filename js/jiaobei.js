'use strict';

/* ============================================
   天虛宮 — 擲筊功能 JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ---------- 共用工具（js/temple-common.js） ---------- */
  var Guard = window.TempleGuard;
  var Modal = window.TempleModal;
  var Fate = window.TempleFate;

  // 與祈福牆共用同一組寫入次數限制（兩者寫進同一張表）
  var writeLimit = Guard
    ? Guard.rateLimiter('prayer_write', 5)
    : { limited: function () { return false; }, record: function () {} };

  function checkText(text) {
    return Guard ? Guard.check(text) : { pass: true };
  }

  /* ---------- State ---------- */
  var currentMethod = null;   // 'silent' or 'write'
  var wishText = '';           // text from Stage 2b
  var wishSaved = false;       // 心願是否已存進祈福牆
  var lastResult = null;       // 'sheng', 'xiao', 'yin', 'triple'
  var countdownTimer = null;
  var throwMode = 'single';    // 'single' or 'triple'（連三聖筊）
  var streak = 0;              // 連續聖筊次數

  /* ---------- DOM References ---------- */
  var stages = document.querySelectorAll('.jiaobei-stage');
  var altarScene = document.querySelector('.altar-scene');
  var baguaImg = document.getElementById('baguaImg');
  var throwBtn = document.getElementById('throwBtn');
  var resultImage = document.getElementById('resultImage');
  var countdownNumber = document.getElementById('countdownNumber');
  var skipCountdownBtn = document.getElementById('skipCountdownBtn');
  var wishTextarea = document.getElementById('wishTextarea');
  var wishCount = document.getElementById('wishCount');
  var wishPaper = document.getElementById('wishPaper');
  var wishSubmitBtn = document.getElementById('wishSubmitBtn');
  var resultArea = document.getElementById('resultArea');
  var resultTitle = document.getElementById('resultTitle');
  var resultDesc = document.getElementById('resultDesc');
  var resultProgress = document.getElementById('resultProgress');
  var retryBtn = document.getElementById('retryBtn');
  var saveBtn = document.getElementById('saveBtn');
  var shareBtn = document.getElementById('shareBtn');
  var confirmModalEl = document.getElementById('confirmModal');
  var confirmYes = document.getElementById('confirmYes');
  var confirmNo = document.getElementById('confirmNo');
  var confirmError = document.getElementById('confirmError');
  var saveNickInput = document.getElementById('saveNickInput');
  var saveToast = document.getElementById('saveToast');
  var throwModeBar = document.getElementById('throwMode');
  var streakTrack = document.getElementById('streakTrack');
  var streakDots = streakTrack ? streakTrack.querySelectorAll('.streak-dot') : [];

  // 導覽列與平滑捲動已移至 js/layout.js（共用版面）

  /* ---------- Result Data ---------- */
  // dbType 是寫進祈福牆的分類名稱，必須是資料表允許的值
  var results = {
    sheng: {
      title: '聖筊',
      desc: '神明允諾，所求之事可依計而行。心存誠意，前路自有庇佑。',
      className: 'result-sheng',
      shareImage: 'images/share-shengjiao.svg',
      dbType: '聖筊'
    },
    xiao: {
      title: '笑筊',
      desc: '神明展顏，所問之事尚未明朗。請再次整理心中所求，重新稟告。',
      className: 'result-xiao',
      shareImage: 'images/share-xiaojiao.svg',
      dbType: '笑筊'
    },
    yin: {
      title: '陰筊',
      desc: '神明暫無指示，並非凶兆。或許時機未至，靜心等待方為上策。',
      className: 'result-yin',
      shareImage: 'images/share-yinjiao.svg',
      dbType: '陰筊'
    },
    triple: {
      title: '三聖筊',
      desc: '連得三次聖筊，神明明確允諾。此事可安心依願而行，並記得回廟答謝。',
      className: 'result-sheng',
      shareImage: 'images/share-sanshengjiao.svg',
      dbType: '聖筊'
    }
  };

  /* ---------- Stage Management ---------- */
  function showStage(n) {
    stages.forEach(function (s) {
      s.hidden = true;
    });
    var target = document.querySelector('[data-stage="' + n + '"]');
    if (target) {
      target.hidden = false;
    }

    // Stage-specific initialization
    if (n === '2a') {
      startCountdown();
    }
    if (n === '3') {
      resetAltar();
    }
  }

  /* ---------- Stage 1: Method Selection ---------- */
  document.querySelectorAll('.method-card').forEach(function (card) {
    card.addEventListener('click', function () {
      currentMethod = this.getAttribute('data-method');
      if (currentMethod === 'silent') {
        showStage('2a');
      } else if (currentMethod === 'write') {
        showStage('2b');
      }
    });
  });

  /* ---------- Stage 2a: Countdown ---------- */
  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function startCountdown() {
    var count = 10;
    countdownNumber.textContent = count;
    stopCountdown();

    countdownTimer = setInterval(function () {
      count--;
      countdownNumber.textContent = count;
      if (count <= 0) {
        stopCountdown();
        showStage('3');
      }
    }, 1000);
  }

  // 默念完的人不必乾等倒數走完
  if (skipCountdownBtn) {
    skipCountdownBtn.addEventListener('click', function () {
      stopCountdown();
      showStage('3');
    });
  }

  /* ---------- Stage 2b: Write Wish ---------- */
  if (wishTextarea && wishCount) {
    wishTextarea.addEventListener('input', function () {
      wishCount.textContent = this.value.length;
    });
  }

  if (wishSubmitBtn) {
    wishSubmitBtn.addEventListener('click', function () {
      wishText = wishTextarea ? wishTextarea.value.trim() : '';
      // Paper collapse animation
      if (wishPaper) {
        wishPaper.classList.add('collapsing');
        setTimeout(function () {
          showStage('3');
          wishPaper.classList.remove('collapsing');
        }, 600);
      } else {
        showStage('3');
      }
    });
  }

  /* ---------- Stage 3: 問事類型（單次 / 連三聖筊） ---------- */
  function updateStreakDisplay() {
    if (!streakTrack) { return; }
    streakTrack.hidden = (throwMode !== 'triple');
    Array.prototype.forEach.call(streakDots, function (dot, i) {
      dot.classList.toggle('filled', i < streak);
    });
  }

  if (throwModeBar) {
    throwModeBar.addEventListener('click', function (e) {
      var btn = e.target.closest('.mode-btn');
      if (!btn) { return; }
      var next = btn.getAttribute('data-mode');
      if (next === throwMode) { return; }

      throwMode = next;
      streak = 0;   // 換模式重新起算
      throwModeBar.querySelectorAll('.mode-btn').forEach(function (b) {
        var on = (b === btn);
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      updateStreakDisplay();
    });
  }

  /* ---------- Stage 3: Throw Jiaobei ---------- */
  function resetAltar() {
    if (baguaImg) {
      baguaImg.classList.remove('bagua-spin');
      baguaImg.hidden = true;
    }
    if (altarScene) {
      altarScene.classList.remove('shake-screen');
    }
    if (throwBtn) {
      throwBtn.disabled = false;
      throwBtn.hidden = false;
      throwBtn.textContent = (throwMode === 'triple' && streak > 0)
        ? '擲第 ' + (streak + 1) + ' 次'
        : '擲筊問神';
    }
    updateStreakDisplay();
  }

  /**
   * 取筊象。
   * 三種筊象各三分之一為底，再依參拜的誠意（停留時間、擲之前
   * 靜候多久）微調——聖筊最多升到約 0.39，另兩種等量遞減。
   * 詳見 js/temple-common.js 的 TempleFate。
   */
  function drawResult() {
    if (!Fate) {
      var rand = Math.random();
      if (rand < 1 / 3) { return 'sheng'; }
      if (rand < 2 / 3) { return 'xiao'; }
      return 'yin';
    }

    var lean = Fate.sincerity() * 0.06;
    return Fate.weighted({
      sheng: 1 / 3 + lean,
      xiao: 1 / 3 - lean / 2,
      yin: 1 / 3 - lean / 2
    });
  }

  function throwJiaobei() {
    // 1. Hide button
    throwBtn.disabled = true;
    throwBtn.hidden = true;

    // 2. Show bagua + start spin and screen shake
    if (baguaImg) {
      baguaImg.hidden = false;
      // Force reflow so animation restarts cleanly
      void baguaImg.offsetWidth;
      baguaImg.classList.add('bagua-spin');
    }
    if (altarScene) {
      altarScene.classList.add('shake-screen');
    }

    // 3. 筊在桌上轉停要一點時間；太快出結果會像在按扭蛋機，
    //    停約 2.6 秒才取筊象，儀式感才立得住。
    setTimeout(function () {
      var thrown = drawResult();

      if (throwMode === 'triple') {
        if (thrown === 'sheng') {
          streak = Math.min(3, streak + 1);
          updateStreakDisplay();
          showResult(streak >= 3 ? 'triple' : 'sheng');
        } else {
          // 聖筊中斷，依傳統要從第一次重新擲起
          streak = 0;
          updateStreakDisplay();
          showResult(thrown);
        }
      } else {
        showResult(thrown);
      }
    }, 2600);
  }

  if (throwBtn) {
    throwBtn.addEventListener('click', throwJiaobei);
  }

  /* ---------- Stage 4: Show Result ---------- */
  function showResult(type) {
    var data = results[type];
    if (!data) { return; }
    lastResult = type;

    // Clear previous result classes
    resultArea.className = 'result-area ' + data.className;
    resultTitle.textContent = data.title;
    resultDesc.textContent = data.desc;

    // Set result image
    if (resultImage) {
      resultImage.src = data.shareImage;
      resultImage.alt = data.title;
      resultImage.hidden = false;
    }

    // 連三聖筊的進度說明與按鈕文字
    if (throwMode === 'triple' && resultProgress) {
      if (type === 'triple') {
        resultProgress.textContent = '三次聖筊已足，神明明確應允。';
        retryBtn.textContent = '重新問事';
      } else if (type === 'sheng') {
        resultProgress.textContent =
          '已連得 ' + streak + ' 次聖筊，還需 ' + (3 - streak) + ' 次。';
        retryBtn.textContent = '繼續擲筊';
      } else {
        resultProgress.textContent = '連續聖筊中斷，請重新從第一次擲起。';
        retryBtn.textContent = '重新擲筊';
      }
      resultProgress.hidden = false;
    } else if (resultProgress) {
      resultProgress.hidden = true;
      retryBtn.textContent = '再擲一次';
    }

    // Configure save button based on method
    if (currentMethod === 'silent' || !wishText) {
      saveBtn.disabled = true;
      saveBtn.setAttribute('data-tooltip', '默念祈願無文字可儲存');
    } else if (wishSaved) {
      saveBtn.disabled = true;
      saveBtn.setAttribute('data-tooltip', '此心願已存入祈福牆');
    } else {
      saveBtn.disabled = false;
      saveBtn.removeAttribute('data-tooltip');
    }

    showStage('4');
  }

  /* ---------- Stage 4: Actions ---------- */

  // Retry
  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      // 已完成連三聖筊，下一輪重新起算
      if (lastResult === 'triple') { streak = 0; }
      showStage('3');
    });
  }

  /* ---------- 儲存至祈福牆 ---------- */
  var confirmModal = Modal
    ? Modal.create(confirmModalEl, { labelledBy: 'confirmTitle', onClose: hideConfirmError })
    : null;

  function openConfirm() {
    hideConfirmError();
    if (confirmModal) {
      confirmModal.open();
    } else if (confirmModalEl) {
      confirmModalEl.hidden = false;
    }
  }

  function closeConfirm() {
    if (confirmModal) {
      confirmModal.close();
    } else if (confirmModalEl) {
      confirmModalEl.hidden = true;
    }
  }

  function showConfirmError(msg) {
    if (!confirmError) { return; }
    confirmError.textContent = msg;
    confirmError.hidden = false;
  }

  function hideConfirmError() {
    if (confirmError) { confirmError.hidden = true; }
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      if (this.disabled) { return; }
      openConfirm();
    });
  }

  if (confirmYes) {
    confirmYes.addEventListener('click', function () {
      hideConfirmError();

      var api = window.TempleAPI;
      if (!api || !api.ready) {
        closeConfirm();
        showSaveToast('祈福牆尚未設定，無法儲存');
        return;
      }
      if (!wishText) {
        closeConfirm();
        return;
      }

      var name = saveNickInput ? saveNickInput.value.trim() : '';
      if (!name) { name = '虔誠信眾'; }

      // 與祈福牆同一套內容檢查
      var nameCheck = checkText(name);
      if (!nameCheck.pass) {
        showConfirmError(nameCheck.reason);
        return;
      }
      var wishCheck = checkText(wishText);
      if (!wishCheck.pass) {
        showConfirmError(wishCheck.reason);
        return;
      }
      if (writeLimit.limited()) {
        showConfirmError('您已送出多則心願，請稍後再試');
        return;
      }

      // 以擲筊結果作為分類，寫入公開祈福牆
      var data = results[lastResult];
      var typeLabel = (data && data.dbType) ? data.dbType : '純祈願';

      confirmYes.disabled = true;
      api.insertPrayer({
        name: name,
        content: wishText,
        type: typeLabel,
        is_private: false
      }).then(function () {
        writeLimit.record();
        wishSaved = true;
        confirmYes.disabled = false;
        closeConfirm();
        saveBtn.disabled = true;
        saveBtn.setAttribute('data-tooltip', '此心願已存入祈福牆');
        showSaveToast('已儲存至祈福牆 ✓');
      }).catch(function (err) {
        if (window.console && console.warn) {
          console.warn('儲存至祈福牆失敗：', err);
        }
        confirmYes.disabled = false;
        closeConfirm();
        showSaveToast('儲存失敗，請稍後再試');
      });
    });
  }

  if (confirmNo) {
    confirmNo.addEventListener('click', closeConfirm);
  }

  // 沒有 TempleModal 時仍保留點背景關閉
  if (!confirmModal && confirmModalEl) {
    var backdrop = confirmModalEl.querySelector('.confirm-modal-backdrop');
    if (backdrop) { backdrop.addEventListener('click', closeConfirm); }
  }

  function showSaveToast(msg) {
    saveToast.textContent = msg || '已儲存 ✓';
    saveToast.hidden = false;
    // Force reflow
    void saveToast.offsetWidth;
    saveToast.classList.add('visible');

    setTimeout(function () {
      saveToast.classList.remove('visible');
      setTimeout(function () {
        saveToast.hidden = true;
      }, 400);
    }, 2000);
  }

  /* ---------- 分享結果 ---------- */
  /**
   * 把站內的 SVG 轉成 PNG。
   * 手機的系統分享（LINE / IG…）只吃點陣圖，SVG 分享出去多半不顯示，
   * 所以先畫到 canvas 再輸出 PNG。圖檔同源，canvas 不會被污染。
   */
  function svgToPngBlob(url, width, height) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(function (blob) {
            if (blob) { resolve(blob); } else { reject(new Error('toBlob failed')); }
          }, 'image/png');
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = function () { reject(new Error('image load failed')); };
      img.src = url;
    });
  }

  // 最後的退路：直接下載原始圖檔
  function downloadImage(url) {
    var link = document.createElement('a');
    link.href = url;
    link.download = url.split('/').pop();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      if (!lastResult) { return; }
      var data = results[lastResult];
      if (!data) { return; }

      var text = '我在天虛宮線上擲筊，得到「' + data.title + '」。' + data.desc;
      var fileName = 'tianxugong-' + lastResult + '.png';

      shareBtn.disabled = true;

      svgToPngBlob(data.shareImage, 1200, 800).then(function (blob) {
        var file = null;
        try {
          file = new File([blob], fileName, { type: 'image/png' });
        } catch (e) {
          file = null;   // 舊瀏覽器沒有 File 建構式
        }

        // 1. 系統分享（可直接把圖分享到 LINE）
        if (file && navigator.share && navigator.canShare &&
            navigator.canShare({ files: [file] })) {
          return navigator.share({
            files: [file],
            title: '天虛宮擲筊結果',
            text: text
          });
        }
        // 2. 只分享文字與連結
        if (navigator.share) {
          return navigator.share({
            title: '天虛宮擲筊結果',
            text: text,
            url: location.href
          });
        }
        // 3. 沒有分享 API：下載圖片
        downloadImage(data.shareImage);
        return null;
      }).catch(function (err) {
        // 使用者自己按取消，不需要再做別的事
        if (err && err.name === 'AbortError') { return; }
        if (window.console && console.warn) {
          console.warn('分享失敗，改為下載圖片：', err);
        }
        downloadImage(data.shareImage);
      }).then(function () {
        shareBtn.disabled = false;
      });
    });
  }

  /* ---------- Seal Stamp Button Effect ---------- */
  document.querySelectorAll('.btn-seal').forEach(function (btn) {
    btn.addEventListener('click', function () {
      this.classList.remove('stamped');
      void this.offsetWidth;
      this.classList.add('stamped');
    });
  });

  /* ---------- Initialize: Show Stage 1 ---------- */
  showStage('1');

});
