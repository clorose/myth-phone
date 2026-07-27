import { escapeHTML as esc, formatTime, formatDuration, debug, userDisplayName } from "./utils.js";
import { PhoneStore } from "./store.js";
import { PhoneSocket } from "./socket.js";
import { gmEditorMethods } from "./apps/gm-editor.js";
import { phoneMethods } from "./apps/phone.js";
import { chatMethods } from "./apps/chat.js";
import { emailMethods } from "./apps/email.js";

const MODULE_ID = "myth-phone";

class SmartphoneShell {
  static phone;
  static wrapper;
  static clockTimer;
  static callTimer;
  static callSceneTimers = [];
  static callSeconds = 0;
  static ringtoneTimer;
  static ringtoneGeneration = 0;
  static audioContext;
  static openBubbleRoomId = null;

  // 데이터는 PhoneStore가 원본. 기존 렌더러 호환용 접근자.
  static get callScenes() {
    return PhoneStore.callScenes;
  }

  static get messageData() {
    return PhoneStore.data;
  }

  static mount() {
    if (document.querySelector("#fvtt-smartphone")) return;

    const wrapper = document.createElement("div");
    wrapper.id = "fvtt-smartphone";
    wrapper.innerHTML = `
      <button class="smartphone-launcher" type="button" aria-label="스마트폰 열기">
        <i class="fa-solid fa-mobile-screen-button"></i>
      </button>

      <section class="smartphone-device" aria-label="스마트폰" aria-hidden="true">
        <div class="smartphone-frame">
          <header class="smartphone-status">
            <time class="smartphone-clock">00:00</time>
            <span class="smartphone-status-icons" aria-hidden="true">
              <i class="fa-solid fa-signal"></i>
              <i class="fa-solid fa-wifi"></i>
              <i class="fa-solid fa-battery-three-quarters"></i>
            </span>
          </header>

          <main class="smartphone-screen">
            <div class="smartphone-wallpaper">
              <p class="smartphone-date"></p>
              <h1 class="smartphone-hero-clock">00:00</h1>
            </div>

            <div class="smartphone-app-grid">
              <button type="button" data-app="messages">
                <span class="smartphone-app-icon messages"><i class="fa-solid fa-comment"></i></span>
                <span>메시지</span>
              </button>
              <button type="button" data-app="bubbletalk">
                <span class="smartphone-app-icon bubbletalk bubbletalk-icon" aria-hidden="true">
                  <span class="bubbletalk-bubble is-large"></span>
                  <span class="bubbletalk-bubble is-small"></span>
                </span>
                <span>버블톡</span>
              </button>
              <button type="button" data-app="email">
                <span class="smartphone-app-icon email"><i class="fa-solid fa-envelope"></i></span>
                <span>이메일</span>
              </button>
              <button type="button" data-app="contacts">
                <span class="smartphone-app-icon contacts"><i class="fa-solid fa-address-book"></i></span>
                <span>연락처</span>
              </button>
              <button type="button" data-app="notes">
                <span class="smartphone-app-icon notes"><i class="fa-solid fa-note-sticky"></i></span>
                <span>메모</span>
              </button>
              <button type="button" data-app="settings">
                <span class="smartphone-app-icon settings"><i class="fa-solid fa-gear"></i></span>
                <span>설정</span>
              </button>
              ${game.user.isGM ? `
              <button type="button" data-app="gm-editor">
                <span class="smartphone-app-icon gm-editor"><i class="fa-solid fa-user-pen"></i></span>
                <span>연출 편집</span>
              </button>` : ""}
            </div>

            <div class="smartphone-dock" aria-label="즐겨찾기">
              <button type="button" data-app="phone" aria-label="전화">
                <span class="smartphone-app-icon calls"><i class="fa-solid fa-phone"></i></span>
              </button>
              <button type="button" data-app="browser" aria-label="브라우저">
                <span class="smartphone-app-icon browser"><i class="fa-solid fa-compass"></i></span>
              </button>
              <button type="button" aria-label="카메라">
                <span class="smartphone-app-icon camera"><i class="fa-solid fa-camera"></i></span>
              </button>
              <button type="button" aria-label="음악">
                <span class="smartphone-app-icon music"><i class="fa-solid fa-music"></i></span>
              </button>
            </div>

            <section class="smartphone-app-view" hidden>
              <button class="smartphone-back" type="button" aria-label="홈으로 돌아가기">
                <i class="fa-solid fa-chevron-left"></i>
              </button>
              <div class="smartphone-app-content"></div>
            </section>
          </main>

          <footer class="smartphone-navigation">
            <button class="smartphone-home" type="button" aria-label="홈"></button>
          </footer>
        </div>
      </section>
    `;

    document.body.append(wrapper);
    this.wrapper = wrapper;
    this.phone = wrapper.querySelector(".smartphone-device");
    this.bindEvents(wrapper);
    this.updateClock(wrapper);
    this.clockTimer = window.setInterval(() => this.updateClock(wrapper), 30_000);
  }

  static bindEvents(wrapper) {
    wrapper.querySelector(".smartphone-launcher").addEventListener("click", () => {
      const isOpen = this.phone.classList.toggle("is-open");
      this.phone.setAttribute("aria-hidden", String(!isOpen));
    });

    this.phone.addEventListener("click", (event) => {
      if (event.target === this.phone) this.close();
    });

    wrapper.querySelectorAll("[data-app]").forEach((button) => {
      button.addEventListener("click", () => this.openApp(wrapper, button.dataset.app));
    });

    wrapper.querySelector(".smartphone-back").addEventListener("click", () => this.showHome(wrapper));
    wrapper.querySelector(".smartphone-home").addEventListener("click", () => this.showHome(wrapper));

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.phone.classList.contains("is-open")) this.close();
    });
  }

  static openApp(wrapper, app) {
    const view = wrapper.querySelector(".smartphone-app-view");
    wrapper.querySelector(".smartphone-wallpaper").hidden = true;
    wrapper.querySelector(".smartphone-app-grid").hidden = true;
    wrapper.querySelector(".smartphone-dock").hidden = true;
    view.hidden = false;
    view.dataset.app = app;
    this.renderApp(wrapper, app);
  }

  static renderApp(wrapper, app) {
    this.stopCallTimer();
    this.stopRingtone();
    const content = wrapper.querySelector(".smartphone-app-content");
    const renderers = {
      messages: () => this.renderMessages(content),
      bubbletalk: () => this.renderBubbleTalk(content),
      phone: () => this.renderPhone(content),
      browser: () => this.renderBrowser(content),
      email: () => this.renderEmail(content),
      contacts: () => this.renderContacts(content),
      notes: () => this.renderNotes(content),
      settings: () => this.renderSettings(content),
      "gm-editor": () => this.renderGmEditor(content)
    };
    renderers[app]?.();
  }

  static browserSites() {
    return game.settings.get(MODULE_ID, "sites") ?? [];
  }

  static renderBrowser(content) {
    content.closest(".smartphone-app-view")?.classList.remove("is-chat-open");
    const sites = this.browserSites();

    content.innerHTML = `
      <header class="phone-page-header">
        <p>브라우저</p><h2>홈</h2>
        ${game.user.isGM ? `
        <button class="phone-site-add" type="button" aria-label="사이트 등록">
          <i class="fa-solid fa-plus"></i>
        </button>` : ""}
      </header>
      <form class="phone-browser-bar">
        <i class="fa-solid fa-lock" aria-hidden="true"></i>
        <input name="address" type="text" placeholder="주소 입력" autocomplete="off"
          aria-label="주소 입력">
        <button type="submit" aria-label="이동"><i class="fa-solid fa-arrow-right"></i></button>
      </form>
      <div class="phone-site-list">
        ${sites.length ? sites.map((site, index) => `
          <button class="phone-site" type="button" data-site-index="${index}">
            <span class="phone-avatar">${esc(Array.from(site.label ?? "?")[0])}</span>
            <span class="phone-site-copy">
              <strong>${esc(site.label ?? site.url)}</strong>
              <small>${esc(site.url)}</small>
            </span>
            ${game.user.isGM ? `
            <i class="fa-solid fa-trash" data-site-delete="${index}" aria-label="삭제"></i>` : ""}
          </button>`).join("")
        : `<div class="bubbletalk-empty"><i class="fa-solid fa-compass"></i><p>등록된 사이트가 없습니다.</p></div>`}
      </div>
    `;

    content.querySelector(".phone-browser-bar").addEventListener("submit", (event) => {
      event.preventDefault();
      const address = event.currentTarget.elements.address.value.trim();
      if (address) this.renderBrowserPage(content, address);
    });
    content.querySelectorAll(".phone-site").forEach((button) => {
      button.addEventListener("click", (event) => {
        const remove = event.target.closest("[data-site-delete]");
        if (remove) {
          const sites = this.browserSites().slice();
          sites.splice(Number(remove.dataset.siteDelete), 1);
          game.settings.set(MODULE_ID, "sites", sites).then(() => this.renderBrowser(content));
          return;
        }
        const site = this.browserSites()[Number(button.dataset.siteIndex)];
        if (site) this.renderBrowserPage(content, site.url);
      });
    });
    content.querySelector(".phone-site-add")?.addEventListener("click", () => {
      this.renderSiteForm(content);
    });
  }

  static renderSiteForm(content) {
    content.innerHTML = `
      <header class="phone-page-header">
        <p>브라우저</p><h2>사이트 등록</h2>
        <button class="phone-site-cancel" type="button" aria-label="닫기">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>
      <form class="phone-outgoing-form phone-site-form">
        <label>이름
          <input name="label" type="text" maxlength="30" placeholder="예: 데일리 뉴스" required>
        </label>
        <label>주소
          <input name="url" type="text" placeholder="worlds/월드명/sites/news.html" required>
        </label>
        <div class="phone-outgoing-actions">
          <button class="is-cancel" type="button">취소</button>
          <button class="is-send" type="submit">등록</button>
        </div>
      </form>
    `;

    const done = () => this.renderBrowser(content);
    content.querySelector(".phone-site-cancel").addEventListener("click", done);
    content.querySelector(".is-cancel").addEventListener("click", done);
    content.querySelector(".phone-site-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const fields = event.currentTarget.elements;
      const sites = this.browserSites().slice();
      sites.push({ label: fields.label.value.trim(), url: fields.url.value.trim() });
      await game.settings.set(MODULE_ID, "sites", sites);
      done();
    });
  }

  static renderBrowserPage(content, url) {
    debug(`브라우저 이동: ${url}`);
    content.innerHTML = `
      <header class="phone-browser-header">
        <button class="phone-browser-back" type="button" aria-label="브라우저 홈">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="phone-browser-url"><i class="fa-solid fa-lock"></i> ${esc(url)}</span>
      </header>
      <iframe class="phone-browser-frame" src="${esc(url)}" title="페이지"
        sandbox="allow-scripts allow-same-origin"></iframe>
    `;
    content.querySelector(".phone-browser-back").addEventListener("click", () => {
      this.renderBrowser(content);
    });
  }

  static renderContacts(content) {
    const users = game.users.filter((user) => user.id !== game.user.id);
    const npcContacts = game.actors.filter((actor) => actor.getFlag(MODULE_ID, "contact"));

    content.innerHTML = `
      <header class="phone-page-header">
        <p>연락처</p><h2>연락처</h2>
        ${game.user.isGM ? `
        <button class="phone-contact-add" type="button" aria-label="캐릭터 연락처 추가">
          <i class="fa-solid fa-user-plus"></i>
        </button>` : ""}
      </header>
      <label class="phone-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" placeholder="이름 또는 번호 검색" aria-label="연락처 검색">
      </label>
      <div class="phone-contact-list">
        ${users.map((user) => `
          <article class="phone-contact" data-name="${esc(userDisplayName(user))}">
            <span class="phone-avatar">${esc(Array.from(userDisplayName(user))[0].toLocaleUpperCase())}</span>
            <span><strong>${esc(userDisplayName(user))}</strong><small>${user.isGM ? "GM" : user.active ? "접속 중" : "오프라인"}</small></span>
            <button type="button" data-chat-room="${PhoneStore.directRoomId(game.user.id, user.id)}"
              aria-label="${esc(user.name)}에게 메시지"><i class="fa-solid fa-comment"></i></button>
          </article>`).join("")}
        ${npcContacts.map((actor) => {
          const contact = actor.getFlag(MODULE_ID, "contact") ?? {};
          return `
          <article class="phone-contact" data-name="${esc(actor.name)} ${esc(contact.number ?? "")}">
            <span class="phone-avatar">${esc(Array.from(actor.name)[0])}</span>
            <span><strong>${esc(actor.name)}</strong><small>${esc(contact.number || "번호 없음")}</small></span>
            ${game.user.isGM ? `
            <button type="button" data-edit-actor="${actor.id}" aria-label="연락처 편집">
              <i class="fa-solid fa-pen"></i>
            </button>` : `
            <button type="button" data-chat-room="${PhoneStore.npcRoomId(actor.id, game.user.id)}"
              aria-label="${esc(actor.name)}에게 메시지"><i class="fa-solid fa-comment"></i></button>`}
          </article>`;
        }).join("")}
      </div>
    `;

    const search = content.querySelector("input[type=search]");
    search.addEventListener("input", () => {
      const query = search.value.trim().toLocaleLowerCase();
      content.querySelectorAll(".phone-contact").forEach((item) => {
        item.hidden = !item.dataset.name.toLocaleLowerCase().includes(query);
      });
    });

    content.querySelectorAll("[data-chat-room]").forEach((button) => {
      button.addEventListener("click", () => {
        const view = content.closest(".smartphone-app-view");
        if (view) view.dataset.app = "bubbletalk";
        this.renderBubbleTalkChat(content, button.dataset.chatRoom);
      });
    });
    content.querySelector(".phone-contact-add")?.addEventListener("click", () => {
      this.renderContactForm(content);
    });
    content.querySelectorAll("[data-edit-actor]").forEach((button) => {
      button.addEventListener("click", () => {
        this.renderContactForm(content, button.dataset.editActor);
      });
    });
  }

  static renderContactForm(content, actorId = null) {
    const editing = actorId ? game.actors.get(actorId) : null;
    const current = editing?.getFlag(MODULE_ID, "contact") ?? {};
    const actors = this.npcActors().filter((actor) => !actor.getFlag(MODULE_ID, "contact"));

    content.innerHTML = `
      <header class="phone-page-header">
        <p>연락처</p><h2>${editing ? "연락처 수정" : "캐릭터 연락처 추가"}</h2>
        <button class="phone-contact-cancel" type="button" aria-label="닫기">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>
      <form class="phone-outgoing-form phone-contact-form">
        <label>캐릭터
          ${editing
            ? `<input type="text" value="${esc(editing.name)}" disabled>`
            : `<select name="actorId">
                ${actors.map((actor) => `<option value="${actor.id}">${esc(actor.name)}</option>`).join("")}
              </select>`}
        </label>
        <label>전화번호
          <input name="number" type="text" maxlength="20" placeholder="010-0000-0000"
            value="${esc(current.number ?? "")}">
        </label>
        <div class="phone-outgoing-actions">
          ${editing ? `<button class="is-delete" type="button">삭제</button>` : ""}
          <button class="is-cancel" type="button">취소</button>
          <button class="is-send" type="submit">저장</button>
        </div>
      </form>
    `;

    const done = () => this.renderContacts(content);
    content.querySelector(".phone-contact-cancel").addEventListener("click", done);
    content.querySelector(".is-cancel").addEventListener("click", done);
    content.querySelector(".is-delete")?.addEventListener("click", async () => {
      await editing.unsetFlag(MODULE_ID, "contact");
      done();
    });
    content.querySelector(".phone-contact-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const fields = event.currentTarget.elements;
      const actor = editing ?? game.actors.get(fields.actorId?.value);
      if (!actor) {
        ui.notifications.warn("등록할 캐릭터가 없습니다.");
        return;
      }
      await actor.setFlag(MODULE_ID, "contact", { number: fields.number.value.trim() });
      done();
    });
  }

  static renderNotes(content) {
    content.innerHTML = `
      <header class="phone-page-header">
        <p>메모</p><h2>내 메모</h2>
        <button type="button" aria-label="새 메모"><i class="fa-solid fa-square-plus"></i></button>
      </header>
      <div class="phone-note-list">
        <button type="button"><strong>사건 기록</strong><span>창고 열쇠는 경비실에 있다.</span><time>오늘</time></button>
        <button type="button"><strong>확인할 것</strong><span>검은 차량 번호 37가 1428</span><time>어제</time></button>
        <button type="button"><strong>비밀번호</strong><span>두 번째 숫자는 9</span><time>7월 21일</time></button>
      </div>
    `;
  }

  static renderSettings(content) {
    const userName = game.user?.name?.trim() || "플레이어";
    const userInitial = Array.from(userName)[0]?.toLocaleUpperCase() || "P";

    content.innerHTML = `
      <header class="phone-page-header"><p>설정</p><h2>스마트폰 설정</h2></header>
      <div class="phone-profile">
        <span class="phone-avatar" data-profile-initial></span>
        <span><strong data-profile-name></strong><small>내 스마트폰</small></span>
      </div>
      <div class="phone-settings-list">
        <label><span><i class="fa-solid fa-bell"></i> 알림</span><input type="checkbox" checked></label>
        <label><span><i class="fa-solid fa-volume-high"></i> 메시지 소리</span><input type="checkbox" checked></label>
        <label><span><i class="fa-solid fa-eye"></i> 미리보기</span><input type="checkbox" checked></label>
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
  }

  // 로그 내보내기: GM은 참여 여부와 무관하게 전체 방, 플레이어는 자기 참여 방만.
  // (귓속말의 인게임 비공개는 유지하고, 기록 정리 용도로만 GM 전체 열람을 허용하는 결정)
  static collectExportRooms() {
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
  }

  static exportRoomName(roomId, flag) {
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
  }

  static renderLogExport(content) {
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
  }

  // GM 전용: 기본 채팅과 버블톡 방을 시간순으로 합친 통합 로그(HTML).
  // 라벨 대신 방마다 다른 배경색으로 구분한다. 맨 위에 색상 범례.
  static downloadFullLog(includeGroups = false) {
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
  }

  static downloadRoomLog(room) {
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
  }

  static showHome(wrapper) {
    this.stopCallTimer();
    this.stopRingtone();
    this.openBubbleRoomId = null;
    wrapper.querySelector(".smartphone-app-view").classList.remove("is-chat-open");
    wrapper.querySelector(".smartphone-app-view").classList.remove("is-call-screen");
    wrapper.querySelector(".smartphone-wallpaper").hidden = false;
    wrapper.querySelector(".smartphone-app-grid").hidden = false;
    wrapper.querySelector(".smartphone-dock").hidden = false;
    wrapper.querySelector(".smartphone-app-view").hidden = true;
  }

  static updateClock(wrapper) {
    const now = new Date();
    wrapper.querySelector(".smartphone-clock").textContent =
      new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    wrapper.querySelector(".smartphone-hero-clock").textContent =
      new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    wrapper.querySelector(".smartphone-date").textContent =
      new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(now);
  }

  static close() {
    this.stopCallTimer();
    this.stopRingtone();
    this.phone?.classList.remove("is-open");
    this.phone?.setAttribute("aria-hidden", "true");
  }
}

Object.assign(SmartphoneShell, gmEditorMethods);
Object.assign(SmartphoneShell, phoneMethods);
Object.assign(SmartphoneShell, chatMethods);
Object.assign(SmartphoneShell, emailMethods);

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "sites", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
  // 연출 편집기 정본 데이터 (GM이 편집, 플레이어는 읽기만)
  game.settings.register(MODULE_ID, "messages", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
  game.settings.register(MODULE_ID, "emails", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
  game.settings.register(MODULE_ID, "seeded", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
  game.settings.register(MODULE_ID, "debugLog", {
    name: "디버그 로그",
    hint: "소켓 송수신 등 내부 동작을 콘솔과 화면 알림으로 표시합니다.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
});

Hooks.once("ready", () => {
  PhoneSocket.register();
  PhoneSocket.on("incoming-call", (payload) => SmartphoneShell.receiveIncomingCall(payload));
  PhoneSocket.on("call-result", (payload) => {
    if (!game.user.isGM) return;
    ui.notifications.info(`MythPhone | ${payload.targetName}: ${payload.callerName} 전화 ${payload.result}`);
  });

  Hooks.on("createChatMessage", (message) => PhoneStore.addChatMessage(message));
  PhoneStore.on("bubbletalk-message", ({ room, entry }) =>
    SmartphoneShell.onBubbleTalkMessage(room, entry));
  PhoneStore.on("unread-changed", () => SmartphoneShell.updateAppBadges());
  Hooks.on("updateUser", (user, changes) => {
    if (!foundry.utils.getProperty(changes, `flags.${MODULE_ID}.lastRead`)) return;
    SmartphoneShell.refreshOpenChatLog();
  });
  Hooks.on("updateSetting", (setting) => {
    const kind = ["messages", "emails"].find((key) => setting.key === `${MODULE_ID}.${key}`);
    if (!kind) return;
    PhoneStore.data[kind] = game.settings.get(MODULE_ID, kind) ?? [];
    SmartphoneShell.refreshOpenEditorApps();
  });

  PhoneStore.load()
    .then(() => {
      PhoneStore.buildRooms();
      PhoneStore.loadCallLog();
      SmartphoneShell.mount();
      SmartphoneShell.updateAppBadges();
      console.info(`${MODULE_ID} | MythPhone 인터페이스를 준비했습니다.`);
    })
    .catch((error) => {
      console.error(`${MODULE_ID} | MythPhone 초기화에 실패했습니다.`, error);
      ui.notifications.error("MythPhone 데이터를 불러오지 못했습니다.");
    });
});
