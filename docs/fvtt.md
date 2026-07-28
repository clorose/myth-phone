# MythPhone — Foundry API 사용 노트 (모듈 전용)

일반 Foundry v14 API·패턴(훅·소켓·설정/플래그·ApplicationV2·Scene Controls·v14 주의점)은
**작업 공간 공통 문서 [`../../docs/fvtt-guide.md`](../../docs/fvtt-guide.md)** 를 본다.
여기엔 그 API를 **MythPhone이 구체적으로 어떻게 쓰는지**만 적는다.

## 모듈 채널·플래그 네임스페이스

- 모듈 ID = `myth-phone`. 소켓 채널 = `module.myth-phone`, 플래그 키 = `flags["myth-phone"]`.
- `module.json`에 `"socket": true` 선언됨.

## ChatMessage — 버블톡의 저장·전달 계층

버블톡 실채팅은 별도 저장소 없이 Foundry `ChatMessage` 귓속말로 저장·전달한다.

```js
ChatMessage.create({
  content: "본문",
  whisper: [userId1, userId2],
  speaker: ChatMessage.getSpeaker(),
  flags: { "myth-phone": { app: "bubbletalk", roomId, image } }
});
```

- `whisper`에 참여자 User ID, `flags["myth-phone"]`에 `app`·`roomId`(·`image`).
- 문서는 전 클라이언트에 동기화되므로, 스토어는 **참여자가 아니면 폐기**한다(프라이버시).
- GM이 NPC 명의로 보낼 때: `speaker: { alias: actor.name, actor: actor.id }`.
- 조회: `game.messages` 순회 + `message.flags?.["myth-phone"]` 필터. `message.author`, `message.timestamp` 사용.

## 소켓 — 대상 지정 이벤트

- 전화 발신(`incoming-call`) 등은 `module.myth-phone` 한 채널로 브로드캐스트하고, 수신 즉시 `targetUserId === game.user.id` 검사 후 무관하면 폐기한다.
- 발신자 자신은 수신 안 함(GM 발신 → GM 화면엔 안 옴).

## 저장 위치 매핑 (무엇을 어디에)

| 데이터 | 위치 |
|---|---|
| 브라우저 사이트 목록 (`sites`) | `game.settings` world |
| 연출용 메시지·이메일 (`messages`/`emails`), 시드 여부(`seeded`) | `game.settings` world |
| 게임 내 날짜 (`gameDate`) | `game.settings` world |
| 연출 읽음 상태(`stagedRead`), 달력 개인 일정(`calendarEvents`) | `user.setFlag("myth-phone", …)` |
| 알림 토글(`notifEnabled`/`notifSound`/`notifPreview`) | `game.settings` client |
| 읽은 시각(`lastRead`), 통화 기록 | `user.setFlag("myth-phone", …)` (전원 읽기 가능 → 읽음 계산) |
| 캐릭터 연락처 번호 | `actor.setFlag("myth-phone", …)` |

## 이 모듈이 쓰는 훅

- `createChatMessage` → `PhoneStore.addChatMessage` (버블톡 수신)
- `updateUser`(`flags.myth-phone.lastRead` 변경) → 로그 읽음 갱신
- `updateSetting`(`myth-phone.messages`/`emails`) → 인메모리 사본 갱신 + 플레이어 폰/GM툴 창 갱신
- `getSceneControlButtons` → 좌측 툴바에 GM툴 버튼 (상세는 `../../docs/fvtt-guide.md`)
