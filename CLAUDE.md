# CLAUDE.md

## 프로젝트 개요

DCInside 갤러리에서 추천수가 설정값 미만인 글을 숨기는 Chrome 확장 프로그램 (Manifest V3).

## 파일 구조

```
manifest.json          - 확장 설정 (MV3, host: *.dcinside.com)
content_script.js      - 필터링 로직 + 단축키 (페이지 이동, 글 이동)
popup.html / popup.js  - 팝업 UI (설정 저장/로드)
background.js          - Service Worker (초기 기본값 설정)
tests/test_parser.js   - 파서 단위 테스트
scripts/package.sh     - dist/ zip 패키징 스크립트
```

## 설정 항목 (chrome.storage.sync)

| 키 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `enabled` | boolean | `true` | 필터 활성화 여부 |
| `threshold` | number | `10` | 최소 추천수 |
| `hotkeysEnabled` | boolean | `true` | 단축키 활성화 여부 |

## 단축키

| 키 | 동작 | 작동 페이지 |
|---|---|---|
| `,` | 이전 갤러리 페이지 | 전체 |
| `.` | 다음 갤러리 페이지 | 전체 |
| `Q` | 이전 글 (필터 통과 글 기준) | 글 보기 |
| `E` | 다음 글 (필터 통과 글 기준) | 글 보기 |

- 모든 단축키는 입력 중(`input`, `textarea`, `contentEditable`)일 때 비활성
- `hotkeysEnabled` 설정으로 일괄 켜고 끔

## 핵심 로직

### 필터링
- `findRecommendInNode(node)` — DOM에서 추천수 추출 (`.gall_recom` 등 후보 선택자 순서대로 탐색)
- `runFilter()` — `a[href*="/board/view|read|gallery/read"]` 앵커 기준으로 글 행을 찾아 숨김 처리
- MutationObserver로 동적 로딩(스크롤·필터 변경) 대응, 250ms debounce
- 추천수가 없는 글(null)은 숨기지 않음 (뷰카운트 오탐 방지)

### Q/E 글 이동
- `saveFilteredPosts()` — `runFilter()` 실행 후 목록 페이지에서 호출. 필터 통과 글 목록을 `sessionStorage`에 저장 (키: `dc-filter-posts:{galleryId}`)
- `getAdjacentPostHref(direction)` — 저장된 목록 기준 이전(-1)/다음(+1) 글 URL 반환. 목록에 없으면 글 번호 ±1로 폴백
- `atStoredBoundary(direction)` — 현재 글이 저장된 목록의 경계(처음/끝)인지 확인
- `navigateToAdjacentPage(direction)` — 경계에서 호출. `sessionStorage`에 `dc-filter-goto` 플래그 저장 후 인접 갤러리 목록 페이지로 이동
- `checkAndExecuteGoto()` — 목록 페이지 도착 후 `saveFilteredPosts()` 내에서 호출. 플래그 소비 후 해당 글(`first`/`last`)로 자동 이동

#### 페이지 넘김 흐름 (예: E를 마지막 글에서 누를 때)
1. `atStoredBoundary(+1)` → true
2. `navigateToAdjacentPage(+1)` → `{ galleryId, target:'first' }` 플래그 저장 → 다음 목록 페이지 이동
3. 목록 페이지에서 `runFilter()` → `saveFilteredPosts()` → `checkAndExecuteGoto()` → 첫 글로 이동

### DevTools 헬퍼
- `window.__dcFilterRun(threshold, enabled)` — 콘솔에서 수동 테스트용

## 개발 명령어

```bash
npm test          # tests/test_parser.js 실행
npm run package   # dist/dc-recomm-filter.zip 생성
```

## 주의 사항

- DCInside HTML 구조 변경 시 `content_script.js`의 CSS 선택자 후보 목록 업데이트 필요
- 팝업 저장 시 열려 있는 모든 DCInside 탭에 `update_settings` 메시지 전송
- `getListPageUrl()` 에서 view URL → list URL 변환 시 `/view/` → `/lists/` 치환 (mgallery 등 prefix 유지)
