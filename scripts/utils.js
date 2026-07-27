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

// 폰에서 유저를 지칭할 때는 배정된 캐릭터 이름을 쓰고, 없으면 계정 이름으로 폴백.
export function userDisplayName(user) {
  return user?.character?.name ?? user?.name ?? "알 수 없음";
}
