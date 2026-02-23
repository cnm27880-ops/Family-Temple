'use strict';

/* ============================================
   天虛宮 — Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ---------- Navigation ---------- */
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

  /* ---------- Smoke Particles ---------- */
  var smokeContainer = document.getElementById('smokeContainer');
  if (smokeContainer) {
    for (var i = 0; i < 10; i++) {
      var particle = document.createElement('div');
      particle.classList.add('smoke-particle');
      particle.style.left = 42 + Math.random() * 16 + '%';
      particle.style.height = 50 + Math.random() * 80 + 'px';
      particle.style.animationDuration = 7 + Math.random() * 7 + 's';
      particle.style.animationDelay = Math.random() * 10 + 's';
      smokeContainer.appendChild(particle);
    }
  }

  /* ---------- Golden Dust ---------- */
  var dustContainer = document.getElementById('dustContainer');
  if (dustContainer) {
    for (var j = 0; j < 15; j++) {
      var dust = document.createElement('div');
      dust.classList.add('dust');
      dust.style.left = Math.random() * 100 + '%';
      dust.style.top = Math.random() * 100 + '%';
      var size = 1 + Math.random() * 2.5 + 'px';
      dust.style.width = size;
      dust.style.height = size;
      dust.style.animationDuration = 10 + Math.random() * 15 + 's';
      dust.style.animationDelay = Math.random() * 12 + 's';
      dustContainer.appendChild(dust);
    }
  }

  /* ---------- Ink Wash Scroll Reveal ---------- */
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
    inkElements.forEach(function (el) {
      inkObserver.observe(el);
    });
  }

  /* ---------- Seal Stamp Button Effect ---------- */
  document.querySelectorAll('.btn-seal').forEach(function (btn) {
    btn.addEventListener('click', function () {
      this.classList.remove('stamped');
      void this.offsetWidth; // force reflow
      this.classList.add('stamped');
    });
  });

  /* ---------- Smooth Scroll ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var href = this.getAttribute('href');
      if (!href || href === '#') {
        e.preventDefault();
        return;
      }
      var target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

});
