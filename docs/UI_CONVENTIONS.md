# myth-phone UI 규칙 — 겹침 방지 (모듈 전용)

일반 원칙은 작업 공간 공통 문서 **`../../docs/ui-layout.md`** 를 따른다(P1·P2·P3, 체크리스트).
이 문서는 그 원칙이 **myth-phone의 실제 CSS 클래스·선택자에 어떻게 적용되는지** 구체 규칙만 적는다.

## 지금까지 나온 겹침 (전부 같은 계열)

1. **전역 뒤로가기 × 뷰 자체 뒤로가기** *(고침)*
   브라우저 뷰에 자체 `‹`를 넣었는데 전역 `.smartphone-back`을 안 숨겨 `«`처럼 두 개가 겹쳤다.
   → `.smartphone-app-view:has(.phone-browser-header) > .smartphone-back { display:none }`.
   GM 편집기 상세도 같은 방식(`:has(.gm-editor-detail)`).
   *(스크린샷 `뒤로가기 버튼 두개 겹치는 버그.png` = 이 고쳐진 버그의 기록)*
   **재발(2026-07-28, 고침)**: 이메일 상세(`.phone-email-header`)도 자체 `‹`가 있는데 숨김 규칙에서
   빠져 있었다 → 같은 `:has` 규칙에 셀렉터 추가. **자체 헤더를 새로 만들면 이 규칙에 추가하는 것까지가
   한 세트다.**

2. **목록 아바타끼리 세로 겹침** *(고침)*
   연출 편집 메시지 목록(`.gm-editor-row`)에서 공유 `.phone-avatar`(44px 고정)를 재사용했는데,
   행(버튼)이 Foundry 기본 버튼 높이·라인하이트를 중화하지 않아 눌린 버튼 밖으로 아바타가 넘쳐
   아래 행과 포갰다. 아바타 열도 40px라 44px 아바타보다 좁았다.
   → 고침: `.gm-editor-row`에 `height: auto; min-height: 0; line-height: normal` 추가(P3),
   아바타 열 `40px → 44px`(P2). 잘 되던 `.phone-conversation` 행과 같은 패턴.
   *(스크린샷 `겹치는 버그.png` = 고쳐진 버그의 기록)*

## myth-phone 구체 규칙

### 전역 뒤로가기 (일반 원칙 P1의 적용)
- 전역 `.smartphone-back`은 기본으로 모든 앱 뷰에 뜬다(누르면 홈).
- 뷰 헤더에 자체 뒤로가기를 넣으면 그 뷰에서 전역 것을 숨긴다:
  `.smartphone-app-view:has(<뷰 식별 클래스>) > .smartphone-back { display:none }`,
  또는 상태 클래스(`is-chat-open`, `is-call-screen`).
- 자체 뒤로가기를 안 넣으면 전역 것을 그대로 쓰고, `.phone-page-header`의 좌패딩 52px로 자리를 비운다.

### 공유 아바타 (일반 원칙 P2·P3의 적용)
- `.phone-avatar`는 44×44 고정이다. 목록 행에 재사용할 때:
  - 그리드 아바타 열 폭을 44px 이상으로(현재 `.gm-editor-row`는 40px 트랙 → 넘침),
  - 행에 `min-height`를 주거나, 아바타를 트랙 크기에 맞게 축소,
  - 행이 `<button>`이면 Foundry 기본 버튼 높이 눌림을 `min-height: 0`으로 중화.

## 연출 편집 목록 아바타 — 적용된 수정

`.gm-editor-row`에 `height: auto; min-height: 0; line-height: normal`을 넣어 Foundry 기본
버튼 높이 눌림을 중화하고, 아바타 열을 `40px → 44px`로 넓혔다. 잘 되던 `.phone-conversation`
행과 동일한 패턴(그 행은 처음부터 이 리셋을 갖고 있었다).
