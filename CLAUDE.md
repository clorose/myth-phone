# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 이 파일은 myth-phone 모듈 코드의 안정적인 구조와 불변식을 다룬다. 작업 공간 전체 지도·동기화·
> 커밋 규칙은 상위 `../CLAUDE.md`, 공통 개발 규칙은 `../AGENTS.md`, 일반 UI 원칙은
> `../docs/ui-layout.md`를 따른다.

## 모듈 작업 규칙

- 질문에는 확인된 사실부터 답한다. 기능 유무는 기억이나 진행 문서가 아니라 실제 코드로 확인한다.
- `docs/user/`는 읽어도 되지만, 사용자가 직접 꺼내지 않은 내용을 판단·제안의 근거로 사용하지 않는다.
- UI 리뷰는 사용자가 `../screen_shot/`에 올린 최신 스크린샷과 재현 정보를 먼저 확인한다.
- 스타일을 고쳤는데 화면이 그대로면 값을 반복 조정하기 전에 선택자가 실제로 적용되는지 확인한다.

## 빌드·테스트·실행

빌드 단계가 없는 순수 클라이언트 ES 모듈이다. Foundry가 `module.json`의
`scripts/myth-phone.js`와 `styles/myth-phone.css`를 직접 로드한다.

- CSS·HBS·번역 JSON → 핫 리로드
- `data/` JSON·JavaScript → 브라우저 새로고침
- `module.json`·모듈 ID·심볼릭 링크 → Foundry 재시작
- 자동 테스트 러너는 없다. 회귀 항목은 `docs/TESTING.md`를 사용해 Foundry v14에서 수동 확인한다.
- 모듈 링크 재생성은 관리자 권한으로 `../tools/link-myth-phone-module.ps1`을 실행한다.
- 디버그 출력은 `scripts/log.js`의 `DEBUG` 상수로만 제어한다. 개발 중 `true`, 출시 시 `false`로
  바꾸며 debug 호출은 제거하지 않는다. `warn`·`error`는 실제 실패용으로 유지한다.

## 아키텍처

- `scripts/myth-phone.js` — 셸. `SmartphoneShell`이 런처·기기 프레임·홈·앱 라우팅·전역
  타이머를 관리한다. 앱별 메서드 묶음은 파일 하단에서 셸에 합성된다.
- `scripts/apps/*.js` — 앱 렌더러. 템플릿 문자열로 DOM을 렌더하고 이벤트 리스너를 연결한다.
  `gm-editor.js`의 렌더 로직은 독립 ApplicationV2 창에서도 재사용한다.
- `scripts/store.js` — 화면용 메모리 상태. 월드 설정·ChatMessage·User/Actor 플래그에서 읽은
  데이터와 계산된 방 상태를 보관한다. 영구 정본 자체는 아니다.
- `scripts/socket.js` — 실시간 전달. `module.myth-phone` 채널의 이벤트를 타입별 핸들러로
  라우팅한다.
- `scripts/utils.js` — 공통 표시 함수. HTML 이스케이프, 시각·통화 시간, 사용자 표시 이름,
  초상화 판정을 제공한다.
- `scripts/log.js` — 로깅 단일 제어점. 코드에서 원시 `console.*`를 직접 호출하지 않는다.

## 모듈 불변식

- 버블톡은 실제 채팅이고 기본 메시지·이메일은 GM이 준비하는 연출 데이터다. 두 계통을 합치지 않는다.
- 연출 메시지·이메일의 영구 정본은 world 설정이다. 번들 JSON은 최초 1회 시드일 뿐이며 재시드하지
  않는다.
- 버블톡 메시지의 영구 정본은 `ChatMessage` 귓속말이다.
- 소켓은 전달만 담당한다. 영구 저장과 별개의 책임으로 유지한다.
- 모듈 소켓은 모든 클라이언트에 브로드캐스트되므로 대상·참여자 검사를 수신 즉시 수행한다.
- 사용자·Actor·월드 데이터는 템플릿 문자열에 넣기 전에 `esc()`로 이스케이프하거나
  `textContent`로 설정한다.
- 폰 UI 스타일은 `#fvtt-smartphone`, 독립 GM 창 스타일은 `.mp-gm-app` 아래로 제한해 전역 UI를
  오염시키지 않는다.
- 자체 뒤로가기와 고정 크기 아바타를 추가할 때 `docs/UI_CONVENTIONS.md`의 모듈 규칙을 따른다.

## 저장 위치

| 데이터 | 영구 저장 위치 |
|---|---|
| 연출 메시지·이메일, 브라우저 사이트, 게임 날짜, 시드 여부 | world 설정 |
| 알림·소리·미리보기 | client 설정 |
| 캐릭터 연락처 | Actor 플래그 |
| 통화 기록, 버블톡·연출 읽음, 달력 개인 일정 | User 플래그 |
| 버블톡 메시지 | `ChatMessage` 귓속말 |

세부 설정 키와 훅 연결은 `docs/fvtt.md`, 결정 이유는 `docs/DECISIONS.md`에서 확인한다.
