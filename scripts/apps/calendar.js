import { PhoneStore } from "../store.js";

export const calendarMethods = {
  // 게임 내 날짜(gameDate) 기준 월 달력. 미설정이면 시계와 같은 규칙으로 현실 날짜 폴백.
  renderCalendar(content, year = null, month = null) {
    content.closest(".smartphone-app-view")?.classList.remove("is-chat-open");
    const gameDate = PhoneStore.gameDate();
    const now = new Date();
    const today = gameDate ?? { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
    const y = year ?? today.y;
    const m = month ?? today.m;

    const startDow = new Date(y, m - 1, 1).getDay(); // 0 = 일요일
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells = Array(startDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const isToday = (d) => y === today.y && m === today.m && d === today.d;

    content.innerHTML = `
      <header class="phone-page-header phone-cal-header">
        <p>달력</p>
        <h2>${y}년 ${m}월</h2>
        <span class="phone-cal-nav">
          <button type="button" data-cal-nav="-1" aria-label="이전 달"><i class="fa-solid fa-chevron-left"></i></button>
          <button type="button" data-cal-nav="1" aria-label="다음 달"><i class="fa-solid fa-chevron-right"></i></button>
        </span>
      </header>
      <div class="phone-cal-grid" role="grid">
        ${["일", "월", "화", "수", "목", "금", "토"].map((w, i) =>
          `<span class="phone-cal-dow${i === 0 ? " is-sun" : i === 6 ? " is-sat" : ""}">${w}</span>`).join("")}
        ${cells.map((d, i) => {
          if (!d) return `<span class="phone-cal-day is-empty"></span>`;
          const dow = i % 7;
          const cls = [
            "phone-cal-day",
            dow === 0 ? "is-sun" : "",
            dow === 6 ? "is-sat" : "",
            isToday(d) ? "is-today" : ""
          ].filter(Boolean).join(" ");
          return `<span class="${cls}"><b>${d}</b></span>`;
        }).join("")}
      </div>
      ${gameDate ? "" : `<p class="phone-cal-note">게임 내 날짜 미설정 — 현실 날짜 기준</p>`}
    `;

    content.querySelectorAll("[data-cal-nav]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const moved = new Date(y, m - 1 + Number(btn.dataset.calNav), 1);
        this.renderCalendar(content, moved.getFullYear(), moved.getMonth() + 1);
      }));
  },
};
