import { escapeHTML as esc, formatTime, userDisplayName } from "../utils.js";
import { PhoneStore } from "../store.js";

const MODULE_ID = "myth-phone";

export const settingsMethods = {
  renderSettings(content) {
    const userName = game.user?.name?.trim() || "플레이어";
    const userInitial = Array.from(userName)[0]?.toLocaleUpperCase() || "P";

    content.innerHTML = `
      <header class="phone-page-header"><p>설정</p><h2>스마트폰 설정</h2></header>
      <div class="phone-profile">
        <span class="phone-avatar" data-profile-initial></span>
        <span><strong data-profile-name></strong><small>내 스마트폰</small></span>
      </div>
      <div class="phone-settings-list">
        <label><span><i class="fa-solid fa-bell"></i> 알림</span><input type="checkbox" data-setting="notifEnabled"></label>
        <label><span><i class="fa-solid fa-volume-high"></i> 메시지 소리</span><input type="checkbox" data-setting="notifSound"></label>
        <label><span><i class="fa-solid fa-eye"></i> 미리보기</span><input type="checkbox" data-setting="notifPreview"></label>
        <button class="phone-log-export" type="button"><span><i class="fa-solid fa-file-export"></i> 대화 로그 내보내기</span><small><i class="fa-solid fa-chevron-right"></i></small></button>
        <button type="button"><span><i class="fa-solid fa-palette"></i> 화면 테마</span><small>보라색 <i class="fa-solid fa-chevron-right"></i></small></button>
        <button type="button"><span><i class="fa-solid fa-circle-info"></i> 정보</span><small>v0.1.0 <i class="fa-solid fa-chevron-right"></i></small></button>
      </div>
    `;

    content.querySelector("[data-profile-initial]").textContent = userInitial;
    content.querySelector("[data-profile-name]").textContent = userName;
    content.querySelector(".phone-log-export").addEventListener("click", () => {
      this.renderLogExport(content);
    });
    content.querySelectorAll("[data-setting]").forEach((input) => {
      input.checked = game.settings.get(MODULE_ID, input.dataset.setting);
      input.addEventListener("change", () => {
        game.settings.set(MODULE_ID, input.dataset.setting, input.checked);
      });
    });
  },

  // 로그 내보내기: GM은 참여 여부와 무관하게 전체 방, 플레이어는 자기 참여 방만.
  // (귓속말의 인게임 비공개는 유지하고, 기록 정리 용도로만 GM 전체 열람을 허용하는 결정)
  collectExportRooms() {
    if (!game.user.isGM) {
      return Array.from(PhoneStore.rooms.values()).map((room) => ({
        id: room.id,
        name: room.name,
        messages: room.messages.map((entry) => ({
          time: entry.time,
          name: entry.authorName,
          text: entry.text,
          image: entry.image
        }))
      }));
    }

    const rooms = new Map();
    for (const message of game.messages) {
      const flag = message.flags?.[MODULE_ID];
      if (flag?.app !== "bubbletalk" || !flag.roomId) continue;
      // 유저 간 개인톡은 GM 내보내기에서도 제외 — 참여자 본인 내보내기로만 공개 가능
      if (flag.roomId.startsWith("direct:")) continue;
      if (!rooms.has(flag.roomId)) {
        rooms.set(flag.roomId, {
          id: flag.roomId,
          name: this.exportRoomName(flag.roomId, flag),
          messages: []
        });
      }
      const room = rooms.get(flag.roomId);
      if (flag.group?.name) room.name = flag.group.name;
      room.messages.push({
        time: message.timestamp,
        name: message.speaker?.alias || message.author?.name || "?",
        text: message.content,
        image: flag.image ?? null
      });
    }
    return Array.from(rooms.values());
  },

  exportRoomName(roomId, flag) {
    if (flag.group?.name) return flag.group.name;
    const [kind, first, second] = roomId.split(":");
    if (kind === "npc") {
      const actor = game.actors.get(first)?.name ?? "?";
      const user = userDisplayName(game.users.get(second));
      return `${actor} ↔ ${user}`;
    }
    const userA = userDisplayName(game.users.get(first));
    const userB = userDisplayName(game.users.get(second));
    return `${userA} ↔ ${userB}`;
  },

  renderLogExport(content) {
    const rooms = this.collectExportRooms()
      .sort((a, b) => (b.messages.at(-1)?.time ?? 0) - (a.messages.at(-1)?.time ?? 0));

    content.innerHTML = `
      <header class="phone-page-header">
        <p>설정</p><h2>대화 로그 내보내기</h2>
        <button class="phone-log-back" type="button" aria-label="설정으로">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
      </header>
      <div class="phone-note-list">
        ${game.user.isGM ? `
        <button class="phone-log-full" type="button">
          <strong>전체 통합 로그</strong>
          <span>기본 채팅 + NPC 방을 시간순으로 한 파일에 (방 라벨 포함)</span>
        </button>
        <label class="phone-log-option">
          <input type="checkbox" name="includeGroups"> 통합 로그에 단체톡 포함
        </label>` : ""}
        ${rooms.length ? rooms.map((room, index) => `
          <button type="button" data-export-index="${index}">
            <strong>${esc(room.name)}</strong>
            <span>메시지 ${room.messages.length}개 · 누르면 txt로 저장</span>
            <time>${esc(formatTime(room.messages.at(-1)?.time))}</time>
          </button>`).join("")
        : `<div class="bubbletalk-empty"><i class="fa-regular fa-file-lines"></i><p>내보낼 대화가 없습니다.</p></div>`}
      </div>
    `;

    content.querySelector(".phone-log-back").addEventListener("click", () => this.renderSettings(content));
    content.querySelector(".phone-log-full")?.addEventListener("click", () => {
      const includeGroups = content.querySelector('input[name="includeGroups"]')?.checked ?? false;
      this.downloadFullLog(includeGroups);
    });
    content.querySelectorAll("[data-export-index]").forEach((button) => {
      button.addEventListener("click", () => {
        this.downloadRoomLog(rooms[Number(button.dataset.exportIndex)]);
      });
    });
  },

  // GM 전용: 기본 채팅과 버블톡 방을 시간순으로 합친 통합 로그(HTML).
  // 라벨 대신 방마다 다른 배경색으로 구분한다. 맨 위에 색상 범례.
  downloadFullLog(includeGroups = false) {
    const stamp = (time) => typeof time === "number"
      ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(time))
      : "";
    const stripHTML = (html) => {
      const div = document.createElement("div");
      div.innerHTML = html ?? "";
      return div.textContent.trim();
    };
    const palette = ["#e8f2fb", "#fdf0e4", "#eaf7ea", "#f6ecfa", "#fbeaea", "#f0f4e3"];

    const rooms = new Map(); // roomId → { name, color }
    const roomInfo = (flag) => {
      if (!rooms.has(flag.roomId)) {
        rooms.set(flag.roomId, {
          name: this.exportRoomName(flag.roomId, flag),
          color: palette[rooms.size % palette.length]
        });
      }
      if (flag.group?.name) rooms.get(flag.roomId).name = flag.group.name;
      return rooms.get(flag.roomId);
    };

    const sorted = Array.from(game.messages).sort((a, b) => a.timestamp - b.timestamp);
    const lines = sorted.map((message) => {
      const flag = message.flags?.[MODULE_ID];
      // 유저 간 개인톡은 통합 로그에서도 제외, 단체톡은 옵션
      if (flag?.roomId?.startsWith("direct:")) return null;
      if (!includeGroups && flag?.roomId?.startsWith("group:")) return null;

      const isPhone = flag?.app === "bubbletalk" && flag.roomId;
      const color = isPhone ? roomInfo(flag).color : null;
      const name = message.speaker?.alias || message.author?.name || "?";
      const imageNote = flag?.image ? ` <em>[사진: ${esc(flag.image)}]</em>` : "";
      return `<p class="line"${color ? ` style="background:${color}"` : ""}>`
        + `<time>${stamp(message.timestamp)}</time>`
        + `<b>${esc(name)}</b>${esc(stripHTML(message.content))}${imageNote}</p>`;
    }).filter(Boolean);

    const legend = rooms.size
      ? `<div class="legend">${Array.from(rooms.values())
          .map((room) => `<span><i style="background:${room.color}"></i>${esc(room.name)}</span>`)
          .join("")}</div>`
      : "";

    const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>세션 로그</title>
<style>
  body { max-width: 760px; margin: 32px auto; padding: 0 16px;
    font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    line-height: 1.7; color: #222; }
  h1 { font-size: 20px; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; margin: 10px 0 22px;
    font-size: 13px; color: #555; }
  .legend i { display: inline-block; width: 12px; height: 12px; margin-right: 5px;
    border-radius: 3px; vertical-align: -1px; }
  .line { margin: 2px 0; padding: 3px 10px; border-radius: 7px; }
  .line time { margin-right: 8px; color: #9aa3a8; font-size: 11px; }
  .line b { margin-right: 7px; }
</style></head><body>
<h1>세션 로그</h1>
${legend}
${lines.join("\n")}
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mythphone-session-log.html";
    link.click();
    URL.revokeObjectURL(url);
  },

  downloadRoomLog(room) {
    const stamp = (time) => typeof time === "number"
      ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(time))
      : "";
    const lines = room.messages.map((entry) => `[${stamp(entry.time)}] ${entry.name}: ${entry.text ?? ""}${entry.image ? ` [사진: ${entry.image}]` : ""}`);
    const blob = new Blob([`# ${room.name}\n\n${lines.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mythphone-${room.id.replaceAll(":", "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  },
};
