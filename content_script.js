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

  // 갤러리 목록에서 실제 게시물 행(tr.ub-content)의 앵커만 반환
  // - 개념글/이슈박스 링크 제외 (tr.ub-content 안에 없는 링크)
  // - 댓글 수 링크 제외 (?t=cv)
  function getActualPostAnchors(container) {
    // tr.ub-content 행이 있으면 그것만 사용 (일반 게시판)
    const ubRows = Array.from(container.querySelectorAll('tr.ub-content'));
    if (ubRows.length > 0) {
      const result = [];
      for (const tr of ubRows) {
        // 각 행의 첫 번째 제목 링크만 (t=cv 댓글 링크 제외)
        const a = tr.querySelector('a[href*="/board/view"]:not([href*="t=cv"]), a[href*="/board/read"]:not([href*="t=cv"]), a[href*="/gallery/read"]:not([href*="t=cv"])');
        if (a) result.push(a);
      }
      return result;
    }
    // tr.ub-content가 없으면 기존 방식으로 폴백 (단, t=cv 제외)
    return Array.from(container.querySelectorAll(
      'a[href*="/board/view"]:not([href*="t=cv"]), a[href*="/board/read"]:not([href*="t=cv"]), a[href*="/gallery/read"]:not([href*="t=cv"])'
    ));
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

    const anchors = getActualPostAnchors(document);
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

  function getWritePageUrl() {
    try {
      const u = new URL(window.location.href);
      const writePath = u.pathname.replace(/\/(lists|view|read)\/?$/, '/write/');
      if (writePath === u.pathname) return null;
      const writeUrl = new URL(u.origin + writePath);
      writeUrl.searchParams.set('id', u.searchParams.get('id') || '');
      return writeUrl.toString();
    } catch (e) { return null; }
  }

  function addKeyNav() {
    if (_keyListener) return;
    _keyListener = (e) => {
      if (isTyping()) return;
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === '.') {
        const next = currentPageNumber() + 1;
        gotoPage(next);
      } else if (e.key === ',') {
        const prev = currentPageNumber() - 1;
        if (prev >= 1) gotoPage(prev);
      } else if (e.key === 'r' || e.key === 'R' || e.key === 'ㄱ') {
        window.location.reload();
      } else if (e.key === 'w' || e.key === 'W' || e.key === 'ㅈ') {
        const url = getWritePageUrl();
        if (url) window.location.href = url;
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

    const anchors = getActualPostAnchors(document);
    const processed = new Set();
    const posts = [];

    for (const a of anchors) {
      const post = getPostElementFromAnchor(a);
      if (!post || processed.has(post)) continue;
      processed.add(post);
      if (post.dataset.dcFilterHidden === 'true') continue;
      try {
        const u = new URL(a.href, window.location.href);
        if (u.searchParams.get('id') !== galleryId) continue; // 다른 갤러리 제외
        const no = parseInt(u.searchParams.get('no'), 10);
        if (Number.isInteger(no)) posts.push({ no, href: a.href });
      } catch (e) { /* ignore */ }
    }

    // no 기준 중복 제거 (같은 행에 앵커가 여러 개인 경우)
    const seen = new Set();
    const uniquePosts = posts.filter(p => seen.has(p.no) ? false : seen.add(p.no));

    try {
      sessionStorage.setItem(FILTERED_POSTS_KEY + galleryId, JSON.stringify(uniquePosts));
    } catch (e) { /* ignore */ }

    checkAndExecuteGoto();
  }

  // 목록 페이지 URL 생성 (view/list URL 기준으로 page 조정)
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

  // fetch로 목록 페이지를 파싱해 필터 통과 글 목록 반환
  async function fetchFilteredPosts(listUrl, galleryId) {
    const resp = await fetch(listUrl);
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const anchors = getActualPostAnchors(doc);
    const processed = new Set();
    const seenNos = new Set();
    const posts = [];

    for (const a of anchors) {
      const post = getPostElementFromAnchor(a);
      if (!post || processed.has(post)) continue;
      processed.add(post);
      try {
        const u = new URL(a.href, listUrl);
        if (u.searchParams.get('id') !== galleryId) continue;
        const no = parseInt(u.searchParams.get('no'), 10);
        if (!Number.isInteger(no) || seenNos.has(no)) continue;
        const recom = findRecommendInNode(post);
        if (recom !== null && recom < settings.threshold) continue;
        seenNos.add(no);
        posts.push({ no, href: a.href });
      } catch (e) { /* ignore */ }
    }
    return posts;
  }

  // Q/E: fetch로 목록을 백그라운드에서 갱신한 뒤 바로 글로 이동
  async function navigateViaList(direction) {
    const galleryId = getGalleryId();
    const currentNo = getCurrentPostNo();
    if (!galleryId || !currentNo) return;

    try {
      const listUrl = getListPageUrl(0);
      if (!listUrl) return;

      const posts = await fetchFilteredPosts(listUrl, galleryId);
      try {
        sessionStorage.setItem(FILTERED_POSTS_KEY + galleryId, JSON.stringify(posts));
      } catch (e) { /* ignore */ }

      const idx = posts.findIndex(p => p.no === currentNo);
      if (idx !== -1 && posts[idx + direction]) {
        // 같은 페이지 내 인접 글
        window.location.href = posts[idx + direction].href;
      } else {
        // 경계: 인접 목록 페이지 fetch 후 first/last 글로 이동
        const adjUrl = getListPageUrl(direction);
        if (!adjUrl) return;
        const adjPosts = await fetchFilteredPosts(adjUrl, galleryId);
        if (!adjPosts.length) return;
        const target = direction === +1 ? adjPosts[0] : adjPosts[adjPosts.length - 1];
        window.location.href = target.href;
      }
    } catch (e) {
      // fetch 실패 시 목록 페이지 경유 방식으로 폴백
      const listUrl = getListPageUrl(0);
      if (!listUrl) return;
      try {
        sessionStorage.setItem(GOTO_KEY, JSON.stringify({
          galleryId, currentNo,
          target: direction === +1 ? 'next' : 'prev',
        }));
      } catch (e2) { /* ignore */ }
      window.location.href = listUrl;
    }
  }

  // 목록 페이지 도착 후 플래그를 확인해 자동으로 해당 글로 이동 (폴백용)
  function checkAndExecuteGoto() {
    try {
      const raw = sessionStorage.getItem(GOTO_KEY);
      if (!raw) return;
      const { galleryId, target, currentNo } = JSON.parse(raw);
      sessionStorage.removeItem(GOTO_KEY);
      if (galleryId !== getGalleryId()) return;

      const stored = sessionStorage.getItem(FILTERED_POSTS_KEY + galleryId);
      if (!stored) return;
      const posts = JSON.parse(stored);
      if (!posts.length) return;

      if (target === 'first') {
        window.location.href = posts[0].href;
      } else if (target === 'last') {
        window.location.href = posts[posts.length - 1].href;
      } else {
        const dir = target === 'next' ? +1 : -1;
        const idx = posts.findIndex(p => p.no === currentNo);
        if (idx !== -1 && posts[idx + dir]) {
          window.location.href = posts[idx + dir].href;
        } else {
          const u = new URL(window.location.href);
          const nextPage = parseInt(u.searchParams.get('page') || '1', 10) + dir;
          if (nextPage >= 1) {
            try {
              sessionStorage.setItem(GOTO_KEY, JSON.stringify({
                galleryId, target: dir === +1 ? 'first' : 'last',
              }));
            } catch (e) { /* ignore */ }
            u.searchParams.set('page', String(nextPage));
            window.location.href = u.toString();
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  function addPostNav() {
    if (_postKeyListener || !isViewPage()) return;
    _postKeyListener = (e) => {
      if (isTyping()) return;
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'e' || e.key === 'E' || e.key === 'ㄷ') {
        navigateViaList(+1);
      } else if (e.key === 'q' || e.key === 'Q' || e.key === 'ㅂ') {
        navigateViaList(-1);
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