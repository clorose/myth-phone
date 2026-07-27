// 로깅 단일 제어점.
// 코드 어디서도 console.*를 직접 쓰지 않고 여기 함수를 쓴다 → 로깅 정책이 이 파일 하나에 모인다.
//
// - debug: 개발/추적용. 모듈 설정 "debugLog"가 켜져 있을 때만 출력한다.
//   기본값이 꺼짐이라 배포 시 자동으로 조용해진다(따로 끌 것 없음).
// - warn / error: 실제 실패용. 항상 콘솔에 남긴다(문제가 났을 때만 뜨므로 스팸이 아니다).

const PREFIX = "myth-phone |";

export function debug(...args) {
  let enabled = false;
  try {
    enabled = game.settings.get("myth-phone", "debugLog");
  } catch {
    return;
  }
  if (!enabled) return;

  console.log(PREFIX, ...args);
  ui.notifications?.info(`MythPhone 디버그 | ${args.map(String).join(" ")}`);
}

export function warn(...args) {
  console.warn(PREFIX, ...args);
}

export function error(...args) {
  console.error(PREFIX, ...args);
}
