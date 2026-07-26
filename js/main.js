'use strict';

/* ============================================
   天虛宮 — Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  // 導覽列與平滑捲動已移至 js/layout.js（共用版面）

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
  // A single shared observer so elements injected later (e.g. from
  // content.json) can also be revealed via observeInk().
  var inkObserver = null;
  if ('IntersectionObserver' in window) {
    inkObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
  }

  function observeInk(root) {
    var scope = root || document;
    var els = scope.querySelectorAll(
      '.ink-reveal, .ink-reveal-left, .ink-reveal-right'
    );
    els.forEach(function (el) {
      if (el.dataset.inkObserved) { return; }
      el.dataset.inkObserved = '1';
      if (inkObserver) {
        inkObserver.observe(el);
      } else {
        // No IntersectionObserver support: show immediately.
        el.classList.add('visible');
      }
    });
  }

  observeInk(document);

  /* ---------- Site Content (content.json) ---------- */
  loadContent(observeInk);

  /* ---------- Seal Stamp Button Effect ---------- */
  document.querySelectorAll('.btn-seal').forEach(function (btn) {
    btn.addEventListener('click', function () {
      this.classList.remove('stamped');
      void this.offsetWidth; // force reflow
      this.classList.add('stamped');
    });
  });

});

/* ============================================
   Site Content Loader
   讀取 content.json 並注入到頁面。
   要修改網站文字，請編輯 content.json，不需動這裡。
   ============================================ */
function loadContent(observeInk) {
  fetch('content.json', { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    })
    .then(function (data) {
      renderAbout(data.about);
      renderDeities(data.deities, observeInk);
      renderNews(data.news, observeInk);
      renderVisit(data.visit);
    })
    .catch(function (err) {
      // Graceful degradation: leave the static skeleton in place and log.
      if (window.console && console.warn) {
        console.warn('內容載入失敗（content.json）：', err);
      }
    });

  /* ---- helpers ---- */
  // 判斷欄位是否已由廟方填寫。還留著【】佔位字樣的就算沒填。
  function isFilled(text) {
    var s = String(text == null ? '' : text).trim();
    return s !== '' && s.indexOf('【') === -1;
  }

  // 2026-01-01 → 2026.01.01；格式不合就原樣顯示
  function formatNewsDate(raw) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw || '').trim());
    return m ? m[1] + '.' + m[2] + '.' + m[3] : String(raw || '');
  }

  // 建立可能含換行 (\n) 的文字節點，換行轉為 <br>
  function appendMultiline(parent, text) {
    var lines = String(text == null ? '' : text).split('\n');
    lines.forEach(function (line, i) {
      if (i > 0) { parent.appendChild(document.createElement('br')); }
      parent.appendChild(document.createTextNode(line));
    });
  }

  function renderAbout(about) {
    if (!about) { return; }
    var heading = document.getElementById('aboutHeading');
    if (heading && about.heading) { heading.textContent = about.heading; }

    var paras = document.getElementById('aboutParagraphs');
    if (paras && Array.isArray(about.paragraphs)) {
      paras.textContent = '';
      about.paragraphs.forEach(function (text) {
        var p = document.createElement('p');
        appendMultiline(p, text);
        paras.appendChild(p);
      });
    }

    var stats = document.getElementById('aboutStats');
    if (stats && Array.isArray(about.stats)) {
      stats.textContent = '';
      about.stats.forEach(function (s) {
        var item = document.createElement('div');
        item.className = 'stat-item';
        var num = document.createElement('div');
        num.className = 'stat-number';
        num.textContent = s.number || '';
        var label = document.createElement('div');
        label.className = 'stat-label';
        label.textContent = s.label || '';
        item.appendChild(num);
        item.appendChild(label);
        stats.appendChild(item);
      });
    }
  }

  /* ---- 內建線稿圖示 ----------------------------------------
     content.json 的 icon 欄位若填下面的代號，就會畫出對應線稿；
     填其他內容（文字或 emoji）則原樣顯示。
     全部是固定字串、不含外部輸入，故可直接用 innerHTML。
     ---------------------------------------------------------- */
  function lineIcon(paths) {
    return '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" ' +
      'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + paths + '</svg>';
  }

  var INFO_ICONS = {
    // 地址
    pin: lineIcon(
      '<path d="M16 27.5s8.5-8 8.5-13.8a8.5 8.5 0 0 0-17 0C7.5 19.5 16 27.5 16 27.5z"/>' +
      '<circle cx="16" cy="13.5" r="3.1"/>'),
    // 開放時間
    clock: lineIcon(
      '<circle cx="16" cy="16" r="10.5"/>' +
      '<path d="M16 9.8v6.6l4.6 2.8"/>'),
    // 電話
    phone: lineIcon(
      '<path d="M9.6 5.5h4l2 5-2.6 1.9a13 13 0 0 0 5.6 5.6l1.9-2.6 5 2v4a2.5 2.5 0 0 1-2.5 2.5' +
      'C15.2 23.9 8.1 16.8 8.1 8A2.5 2.5 0 0 1 9.6 5.5z"/>'),
    // 停車
    parking: lineIcon(
      '<rect x="6" y="6" width="20" height="20" rx="3"/>' +
      '<path d="M13 21.8V10.2h3.9a3.5 3.5 0 0 1 0 7H13"/>'),
    // LINE / 聯絡訊息
    chat: lineIcon(
      '<path d="M26 15.4c0 4.6-4.5 8.4-10 8.4-1.1 0-2.2-.2-3.2-.5L7.2 25.8l1.4-4.1' +
      'A7.8 7.8 0 0 1 6 15.4C6 10.8 10.5 7 16 7s10 3.8 10 8.4z"/>' +
      '<path d="M12 15.4h8" opacity=".45"/>')
  };

  // 未指定圖示時的佔位線稿（神像多坐蓮座）。
  var LOTUS_MARK =
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M16 7.5c2.7 3.2 4 6.8 4 10.7h-8c0-3.9 1.3-7.5 4-10.7z"/>' +
      '<path d="M12 18.2c-2.3-2.2-4.7-3.4-7.3-3.7.5 3.8 2.7 6.9 5.6 8.7"/>' +
      '<path d="M20 18.2c2.3-2.2 4.7-3.4 7.3-3.7-.5 3.8-2.7 6.9-5.6 8.7"/>' +
      '<path d="M7.5 25h17" opacity=".45"/>' +
    '</svg>';

  function renderDeities(deities, observeInk) {
    var grid = document.getElementById('deitiesGrid');
    if (!grid || !Array.isArray(deities)) { return; }
    grid.textContent = '';
    deities.forEach(function (d, i) {
      var card = document.createElement('div');
      card.className = 'deity-card ink-reveal ink-delay-' + (i + 1);

      var icon = document.createElement('div');
      icon.className = 'deity-icon';
      if (d.icon) {
        icon.textContent = d.icon;
      } else {
        icon.classList.add('deity-icon--mark');
        icon.innerHTML = LOTUS_MARK;
      }

      var name = document.createElement('h3');
      name.className = 'deity-name';
      name.textContent = d.name || '';

      var role = document.createElement('p');
      role.className = 'deity-title-label';
      role.textContent = d.role || '';

      var desc = document.createElement('p');
      desc.className = 'deity-desc';
      appendMultiline(desc, d.desc || '');

      card.appendChild(icon);
      card.appendChild(name);
      card.appendChild(role);
      card.appendChild(desc);
      grid.appendChild(card);
    });
    // 讓新注入的卡片也能觸發捲動顯現動畫
    if (typeof observeInk === 'function') { observeInk(grid); }
  }

  // 消息區塊隱藏時，導覽列與頁尾指向它的連結也要一起收起，
  // 否則會出現點了沒反應的連結。
  function setNewsLinksVisible(visible) {
    var links = document.querySelectorAll('a[href$="#news"]');
    Array.prototype.forEach.call(links, function (a) {
      var item = a.closest('li') || a;
      item.hidden = !visible;
    });
  }

  function renderNews(news, observeInk) {
    var section = document.getElementById('news');
    var list = document.getElementById('newsList');
    if (!list) { return; }

    // 廟方把 news 清空時，整個區塊就不要出現
    if (!Array.isArray(news) || news.length === 0) {
      if (section) { section.hidden = true; }
      setNewsLinksVisible(false);
      return;
    }
    if (section) { section.hidden = false; }
    setNewsLinksVisible(true);

    // 日期新的排前面（ISO 格式可直接比字串）
    var items = news.slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });

    list.textContent = '';
    items.forEach(function (item, i) {
      var card = document.createElement('article');
      card.className = 'news-item ink-reveal ink-delay-' + Math.min(4, i + 1);

      var meta = document.createElement('div');
      meta.className = 'news-meta';

      if (item.date) {
        var time = document.createElement('time');
        time.className = 'news-date';
        time.setAttribute('datetime', item.date);
        time.textContent = formatNewsDate(item.date);
        meta.appendChild(time);
      }
      if (item.tag) {
        var tag = document.createElement('span');
        tag.className = 'news-tag';
        tag.textContent = item.tag;
        meta.appendChild(tag);
      }

      var title = document.createElement('h3');
      title.className = 'news-title';
      title.textContent = item.title || '';

      var body = document.createElement('p');
      body.className = 'news-body';
      appendMultiline(body, item.body || '');

      card.appendChild(meta);
      card.appendChild(title);
      card.appendChild(body);
      list.appendChild(card);
    });

    if (typeof observeInk === 'function') { observeInk(list); }
  }

  /**
   * 地圖：content.json 的 visit.mapQuery 填好地址後，
   * 把佔位區塊換成真的 Google 地圖。
   * （index.html 的 CSP 已放行 frame-src https://www.google.com）
   */
  function renderMap(query) {
    var mount = document.getElementById('mapMount');
    if (!mount || !isFilled(query)) { return; }

    var iframe = document.createElement('iframe');
    iframe.className = 'map-embed';
    iframe.src = 'https://www.google.com/maps?q=' +
      encodeURIComponent(query) + '&output=embed';
    iframe.title = '天虛宮位置地圖';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.setAttribute('allowfullscreen', '');

    mount.textContent = '';
    mount.appendChild(iframe);
  }

  function renderVisit(visit) {
    if (!visit) { return; }
    renderMap(visit.mapQuery);
    var list = document.getElementById('visitInfoList');
    if (list && Array.isArray(visit.info)) {
      list.textContent = '';
      visit.info.forEach(function (info) {
        var item = document.createElement('div');
        item.className = 'info-item';

        var icon = document.createElement('div');
        icon.className = 'info-icon';
        var iconKey = String(info.icon == null ? '' : info.icon).trim();
        if (INFO_ICONS[iconKey]) {
          icon.classList.add('info-icon--mark');
          icon.innerHTML = INFO_ICONS[iconKey];
        } else {
          // 不是內建代號就當文字顯示（原本填 emoji 的資料仍可運作）
          icon.textContent = iconKey;
        }

        var content = document.createElement('div');
        content.className = 'info-content';
        var label = document.createElement('div');
        label.className = 'info-label';
        label.textContent = info.label || '';
        var value = document.createElement('div');
        value.className = 'info-value';
        value.textContent = info.value || '';
        content.appendChild(label);
        content.appendChild(value);

        item.appendChild(icon);
        item.appendChild(content);
        list.appendChild(item);
      });
    }

    var guide = document.getElementById('visitGuide');
    if (guide && visit.guide) {
      guide.textContent = '';
      appendMultiline(guide, visit.guide);
    }
  }
}
