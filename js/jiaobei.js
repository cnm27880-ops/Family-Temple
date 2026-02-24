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
  var cup1 = document.getElementById('cup1');
  var cup2 = document.getElementById('cup2');
  var throwBtn = document.getElementById('throwBtn');
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

  /* ---------- Navigation ---------- */
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
      resetCups();
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

  /** Switch between yang (flat) and yin (curved) face via display */
  function showFace(cupEl, isYang) {
    cupEl.querySelector('.face-yang').style.display = isYang ? 'block' : 'none';
    cupEl.querySelector('.face-yin').style.display = isYang ? 'none' : 'block';
  }

  function resetCups() {
    cup1.classList.remove('throwing', 'landed');
    cup2.classList.remove('throwing', 'landed');
    showFace(cup1, true);
    showFace(cup2, true);
    throwBtn.disabled = false;
  }

  function throwJiaobei() {
    // 1. Disable button
    throwBtn.disabled = true;

    // 2. Reset cup animation classes
    cup1.classList.remove('throwing', 'landed');
    cup2.classList.remove('throwing', 'landed');
    showFace(cup1, true);
    showFace(cup2, true);

    // Force reflow
    void cup1.offsetWidth;
    void cup2.offsetWidth;

    // 3. Random result for each cup
    var cup1Yang = Math.random() < 0.5;
    var cup2Yang = Math.random() < 0.5;

    // 4. Start throw animation
    cup1.classList.add('throwing');
    cup2.classList.add('throwing');

    // 5. After animation, show result face
    setTimeout(function () {
      cup1.classList.remove('throwing');
      cup2.classList.remove('throwing');
      cup1.classList.add('landed');
      cup2.classList.add('landed');

      showFace(cup1, cup1Yang);
      showFace(cup2, cup2Yang);

      // 6. Determine result
      if (cup1Yang !== cup2Yang) {
        lastResult = 'sheng';  // one yang one yin
      } else if (cup1Yang && cup2Yang) {
        lastResult = 'xiao';   // both yang
      } else {
        lastResult = 'yin';    // both yin
      }

      // 7. Wait then show result
      setTimeout(function () {
        showResult(lastResult);
      }, 500);
    }, 1800);
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
      confirmModal.hidden = true;
      // Show toast
      showSaveToast();
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

  function showSaveToast() {
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
