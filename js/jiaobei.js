'use strict';

/* ============================================
   天虛宮 — 擲筊功能 JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ---------- State ---------- */
  var currentMethod = null;   // 'silent' or 'write'
  var wishText = '';           // text from Stage 2b
  var lastResult = null;       // 'sheng', 'xiao', or 'yin'
  var countdownTimer = null;

  /* ---------- DOM References ---------- */
  var stages = document.querySelectorAll('.jiaobei-stage');
  var altarScene = document.querySelector('.altar-scene');
  var baguaImg = document.getElementById('baguaImg');
  var throwBtn = document.getElementById('throwBtn');
  var resultImage = document.getElementById('resultImage');
  var countdownNumber = document.getElementById('countdownNumber');
  var wishTextarea = document.getElementById('wishTextarea');
  var wishCount = document.getElementById('wishCount');
  var wishPaper = document.getElementById('wishPaper');
  var wishSubmitBtn = document.getElementById('wishSubmitBtn');
  var resultArea = document.getElementById('resultArea');
  var resultTitle = document.getElementById('resultTitle');
  var resultDesc = document.getElementById('resultDesc');
  var resultGlow = document.getElementById('resultGlow');
  var retryBtn = document.getElementById('retryBtn');
  var saveBtn = document.getElementById('saveBtn');
  var shareBtn = document.getElementById('shareBtn');
  var confirmModal = document.getElementById('confirmModal');
  var confirmYes = document.getElementById('confirmYes');
  var confirmNo = document.getElementById('confirmNo');
  var saveToast = document.getElementById('saveToast');

  // 導覽列與平滑捲動已移至 js/layout.js（共用版面）

  /* ---------- Result Data ---------- */
  var results = {
    sheng: {
      title: '聖筊',
      desc: '神明允諾，所求之事可依計而行。心存誠意，前路自有庇佑。',
      className: 'result-sheng',
      shareImage: 'images/share-shengjiao.svg'
    },
    xiao: {
      title: '笑筊',
      desc: '神明展顏，所問之事尚未明朗。請再次整理心中所求，重新稟告。',
      className: 'result-xiao',
      shareImage: 'images/share-xiaojiao.svg'
    },
    yin: {
      title: '陰筊',
      desc: '神明暫無指示，並非凶兆。或許時機未至，靜心等待方為上策。',
      className: 'result-yin',
      shareImage: 'images/share-yinjiao.svg'
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
  function startCountdown() {
    var count = 10;
    countdownNumber.textContent = count;

    if (countdownTimer) {
      clearInterval(countdownTimer);
    }

    countdownTimer = setInterval(function () {
      count--;
      countdownNumber.textContent = count;
      if (count <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        showStage('3');
      }
    }, 1000);
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
    }
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

    // 3. After 1.5s, compute random result and switch to Stage 4
    setTimeout(function () {
      var rand = Math.random();
      if (rand < 1 / 3) {
        lastResult = 'sheng';
      } else if (rand < 2 / 3) {
        lastResult = 'xiao';
      } else {
        lastResult = 'yin';
      }
      showResult(lastResult);
    }, 1500);
  }

  if (throwBtn) {
    throwBtn.addEventListener('click', throwJiaobei);
  }

  /* ---------- Stage 4: Show Result ---------- */
  function showResult(type) {
    var data = results[type];
    if (!data) return;

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

    // Configure save button based on method
    if (currentMethod === 'silent' || !wishText) {
      saveBtn.disabled = true;
      saveBtn.setAttribute('data-tooltip', '默念祈願無文字可儲存');
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
      showStage('3');
    });
  }

  // Save to prayer wall
  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      if (this.disabled) return;
      confirmModal.hidden = false;
    });
  }

  if (confirmYes) {
    confirmYes.addEventListener('click', function () {
      var api = window.TempleAPI;
      if (!api || !api.ready) {
        confirmModal.hidden = true;
        showSaveToast('祈福牆尚未設定，無法儲存');
        return;
      }
      if (!wishText) {
        confirmModal.hidden = true;
        return;
      }
      // 以擲筊結果作為分類（聖筊 / 笑筊 / 陰筊），寫入公開祈福牆
      var typeLabel = (lastResult && results[lastResult])
        ? results[lastResult].title : '純祈願';
      confirmYes.disabled = true;
      api.insertPrayer({
        name: '虔誠信眾',
        content: wishText,
        type: typeLabel,
        is_private: false
      }).then(function () {
        confirmModal.hidden = true;
        confirmYes.disabled = false;
        showSaveToast('已儲存至祈福牆 ✓');
      }).catch(function (err) {
        if (window.console && console.warn) {
          console.warn('儲存至祈福牆失敗：', err);
        }
        confirmModal.hidden = true;
        confirmYes.disabled = false;
        showSaveToast('儲存失敗，請稍後再試');
      });
    });
  }

  if (confirmNo) {
    confirmNo.addEventListener('click', function () {
      confirmModal.hidden = true;
    });
  }

  // Click backdrop to close modal
  var modalBackdrop = confirmModal ? confirmModal.querySelector('.confirm-modal-backdrop') : null;
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', function () {
      confirmModal.hidden = true;
    });
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

  // Share result — trigger image download
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      if (!lastResult) return;
      var data = results[lastResult];
      if (!data) return;

      var link = document.createElement('a');
      link.href = data.shareImage;
      link.download = data.shareImage.split('/').pop();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
