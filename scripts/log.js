// 로깅 단일 제어점.
// 코드 어디서도 console.*를 직접 쓰지 않고 여기 함수를 쓴다 → 로깅 정책이 이 파일 하나에 모인다.
//
// ★ 로그 정책 (사용자 지시):
//   - debug는 아래 DEBUG 상수로만 켜고 끈다. 게임 설정이 아니므로 유저는 못 건드린다.
//   - 개발 중: true. 정식 출시: false로 바꾼다 — 이거면 끝, 코드 삭제 불필요.
//
// - warn / error: 실제 실패용. 출시 후에도 항상 출력(문제가 났을 때만 뜨므로 스팸이 아니다).

const DEBUG = true;

const PREFIX = "myth-phone |";

export function debug(...args) {
  if (!DEBUG) return;
  console.log(PREFIX, ...args);
}

export function warn(...args) {
  console.warn(PREFIX, ...args);
}

export function error(...args) {
  console.error(PREFIX, ...args);
}
