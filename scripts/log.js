// 로깅 단일 제어점.
// 코드 어디서도 console.*를 직접 쓰지 않고 여기 함수를 쓴다 → 로깅 정책이 이 파일 하나에 모인다.
//
// ★ 로그 정책 (사용자 지시):
//   - 개발 중: debug는 게이트 없이 항상 켜져 있다.
//   - 정식 출시: 설정으로 끄는 게 아니라 debug 호출과 이 함수 자체를 전부 제거한다.
//     (제거 대상 찾기: `grep -rn "debug(" scripts/` — import 지점 포함 전부)
//
// - warn / error: 실제 실패용. 출시 후에도 남긴다(문제가 났을 때만 뜨므로 스팸이 아니다).

const PREFIX = "myth-phone |";

export function debug(...args) {
  console.log(PREFIX, ...args);
}

export function warn(...args) {
  console.warn(PREFIX, ...args);
}

export function error(...args) {
  console.error(PREFIX, ...args);
}
