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

  npcRoomId(actorId, userId) {
    return `npc:${actorId}:${userId}`;
  },

  groupPalette: ["#8c82ed", "#5fb3e8", "#e88a5f", "#6cc19a"],

  roomFor(roomId, groupMeta = null) {
    if (this.rooms.has(roomId)) {
      const existing = this.rooms.get(roomId);
      if (groupMeta) this.applyGroupMeta(existing, groupMeta);
      return existing;
    }

    let room;
    if (roomId.startsWith("group:")) {
      room = {
        id: roomId,
        type: "group",
        real: true,
        name: "단체 대화",
        participantUserIds: [],
        participantCount: 0,
        initial: "단",
        status: "단체 대화",
        messages: []
      };
      if (groupMeta) this.applyGroupMeta(room, groupMeta);
    } else if (roomId.startsWith("npc:")) {
      // GM이 NPC Actor 명의로 특정 플레이어와 나누는 개인톡
      const [, actorId, userId] = roomId.split(":");
      const actor = game.actors.get(actorId);
      const user = game.users.get(userId);
      const actorName = actor?.name ?? "알 수 없음";
      room = {
        id: roomId,
        type: "direct",
        real: true,
        npcActorId: actorId,
        targetUserId: userId,
        name: game.user.isGM ? `${actorName} → ${user?.name ?? "?"}` : actorName,
        initial: Array.from(actorName)[0].toLocaleUpperCase(),
        online: true,
        status: game.user.isGM ? "NPC 명의 대화" : "접속 중",
        messages: []
      };
    } else {
      const ids = roomId.split(":").slice(1);
      const otherId = ids.find((id) => id !== game.user.id) ?? ids[0];
      const other = game.users.get(otherId);
      room = {
        id: roomId,
        type: "direct",
        real: true,
        otherUserId: otherId,
        name: other?.name ?? "알 수 없음",
        initial: Array.from(other?.name ?? "?")[0].toLocaleUpperCase(),
        online: other?.active ?? false,
        status: other?.active ? "접속 중" : "오프라인",
        messages: []
      };
    }
    this.rooms.set(roomId, room);
    return room;
  },

  applyGroupMeta(room, meta) {
    room.name = meta.name ?? room.name;
    room.participantUserIds = meta.participantUserIds ?? room.participantUserIds;
    room.participantCount = room.participantUserIds.length;
    room.initial = Array.from(room.name)[0];
    room.status = `멤버 ${room.participantCount}명`;
    // 목록 모자이크 아바타용
    room.participants = room.participantUserIds.slice(0, 4).map((id, index) => ({
      initial: Array.from(game.users.get(id)?.name ?? "?")[0],
      color: this.groupPalette[index % this.groupPalette.length]
    }));
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

    const room = this.roomFor(flag.roomId, flag.group ?? null);
    const entry = {
      authorId,
      // NPC 명의 메시지는 speaker.alias(Actor 이름)를 표시 이름으로 쓴다
      authorName: message.speaker?.alias || message.author?.name || "알 수 없음",
      text: message.content,
      time: message.timestamp
    };
    room.messages.push(entry);
    room.preview = entry.text;
    room.listTime = entry.time;
    if (!silent) this.emit("bubbletalk-message", { room, entry });
  },

  // ----- 읽음 상태: 사용자별 마지막 읽은 시각을 유저 플래그(월드 저장)에 보관 -----

  lastReadMap(user = game.user) {
    return user?.getFlag(MODULE_ID, "lastRead") ?? {};
  },

  unreadOf(room) {
    const last = this.lastReadMap()[room.id] ?? 0;
    return room.messages.filter(
      (entry) => entry.time > last && entry.authorId !== game.user.id
    ).length;
  },

  totalUnread() {
    return Array.from(this.rooms.values())
      .reduce((sum, room) => sum + this.unreadOf(room), 0);
  },

  async markRead(roomId) {
    const map = { ...this.lastReadMap() };
    map[roomId] = Date.now();
    await game.user.setFlag(MODULE_ID, "lastRead", map);
    this.emit("unread-changed");
  },

  // 이 방에서 나 말고 다른 참여자들의 마지막 읽은 시각 목록 (보낸 메시지 읽음 표시용)
  otherLastRead(room) {
    let ids = [];
    if (room.id.startsWith("npc:")) {
      ids = game.user.isGM
        ? [room.targetUserId]
        : game.users.filter((user) => user.isGM).map((user) => user.id);
    } else if (room.otherUserId) {
      ids = [room.otherUserId];
    } else if (room.participantUserIds) {
      ids = room.participantUserIds.filter((id) => id !== game.user.id);
    }
    return ids.map((id) => this.lastReadMap(game.users.get(id))[room.id] ?? 0);
  },

  // ----- 통화 기록: 유저 플래그에 영구 저장 -----

  loadCallLog() {
    this.callLog = game.user.getFlag(MODULE_ID, "callLog") ?? [];
  },

  async saveCallEntry(entry) {
    this.callLog = [entry, ...this.callLog].slice(0, 50);
    await game.user.setFlag(MODULE_ID, "callLog", this.callLog);
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
