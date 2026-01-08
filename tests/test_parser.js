const { JSDOM } = require('jsdom');
const assert = require('assert');

// Duplicate of the parsing helper functions from content_script.js for isolated tests
function extractNumberFromText(text) {
  if (!text) return null;
  const m = text.replace(/,/g, '').match(/\b(\d{1,7})\b/);
  return m ? parseInt(m[1], 10) : null;
}

function findRecommendInNode(node) {
  // Prefer explicit recommend-related selectors first
  const candidates = [
    '.gall_recom', '.g_recom', '.recom', '.recommend', '.g_recommend', '.rcmd', '.num', '.vote_count', '.votenum'
  ];

  for (const sel of candidates) {
    const el = node.querySelector(sel);
    if (el) {
      const n = extractNumberFromText(el.textContent.trim());
      if (Number.isInteger(n)) return n;
    }
  }

  // Look for text nodes containing the word '추천' (e.g., '추천 1,234' or '1,234 추천')
  const elems = Array.from(node.querySelectorAll('*'));
  for (const el of elems) {
    const txt = (el.textContent || '').trim();
    if (/추천/.test(txt)) {
      const n = extractNumberFromText(txt);
      if (Number.isInteger(n)) return n;
      // check immediate siblings which might carry the number
      const sib = el.nextElementSibling || el.previousElementSibling;
      if (sib) {
        const n2 = extractNumberFromText((sib.textContent || '').trim());
        if (Number.isInteger(n2)) return n2;
      }
    }

    // aria-label or title may mention 추천
    const label = (el.getAttribute && (el.getAttribute('title') || el.getAttribute('aria-label'))) || '';
    if (/추천/.test(label)) {
      const n = extractNumberFromText(txt || label);
      if (Number.isInteger(n)) return n;
    }
  }

  // As a last attempt, look for elements whose class names indicate recommendation
  for (const el of elems) {
    if (/recom|recommend|rcmd|vote/i.test(el.className || '')) {
      const n = extractNumberFromText((el.textContent || '').trim());
      if (Number.isInteger(n)) return n;
    }
  }

  // Do NOT fall back to arbitrary numeric-only elements (avoids picking view counts)
  return null;
}

function applyFilterToPosts(document, threshold) {
  const anchors = Array.from(document.querySelectorAll('a[href*="/board/view"], a[href*="/board/read"], a[href*="/gallery/read"]'));
  const processed = new Set();
  const results = [];

  for (const a of anchors) {
    const post = a.closest('tr') || a.closest('li') || a.closest('.gall_list') || a.closest('.ub-content') || a.parentElement;
    if (!post || processed.has(post)) continue;
    processed.add(post);

    const recom = findRecommendInNode(post);
    const hidden = (recom !== null && recom < threshold);
    if (hidden) post.style.display = 'none';
    else post.style.display = '';
    results.push({ post, recom, hidden });
  }

  return results;
}

// Build a sample DOM resembling DCInside list rows
const html = `
<table>
  <tr class="post">
    <td><a href="/board/view?id=foo1">Post 1</a></td>
    <td class="gall_recom">8</td>
  </tr>
  <tr class="post">
    <td><a href="/board/view?id=foo2">Post 2</a></td>
    <td class="gall_recom">12</td>
  </tr>
  <tr class="post">
    <td><a href="/board/view?id=foo3">Post 3</a></td>
    <td>추천 1,234</td>
  </tr>
  <tr class="post">
    <td><a href="/board/view?id=foo4">Post 4</a></td>
    <td><span class="num">9</span></td>
  </tr>
  <tr class="post">
    <td><a href="/board/view?id=foo5">Post 5</a></td>
    <td><span class="other">없음</span></td>
  </tr>
  <tr class="post">
    <td><a href="/board/view?id=foo6">Post 6</a></td>
    <td>조회 987</td>
  </tr>
  <tr class="post">
    <td><a href="/board/view?id=foo7">Post 7</a></td>
    <td class="gall_count">1234</td>
  </tr>
</table>
`;

const dom = new JSDOM(html);
const { document } = dom.window;

// Run parser tests
console.log('Running parser tests...');
assert.strictEqual(findRecommendInNode(document.querySelector('.post')), 8, 'post1 should be 8');
assert.strictEqual(findRecommendInNode(document.querySelectorAll('.post')[1]), 12, 'post2 should be 12');
assert.strictEqual(findRecommendInNode(document.querySelectorAll('.post')[2]), 1234, 'post3 should parse 1,234');
assert.strictEqual(findRecommendInNode(document.querySelectorAll('.post')[3]), 9, 'post4 should be 9 from span.num');
assert.strictEqual(findRecommendInNode(document.querySelectorAll('.post')[4]), null, 'post5 should have no recommend number');
assert.strictEqual(findRecommendInNode(document.querySelectorAll('.post')[5]), null, 'post6 should have no recommend number (views only)');
assert.strictEqual(findRecommendInNode(document.querySelectorAll('.post')[6]), null, 'post7 (gall_count) should not be interpreted as recommend');
console.log('Parser tests passed.');

// Run filter application tests
console.log('Running filter application tests (threshold=10)...');
const results = applyFilterToPosts(document, 10);
const resByHref = {};
for (const r of results) {
  const a = r.post.querySelector('a');
  const href = a.getAttribute('href');
  resByHref[href] = r;
}

assert.strictEqual(resByHref['/board/view?id=foo1'].hidden, true, 'foo1 (8) should be hidden');
assert.strictEqual(resByHref['/board/view?id=foo2'].hidden, false, 'foo2 (12) should not be hidden');
assert.strictEqual(resByHref['/board/view?id=foo3'].hidden, false, 'foo3 (1234) should not be hidden');
assert.strictEqual(resByHref['/board/view?id=foo4'].hidden, true, 'foo4 (9) should be hidden');
assert.strictEqual(resByHref['/board/view?id=foo5'].hidden, false, 'foo5 (null) should not be hidden (no recommend)');
assert.strictEqual(resByHref['/board/view?id=foo6'].hidden, false, 'foo6 (views-only) should not be hidden');
console.log('Filter application tests passed.');

console.log('\nAll tests passed ✅');
