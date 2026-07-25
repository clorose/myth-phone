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
