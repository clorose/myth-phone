// 앱 공통 유틸: 문자열 이스케이프와 시간 표시

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

// timestamp(숫자)는 "오후 8:46" 형태로 포맷하고,
// 기존 더미 데이터의 표시용 문자열은 그대로 통과시킨다.
export function formatTime(value) {
  if (typeof value !== "number") return value ?? "";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(new Date(value));
}

export function formatDuration(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

// 디버그 로그: 모듈 설정 "debugLog"가 켜져 있을 때만
// 콘솔과 화면 알림으로 출력한다. 끄면 아무것도 하지 않는다.
export function debug(...args) {
  let enabled = false;
  try {
    enabled = game.settings.get("myth-phone", "debugLog");
  } catch {
    return;
  }
  if (!enabled) return;

  console.log("myth-phone |", ...args);
  ui.notifications?.info(`MythPhone 디버그 | ${args.map(String).join(" ")}`);
}
