import { PhoneStore } from "../store.js";
import { escapeHTML as esc } from "../utils.js";

const MODULE_ID = "myth-phone";

// 양력 고정 공휴일. 음력 공휴일(설날·추석·부처님오신날)과 대체공휴일은
// 음력 변환이 필요해 표시하지 않는다 — 필요해지면 별도 확장.
const FIXED_HOLIDAYS = {
  "1-1": "신정",
  "3-1": "삼일절",
  "5-5": "어린이날",
  "6-6": "현충일",
  "8-15": "광복절",
  "10-3": "개천절",
  "10-9": "한글날",
  "12-25": "성탄절"
};

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

    // 선택 포커스(보기용, 클라이언트 로컬) — 처음 열면 오늘이 선택돼 있다
    this.calSelected ??= { ...today };
    const isToday = (d) => y === today.y && m === today.m && d === today.d;
    const isSelected = (d) =>
      y === this.calSelected.y && m === this.calSelected.m && d === this.calSelected.d;

    // 일정: 월드 공유 데이터 { id, m, d, title } — 연도 무관(매년 반복)
    const allEvents = game.settings.get(MODULE_ID, "calendarEvents") ?? [];
    const eventsFor = (em, ed) => allEvents.filter((ev) => ev.m === em && ev.d === ed);

    const sel = this.calSelected;
    const selHoliday = FIXED_HOLIDAYS[`${sel.m}-${sel.d}`];
    const selEvents = eventsFor(sel.m, sel.d);

    content.innerHTML = `
      <header class="phone-page-header phone-cal-header">
        <p>달력</p>
        <h2>${y}년 ${m}월</h2>
        <span class="phone-cal-nav">
          <button type="button" data-cal-nav="-1" aria-label="이전 달"><i class="fa-solid fa-chevron-left"></i></button>
          <button type="button" data-cal-nav="1" aria-label="다음 달"><i class="fa-solid fa-chevron-right"></i></button>
          <button type="button" class="phone-cal-today" aria-label="오늘로">${today.d}</button>
        </span>
      </header>
      <div class="phone-cal-grid" role="grid">
        ${["일", "월", "화", "수", "목", "금", "토"].map((w, i) =>
          `<span class="phone-cal-dow${i === 0 ? " is-sun" : i === 6 ? " is-sat" : ""}">${w}</span>`).join("")}
        ${cells.map((d, i) => {
          if (!d) return `<span class="phone-cal-day is-empty"></span>`;
          const dow = i % 7;
          const holiday = FIXED_HOLIDAYS[`${m}-${d}`];
          const cls = [
            "phone-cal-day",
            dow === 0 ? "is-sun" : "",
            dow === 6 ? "is-sat" : "",
            holiday ? "is-holiday" : "",
            isToday(d) ? "is-today" : "",
            isSelected(d) ? "is-selected" : ""
          ].filter(Boolean).join(" ");
          return `<span class="${cls}" data-cal-day="${d}"${holiday ? ` data-tooltip="${holiday}"` : ""}>
            <b>${d}</b>${eventsFor(m, d).length ? '<i class="phone-cal-dot"></i>' : ""}
          </span>`;
        }).join("")}
      </div>
      <div class="phone-cal-detail">
        <h3>${sel.m}월 ${sel.d}일</h3>
        ${selHoliday ? `<p class="phone-cal-ev is-holiday"><i class="fa-solid fa-flag"></i>${esc(selHoliday)}</p>` : ""}
        ${selEvents.map((ev) => `
          <p class="phone-cal-ev"><i class="fa-solid fa-circle"></i>${esc(ev.title)}
            ${game.user.isGM ? `<button type="button" data-ev-del="${esc(ev.id)}" aria-label="삭제"><i class="fa-solid fa-xmark"></i></button>` : ""}
          </p>`).join("")}
        ${!selHoliday && !selEvents.length ? `<p class="phone-cal-ev is-none">일정 없음</p>` : ""}
        ${game.user.isGM ? `
        <form class="phone-cal-add">
          <input name="title" maxlength="30" placeholder="일정 추가 (전체 공개)" autocomplete="off">
          <button type="submit" aria-label="추가"><i class="fa-solid fa-plus"></i></button>
        </form>` : ""}
      </div>
      ${gameDate ? "" : `<p class="phone-cal-note">게임 내 날짜 미설정 — 현실 날짜 기준</p>`}
    `;

    content.querySelectorAll("[data-cal-nav]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const moved = new Date(y, m - 1 + Number(btn.dataset.calNav), 1);
        this.renderCalendar(content, moved.getFullYear(), moved.getMonth() + 1);
      }));
    // 날짜 탭 → 선택 포커스 이동 (보기용 — 게임 날짜와 무관)
    content.querySelectorAll("[data-cal-day]").forEach((cell) =>
      cell.addEventListener("click", () => {
        this.calSelected = { y, m, d: Number(cell.dataset.calDay) };
        this.renderCalendar(content, y, m);
      }));
    // 오늘 버튼 → 오늘 달로 복귀 + 오늘 선택
    content.querySelector(".phone-cal-today").addEventListener("click", () => {
      this.calSelected = { ...today };
      this.renderCalendar(content, today.y, today.m);
    });

    // GM: 선택한 날에 일정 추가/삭제 (월드 설정 — 전 클라이언트 공유)
    content.querySelector(".phone-cal-add")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = event.currentTarget.elements.title.value.trim();
      if (!title) return;
      const list = [...allEvents, { id: foundry.utils.randomID(), m: sel.m, d: sel.d, title }];
      await game.settings.set(MODULE_ID, "calendarEvents", list);
      this.renderCalendar(content, y, m);
    });
    content.querySelectorAll("[data-ev-del]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const list = allEvents.filter((ev) => ev.id !== btn.dataset.evDel);
        await game.settings.set(MODULE_ID, "calendarEvents", list);
        this.renderCalendar(content, y, m);
      }));
  },
};
