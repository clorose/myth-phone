// 폰 데이터 스토어: 앱 데이터 로드와 보관, 변경 알림(pub/sub)을 담당.
// 렌더러는 여기서 데이터를 읽고, 데이터 변경은 emit으로 구독자에게 알린다.
// (버블톡 실채팅 전환 시 ChatMessage 훅이 이 스토어를 갱신하는 구조를 전제)

const MODULE_ID = "myth-phone";

const listeners = new Map();

export const PhoneStore = {
  data: {
    messages: [],
    bubbletalk: [],
    bubbletalkFriends: []
  },
  callScenes: new Map(),
  // 최근 통화 기록: { name, time(timestamp), result("수신"|"거절"|"부재중") }
  // 현재는 클라이언트 세션 메모리에만 유지. 영구 저장은 별도 단계에서 처리.
  callLog: [],
  // 실채팅 방: roomId → { id, type, real, otherUserId, name, initial, messages[] }
  // 메시지 원본은 Foundry ChatMessage(귓속말)이고 여기는 화면용 사본.
  rooms: new Map(),

  async load() {
    await Promise.all([this.loadCallScenes(), this.loadMessageData()]);
  },

  async loadCallScenes() {
    const response = await fetch(`modules/${MODULE_ID}/data/call-scenes.json`);
    if (!response.ok) {
      throw new Error(`전화 장면 데이터를 불러오지 못했습니다: ${response.status}`);
    }
    const data = await response.json();
    this.callScenes = new Map((data.scenes ?? []).map((scene) => [scene.id, scene]));
  },

  async loadMessageData() {
    const appNames = ["messages", "bubbletalk"];
    const responses = await Promise.all(
      appNames.map((app) => fetch(`modules/${MODULE_ID}/data/${app}.json`))
    );

    for (const [index, response] of responses.entries()) {
      const app = appNames[index];
      if (!response.ok) {
        throw new Error(`${app} 데이터를 불러오지 못했습니다: ${response.status}`);
      }
      const data = await response.json();
      this.data[app] = data.conversations ?? [];
      if (app === "bubbletalk") {
        this.data.bubbletalkFriends = data.friends ?? [];
      }
    }
  },

  directRoomId(userA, userB) {
    return `direct:${[userA, userB].sort().join(":")}`;
  },

  roomFor(roomId) {
    if (!this.rooms.has(roomId)) {
      const ids = roomId.split(":").slice(1);
      const otherId = ids.find((id) => id !== game.user.id) ?? ids[0];
      const other = game.users.get(otherId);
      this.rooms.set(roomId, {
        id: roomId,
        type: "direct",
        real: true,
        otherUserId: otherId,
        name: other?.name ?? "알 수 없음",
        initial: Array.from(other?.name ?? "?")[0].toLocaleUpperCase(),
        online: other?.active ?? false,
        status: other?.active ? "접속 중" : "오프라인",
        messages: []
      });
    }
    return this.rooms.get(roomId);
  },

  // 월드의 기존 ChatMessage에서 참여 중인 버블톡 방을 복원한다.
  buildRooms() {
    this.rooms = new Map();
    for (const message of game.messages ?? []) {
      this.addChatMessage(message, { silent: true });
    }
  },

  // 버블톡 ChatMessage를 방에 반영한다. 참여자가 아니면 폐기.
  addChatMessage(message, { silent = false } = {}) {
    const flag = message.flags?.["myth-phone"];
    if (flag?.app !== "bubbletalk" || !flag.roomId) return;

    const authorId = message.author?.id;
    const participants = message.whisper.map(String);
    if (authorId) participants.push(authorId);
    if (!participants.includes(game.user.id)) return;

    const room = this.roomFor(flag.roomId);
    const entry = {
      authorId,
      authorName: message.author?.name ?? "알 수 없음",
      text: message.content,
      time: message.timestamp
    };
    room.messages.push(entry);
    room.preview = entry.text;
    room.listTime = entry.time;
    if (!silent) this.emit("bubbletalk-message", { room, entry });
  },

  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
  },

  off(event, handler) {
    listeners.get(event)?.delete(handler);
  },

  emit(event, payload) {
    listeners.get(event)?.forEach((handler) => handler(payload));
  }
};
