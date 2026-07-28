import { escapeHTML as esc, formatTime, formatDuration, userDisplayName } from "./utils.js";
import { debug, error } from "./log.js";
import { PhoneStore } from "./store.js";
import { PhoneSocket } from "./socket.js";
import { GmEditorWindow } from "./apps/gm-editor-window.js";
import { phoneMethods } from "./apps/phone.js";
import { chatMethods } from "./apps/chat.js";
import { emailMethods } from "./apps/email.js";
import { browserMethods } from "./apps/browser.js";
import { contactsMethods } from "./apps/contacts.js";
import { notesMethods } from "./apps/notes.js";
import { settingsMethods } from "./apps/settings.js";

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
      settings: () => this.renderSettings(content)
    };
    renderers[app]?.();
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
    if (!wrapper) return;
    const now = new Date();
    const clock = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    wrapper.querySelector(".smartphone-clock").textContent = clock;
    wrapper.querySelector(".smartphone-hero-clock").textContent = clock;
    // 시계는 시계로 남기고, 잠금화면 날짜 줄만 게임 내 날짜로 바꿔치기한다
    const gameDate = game.settings.get(MODULE_ID, "gameDate");
    wrapper.querySelector(".smartphone-date").textContent = gameDate?.m && gameDate?.d
      ? `${gameDate.m}월 ${gameDate.d}일`
      : new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(now);
  }

  static close() {
    this.stopCallTimer();
    this.stopRingtone();
    this.phone?.classList.remove("is-open");
    this.phone?.setAttribute("aria-hidden", "true");
  }

  // GM이 연출 정본(messages·emails)을 바꾸면 열려 있는 플레이어 목록 화면을 갱신한다.
  // (대화 스레드를 열어둔 중이면 화면을 뒤엎지 않는다.)
  static refreshOpenPlayerData() {
    if (!this.wrapper) return;
    const view = this.wrapper.querySelector(".smartphone-app-view");
    if (!view || view.hidden) return;
    if (!["messages", "email"].includes(view.dataset.app)) return;
    if (view.classList.contains("is-chat-open")) return;
    this.renderApp(this.wrapper, view.dataset.app);
  }
}

Object.assign(SmartphoneShell, phoneMethods);
Object.assign(SmartphoneShell, chatMethods);
Object.assign(SmartphoneShell, emailMethods);
Object.assign(SmartphoneShell, browserMethods);
Object.assign(SmartphoneShell, contactsMethods);
Object.assign(SmartphoneShell, notesMethods);
Object.assign(SmartphoneShell, settingsMethods);

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
  // 게임 내 날짜 { m, d }. null = 미설정(폰 시계는 현실 시간).
  game.settings.register(MODULE_ID, "gameDate", {
    scope: "world",
    config: false,
    type: Object,
    default: null
  });
  // 알림 설정 (클라이언트별 개인 취향)
  game.settings.register(MODULE_ID, "notifEnabled", {
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, "notifSound", {
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, "notifPreview", {
    scope: "client",
    config: false,
    type: Boolean,
    default: true
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
  PhoneSocket.on("staged-send", (payload) => SmartphoneShell.onStagedDelivery(payload));

  Hooks.on("createChatMessage", (message) => PhoneStore.addChatMessage(message));
  PhoneStore.on("bubbletalk-message", ({ room, entry }) =>
    SmartphoneShell.onBubbleTalkMessage(room, entry));
  PhoneStore.on("unread-changed", () => SmartphoneShell.updateAppBadges());
  Hooks.on("updateUser", (user, changes) => {
    if (!foundry.utils.getProperty(changes, `flags.${MODULE_ID}.lastRead`)) return;
    SmartphoneShell.refreshOpenChatLog();
  });
  Hooks.on("updateSetting", (setting) => {
    if (setting.key === `${MODULE_ID}.gameDate`) {
      // 날짜가 넘어가면 시계와 열린 목록의 오늘/어제 라벨을 즉시 갱신
      SmartphoneShell.updateClock(SmartphoneShell.wrapper);
      SmartphoneShell.refreshOpenPlayerData();
      GmEditorWindow.refreshIfOpen();
      return;
    }
    const kind = ["messages", "emails"].find((key) => setting.key === `${MODULE_ID}.${key}`);
    if (!kind) return;
    PhoneStore.data[kind] = game.settings.get(MODULE_ID, kind) ?? [];
    SmartphoneShell.refreshOpenPlayerData();  // 플레이어 폰의 목록 화면
    GmEditorWindow.refreshIfOpen();           // 다른 GM이 열어둔 편집 창
  });

  // 다른 매크로·콘솔에서 편집기를 열 수 있는 폴백 API (좌측 버튼이 안 뜰 때 대비)
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { openGmEditor: () => GmEditorWindow.open() };

  PhoneStore.load()
    .then(() => {
      PhoneStore.buildRooms();
      PhoneStore.loadCallLog();
      SmartphoneShell.mount();
      SmartphoneShell.updateAppBadges();
      debug("MythPhone 인터페이스를 준비했습니다.");
    })
    .catch((err) => {
      error("MythPhone 초기화에 실패했습니다.", err);
      ui.notifications.error("MythPhone 데이터를 불러오지 못했습니다.");
    });
});

// 좌측 Scene Controls의 토큰 컨트롤 안에 GM 전용 "GM툴" 버튼 툴을 넣는다 (v14 record 구조).
// 별도 그룹으로 만들지 않는 이유: 그룹이면 ①그룹 아이콘+툴 아이콘이 같은 모양으로 2개 보이고
// ②activeTool로 활성화된 버튼 툴은 재클릭 이벤트가 안 와 창을 닫으면 다시 못 연다.
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM || !controls.tokens) return;
  controls.tokens.tools["myth-phone-gm"] = {
    name: "myth-phone-gm",
    title: "MythPhone GM툴",
    icon: "fa-solid fa-user-pen",
    order: 100,
    button: true,
    onChange: () => GmEditorWindow.open(),
  };
});
