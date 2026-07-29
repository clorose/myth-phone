# MythPhone — Foundry API 사용 노트

일반 Foundry v14 API·패턴은 `../../docs/fvtt-guide.md`를 본다. 이 문서는 MythPhone이 실제로
연결한 훅·소켓·저장 위치만 기록한다.

## 네임스페이스

- 모듈 ID: `myth-phone`
- 소켓 채널: `module.myth-phone`
- 플래그: `flags["myth-phone"]`
- `module.json`에 `"socket": true` 선언

## ChatMessage

버블톡 메시지는 Foundry `ChatMessage` 귓속말로 저장·전달한다.

```js
ChatMessage.create({
  content,
  whisper: [targetUserId],
  speaker: ChatMessage.getSpeaker(),
  flags: {
    "myth-phone": { app: "bubbletalk", roomId }
  }
});
```

- 1:1 방은 상대 사용자, 단체방은 참여자를 `whisper` 대상으로 지정한다.
- `flags["myth-phone"]`에 `app`, `roomId`, 선택적인 이미지와 단체방 메타를 저장한다.
- 캐릭터 명의 메시지는 `speaker.alias`와 `speaker.actor`에 Actor 정보를 넣는다.
- 접속 시 `game.messages`에서 참여 중인 방을 복원한다.
- 참여자가 아닌 클라이언트는 스토어에 메시지를 반영하지 않는다.

## 소켓 이벤트

| 타입 | 목적 | 수신 검사 |
|---|---|---|
| `incoming-call` | 대상 플레이어에게 전화 전달 | `targetUserId === game.user.id` |
| `call-result` | 응답·거절 결과를 GM에게 알림 | `game.user.isGM` |
| `staged-send` | 연출 메시지·이메일 신규 대상에게 도착 알림 | GM 제외, `targets`에 현재 User ID 포함 |

소켓은 알림과 실시간 전달만 담당한다. 대화·연출 데이터·통화 기록의 영구 저장을 대신하지 않는다.

## 설정과 플래그

| 데이터 | 위치 |
|---|---|
| 브라우저 사이트 `sites` | world 설정 |
| 연출 메시지 `messages`, 이메일 `emails`, 시드 여부 `seeded` | world 설정 |
| 게임 날짜 `gameDate` | world 설정 |
| 알림 `notifEnabled`, 소리 `notifSound`, 미리보기 `notifPreview` | client 설정 |
| 버블톡 읽음 `lastRead` | User 플래그 |
| 연출 읽음 `stagedRead` | User 플래그 |
| 통화 기록 `callLog` | User 플래그 |
| 달력 개인 일정 `calendarEvents` | User 플래그 |
| 캐릭터 연락처 `contact` | Actor 플래그 |

`PhoneStore`는 이 영구 데이터의 화면용 사본과 계산 상태를 보관한다.

## 훅

- `init` — 설정 등록
- `ready` — 소켓 등록, 데이터 로드, 셸 마운트, 모듈 API 공개
- `createChatMessage` — 버블톡 메시지를 `PhoneStore`에 반영
- `updateUser` — `lastRead` 변경 시 열린 버블톡 읽음 표시 갱신
- `updateSetting` — 연출 데이터와 게임 날짜 변경 시 열린 플레이어 화면·GM툴 갱신
- `getSceneControlButtons` — GM에게 토큰 팔레트의 `GM툴` 버튼 추가

## GM툴

- `GmEditorWindow`는 Foundry ApplicationV2 기반 독립 창이다.
- Scene Controls 버튼에서 열고 `game.modules.get("myth-phone").api.openGmEditor()`를 폴백으로
  제공한다.
- 연출 데이터 저장은 world 설정, 열린 창의 동기화는 `updateSetting` 훅이 담당한다.
