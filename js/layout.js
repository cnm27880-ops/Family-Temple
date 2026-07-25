'use strict';

/* ============================================
   天虛宮 — 共用版面（導覽列 / 頁尾）
   --------------------------------------------
   導覽列與頁尾在每一頁都相同，集中在這裡產生，
   之後只要改這個檔，三個頁面一起更新。
   頁面裡放 <div id="site-nav"></div> 與
   <div id="site-footer"></div> 作為掛載點即可。
   （以 defer 載入，執行時 DOM 已就緒）
   ============================================ */
(function () {

  // 判斷目前是否在首頁，決定連結要不要加 index.html 前綴
  var page = location.pathname.split('/').pop();
  var onIndex = (page === '' || page === 'index.html');
  var home = onIndex ? '' : 'index.html';
  var logoHref = onIndex ? '#hero' : 'index.html';

  function navHtml() {
    return '' +
      '<nav class="nav" id="navbar">' +
        '<div class="nav-inner">' +
          '<a href="' + logoHref + '" class="nav-logo">天虛宮</a>' +
          '<button class="nav-toggle" id="navToggle" aria-label="開啟選單" aria-expanded="false" aria-controls="navLinks">' +
            '<span></span><span></span><span></span>' +
          '</button>' +
          '<ul class="nav-links" id="navLinks">' +
            '<li><a href="' + home + '#about">廟宇介紹</a></li>' +
            '<li><a href="' + home + '#deities">神明介紹</a></li>' +
            '<li><a href="' + home + '#news">最新消息</a></li>' +
            '<li><a href="' + home + '#features">線上祈福</a></li>' +
            '<li><a href="' + home + '#visit">參拜資訊</a></li>' +
          '</ul>' +
        '</div>' +
      '</nav>';
  }

  function footerHtml() {
    return '' +
      '<footer class="footer">' +
        '<div class="lattice-pattern lattice-pattern--faint"></div>' +
        '<div class="container">' +
          '<div class="footer-inner">' +
            '<div class="footer-brand">' +
              '<div class="footer-logo">天虛宮</div>' +
              '<p>歷經百年歲月，守護一方水土。<br>歡迎蒞臨參拜，共沐神恩。</p>' +
            '</div>' +
            '<div class="footer-section">' +
              '<h4>快速連結</h4>' +
              '<ul class="footer-links">' +
                '<li><a href="' + home + '#about">廟宇沿革</a></li>' +
                '<li><a href="' + home + '#deities">神明介紹</a></li>' +
                '<li><a href="' + home + '#news">最新消息</a></li>' +
                '<li><a href="' + home + '#visit">參拜資訊</a></li>' +
              '</ul>' +
            '</div>' +
            '<div class="footer-section">' +
              '<h4>線上服務</h4>' +
              '<ul class="footer-links">' +
                '<li><a href="jiaobei.html">線上擲筊</a></li>' +
                '<li><a href="qiuqian.html">線上求籤</a></li>' +
                '<li><a href="diandeng.html">線上點燈</a></li>' +
                '<li><a href="prayer-wall.html">祈福牆</a></li>' +
              '</ul>' +
            '</div>' +
          '</div>' +
          '<div class="footer-bottom">' +
            '<p>&copy; 2026 天虛宮 All Rights Reserved</p>' +
          '</div>' +
        '</div>' +
      '</footer>';
  }

  // ---- 注入版面 ----
  var navMount = document.getElementById('site-nav');
  if (navMount) { navMount.outerHTML = navHtml(); }
  var footerMount = document.getElementById('site-footer');
  if (footerMount) { footerMount.outerHTML = footerHtml(); }

  // ---- 導覽列互動 ----
  var navbar = document.getElementById('navbar');
  if (navbar) {
    // 沒有大面積 hero 的頁面（如擲筊）導覽列固定用實色；有 hero 的則捲動後才變實色
    var hasHero = document.querySelector('.hero, .pw-hero');
    if (!hasHero) {
      navbar.classList.add('scrolled');
    } else {
      window.addEventListener('scroll', function () {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
      });
    }
  }

  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      var open = navLinks.classList.toggle('active');
      navToggle.classList.toggle('active', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navToggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
    });
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navToggle.classList.remove('active');
        navLinks.classList.remove('active');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', '開啟選單');
      });
    });
  }

  // ---- 平滑捲動（事件委派，動態內容也適用；尊重減少動態設定）----
  document.addEventListener('click', function (e) {
    var anchor = e.target.closest('a[href^="#"]');
    if (!anchor) { return; }
    var href = anchor.getAttribute('href');
    if (!href || href === '#') { e.preventDefault(); return; }
    var target = document.querySelector(href);
    if (!target) { return; }
    e.preventDefault();
    var reduce = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  });

})();
