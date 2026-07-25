// 실시간 통신 계층: Foundry 모듈 전용 game.socket 채널 하나로
// 타입별 이벤트를 주고받는다. (전화 발신이 먼저 사용, 버블톡 알림도 재사용 예정)
//
// 개인정보 원칙(FEATURES.md): 소켓 이벤트는 모든 클라이언트에 전달되므로
// 각 핸들러는 수신 즉시 대상 사용자 ID를 검사하고 무관한 이벤트를 폐기한다.

const MODULE_ID = "myth-phone";
const CHANNEL = `module.${MODULE_ID}`;

const handlers = new Map();

export const PhoneSocket = {
  register() {
    game.socket.on(CHANNEL, (payload) => {
      if (!payload?.type) return;
      handlers.get(payload.type)?.(payload);
    });
  },

  on(type, handler) {
    handlers.set(type, handler);
  },

  send(type, payload = {}) {
    game.socket.emit(CHANNEL, { type, ...payload });
  }
};
