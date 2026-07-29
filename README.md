# MythPhone

Foundry VTT v14용 인게임 스마트폰 인터페이스 모듈이다.

## 주요 기능

- `ChatMessage` 귓속말 기반의 1:1·단체·캐릭터 명의 버블톡
- GM이 작성하고 대상에게 공개하는 연출 메시지·이메일
- 전화 장면에 정의된 발신자가 플레이어 한 명에게 거는 연출 전화
- 연락처, 브라우저, 달력, 메모, 설정 앱
- 사용자별 안읽음·통화 기록·개인 일정
- GM용 독립 저작 창 `GM툴`

버블톡은 실제 대화이고, 기본 메시지·이메일 앱은 GM이 준비하는 연출 데이터다. 소켓은 실시간 알림과
전화 전달에 사용하고, 영구 데이터는 Foundry 문서·설정·플래그에 저장한다.

## 문서

- [사용 설명서](docs/GUIDE.md) — GM·플레이어 조작법과 전화 장면 형식
- [기능 요구사항](docs/FEATURES.md) — 목표 동작, 다음 개발 후보, 보류 범위
- [결정 기록](docs/DECISIONS.md) — 구조적 결정과 이유
- [테스트 체크리스트](docs/TESTING.md) — Foundry 플레이 테스트 항목
- [모듈 UI 규칙](docs/UI_CONVENTIONS.md) — MythPhone 선택자에 적용되는 UI 불변식
- [Foundry API 사용 노트](docs/fvtt.md) — 이 모듈의 훅·소켓·저장 매핑

개발 에이전트가 항상 알아야 할 구조와 작업 규칙은 [CLAUDE.md](CLAUDE.md)에 있다.

## 개발 환경 연결

소스는 WSL 파일시스템에 두고 Windows Foundry 모듈 경로에서 디렉터리 심볼릭 링크로 연결한다.

```text
C:\Users\heun1\AppData\Local\FoundryVTT\Data\modules\myth-phone
→ \\wsl.localhost\Ubuntu\home\heun1\FVTT\myth-phone
```

링크를 재생성할 때는 관리자 권한으로 다음 스크립트를 실행한다.

```text
/home/heun1/FVTT/tools/link-myth-phone-module.ps1
```

WSL의 `ln -s`로 `/home/...`을 직접 가리키는 링크는 Windows Foundry가 해석하지 못한다.

## 빌드와 핫 리로드

별도 빌드 단계가 없다. Foundry가 `module.json`의 ES 모듈과 CSS를 직접 로드한다.

- CSS·HBS·번역 JSON: 핫 리로드
- `data/` JSON과 JavaScript: 브라우저 새로고침 필요
- `module.json`, 모듈 ID, 심볼릭 링크: Foundry 재시작 필요

## 여러 개발 환경 동기화

`/home/heun1/FVTT`는 Syncthing의 `fvtt` 공유 폴더다. 동기화 제외 규칙은 작업 공간의
`.stignore-shared`에서 관리하고, 각 장치의 `.stignore`에서 다음처럼 포함한다.

```text
#include .stignore-shared
```
