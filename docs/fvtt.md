# FVTT(v14) 문법 노트

MythPhone에서 실제로 쓰고 있는 Foundry API 정리. 공식 문서는 https://foundryvtt.com/api/ (v14 기준 서빙).

## 모듈 구조

- `module.json`의 `esmodules`에는 진입점 하나만 두고 나머지는 ES `import`로 연결한다.
- `"socket": true`를 선언해야 `game.socket`의 모듈 채널을 쓸 수 있다.
- `flags.hotReload`: css·hbs·json은 저장 즉시 리로드, JS는 브라우저 F5, `module.json` 변경은 Foundry 재시작.

## 훅 (Hooks)

```js
Hooks.once("init", () => { /* 설정·키바인딩 등록. game 문서는 아직 없음 */ });
Hooks.once("ready", () => { /* game.users, game.messages 등 접근 가능 */ });
Hooks.on("createChatMessage", (message) => { /* 모든 클라이언트에서 발생 */ });
Hooks.on("updateUser", (user, changes) => { /* 유저 플래그 변경 감지에 사용 */ });
```

## ChatMessage — 버블톡의 저장·전달 계층

```js
ChatMessage.create({
  content: "본문",
  whisper: [userId1, userId2],          // 수신자. 작성자는 자동 포함
  speaker: ChatMessage.getSpeaker(),    // 배정 캐릭터가 alias로 들어감
  flags: { "myth-phone": { app: "bubbletalk", roomId, image } }
});
```

- 귓속말 가시성: **작성자와 whisper 대상만** 볼 수 있다. GM도 예외 아님 (`ChatMessage#visible`, 주사위 굴림만 예외).
- 단, 문서 자체는 모든 클라이언트에 동기화된다 — 화면 필터일 뿐이므로 우리 스토어는 참여자 검사 후 폐기한다.
- GM이 캐릭터 명의로 보낼 때: `speaker: { alias: actor.name, actor: actor.id }`.
- 조회: `game.messages`를 순회하며 `message.flags?.["myth-phone"]`으로 거른다. `message.author`(User), `message.timestamp`(ms) 사용.

## 소켓

```js
game.socket.on(`module.myth-phone`, (payload) => { ... });  // 발신자 제외 전원 수신
game.socket.emit(`module.myth-phone`, { type, ...data });
```

- 이벤트는 모든 클라이언트에 가므로 수신 즉시 `targetUserId` 검사 후 무관하면 폐기한다.
- 발신자 자신은 수신하지 않는다 (GM 발신 → GM 화면엔 안 옴).

## 설정과 플래그 — 저장 위치 고르기

| 위치 | 범위 | 쓰기 권한 | 용도 (우리 사용처) |
|---|---|---|---|
| `game.settings` scope `world` | 월드 전체 공유 | GM | 브라우저 사이트 목록 |
| `game.settings` scope `client` | 브라우저별 | 본인 | 디버그 로그 토글 |
| `user.setFlag("myth-phone", key, v)` | 유저별, 월드 저장, **전원이 읽기 가능** | 본인 | 읽은 시각(lastRead), 통화 기록 |
| `actor.setFlag(...)` | Actor에 저장 | 소유자(GM) | 캐릭터 연락처 번호 |

- 유저 플래그가 전원 읽기 가능하다는 점을 이용해 "상대가 읽었는지"를 계산한다.
- `updateUser` 훅에서 `foundry.utils.getProperty(changes, "flags.myth-phone.lastRead")`로 변경만 골라낸다.

## 유저·캐릭터

```js
game.user.id / game.user.isGM / game.user.can("FILES_BROWSE")
game.users.filter((u) => u.active && !u.isGM)   // 접속 중 플레이어
user.character?.name                              // 배정 캐릭터 (없으면 undefined)
game.actors.filter((a) => !a.hasPlayerOwner)      // GM이 운용하는 캐릭터만
```

## 파일·이미지

```js
const Picker = foundry.applications.apps.FilePicker.implementation;
new Picker({ type: "image", callback: (path) => { ... } }).render(true);

const Popout = foundry.applications.apps.ImagePopout;
new Popout({ src, window: { title } }).render(true);
```

- Foundry 서버는 `Data/` 아래 정적 파일을 그대로 서빙한다. `worlds/월드명/sites/a.html` 같은 상대 경로를 iframe `src`로 쓰면 된다.

## v14에서 주의할 것

- ApplicationV1(`getData`/`activateListeners`)은 쓰지 않는다. AppV2 계열 또는 직접 DOM.
- 전역 `renderTemplate` 대신 `foundry.applications.handlebars.renderTemplate`.
- `Date.now()` timestamp로 저장하고 표시할 때만 `Intl.DateTimeFormat("ko-KR", ...)`으로 포맷.
- 사용자 입력·Actor 이름 등 외부 문자열은 innerHTML에 넣기 전 반드시 이스케이프 (`utils.js`의 `escapeHTML`).
