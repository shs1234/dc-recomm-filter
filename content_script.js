(() => {
  const DEFAULTS = { enabled: true, threshold: 10 };
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

  // Apply initial settings and run
  chrome.storage.sync.get(DEFAULTS, (items) => {
    settings = { ...DEFAULTS, ...items };
    runFilter();
    initObserver();
  });

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes) => {
    let changed = false;
    if (changes.enabled) { settings.enabled = changes.enabled.newValue; changed = true; }
    if (changes.threshold) { settings.threshold = changes.threshold.newValue; changed = true; }
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