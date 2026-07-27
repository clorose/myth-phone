# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 이 파일은 **myth-phone 모듈 코드**에 대한 안내다. 작업 공간 전체 지도·환경·동기화·커밋 규칙은
> 상위 `../CLAUDE.md`, 모듈 공통 개발 규칙은 `../AGENTS.md`, 겹침 방지 등 일반 UI 원칙은
> `../docs/ui-layout.md`에 있다. 여기선 이 모듈 고유의 아키텍처만 다룬다.

## 빌드·테스트·실행

**빌드 단계가 없다.** 순수 클라이언트 ES 모듈로, Foundry가 `module.json`의 `esmodules`
(`scripts/myth-phone.js`)와 `styles`(`styles/myth-phone.css`)를 직접 로드한다. 번들러·트랜스파일·
lint·테스트 러너 없음.

- **테스트 = Foundry에서 수동 확인.** 자동 테스트는 없고, 회귀 체크리스트는 `docs/TESTING.md`다.
  변경 후 실제 Foundry(v14)를 켜서 해당 화면을 눈으로 확인한다.
- **핫 리로드 규칙** (`module.json`의 `hotReload` 감시 대상: `styles`·`templates`·`lang`):
  - CSS·HBS·번역 JSON → 자동 핫 리로드
  - `data/` 아래 JSON → 브라우저 새로고침 필요
  - JavaScript(`scripts/`) → 브라우저 새로고침 필요
  - `module.json`·모듈 ID·심볼릭 링크 변경 → Foundry 재시작 필요
- **모듈 링크**(소스는 WSL, Windows Foundry가 심볼릭 링크로 접근):
  재생성은 관리자 권한으로 `tools/link-myth-phone-module.ps1`. 상세는 `README.md`.
- **디버그**: 모듈 설정 "디버그 로그"(`debugLog`)를 켜면 소켓 송수신 등이 콘솔·화면 알림으로 나온다
  (`utils.js`의 `debug()`).

## 아키텍처 (전체 그림)

코드는 셸 + 앱 모듈 + 공통 계층 + 데이터로 나뉜다. 구조는 단순하다.

- **`scripts/myth-phone.js` — `SmartphoneShell` (셸, static 클래스, ~300줄).**
  `mount()`가 `#fvtt-smartphone` DOM을 body에 한 번 붙이고, 홈 그리드·전역 크롬을 그린다.
  앱 전환은 `renderApp(wrapper, app)` → `view.dataset.app = app` → `renderers[app]()` 맵으로 라우팅.
  상태는 static 필드(열린 방 id, 타이머 등)와 `.smartphone-app-view`의 상태 클래스(`is-chat-open`,
  `is-call-screen`)로 관리한다. 파일 하단에서 각 앱 모듈을 `Object.assign(SmartphoneShell, xMethods)`로 붙인다.
- **`scripts/apps/*.js` — 앱별 렌더러** (`phone`·`chat`·`email`·`browser`·`contacts`·`notes`·`settings`·`gm-editor`).
  각 파일이 메서드 묶음(`chatMethods` 등)을 export하고 셸에 `Object.assign`으로 얹힌다 — 그래서 메서드 본문의
  `this.*`는 실행 시 `SmartphoneShell`로 해석되고, **어느 모듈에 있든 모든 메서드가 같은 클래스에 붙어**
  앱 간 헬퍼 호출이 그대로 된다. 렌더는 **템플릿 문자열을 `innerHTML`에 넣고 수동으로 리스너를 붙이는 방식**
  (프레임워크·가상 DOM 없음). `gm-editor.js`의 `gmEditorMethods`는 독립 창 `GmEditorWindow`에도 재사용된다.
- **`scripts/store.js` — `PhoneStore` (데이터 정본).**
  `callScenes`(Map), `data.messages`/`data.emails`, 방·읽음 상태를 보관. `SmartphoneShell`은
  `PhoneStore.data`를 접근자로 참조만 한다. `load()`가 번들 JSON과 월드 설정에서 초기 데이터를 채운다.
- **`scripts/socket.js` — `PhoneSocket` (실시간 계층).**
  Foundry `game.socket`의 단일 모듈 채널 `module.myth-phone` 하나에 타입별 핸들러 맵을 얹는다.
  `send(type, payload)` / `on(type, handler)`.
- **`scripts/utils.js`** — `escapeHTML`(코드에선 `esc`로 import), `formatTime`, `formatDuration`,
  `userDisplayName`.
- **`scripts/log.js` — 로깅 단일 제어점.** `debug`(개발용, `debugLog` 설정 게이트·기본 off → 배포 시
  자동 조용) / `warn` / `error`(실제 실패용, 항상 출력). **코드 어디서도 `console.*`를 직접 호출하지 말고
  반드시 이 함수를 쓴다** — 로깅 정책이 이 파일 하나에 모인다.

## 반드시 알아야 할 설계 결정

이 규칙들을 모르면 코드가 어긋난다. 상세·이유는 `docs/DECISIONS.md`·`docs/FEATURES.md` 참조.

- **버블톡 = 실채팅, 메시지 앱 = 연출용 기록. 둘은 완전히 다른 계통이다.**
  버블톡 대화는 `ChatMessage` 귓속말(`whisper` + `flags.myth-phone`)로 저장·전달되어 재접속 후에도
  유지된다. 기본 "메시지"/"이메일" 앱은 GM이 미리 깔아두는 연출용 데이터다.
- **연출용 데이터의 정본은 월드 설정이다.** `myth-phone.messages`/`myth-phone.emails`
  (scope: world). 번들 `data/messages.json`·`data/emails.json`은 **최초 1회만** 시드로 옮겨 심고
  (`seeded` 플래그), 이후엔 월드 설정이 정본. **재시드하지 말 것** — 삭제한 항목이 되살아난다.
  GM 전용 "연출 편집기"가 이 설정을 편집한다. **편집기는 폰 앱이 아니라 좌측 Scene Controls에서 여는
  독립 ApplicationV2 창**(`scripts/apps/gm-editor-window.js`, 렌더 로직은 `apps/gm-editor.js`의
  `gmEditorMethods` 재사용). 플레이어 폰은 이 정본을 읽기만 한다. 상세는 `docs/DECISIONS.md`(2026-07-28).
- **소켓 프라이버시 모델**: `game.socket`은 모든 클라이언트에 브로드캐스트된다. 그래서 각 핸들러는
  **수신 즉시 대상 사용자 ID를 검사하고 무관한 이벤트를 폐기**해야 한다. 유저 간 개인톡은
  참여자가 아닌 클라이언트의 스토어에 반영되지 않는다.
- **실시간 전달과 영구 저장은 별개 책임.** 소켓은 전달만, 저장은 ChatMessage/설정/플래그로.
- **HTML은 템플릿 문자열로 만든다 → 데이터·사용자 문자열은 반드시 `esc()`로 이스케이프**한다.
- **CSS는 `#fvtt-smartphone` 스코프 + CSS 변수 토큰** 기반으로만 작성한다. 전역 스타일 오염 금지.
- **전역 크롬·공유 컴포넌트 겹침 주의**: 새 앱 뷰를 추가할 때 전역 뒤로가기(`.smartphone-back`)와
  고정 크기 컴포넌트(`.phone-avatar` 등) 처리 규칙은 `docs/UI_CONVENTIONS.md`
  (일반 원칙은 `../docs/ui-layout.md`)를 따른다.

## 저장 위치 요약

- 월드 설정(`scope: world`): `sites`(브라우저), `messages`·`emails`(연출용), `seeded`(시드 여부), `debugLog`
- Actor 플래그: 캐릭터 연락처
- User 플래그: 통화 기록(발신, 최근 50건). 일부 수신·거절 상태는 클라이언트 세션 메모리
- ChatMessage(`flags.myth-phone` 귓속말): 버블톡 실채팅 전체
