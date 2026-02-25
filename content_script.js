(() => {
  const DEFAULTS = { enabled: true, threshold: 10, hotkeysEnabled: true };
  let settings = { ...DEFAULTS };
  let debounceTimer = null;

  function debug(...args) {
    // Uncomment to enable debug logs
    // console.log('[dc-filter]', ...args);
  }

  function extractNumberFromText(text) {
    if (!text) return null;
    // remove all commas and match up to 7 digits
    const m = text.replace(/,/g, '').match(/\b(\d{1,7})\b/);
    return m ? parseInt(m[1], 10) : null;
  }

  function findRecommendInNode(node) {
    // Prefer explicit recommend-related selectors first (avoid generic view-count classes)
    const candidates = [
      '.gall_recom', '.g_recom', '.recom', '.recommend', '.g_recommend', '.rcmd', '.vote_count', '.votenum'
    ];

    for (const sel of candidates) {
      const els = node.querySelectorAll(sel);
      for (const el of els) {
        const txt = (el.innerText || '').trim();
        // If the element text contains '추천', parse directly
        if (/추천/.test(txt)) {
          const n = extractNumberFromText(txt);
          if (Number.isInteger(n)) return n;
        }

        // If numeric, accept only when the element or nearby context indicates '추천'
        const n = extractNumberFromText(txt);
        if (Number.isInteger(n)) {
          // check attributes
          const label = (el.getAttribute && (el.getAttribute('title') || el.getAttribute('aria-label'))) || '';
          if (/추천/.test(label)) return n;

          // check sibling/parent text
          const sibTexts = [];
          if (el.previousElementSibling) sibTexts.push((el.previousElementSibling.innerText || '').trim());
          if (el.nextElementSibling) sibTexts.push((el.nextElementSibling.innerText || '').trim());
          if (el.parentElement) sibTexts.push((el.parentElement.innerText || '').trim());

          if (sibTexts.some(t => /추천/.test(t))) return n;

          // If class name itself indicates recommendation, accept
          if (/recom|recommend|rcmd|g_recom|gall_recom/i.test(el.className || '')) return n;

          // Otherwise skip numeric-only elements (likely views)
        }
      }
    }

    // Look for explicit '추천' text anywhere in the node (e.g., '추천 1,234' or '1,234 추천')
    const elems = Array.from(node.querySelectorAll('*'));
    for (const el of elems) {
      const txt = (el.innerText || '').trim();
      if (/추천/.test(txt)) {
        const n = extractNumberFromText(txt);
        if (Number.isInteger(n)) return n;

        const sib = el.nextElementSibling || el.previousElementSibling;
        if (sib) {
          const n2 = extractNumberFromText((sib.innerText || '').trim());
          if (Number.isInteger(n2)) return n2;
        }
      }

      const label = (el.getAttribute && (el.getAttribute('title') || el.getAttribute('aria-label'))) || '';
      if (/추천/.test(label)) {
        const n = extractNumberFromText((el.innerText || '').trim() || label);
        if (Number.isInteger(n)) return n;
      }
    }

    // As a last attempt, look for elements whose class names indicate recommendation
    for (const el of elems) {
      if (/recom|recommend|rcmd|vote/i.test(el.className || '')) {
        const n = extractNumberFromText((el.innerText || '').trim());
        if (Number.isInteger(n)) return n;
      }
    }

    // Do NOT fall back to arbitrary numeric-only elements (avoids picking view counts)
    return null;
  }

  function getPostElementFromAnchor(a) {
    return a.closest('tr') || a.closest('li') || a.closest('.gall_list') || a.closest('.ub-content') || a.parentElement;
  }

  function runFilter() {
    if (!settings.enabled) {
      // restore any hidden posts
      document.querySelectorAll('[data-dc-filter-hidden="true"]').forEach(el => {
        el.style.display = '';
        el.removeAttribute('data-dc-filter-hidden');
      });
      return;
    }

    const anchors = Array.from(document.querySelectorAll('a[href*="/board/view"], a[href*="/board/read"], a[href*="/gallery/read"]'));
    const processed = new Set();

    for (const a of anchors) {
      const post = getPostElementFromAnchor(a);
      if (!post || processed.has(post)) continue;
      processed.add(post);

      const recom = findRecommendInNode(post);
      post.dataset.dcFilterRecom = recom === null ? '' : String(recom);

      if (recom !== null && recom < settings.threshold) {
        post.style.display = 'none';
        post.dataset.dcFilterHidden = 'true';
        debug('hiding', post, recom);
      } else if (post.dataset.dcFilterHidden === 'true') {
        // previously hidden, but now should be shown
        post.style.display = '';
        post.removeAttribute('data-dc-filter-hidden');
      }
    }

    // 목록 페이지에서 필터 결과를 sessionStorage에 저장 (Q/E 이동용)
    if (!isViewPage()) saveFilteredPosts();
  }

  function debouncedRun() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runFilter, 250);
  }

  function initObserver() {
    const observer = new MutationObserver((mutations) => {
      debouncedRun();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---- Page navigation hotkeys ----
  let _keyListener = null;

  function isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = (el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  function currentPageNumber() {
    try {
      const u = new URL(window.location.href);
      return parseInt(u.searchParams.get('page') || '1', 10);
    } catch (e) {
      return 1;
    }
  }

  function gotoPage(n) {
    if (!Number.isInteger(n) || n < 1) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('page', String(n));
      window.location.href = u.toString();
    } catch (e) {
      // ignore
    }
  }

  function addKeyNav() {
    if (_keyListener) return;
    _keyListener = (e) => {
      if (isTyping()) return;
      if (e.defaultPrevented) return;
      // Use '.' / ',' for next / previous page
      if (e.key === '.' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const next = currentPageNumber() + 1;
        gotoPage(next);
      } else if (e.key === ',' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const prev = currentPageNumber() - 1;
        if (prev >= 1) gotoPage(prev);
      }
    };
    document.addEventListener('keydown', _keyListener);
  }

  function removeKeyNav() {
    if (!_keyListener) return;
    document.removeEventListener('keydown', _keyListener);
    _keyListener = null;
  }

  // ---- Post navigation (Q/E) on view pages ----
  const FILTERED_POSTS_KEY = 'dc-filter-posts:';
  const GOTO_KEY = 'dc-filter-goto';
  let _postKeyListener = null;

  function isViewPage() {
    return /\/(board\/view|board\/read|gallery\/read)/i.test(window.location.pathname);
  }

  function getGalleryId() {
    try {
      return new URL(window.location.href).searchParams.get('id') || '';
    } catch (e) { return ''; }
  }

  function getCurrentPostNo() {
    try {
      const no = new URL(window.location.href).searchParams.get('no');
      return no ? parseInt(no, 10) : null;
    } catch (e) { return null; }
  }

  function saveFilteredPosts() {
    const galleryId = getGalleryId();
    if (!galleryId) return;

    const anchors = Array.from(document.querySelectorAll(
      'a[href*="/board/view"], a[href*="/board/read"], a[href*="/gallery/read"]'
    ));
    const processed = new Set();
    const posts = [];

    for (const a of anchors) {
      const post = getPostElementFromAnchor(a);
      if (!post || processed.has(post)) continue;
      processed.add(post);
      if (post.dataset.dcFilterHidden === 'true') continue;
      try {
        const u = new URL(a.href, window.location.href);
        const no = parseInt(u.searchParams.get('no'), 10);
        if (Number.isInteger(no)) posts.push({ no, href: a.href });
      } catch (e) { /* ignore */ }
    }

    try {
      sessionStorage.setItem(FILTERED_POSTS_KEY + galleryId, JSON.stringify(posts));
    } catch (e) { /* ignore */ }

    checkAndExecuteGoto();
  }

  function getAdjacentPostHref(direction) {
    // direction: -1 = Q (위로/newer), +1 = E (아래로/older)
    const galleryId = getGalleryId();
    const currentNo = getCurrentPostNo();
    if (!galleryId || !currentNo) return null;

    try {
      const stored = sessionStorage.getItem(FILTERED_POSTS_KEY + galleryId);
      if (stored) {
        const posts = JSON.parse(stored);
        const idx = posts.findIndex(p => p.no === currentNo);
        if (idx !== -1) {
          const target = posts[idx + direction];
          return target ? target.href : null;
        }
      }
    } catch (e) { /* ignore */ }

    // 저장된 목록이 없을 때 폴백: 글 번호 ±1
    try {
      const u = new URL(window.location.href);
      // DCInside는 기본 최신순 정렬 → 위(Q)=no+1, 아래(E)=no-1
      const nextNo = currentNo - direction;
      if (nextNo < 1) return null;
      u.searchParams.set('no', String(nextNo));
      return u.toString();
    } catch (e) { return null; }
  }

  // 저장된 필터 목록 기준으로 현재 글이 경계에 있는지 확인
  function atStoredBoundary(direction) {
    const galleryId = getGalleryId();
    const currentNo = getCurrentPostNo();
    if (!galleryId || !currentNo) return false;
    try {
      const stored = sessionStorage.getItem(FILTERED_POSTS_KEY + galleryId);
      if (!stored) return false;
      const posts = JSON.parse(stored);
      const idx = posts.findIndex(p => p.no === currentNo);
      if (idx === -1) return false;
      const nextIdx = idx + direction;
      return nextIdx < 0 || nextIdx >= posts.length;
    } catch (e) { return false; }
  }

  // 목록 페이지 URL 생성 (view URL 기준으로 page 조정)
  function getListPageUrl(pageOffset) {
    try {
      const u = new URL(window.location.href);
      const targetPage = parseInt(u.searchParams.get('page') || '1', 10) + pageOffset;
      if (targetPage < 1) return null;

      // /board/view/ → /board/lists/  (mgallery 등 prefix 유지)
      const listPath = u.pathname.replace(/\/(view|read)\/?$/, '/lists/');
      if (listPath === u.pathname) return null;

      const listUrl = new URL(u.origin + listPath);
      listUrl.searchParams.set('id', u.searchParams.get('id') || '');
      listUrl.searchParams.set('page', String(targetPage));
      return listUrl.toString();
    } catch (e) { return null; }
  }

  // 인접 페이지로 이동하며 자동 열 글 위치 플래그 저장
  function navigateToAdjacentPage(direction) {
    // E(+1): 다음 페이지 첫 글 / Q(-1): 이전 페이지 마지막 글
    const listUrl = getListPageUrl(direction);
    if (!listUrl) return;
    const target = direction === +1 ? 'first' : 'last';
    try {
      sessionStorage.setItem(GOTO_KEY, JSON.stringify({ galleryId: getGalleryId(), target }));
    } catch (e) { /* ignore */ }
    window.location.href = listUrl;
  }

  // 목록 페이지 도착 후 플래그를 확인해 자동으로 해당 글로 이동
  function checkAndExecuteGoto() {
    try {
      const raw = sessionStorage.getItem(GOTO_KEY);
      if (!raw) return;
      const { galleryId, target } = JSON.parse(raw);
      sessionStorage.removeItem(GOTO_KEY); // 무한 루프 방지
      if (galleryId !== getGalleryId()) return;

      const stored = sessionStorage.getItem(FILTERED_POSTS_KEY + galleryId);
      if (!stored) return;
      const posts = JSON.parse(stored);
      if (!posts.length) return;

      const post = target === 'first' ? posts[0] : posts[posts.length - 1];
      if (post) window.location.href = post.href;
    } catch (e) { /* ignore */ }
  }

  function addPostNav() {
    if (_postKeyListener || !isViewPage()) return;
    _postKeyListener = (e) => {
      if (isTyping()) return;
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'e' || e.key === 'E') {
        const href = getAdjacentPostHref(+1);
        if (href) { window.location.href = href; }
        else if (atStoredBoundary(+1)) { navigateToAdjacentPage(+1); }
      } else if (e.key === 'q' || e.key === 'Q') {
        const href = getAdjacentPostHref(-1);
        if (href) { window.location.href = href; }
        else if (atStoredBoundary(-1)) { navigateToAdjacentPage(-1); }
      }
    };
    document.addEventListener('keydown', _postKeyListener);
  }

  function removePostNav() {
    if (!_postKeyListener) return;
    document.removeEventListener('keydown', _postKeyListener);
    _postKeyListener = null;
  }

  // Apply initial settings and run
  chrome.storage.sync.get(DEFAULTS, (items) => {
    settings = { ...DEFAULTS, ...items };
    runFilter();
    initObserver();
    if (settings.hotkeysEnabled) {
      addKeyNav();
      addPostNav();
    }
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes) => {
    let changed = false;
    if (changes.enabled) { settings.enabled = changes.enabled.newValue; changed = true; }
    if (changes.threshold) { settings.threshold = changes.threshold.newValue; changed = true; }
    if (changes.hotkeysEnabled) {
      settings.hotkeysEnabled = changes.hotkeysEnabled.newValue;
      changed = true;
      if (settings.hotkeysEnabled) { addKeyNav(); addPostNav(); }
      else { removeKeyNav(); removePostNav(); }
    }
    if (changed) runFilter();
  });

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg, sender, resp) => {
    if (msg && msg.action === 'update_settings') {
      chrome.storage.sync.get(DEFAULTS, (items) => {
        settings = { ...DEFAULTS, ...items };
        runFilter();
      });
    }
  });

  // Expose a small helper for manual testing in DevTools console:
  // Usage: window.__dcFilterRun(10) or window.__dcFilterRun(10, true)
  window.__dcFilterRun = (threshold, enabled = true) => {
    settings.enabled = enabled;
    settings.threshold = typeof threshold === 'number' ? threshold : settings.threshold;
    runFilter();
    return { enabled: settings.enabled, threshold: settings.threshold };
  };

})();