// 폰 데이터 스토어: 앱 데이터 로드와 보관, 변경 알림(pub/sub)을 담당.
// 렌더러는 여기서 데이터를 읽고, 데이터 변경은 emit으로 구독자에게 알린다.
// (버블톡 실채팅 전환 시 ChatMessage 훅이 이 스토어를 갱신하는 구조를 전제)

import { userDisplayName, formatTime, formatHM } from "./utils.js";
import { debug } from "./log.js";

const MODULE_ID = "myth-phone";

const listeners = new Map();

export const PhoneStore = {
  data: {
    messages: [],
    emails: []
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

  // 메시지·이메일 연출 데이터는 월드 설정(game.settings, world scope)이 정본.
  // GM 편집기가 여기에 쓰고, 최초 1회는 모듈 번들 JSON을 시드로 옮겨 심는다.
  // (빈 배열 = 의도적으로 비운 상태이므로 seeded 플래그로 "미시드"와 구분한다)
  async loadMessageData() {
    if (game.user.isGM && !game.settings.get(MODULE_ID, "seeded")) {
      await this.seedMessageData();
      await game.settings.set(MODULE_ID, "seeded", true);
    }
    this.data.messages = game.settings.get(MODULE_ID, "messages") ?? [];
    this.data.emails = game.settings.get(MODULE_ID, "emails") ?? [];
  },

  // 번들된 데모 JSON을 월드 정본으로 이식 (최초 1회, GM만).
  async seedMessageData() {
    const load = async (app, key) => {
      try {
        const response = await fetch(`modules/${MODULE_ID}/data/${app}.json`);
        if (!response.ok) return [];
        const data = await response.json();
        return data[key] ?? [];
      } catch (error) {
        debug(`연출 데이터 시드 실패 (${app}): ${error.message}`);
        return [];
      }
    };
    await game.settings.set(MODULE_ID, "messages", await load("messages", "conversations"));
    await game.settings.set(MODULE_ID, "emails", await load("emails", "emails"));
  },

  // ----- 연출 데이터 공개 판정 -----
  // sentTo 없음(구 데이터) = 전체 공개, 배열 = 발송받은 사용자만. GM은 항상 전부 본다.
  stagedVisible(item, user = game.user) {
    return user.isGM || item.sentTo === undefined || item.sentTo.includes(user.id);
  },

  visibleList(kind) {
    return (this.data[kind] ?? []).filter((item) => this.stagedVisible(item));
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
        name: game.user.isGM ? `${actorName} → ${userDisplayName(user)}` : actorName,
        initial: Array.from(actorName)[0].toLocaleUpperCase(),
        online: true,
        status: game.user.isGM ? "NPC 명의 대화" : "접속 중",
        messages: []
      };
    } else {
      const ids = roomId.split(":").slice(1);
      const otherId = ids.find((id) => id !== game.user.id) ?? ids[0];
      const other = game.users.get(otherId);
      const otherName = userDisplayName(other);
      room = {
        id: roomId,
        type: "direct",
        real: true,
        otherUserId: otherId,
        name: otherName,
        initial: Array.from(otherName)[0].toLocaleUpperCase(),
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
    // 목록 모자이크 아바타는 렌더 시점에 participantUserIds로 직접 그린다 (chat.js mosaicTiles)
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
    if (!participants.includes(game.user.id)) {
      debug(`버블톡 폐기 (참여자 아님): ${flag.roomId}`);
      return;
    }

    const room = this.roomFor(flag.roomId, flag.group ?? null);
    const entry = {
      authorId,
      // NPC 명의 메시지는 speaker.alias(Actor 이름)를 표시 이름으로 쓴다
      authorName: message.speaker?.alias || message.author?.name || "알 수 없음",
      // 화자 Actor id — 말풍선 아바타에 캐릭터 초상화를 쓰기 위해 보관
      actorId: message.speaker?.actor ?? null,
      text: message.content,
      image: flag.image ?? null,
      time: message.timestamp
    };
    room.messages.push(entry);
    room.preview = entry.text || (entry.image ? "사진" : "");
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
    debug(`읽음 처리: ${roomId}`);
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

  // ----- 연출(메시지·이메일) 읽음 상태 -----
  // 유저 플래그에 항목별 "본 받은 개수"를 저장. 배지 = 현재 받은 개수 - 본 개수.
  // (연출 말풍선엔 타임스탬프가 없어서 시각 대신 개수로 델타를 잡는다)

  stagedReadMap(user = game.user) {
    return user?.getFlag(MODULE_ID, "stagedRead") ?? {};
  },

  stagedReceivedCount(kind, item) {
    return kind === "messages"
      ? (item.messages ?? []).filter((m) => m.direction !== "sent").length
      : 1;
  },

  stagedUnread(kind, item) {
    const seen = this.stagedReadMap()[item.id] ?? 0;
    return Math.max(0, this.stagedReceivedCount(kind, item) - seen);
  },

  // ----- 연출 시점 라벨 -----
  // 항목의 시점은 item.at = { m, d, t? } 하나. 표시 라벨은 게임 내 오늘(gameDate)과
  // 비교해 자동 계산한다 — 날짜가 넘어가면 "오늘"이 "어제"→"7월 3일"로 저절로 늙는다.

  // 게임 내 날짜 { y, m, d }. 요일은 저장하지 않고 그레고리력으로 계산한다(현대 배경).
  gameDate() {
    const gd = game.settings.get(MODULE_ID, "gameDate");
    return gd?.y && gd?.m && gd?.d ? gd : null;
  },

  // 잠금화면 형식 그대로: "7월 6일 화요일"
  gameDateLabel() {
    const gd = this.gameDate();
    if (!gd) return null;
    const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long" })
      .format(new Date(gd.y, gd.m - 1, gd.d));
    return `${gd.m}월 ${gd.d}일 ${weekday}`;
  },

  // 대화의 시점 = 마지막으로 시점(at)을 가진 말풍선의 것 (파생값 — 별도 입력 없음)
  lastAt(item) {
    const bubbles = item?.messages ?? [];
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (bubbles[i].at?.m && bubbles[i].at?.d) return bubbles[i].at;
    }
    return null;
  },

  stagedTimeLabel(item, { detail = false } = {}) {
    // 대화(messages 보유)는 말풍선에서 파생, 이메일은 항목의 at 그대로
    const at = item.messages ? this.lastAt(item) : item.at;
    if (!at?.m || !at?.d) {
      // 구 데이터 폴백: 옛 자유 텍스트는 그대로, 숫자 타임스탬프는 시각으로 포맷
      const legacy = detail ? (item.timelineTime || item.time || "") : (item.listTime || item.time || "");
      return formatTime(legacy);
    }
    const dateText = `${at.m}월 ${at.d}일`;
    if (detail) return at.t ? `${dateText} ${formatHM(at.t)}` : dateText;
    const today = this.gameDate();
    if (today) {
      // 항목은 기준 날짜와 같은 해로 본다 — 연도 덕에 월 경계 넘는 어제 판정도 정확
      const diffDays = Math.round(
        (new Date(today.y, today.m - 1, today.d) - new Date(today.y, at.m - 1, at.d)) / 86400000);
      if (diffDays === 0) return at.t ? formatHM(at.t) : "오늘";
      if (diffDays === 1) return "어제";
    }
    return dateText;
  },

  async markStagedRead(kind, item) {
    if (!item?.id) return;
    const map = { ...this.stagedReadMap() };
    const count = this.stagedReceivedCount(kind, item);
    if (map[item.id] === count) return;
    map[item.id] = count;
    await game.user.setFlag(MODULE_ID, "stagedRead", map);
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
