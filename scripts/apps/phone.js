import { escapeHTML as esc, formatTime, formatDuration, debug, userDisplayName } from "../utils.js";
import { PhoneStore } from "../store.js";
import { PhoneSocket } from "../socket.js";

const MODULE_ID = "myth-phone";

export const phoneMethods = {
  renderPhone(content) {
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
  },

  callHistoryItem(name, number, type, time, initial, missed = false) {
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
  },

  renderPhoneKeypad(content) {
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
  },

  npcActors() {
    return game.actors.filter((actor) => !actor.hasPlayerOwner);
  },

  renderOutgoingCallForm(content) {
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
  },

  receiveIncomingCall(payload) {
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
  },

  logCall(caller, result) {
    PhoneStore.saveCallEntry({
      name: caller.name,
      initial: caller.initial ?? Array.from(caller.name ?? "?")[0],
      number: caller.number,
      time: Date.now(),
      result
    });
  },

  reportCallResult(payload, caller, result) {
    if (!payload?.callId) return;
    PhoneSocket.send("call-result", {
      callId: payload.callId,
      targetName: game.user.name,
      callerName: caller.name,
      result
    });
  },

  renderIncomingCall(content, sceneId, payload = null) {
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
  },

  renderActiveCall(content, scene, caller = scene.caller) {
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
  },

  playCallScene(content, scene, caller = scene.caller) {
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
  },

  renderCallEnded(content, caller) {
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
  },

  playCallEffect(effect) {
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
  },

  stopCallTimer() {
    if (this.callTimer) {
      window.clearInterval(this.callTimer);
      this.callTimer = undefined;
    }
    this.callSceneTimers.forEach((timer) => window.clearTimeout(timer));
    this.callSceneTimers = [];
  },

  async startRingtone() {
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
  },

  stopRingtone() {
    this.ringtoneGeneration += 1;
    if (this.ringtoneTimer) {
      window.clearInterval(this.ringtoneTimer);
      this.ringtoneTimer = undefined;
    }
  },
};
