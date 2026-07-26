import { escapeHTML as esc, formatTime, formatDuration, debug, userDisplayName } from "./utils.js";
import { PhoneStore } from "./store.js";
import { PhoneSocket } from "./socket.js";

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

  static renderPhone(content) {
    this.stopCallTimer();
    this.stopRingtone();
    content.closest(".smartphone-app-view")?.classList.remove("is-chat-open", "is-call-screen");
    content.innerHTML = `
      <header class="phone-page-header phone-dialer-header">
        <p>전화</p>
        <h2>최근 통화</h2>
        <button class="phone-test-call" type="button" aria-label="테스트 전화 받기">
          <i class="fa-solid fa-phone-volume"></i>
        </button>
      </header>
      ${game.user.isGM ? `
      <button class="phone-outgoing-call" type="button">
        <i class="fa-solid fa-headset"></i> 캐릭터로 전화 걸기
      </button>` : ""}
      <div class="phone-recent-list">
        ${PhoneStore.callLog.map((entry) => this.callHistoryItem(
          esc(entry.name),
          esc(entry.number ?? "MythPhone"),
          `${entry.result} 통화`,
          formatTime(entry.time),
          esc(entry.initial),
          entry.result !== "수신"
        )).join("")}
        ${this.callHistoryItem("의문의 남자", "발신번호 표시제한", "부재중", "오후 10:31", "?", true)}
        ${this.callHistoryItem("지아", "010-1234-5678", "수신 통화", "오후 8:12", "J")}
        ${this.callHistoryItem("정비소", "02-555-0182", "발신 통화", "어제", "修")}
      </div>
      <nav class="phone-dialer-tabs" aria-label="전화 메뉴">
        <button type="button" data-phone-tab="favorites">
          <i class="fa-solid fa-star"></i><span>즐겨찾기</span>
        </button>
        <button class="is-active" type="button" data-phone-tab="recents" aria-current="page">
          <i class="fa-solid fa-clock-rotate-left"></i><span>최근 통화</span>
        </button>
        <button type="button" data-phone-tab="contacts">
          <i class="fa-solid fa-address-book"></i><span>연락처</span>
        </button>
        <button type="button" data-phone-tab="keypad">
          <i class="fa-solid fa-grip"></i><span>키패드</span>
        </button>
      </nav>
    `;

    content.querySelector(".phone-test-call").addEventListener("click", () => {
      this.renderIncomingCall(content, "hacker-ambush");
    });
    content.querySelector(".phone-outgoing-call")?.addEventListener("click", () => {
      this.renderOutgoingCallForm(content);
    });
    content.querySelector('[data-phone-tab="keypad"]').addEventListener("click", () => this.renderPhoneKeypad(content));
    content.querySelector('[data-phone-tab="contacts"]').addEventListener("click", () => this.renderContacts(content));
  }

  static callHistoryItem(name, number, type, time, initial, missed = false) {
    return `
      <button class="phone-recent-call${missed ? " is-missed" : ""}" type="button">
        <span class="phone-avatar">${initial}</span>
        <span class="phone-recent-copy">
          <strong>${name}</strong>
          <small><i class="fa-solid fa-phone"></i> ${type} · ${number}</small>
        </span>
        <time>${time}</time>
        <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
      </button>
    `;
  }

  static renderPhoneKeypad(content) {
    content.innerHTML = `
      <header class="phone-page-header phone-dialer-header">
        <p>전화</p><h2>키패드</h2>
      </header>
      <div class="phone-keypad">
        <output class="phone-dialed-number" aria-live="polite"></output>
        <div class="phone-keypad-grid">
          ${[
            ["1", ""], ["2", "ABC"], ["3", "DEF"],
            ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
            ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
            ["*", ""], ["0", "+"], ["#", ""]
          ].map(([number, letters]) => `
            <button type="button" data-digit="${number}">
              <strong>${number}</strong><small>${letters}</small>
            </button>
          `).join("")}
        </div>
        <div class="phone-keypad-actions">
          <span></span>
          <button class="phone-keypad-call" type="button" aria-label="전화 걸기">
            <i class="fa-solid fa-phone"></i>
          </button>
          <button class="phone-keypad-delete" type="button" aria-label="한 글자 지우기">
            <i class="fa-solid fa-delete-left"></i>
          </button>
        </div>
      </div>
      <nav class="phone-dialer-tabs" aria-label="전화 메뉴">
        <button type="button">
          <i class="fa-solid fa-star"></i><span>즐겨찾기</span>
        </button>
        <button type="button" data-phone-tab="recents">
          <i class="fa-solid fa-clock-rotate-left"></i><span>최근 통화</span>
        </button>
        <button type="button" data-phone-tab="contacts">
          <i class="fa-solid fa-address-book"></i><span>연락처</span>
        </button>
        <button class="is-active" type="button" aria-current="page">
          <i class="fa-solid fa-grip"></i><span>키패드</span>
        </button>
      </nav>
    `;

    const output = content.querySelector(".phone-dialed-number");
    content.querySelectorAll("[data-digit]").forEach((button) => {
      button.addEventListener("click", () => {
        if (output.textContent.length < 16) output.textContent += button.dataset.digit;
      });
    });
    content.querySelector(".phone-keypad-delete").addEventListener("click", () => {
      output.textContent = output.textContent.slice(0, -1);
    });
    content.querySelector('[data-phone-tab="recents"]').addEventListener("click", () => this.renderPhone(content));
    content.querySelector('[data-phone-tab="contacts"]').addEventListener("click", () => this.renderContacts(content));
  }

  static npcActors() {
    return game.actors.filter((actor) => !actor.hasPlayerOwner);
  }

  static renderOutgoingCallForm(content) {
    const actors = this.npcActors();
    const players = game.users.filter((user) => user.active && !user.isGM);
    const scenes = Array.from(this.callScenes.values());

    content.innerHTML = `
      <header class="phone-page-header phone-dialer-header">
        <p>전화</p><h2>캐릭터로 걸기</h2>
      </header>
      <form class="phone-outgoing-form">
        <label>발신 캐릭터
          <select name="actorId">
            ${actors.map((actor) => `<option value="${actor.id}">${esc(actor.name)}</option>`).join("")}
          </select>
        </label>
        <label>대상 플레이어
          <select name="userId">
            ${players.map((user) => `<option value="${user.id}">${esc(userDisplayName(user))}</option>`).join("")}
          </select>
        </label>
        <label>전화 장면
          <select name="sceneId">
            ${scenes.map((scene) => `<option value="${scene.id}">${esc(scene.name ?? scene.id)}</option>`).join("")}
          </select>
        </label>
        <div class="phone-outgoing-actions">
          <button class="is-cancel" type="button">취소</button>
          <button class="is-send" type="submit"><i class="fa-solid fa-phone"></i> 발신</button>
        </div>
      </form>
    `;

    content.querySelector(".is-cancel").addEventListener("click", () => this.renderPhone(content));
    content.querySelector(".phone-outgoing-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const fields = event.currentTarget.elements;
      if (!fields.userId.value) {
        ui.notifications.warn("접속 중인 대상 플레이어가 없습니다.");
        return;
      }

      const actor = game.actors.get(fields.actorId.value);
      const caller = {
        name: actor?.name ?? "알 수 없음",
        initial: Array.from(actor?.name ?? "?")[0].toLocaleUpperCase(),
        number: "발신번호 표시제한"
      };
      PhoneSocket.send("incoming-call", {
        callId: foundry.utils.randomID(),
        targetUserId: fields.userId.value,
        sceneId: fields.sceneId.value,
        caller
      });
      ui.notifications.info(
        `MythPhone | ${caller.name} → ${game.users.get(fields.userId.value)?.name} 발신`
      );
      this.renderPhone(content);
    });
  }

  static receiveIncomingCall(payload) {
    if (payload.targetUserId !== game.user.id) {
      debug(`incoming-call 폐기 (대상 아님: ${payload.targetUserId})`);
      return;
    }
    if (!this.wrapper) return;

    debug(`전화 수신 처리: ${payload.sceneId} (${payload.caller?.name})`);

    this.phone.classList.add("is-open");
    this.phone.setAttribute("aria-hidden", "false");
    this.openApp(this.wrapper, "phone");
    this.renderIncomingCall(
      this.wrapper.querySelector(".smartphone-app-content"),
      payload.sceneId,
      payload
    );
  }

  static logCall(caller, result) {
    PhoneStore.saveCallEntry({
      name: caller.name,
      initial: caller.initial ?? Array.from(caller.name ?? "?")[0],
      number: caller.number,
      time: Date.now(),
      result
    });
  }

  static reportCallResult(payload, caller, result) {
    if (!payload?.callId) return;
    PhoneSocket.send("call-result", {
      callId: payload.callId,
      targetName: game.user.name,
      callerName: caller.name,
      result
    });
  }

  static renderIncomingCall(content, sceneId, payload = null) {
    const scene = this.callScenes.get(sceneId);
    if (!scene) {
      ui.notifications.error(`MythPhone 전화 장면을 찾을 수 없습니다: ${sceneId}`);
      return;
    }

    const caller = payload?.caller ?? scene.caller;
    content.closest(".smartphone-app-view")?.classList.add("is-call-screen");
    content.innerHTML = `
      <section class="phone-incoming-call">
        <p>수신 전화</p>
        <span class="phone-call-avatar">${esc(caller.initial)}</span>
        <h2>${esc(caller.name)}</h2>
        <small>${esc(caller.number)}</small>
        <div class="phone-incoming-actions">
          <button class="is-reject" type="button">
            <i class="fa-solid fa-phone-slash"></i><span>거절</span>
          </button>
          <button class="is-accept" type="button">
            <i class="fa-solid fa-phone"></i><span>응답</span>
          </button>
        </div>
      </section>
    `;

    this.startRingtone();
    content.querySelector(".is-reject").addEventListener("click", () => {
      this.stopRingtone();
      this.logCall(caller, "거절");
      this.reportCallResult(payload, caller, "거절");
      this.renderPhone(content);
    });
    content.querySelector(".is-accept").addEventListener("click", () => {
      this.stopRingtone();
      this.logCall(caller, "수신");
      this.reportCallResult(payload, caller, "수신");
      this.renderActiveCall(content, scene, caller);
    });
  }

  static renderActiveCall(content, scene, caller = scene.caller) {
    this.stopRingtone();
    this.stopCallTimer();
    this.callSeconds = 0;
    content.innerHTML = `
      <section class="phone-active-call">
        <header>
          <span class="phone-call-avatar">${esc(caller.initial)}</span>
          <div>
            <h2>${esc(caller.name)}</h2>
            <time class="phone-call-duration">00:00</time>
          </div>
        </header>
        <div class="phone-call-transcript" aria-live="polite"></div>
        <div class="phone-call-controls">
          <button type="button"><i class="fa-solid fa-microphone-slash"></i><span>음소거</span></button>
          <button type="button"><i class="fa-solid fa-volume-high"></i><span>스피커</span></button>
          <button type="button"><i class="fa-solid fa-grip"></i><span>키패드</span></button>
        </div>
        <button class="phone-hangup" type="button" aria-label="통화 종료">
          <i class="fa-solid fa-phone-slash"></i>
        </button>
      </section>
    `;

    const duration = content.querySelector(".phone-call-duration");
    this.callTimer = window.setInterval(() => {
      this.callSeconds += 1;
      duration.textContent = formatDuration(this.callSeconds);
    }, 1000);

    content.querySelector(".phone-hangup").addEventListener("click", () => this.renderPhone(content));
    this.playCallScene(content, scene, caller);
  }

  static playCallScene(content, scene, caller = scene.caller) {
    scene.beats.forEach((beat) => {
      const timer = window.setTimeout(() => {
        if (!content.querySelector(".phone-active-call")) return;
        if (beat.effect) this.playCallEffect(beat.effect);
        if (beat.type === "end") {
          this.renderCallEnded(content, caller);
          return;
        }

        const transcript = content.querySelector(".phone-call-transcript");
        transcript.querySelector(".is-current")?.classList.remove("is-current");
        const line = document.createElement("p");
        line.textContent = beat.text;
        line.className = beat.type === "stage"
          ? "is-stage"
          : `is-current${beat.speaker === "unknown" ? " is-unknown" : ""}`;
        transcript.append(line);
        line.scrollIntoView({ behavior: "smooth", block: "end" });
      }, beat.delay);
      this.callSceneTimers.push(timer);
    });
  }

  static renderCallEnded(content, caller) {
    const elapsed = this.callSeconds;
    this.stopCallTimer();
    content.innerHTML = `
      <section class="phone-call-ended">
        <i class="fa-solid fa-phone-slash"></i>
        <h2>통화가 종료되었습니다</h2>
        <p>${esc(caller.name)} · ${formatDuration(elapsed)}</p>
        <button type="button">최근 통화로 돌아가기</button>
      </section>
    `;
    content.querySelector("button").addEventListener("click", () => this.renderPhone(content));
  }

  static playCallEffect(effect) {
    if (!this.audioContext || this.audioContext.state !== "running") return;
    const patterns = {
      knock: [[0, 92, 0.09], [0.22, 86, 0.09], [0.44, 90, 0.1]],
      impact: [[0, 58, 0.28], [0.08, 43, 0.34]],
      steps: [[0, 72, 0.08], [0.34, 68, 0.08], [0.72, 74, 0.08]],
      disconnect: [[0, 620, 0.11], [0.11, 420, 0.16]]
    };

    const now = this.audioContext.currentTime;
    for (const [offset, frequency, duration] of patterns[effect] ?? []) {
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = effect === "disconnect" ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.09, now + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
      oscillator.connect(gain);
      gain.connect(this.audioContext.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + duration + 0.02);
    }
  }

  static stopCallTimer() {
    if (this.callTimer) {
      window.clearInterval(this.callTimer);
      this.callTimer = undefined;
    }
    this.callSceneTimers.forEach((timer) => window.clearTimeout(timer));
    this.callSceneTimers = [];
  }

  static async startRingtone() {
    this.stopRingtone();
    const generation = this.ringtoneGeneration;

    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.audioContext ??= new AudioContextClass();
    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch (error) {
        console.warn(`${MODULE_ID} | 벨소리를 재생할 수 없습니다.`, error);
        return;
      }
    }
    if (generation !== this.ringtoneGeneration) return;

    const playRingtonePhrase = () => {
      const now = this.audioContext.currentTime;
      const notes = [
        { offset: 0.00, frequency: 659.25, duration: 0.13 },
        { offset: 0.15, frequency: 783.99, duration: 0.13 },
        { offset: 0.30, frequency: 987.77, duration: 0.24 },
        { offset: 0.60, frequency: 783.99, duration: 0.13 },
        { offset: 0.75, frequency: 987.77, duration: 0.13 },
        { offset: 0.90, frequency: 1174.66, duration: 0.30 }
      ];

      notes.forEach(({ offset, frequency, duration }) => {
        const oscillator = this.audioContext.createOscillator();
        const overtone = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        const noteStart = now + offset;
        const noteEnd = noteStart + duration;

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        overtone.type = "sine";
        overtone.frequency.setValueAtTime(frequency * 2, noteStart);

        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.045, noteStart + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.018, noteEnd - 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

        oscillator.connect(gain);
        overtone.connect(gain);
        gain.connect(this.audioContext.destination);
        oscillator.start(noteStart);
        overtone.start(noteStart);
        oscillator.stop(noteEnd + 0.02);
        overtone.stop(noteEnd + 0.02);
      });
    };

    playRingtonePhrase();
    this.ringtoneTimer = window.setInterval(playRingtonePhrase, 2400);
  }

  static stopRingtone() {
    this.ringtoneGeneration += 1;
    if (this.ringtoneTimer) {
      window.clearInterval(this.ringtoneTimer);
      this.ringtoneTimer = undefined;
    }
  }

  static renderMessages(content) {
    content.closest(".smartphone-app-view")?.classList.remove("is-chat-open");
    content.innerHTML = `
      <header class="phone-page-header">
        <p>메시지</p>
        <h2>대화</h2>
        <button type="button" aria-label="새 메시지"><i class="fa-solid fa-pen-to-square"></i></button>
      </header>
      <label class="phone-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" placeholder="대화 검색" aria-label="대화 검색">
      </label>
      <div class="phone-conversation-list">
        ${this.messageData.messages.map((conversation) =>
          this.conversationItem(conversation)
        ).join("")}
      </div>
    `;

    this.bindConversationList(content, "messages");
  }

  static renderBubbleTalk(content, section = "friends") {
    this.openBubbleRoomId = null;
    content.closest(".smartphone-app-view")?.classList.remove("is-chat-open");
    const sectionNames = {
      friends: "친구",
      chats: "채팅",
      groups: "단체 대화"
    };
    const isFriends = section === "friends";
    const realList = Array.from(PhoneStore.rooms.values());
    realList.forEach((room) => {
      room.unread = PhoneStore.unreadOf(room);
    });
    const realRooms = isFriends
      ? []
      : realList.filter((room) =>
          section === "groups" ? room.type === "group" : room.type !== "group")
          .sort((a, b) => (b.listTime ?? 0) - (a.listTime ?? 0));
    const conversations = realRooms;
    const realUnread = (predicate) => realList
      .filter(predicate)
      .reduce((sum, room) => sum + room.unread, 0);
    const directUnread = realUnread((room) => room.type !== "group");
    const groupUnread = realUnread((room) => room.type === "group");

    content.innerHTML = `
      <header class="phone-page-header bubbletalk-page-header">
        <p>BubbleTalk</p>
        <h2>${sectionNames[section]}</h2>
        ${section === "groups" ? `
        <button class="bubbletalk-group-create" type="button" aria-label="단체 대화 만들기">
          <i class="fa-solid fa-users-medical"></i>
        </button>` : game.user.isGM ? `
        <button class="bubbletalk-npc-chat" type="button" aria-label="캐릭터 명의 대화">
          <i class="fa-solid fa-masks-theater"></i>
        </button>` : `
        <button type="button" aria-label="${isFriends ? "친구 추가" : "새 대화"}">
          <i class="fa-solid ${isFriends ? "fa-user-plus" : "fa-pen-to-square"}"></i>
        </button>`}
      </header>
      <div class="${isFriends ? "bubbletalk-friend-list" : "phone-conversation-list"}">
        ${isFriends
          ? this.bubbleTalkFriendItems()
          : conversations.length
            ? conversations.map((conversation) => this.bubbleTalkConversationItem(conversation)).join("")
            : `<div class="bubbletalk-empty"><i class="fa-regular fa-comments"></i><p>아직 대화가 없습니다.</p></div>`
        }
      </div>
      <nav class="bubbletalk-tabs" aria-label="버블톡 메뉴">
        <button class="${section === "friends" ? "is-active" : ""}" type="button"
          data-bubbletalk-section="friends" ${section === "friends" ? 'aria-current="page"' : ""}>
          <i class="fa-solid fa-user"></i>
          <span>친구</span>
        </button>
        <button class="${section === "chats" ? "is-active" : ""}" type="button"
          data-bubbletalk-section="chats" ${section === "chats" ? 'aria-current="page"' : ""}>
          <i class="fa-solid fa-comment"></i>
          <span>채팅</span>
          ${directUnread ? `<b class="bubbletalk-tab-badge">${directUnread}</b>` : ""}
        </button>
        <button class="${section === "groups" ? "is-active" : ""}" type="button"
          data-bubbletalk-section="groups" ${section === "groups" ? 'aria-current="page"' : ""}>
          <i class="fa-solid fa-user-group"></i>
          <span>단체 대화</span>
          ${groupUnread ? `<b class="bubbletalk-tab-badge">${groupUnread}</b>` : ""}
        </button>
      </nav>
    `;

    if (isFriends) {
      this.bindBubbleTalkFriends(content);
    } else {
      this.bindBubbleTalkConversations(content);
    }
    content.querySelectorAll("[data-bubbletalk-section]").forEach((button) => {
      button.addEventListener("click", () => {
        this.renderBubbleTalk(content, button.dataset.bubbletalkSection);
      });
    });
    content.querySelector(".bubbletalk-npc-chat")?.addEventListener("click", () => {
      this.renderNpcChatForm(content);
    });
    content.querySelector(".bubbletalk-group-create")?.addEventListener("click", () => {
      this.renderGroupChatForm(content);
    });
  }

  static renderGroupChatForm(content) {
    const users = game.users.filter((user) => user.id !== game.user.id);

    content.innerHTML = `
      <header class="phone-page-header bubbletalk-page-header">
        <p>BubbleTalk</p>
        <h2>단체 대화 만들기</h2>
        <button type="button" aria-label="닫기" class="bubbletalk-group-cancel">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>
      <form class="phone-outgoing-form bubbletalk-group-form">
        <label>대화방 이름
          <input name="roomName" type="text" maxlength="30" placeholder="예: 조사팀" required>
        </label>
        <label>참여자</label>
        <div class="bubbletalk-group-members">
          ${users.map((user) => `
            <label class="bubbletalk-group-member">
              <input type="checkbox" name="member" value="${user.id}">
              <span>${esc(userDisplayName(user))}${user.active ? "" : " (오프라인)"}</span>
            </label>`).join("")}
        </div>
        <div class="phone-outgoing-actions">
          <button class="is-cancel" type="button">취소</button>
          <button class="is-send" type="submit"><i class="fa-solid fa-user-group"></i> 만들기</button>
        </div>
      </form>
    `;

    const cancel = () => this.renderBubbleTalk(content, "groups");
    content.querySelector(".bubbletalk-group-cancel").addEventListener("click", cancel);
    content.querySelector(".is-cancel").addEventListener("click", cancel);
    content.querySelector(".bubbletalk-group-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const name = form.elements.roomName.value.trim();
      const memberIds = Array.from(form.querySelectorAll('input[name="member"]:checked'))
        .map((input) => input.value);
      if (!name || !memberIds.length) {
        ui.notifications.warn("대화방 이름과 참여자를 선택하세요.");
        return;
      }

      const roomId = `group:${foundry.utils.randomID()}`;
      const participantUserIds = [game.user.id, ...memberIds];
      await ChatMessage.create({
        content: `${userDisplayName(game.user)} 님이 대화를 시작했습니다.`,
        whisper: memberIds,
        flags: {
          [MODULE_ID]: {
            app: "bubbletalk",
            roomId,
            group: { name, participantUserIds }
          }
        }
      });
      debug(`단체방 생성: ${roomId} (${participantUserIds.length}명)`);
      this.renderBubbleTalkChat(content, roomId);
    });
  }

  static renderNpcChatForm(content) {
    const actors = this.npcActors();
    const players = game.users.filter((user) => !user.isGM);

    content.innerHTML = `
      <header class="phone-page-header bubbletalk-page-header">
        <p>BubbleTalk</p>
        <h2>캐릭터 명의 대화</h2>
        <button type="button" aria-label="닫기" class="bubbletalk-npc-cancel">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>
      <form class="phone-outgoing-form bubbletalk-npc-form">
        <label>발신 캐릭터
          <select name="actorId">
            ${actors.map((actor) => `<option value="${actor.id}">${esc(actor.name)}</option>`).join("")}
          </select>
        </label>
        <label>대상 플레이어
          <select name="userId">
            ${players.map((user) => `<option value="${user.id}">${esc(userDisplayName(user))}${user.active ? "" : " (오프라인)"}</option>`).join("")}
          </select>
        </label>
        <div class="phone-outgoing-actions">
          <button class="is-cancel" type="button">취소</button>
          <button class="is-send" type="submit"><i class="fa-solid fa-comment"></i> 대화 열기</button>
        </div>
      </form>
    `;

    const cancel = () => this.renderBubbleTalk(content, "chats");
    content.querySelector(".bubbletalk-npc-cancel").addEventListener("click", cancel);
    content.querySelector(".is-cancel").addEventListener("click", cancel);
    content.querySelector(".bubbletalk-npc-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const fields = event.currentTarget.elements;
      if (!fields.actorId.value || !fields.userId.value) {
        ui.notifications.warn("NPC와 대상 플레이어를 선택하세요.");
        return;
      }
      this.renderBubbleTalkChat(
        content,
        PhoneStore.npcRoomId(fields.actorId.value, fields.userId.value)
      );
    });
  }

  static bubbleTalkFriendItems() {
    const users = game.users.filter((user) => user.id !== game.user.id);
    if (!users.length) {
      return `<div class="bubbletalk-empty"><i class="fa-solid fa-user-group"></i><p>등록된 친구가 없습니다.</p></div>`;
    }

    return users.map((user) => `
      <button class="bubbletalk-friend" type="button"
        data-name="${esc(userDisplayName(user))}"
        data-conversation-id="${PhoneStore.directRoomId(game.user.id, user.id)}">
        <span class="phone-avatar">${esc(Array.from(userDisplayName(user))[0].toLocaleUpperCase())}</span>
        <span class="bubbletalk-friend-copy">
          <strong>${esc(userDisplayName(user))}</strong>
          <small>${user.isGM ? "GM" : user.active ? "접속 중" : "오프라인"}</small>
        </span>
        <i class="fa-solid fa-circle ${user.active ? "is-online" : ""}" aria-label="${user.active ? "접속 중" : "오프라인"}"></i>
      </button>
    `).join("");
  }

  static bindBubbleTalkFriends(content) {
    content.querySelectorAll(".bubbletalk-friend").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.conversationId) {
          this.renderBubbleTalkChat(content, button.dataset.conversationId);
        }
      });
    });
  }

  static bubbleTalkConversationItem(conversation) {
    const isGroup = conversation.type === "group";
    return `
      <button class="bubbletalk-conversation" type="button"
        data-conversation-id="${conversation.id}" data-name="${esc(conversation.name)}">
        ${isGroup && conversation.participants?.length
          ? `<span class="bubbletalk-room-avatar is-mosaic">${
              conversation.participants.slice(0, 4).map((member) =>
                `<b style="background:${member.color}">${member.initial}</b>`).join("")
            }</span>`
          : `<span class="bubbletalk-room-avatar ${isGroup ? "is-group" : ""}">
              <span>${esc(conversation.initial)}</span>
              ${!isGroup && conversation.online ? '<em class="bubbletalk-online-dot" aria-hidden="true"></em>' : ""}
              ${isGroup ? `<i class="fa-solid fa-user-group" aria-hidden="true"></i>` : ""}
            </span>`}
        <span class="bubbletalk-room-copy">
          <span class="bubbletalk-room-title">
            <strong>${esc(conversation.name)}</strong>
            ${isGroup ? `<small>${conversation.participantCount ?? ""}</small>` : ""}
            ${conversation.muted ? '<i class="fa-solid fa-bell-slash bubbletalk-mute" aria-label="알림 꺼짐"></i>' : ""}
          </span>
          <small>${esc(conversation.preview)}</small>
        </span>
        <span class="bubbletalk-room-meta">
          <time>${esc(formatTime(conversation.listTime))}</time>
          ${conversation.unread ? `<b class="${conversation.muted ? "is-quiet" : ""}">${conversation.unread}</b>` : ""}
        </span>
      </button>
    `;
  }

  static bindBubbleTalkConversations(content) {
    content.querySelectorAll(".bubbletalk-conversation").forEach((button) => {
      button.addEventListener("click", () => {
        this.renderBubbleTalkChat(content, button.dataset.conversationId);
      });
    });
  }

  static bindConversationList(content, app) {
    content.querySelectorAll(".phone-conversation").forEach((button) => {
      button.addEventListener("click", () => {
        this.renderChat(content, button.dataset.conversationId, app);
      });
    });

    this.bindListSearch(content, ".phone-conversation");
  }

  static bindListSearch(content, itemSelector) {
    const search = content.querySelector('input[type="search"]');
    if (!search) return;
    search.addEventListener("input", () => {
      const query = search.value.trim().toLocaleLowerCase();
      content.querySelectorAll(itemSelector).forEach((item) => {
        item.hidden = !item.dataset.name.toLocaleLowerCase().includes(query);
      });
    });
  }

  static conversationItem(conversation) {
    return `
      <button class="phone-conversation" type="button"
        data-conversation-id="${conversation.id}" data-name="${esc(conversation.name)}">
        <span class="phone-avatar">${esc(conversation.initial)}</span>
        <span class="phone-conversation-copy">
          <strong>${esc(conversation.name)}</strong>
          <small>${esc(conversation.preview)}</small>
        </span>
        <span class="phone-conversation-meta">
          <time>${esc(formatTime(conversation.listTime))}</time>
          ${conversation.unread ? `<b>${conversation.unread}</b>` : ""}
        </span>
      </button>
    `;
  }

  static renderBubbleTalkChat(content, conversationId) {
    const conversation = PhoneStore.roomFor(conversationId);
    if (!conversation) {
      this.renderBubbleTalk(content, "chats");
      return;
    }

    this.openBubbleRoomId = conversation.id;
    PhoneStore.markRead(conversation.id);
    const isGroup = conversation.type === "group";
    const viewMessages = conversation.messages.map((entry) => this.bubbleTalkEntryView(entry, conversation));
    content.closest(".smartphone-app-view")?.classList.add("is-chat-open");
    content.innerHTML = `
      <header class="bubbletalk-chat-header">
        <button class="bubbletalk-inline-back" type="button" aria-label="대화 목록">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="bubbletalk-chat-avatar">
          <span>${esc(conversation.initial)}</span>
          ${!isGroup && conversation.online ? '<em class="bubbletalk-online-dot" aria-hidden="true"></em>' : ""}
        </span>
        <div class="bubbletalk-chat-title">
          <strong>${esc(conversation.name)}</strong>
          <small>${isGroup ? `${conversation.participantCount ?? ""}명 참여` : conversation.status}</small>
        </div>
        <button type="button" aria-label="통화"><i class="fa-solid fa-phone"></i></button>
        <button type="button" aria-label="대화 검색"><i class="fa-solid fa-magnifying-glass"></i></button>
        <button type="button" aria-label="대화 메뉴"><i class="fa-solid fa-bars"></i></button>
      </header>
      <div class="bubbletalk-chat-log">
        ${conversation.timelineTime ? `<time>${esc(formatTime(conversation.timelineTime))}</time>` : ""}
        ${this.bubbleLogHTML(viewMessages, conversation)}
        ${conversation.typing ? this.bubbleTalkTyping(conversation) : ""}
      </div>
      <form class="bubbletalk-composer">
        <button type="button" aria-label="첨부"><i class="fa-solid fa-plus"></i></button>
        <input name="message" autocomplete="off" placeholder="메시지를 입력하세요">
        <button type="submit" aria-label="보내기"><i class="fa-solid fa-arrow-up"></i></button>
      </form>
    `;

    content.querySelector(".bubbletalk-inline-back").addEventListener("click", () => {
      this.renderBubbleTalk(content, isGroup ? "groups" : "chats");
    });
    content.querySelector(".bubbletalk-chat-log").addEventListener("click", (event) => {
      const image = event.target.closest(".bubbletalk-image");
      if (image) this.openImagePopout(image.getAttribute("src"));
    });
    if (game.user.can("FILES_BROWSE")) {
      content.querySelector('.bubbletalk-composer [aria-label="첨부"]').addEventListener("click", () => {
        const PickerClass = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
        new PickerClass({
          type: "image",
          callback: (path) => {
            const input = content.querySelector('.bubbletalk-composer [name="message"]');
            this.sendBubbleMessage(conversation, input?.value.trim() ?? "", path);
            if (input) input.value = "";
          }
        }).render(true);
      });
    }
    content.querySelector(".bubbletalk-composer").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.message;
      const text = input.value.trim();
      if (!text) return;
      // 실채팅: DOM에 직접 넣지 않고 ChatMessage 생성 → createChatMessage 훅 경유 단일 경로
      this.sendBubbleMessage(conversation, text);
      input.value = "";
    });
  }

  static bubbleTalkMessage(message, conversation, { first = true, last = true } = {}) {
    const isSent = message.direction === "sent";
    const senderName = message.sender ?? (
      conversation.type === "group" ? message.text.split(":")[0] : conversation.name
    );
    const displayText = conversation.type === "group" && !isSent && !message.sender && message.text.includes(":")
      ? message.text.slice(message.text.indexOf(":") + 1).trim()
      : message.text;
    const contClass = first ? "" : " is-cont";
    const bubbleClasses = [first ? "is-first" : "", message.image ? "has-image" : ""]
      .filter(Boolean).join(" ");
    const bubbleClass = bubbleClasses ? ` class="${bubbleClasses}"` : "";
    const bubbleBody = `${
      message.image ? `<img class="bubbletalk-image" src="${esc(message.image)}" alt="첨부 이미지">` : ""
    }${displayText ? `<span>${esc(displayText)}</span>` : ""}`;
    const readCount = message.readCount ?? (message.read === false ? 1 : 0);
    const meta = last
      ? `<span class="bubbletalk-message-meta">${
          isSent && readCount ? `<b class="bubbletalk-read">${readCount}</b>` : ""
        }<time>${esc(formatTime(message.time))}</time></span>`
      : "";

    if (isSent) {
      return `
        <div class="bubbletalk-message is-sent${contClass}">
          ${meta}
          <p${bubbleClass}>${bubbleBody}</p>
        </div>
      `;
    }

    return `
      <div class="bubbletalk-message is-received${contClass}">
        <span class="bubbletalk-message-avatar${first ? "" : " is-ghost"}">${first ? esc(senderName.charAt(0)) : ""}</span>
        <div>
          ${first ? `<strong>${esc(senderName)}</strong>` : ""}
          <p${bubbleClass}>${bubbleBody}</p>
        </div>
        ${meta}
      </div>
    `;
  }

  static sendBubbleMessage(conversation, text, image = null) {
    const isNpcRoom = conversation.id.startsWith("npc:");
    const messageData = {
      content: text,
      // 기본 화자는 배정된 캐릭터 — 말풍선·로그에 캐릭터 이름이 뜬다
      speaker: ChatMessage.getSpeaker(),
      flags: { [MODULE_ID]: { app: "bubbletalk", roomId: conversation.id } }
    };
    if (image) messageData.flags[MODULE_ID].image = image;

    if (conversation.type === "group") {
      // 단체톡: 참여자 전원 귓속말 + 방 메타를 플래그에 실어 복원 가능하게
      messageData.whisper = conversation.participantUserIds
        .filter((id) => id !== game.user.id);
      messageData.flags[MODULE_ID].group = {
        name: conversation.name,
        participantUserIds: conversation.participantUserIds
      };
    } else if (isNpcRoom && game.user.isGM) {
      // GM → 플레이어: 선택한 캐릭터 Actor를 화자로
      const actor = game.actors.get(conversation.npcActorId);
      messageData.whisper = [conversation.targetUserId];
      messageData.speaker = { alias: actor?.name ?? "캐릭터", actor: actor?.id ?? null };
    } else if (isNpcRoom) {
      // 플레이어 답장 → GM 전원에게 귓속말, 같은 방으로
      messageData.whisper = game.users.filter((user) => user.isGM).map((user) => user.id);
    } else {
      messageData.whisper = [conversation.otherUserId];
    }

    debug(`버블톡 발신: ${conversation.id}${image ? " (사진)" : ""}`);
    ChatMessage.create(messageData);
  }

  static openImagePopout(src) {
    try {
      const PopoutClass = foundry.applications?.apps?.ImagePopout ?? ImagePopout;
      new PopoutClass({ src, window: { title: "이미지" } }).render(true);
    } catch (error) {
      console.warn(`${MODULE_ID} | 이미지 팝업을 열 수 없어 새 창으로 대체합니다.`, error);
      window.open(src, "_blank");
    }
  }

  static bubbleTalkEntryView(entry, room) {
    const view = {
      direction: entry.authorId === game.user.id ? "sent" : "received",
      sender: entry.authorName,
      text: entry.text,
      image: entry.image ?? null,
      time: entry.time
    };
    if (room && view.direction === "sent") {
      // 아직 이 메시지를 읽지 않은 상대 수 → 말풍선 옆 숫자
      view.readCount = PhoneStore.otherLastRead(room)
        .filter((time) => time < entry.time).length;
    }
    return view;
  }

  static bubbleLogHTML(viewMessages, conversation) {
    const sameGroup = (a, b) => Boolean(a && b)
      && a.direction === b.direction && a.sender === b.sender;
    return viewMessages.map((message, index) => this.bubbleTalkMessage(message, conversation, {
      first: !sameGroup(viewMessages[index - 1], message),
      last: !sameGroup(message, viewMessages[index + 1])
    })).join("");
  }

  static refreshOpenChatLog() {
    if (!this.openBubbleRoomId) return;
    const room = PhoneStore.rooms.get(this.openBubbleRoomId);
    const log = this.wrapper?.querySelector(".bubbletalk-chat-log");
    if (!room || !log) return;

    const viewMessages = room.messages.map((entry) => this.bubbleTalkEntryView(entry, room));
    log.innerHTML = this.bubbleLogHTML(viewMessages, room);
    log.lastElementChild?.scrollIntoView({ block: "end" });
  }

  static updateAppBadges() {
    const button = this.wrapper?.querySelector('.smartphone-app-grid [data-app="bubbletalk"]');
    if (!button) return;
    button.querySelector(".smartphone-app-badge")?.remove();
    const total = PhoneStore.totalUnread();
    if (total) {
      button.insertAdjacentHTML("beforeend", `<b class="smartphone-app-badge">${total}</b>`);
    }
  }

  static playNotificationTone() {
    try {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioContext ??= new AudioContextClass();
      if (this.audioContext.state !== "running") return;

      const now = this.audioContext.currentTime;
      for (const [offset, frequency] of [[0, 987.77], [0.11, 1318.51]]) {
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.05, now + offset + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.16);
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | 알림음을 재생할 수 없습니다.`, error);
    }
  }

  static onBubbleTalkMessage(room, entry) {
    debug(`버블톡 메시지 수신: ${room.id}`);
    const isMine = entry.authorId === game.user.id;
    const isOpen = this.openBubbleRoomId === room.id;

    if (isOpen) {
      const log = this.wrapper?.querySelector(".bubbletalk-chat-log");
      if (log) {
        log.insertAdjacentHTML(
          "beforeend",
          this.bubbleTalkMessage(this.bubbleTalkEntryView(entry, room), room)
        );
        log.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
      if (!isMine) PhoneStore.markRead(room.id);
      return;
    }

    if (!isMine) {
      ui.notifications.info(`버블톡 | ${entry.authorName} 님의 새 메시지`);
      this.playNotificationTone();
      this.updateAppBadges();
    }
  }

  static bubbleTalkTyping(conversation) {
    return `
      <div class="bubbletalk-message is-received">
        <span class="bubbletalk-message-avatar">${conversation.initial ?? "?"}</span>
        <div>
          <span class="bubbletalk-typing" role="status" aria-label="입력 중"><i></i><i></i><i></i></span>
        </div>
      </div>
    `;
  }

  static renderChat(content, conversationId, app = "messages") {
    const conversation = this.messageData[app].find(
      (item) => item.id === conversationId
    ) ?? {
      name: "알 수 없음",
      initial: "?",
      status: "오프라인",
      timelineTime: "",
      messages: []
    };

    content.closest(".smartphone-app-view")?.classList.add("is-chat-open");
    content.innerHTML = `
      <header class="phone-chat-header">
        <button class="phone-inline-back" type="button" aria-label="대화 목록">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="phone-avatar">${esc(conversation.initial)}</span>
        <div><strong>${esc(conversation.name)}</strong><small>${conversation.status}</small></div>
        <button type="button" aria-label="통화"><i class="fa-solid fa-phone"></i></button>
      </header>
      <div class="phone-chat-log">
        ${conversation.timelineTime ? `<time>${esc(formatTime(conversation.timelineTime))}</time>` : ""}
        ${conversation.messages.map((message) =>
          `<p class="is-${message.direction}">${message.text}</p>`
        ).join("")}
      </div>
      <form class="phone-composer">
        <button type="button" aria-label="첨부"><i class="fa-solid fa-plus"></i></button>
        <input name="message" autocomplete="off" placeholder="메시지">
        <button type="submit" aria-label="보내기"><i class="fa-solid fa-arrow-up"></i></button>
      </form>
    `;

    content.querySelector(".phone-inline-back").addEventListener("click", () => {
      if (app === "bubbletalk") this.renderBubbleTalk(content);
      else this.renderMessages(content);
    });
    content.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.message;
      const message = input.value.trim();
      if (!message) return;
      conversation.messages.push({ direction: "sent", text: message });
      conversation.preview = message;
      conversation.listTime = Date.now();
      const bubble = document.createElement("p");
      bubble.className = "is-sent";
      bubble.textContent = message;
      content.querySelector(".phone-chat-log").append(bubble);
      input.value = "";
      bubble.scrollIntoView({ behavior: "smooth" });
    });
  }

  static renderEmail(content) {
    content.closest(".smartphone-app-view")?.classList.remove("is-chat-open");
    const emails = this.messageData.emails;

    content.innerHTML = `
      <header class="phone-page-header">
        <p>이메일</p><h2>받은편지함</h2>
        <button type="button" aria-label="편지 쓰기"><i class="fa-solid fa-pen"></i></button>
      </header>
      <label class="phone-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" placeholder="메일 검색" aria-label="메일 검색">
      </label>
      <div class="phone-email-list">
        ${emails.length ? emails.map((email) => `
          <button class="phone-email" type="button" data-email-id="${esc(email.id)}"
            data-name="${esc(`${email.from?.name ?? ""} ${email.subject ?? ""}`)}">
            ${email.unread ? '<i class="phone-email-dot" aria-label="안 읽음"></i>' : "<i></i>"}
            <span class="phone-email-copy">
              <span class="phone-email-top">
                <strong>${esc(email.from?.name ?? "알 수 없음")}</strong>
                <time>${esc(formatTime(email.time))}</time>
              </span>
              <b>${esc(email.subject ?? "(제목 없음)")}</b>
              <small>${esc(email.preview ?? "")}</small>
            </span>
          </button>`).join("")
        : `<div class="bubbletalk-empty"><i class="fa-regular fa-envelope"></i><p>메일이 없습니다.</p></div>`}
      </div>
    `;

    this.bindListSearch(content, ".phone-email");
    content.querySelectorAll(".phone-email").forEach((button) => {
      button.addEventListener("click", () => {
        this.renderEmailDetail(content, button.dataset.emailId);
      });
    });
  }

  static renderEmailDetail(content, emailId) {
    const email = this.messageData.emails.find((item) => item.id === emailId);
    if (!email) {
      this.renderEmail(content);
      return;
    }
    email.unread = false;

    const paragraphs = String(email.body ?? "")
      .split(/\n{2,}/)
      .map((block) => `<p>${esc(block).replaceAll("\n", "<br>")}</p>`)
      .join("");

    content.innerHTML = `
      <header class="phone-email-header">
        <button class="phone-email-back" type="button" aria-label="받은편지함">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="phone-email-title">${esc(email.subject ?? "(제목 없음)")}</span>
      </header>
      <article class="phone-email-detail">
        <div class="phone-email-meta">
          <span class="phone-avatar">${esc(Array.from(email.from?.name ?? "?")[0])}</span>
          <span>
            <strong>${esc(email.from?.name ?? "알 수 없음")}</strong>
            <small>${esc(email.from?.address ?? "")} · ${esc(formatTime(email.time))}</small>
          </span>
        </div>
        <div class="phone-email-body">
          ${paragraphs}
          ${email.image ? `<img class="bubbletalk-image" src="${esc(email.image)}" alt="첨부 이미지">` : ""}
        </div>
      </article>
    `;

    content.querySelector(".phone-email-back").addEventListener("click", () => this.renderEmail(content));
    content.querySelector(".phone-email-body").addEventListener("click", (event) => {
      const image = event.target.closest(".bubbletalk-image");
      if (image) this.openImagePopout(image.getAttribute("src"));
    });
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

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "sites", {
    scope: "world",
    config: false,
    type: Array,
    default: []
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
