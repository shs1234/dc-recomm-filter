# DCInside 추천수 필터 확장 (작업중)

간단한 Chrome 확장으로 DCInside 갤러리에서 추천수(추천)가 설정한 임계값보다 작은 글들을 숨깁니다.

## 기능
- 팝업에서 필터 켜기/끄기 및 최소 추천수(기본 10) 설정
- 페이지 동적 로딩(스크롤, 필터 등)에 대응하여 자동으로 적용
- 모든 `*.dcinside.com` 도메인에서 동작

## 설치 (개발자 로드)
1. Chrome에서 `chrome://extensions` 로 이동
2. 오른쪽 상단 `개발자 모드` 켜기
3. `압축해제된 확장 프로그램 로드` 선택
4. 이 폴더 (`dc-recomm-filter`) 선택

## 옵션
- 팝업에서 `필터 사용` 체크 및 `최소 추천수` 설정

## Packaging & Publishing
- Create a distributable zip: `npm run package` (produces `dist/dc-recomm-filter.zip`)
- Manual publish: go to Chrome Web Store Developer Dashboard and upload the zip (see `PUBLISHING.md`) 
- Add screenshots in `assets/screenshots/` and fill `PRIVACY.md` for the store listing.

## 참고
- 사이트 HTML 구조가 변경되면 추천수 추출 로직(`content_script.js`)의 후보 선택자들을 업데이트해야 할 수 있습니다.
- 아이콘 파일(`icons/`)은 placeholder이며 필요하면 교체하세요.

즐겨 쓰세요!