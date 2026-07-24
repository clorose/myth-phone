# MythPhone

Foundry VTT v14용 인게임 스마트폰 인터페이스 모듈입니다.

## 프로젝트 정보

- 표시 이름: `MythPhone`
- 모듈 ID: `myth-phone`
- Foundry 호환 버전: v14
- 개발 경로: `/home/heun1/FVTT/myth-phone`
- Foundry 경로: `C:\Users\heun1\AppData\Local\FoundryVTT\Data\modules\myth-phone`

## 개발 환경 연결

실제 소스는 빠른 WSL 파일시스템에 보관한다. Windows에서 실행되는 Foundry가 접근할 수 있도록 Windows 디렉터리 심볼릭 링크를 사용한다.

```text
C:\Users\heun1\AppData\Local\FoundryVTT\Data\modules\myth-phone
→ \\wsl.localhost\Ubuntu\home\heun1\FVTT\myth-phone
```

WSL의 `ln -s`로 `/home/...`을 직접 가리키는 링크를 만들면 Windows Foundry가 해석하지 못한다. 링크를 재생성할 때는 관리자 권한으로 다음 스크립트를 실행한다.

```text
/home/heun1/FVTT/tools/link-myth-phone-module.ps1
```

## 현재 구현

- 우측 하단 실행 버튼
- 스마트폰 프레임, 홈 화면, 날짜 및 시각
- 상단 알약형 카메라 영역과 홈 인디케이터
- 4열 앱 아이콘과 반투명 즐겨찾기 독
- 메시지 대화 목록, 검색, 채팅 화면
- 친구, 1:1 채팅, 단체 대화 섹션으로 분리된 버블톡
- 기본 메시지 앱과 독립된 버블톡 목록·대화 렌더러
- 전화 앱, 키패드, 최근 통화와 NPC 전화 테스트 장면
- 브라우저 오디오로 생성한 벨소리와 상황 효과음
- 화면 안에서 동작하는 임시 메시지 입력
- 연락처 목록과 검색
- 메모 카드 화면
- 설정 화면과 토글 UI
- 홈, 뒤로가기, ESC 닫기

현재 메시지와 버블톡은 서로 분리된 JSON 더미 데이터를 사용한다. 입력한 메시지는 저장되거나 다른 사용자에게 전송되지 않으며 새로고침하면 사라진다. 전화 테스트 장면도 JSON에서 불러오지만 아직 특정 플레이어에게 전송되지는 않는다.

상세한 목표 동작과 기능 요구사항은 [`docs/FEATURES.md`](docs/FEATURES.md)를 참고한다.

## 핫 리로드

Foundry의 공식 패키지 핫 리로드 기능을 사용한다.

```json
{
  "hotReload": true
}
```

모듈 매니페스트는 `styles`, `templates`, `lang` 아래의 CSS, HBS, JSON 파일을 감시한다.

- CSS, HBS, 번역 JSON: 핫 리로드
- `data` 아래의 JSON: 브라우저 새로고침 필요
- JavaScript: 변경 후 브라우저 새로고침 권장
- `module.json`, 모듈 ID, 링크 변경: Foundry 재시작 필요

## 디자인 원칙

사용자가 현대적인 스마트폰 인터페이스를 즉시 연상할 수 있는 외형과 사용 흐름을 지향한다.

- 코드 변수와 내부 명칭은 `smartphone`, `phone` 등 중립적인 표현 사용
- 모듈과 가상 기기의 공식 이름은 `MythPhone`
- 아이콘은 Foundry가 제공하는 Font Awesome을 사용
- 화면 비율, 알약형 상단 영역, 홈 인디케이터, 블러, 둥근 카드와 목록 같은 시각적 특징은 자체 CSS로 구현
- 구체적인 디자인 레퍼런스와 클론 범위는 사용자가 정한 방향을 따른다.

## 통신과 저장 방향

별도의 소켓 서버를 만들지 않는다. 실시간 통신이 필요해지면 Foundry가 제공하는 `game.socket`의 모듈 전용 채널을 사용한다.

```text
플레이어 A → Foundry game.socket → 플레이어 B
```

소켓은 실시간 전달을 담당한다. 오프라인 사용자 수신과 대화 기록을 위해서는 별도의 Foundry 문서 또는 설정 기반 영구 저장 구조가 필요하다.

## 다음 개발 순서

1. 버블톡을 Foundry `ChatMessage` 귓속말과 연결
2. GM이 NPC Actor/Token 화자로 개인톡을 보내는 화면
3. 개인톡·단체톡 참여자 범위와 알림
4. 특정 플레이어에게만 NPC 전화를 보내는 GM 발신 화면과 소켓
5. 연락처 생성과 수정
6. 읽지 않은 메시지와 알림

## 여러 개발 환경 동기화

WSL의 `/home/heun1/FVTT`는 Syncthing의 `fvtt` 공유 폴더로 등록되어 있다. macOS에서는 원하는 로컬 경로로 받은 뒤 `myth-phone` 디렉터리를 macOS Foundry 모듈 경로에 연결한다.

동기화 제외 규칙은 저장소 루트의 `.stignore-shared`에서 관리한다. Syncthing은 `.stignore` 자체를 동기화하지 않으므로 각 장치의 `.stignore`에서 다음 파일을 포함한다.

```text
#include .stignore-shared
```
