import { escapeHTML as esc, userDisplayName } from "../utils.js";
import { PhoneStore } from "../store.js";
import { PhoneSocket } from "../socket.js";

const MODULE_ID = "myth-phone";

// GM 연출 편집기 — SmartphoneShell에 Object.assign으로 부착
export const gmEditorMethods = {
  // ===== GM 연출 편집기 (메시지·이메일 월드 데이터 저작) =====

  editorData(kind) {
    return game.settings.get(MODULE_ID, kind) ?? [];
  },

  // 월드 정본에 저장하고, 플레이어 앱이 읽는 인메모리 사본도 맞춘다.
  async saveEditorData(kind, list) {
    await game.settings.set(MODULE_ID, kind, list);
    PhoneStore.data[kind] = list;
  },

  renderGmEditor(content, tab = "messages") {
    if (!game.user.isGM) { this.close(); return; }
    content.closest(".smartphone-app-view")?.classList.remove("is-chat-open");
    const kind = tab === "emails" ? "emails" : "messages";
    this.tab = kind;
    const list = this.editorData(kind);

    const rows = kind === "messages"
      ? list.map((conv) => this.gmEditorRow(
          conv.id,
          conv.initial || Array.from(conv.name || "?")[0],
          conv.name || "(이름 없음)",
          conv.preview || "",
          conv.sentTo)).join("")
      : list.map((mail) => this.gmEditorRow(
          mail.id,
          Array.from(mail.from?.name || "?")[0],
          mail.from?.name || "(보낸사람 없음)",
          mail.subject || "(제목 없음)",
          mail.sentTo)).join("");

    content.innerHTML = `
      <header class="phone-page-header gm-editor-header">
        <p>연출 편집 · GM</p>
        <h2>${kind === "messages" ? "메시지" : "이메일"}</h2>
        <button class="gm-editor-add" type="button" aria-label="새 항목">
          <i class="fa-solid fa-plus"></i>
        </button>
      </header>
      <div class="gm-editor-tabs">
        <button class="gm-editor-tab ${kind === "messages" ? "is-active" : ""}" type="button" data-gm-tab="messages">메시지</button>
        <button class="gm-editor-tab ${kind === "emails" ? "is-active" : ""}" type="button" data-gm-tab="emails">이메일</button>
      </div>
      <div class="gm-editor-list">
        ${rows || `<div class="bubbletalk-empty"><i class="fa-solid fa-feather-pointed"></i><p>항목이 없습니다. +로 추가하세요.</p></div>`}
      </div>
      <div class="gm-editor-io">
        <button type="button" data-gm-io="import"><i class="fa-solid fa-file-import"></i> 가져오기</button>
        <button type="button" data-gm-io="export"><i class="fa-solid fa-file-export"></i> 내보내기</button>
      </div>
    `;

    content.querySelectorAll("[data-gm-tab]").forEach((btn) =>
      btn.addEventListener("click", () => this.renderGmEditor(content, btn.dataset.gmTab)));
    content.querySelectorAll(".gm-editor-row").forEach((row) => {
      row.addEventListener("click", (event) => {
        // 클릭은 항상 버튼(row)에 잡힌다(자식 아이콘으로 포인터가 안 감) — 로그로 확인.
        // 그래서 요소 판별 대신 클릭 좌표가 각 아이콘 박스 안인지로 동작을 가른다.
        const hit = (selector) => {
          const box = row.querySelector(selector)?.getBoundingClientRect();
          return box && event.clientX >= box.left && event.clientX <= box.right
              && event.clientY >= box.top && event.clientY <= box.bottom;
        };
        if (hit("[data-gm-delete]")) {
          this.gmEditorDelete(content, kind, row.dataset.gmId);
          return;
        }
        if (hit("[data-gm-send]")) {
          this.gmEditorSend(content, kind, row.dataset.gmId);
          return;
        }
        this.renderGmEditorDetail(content, kind, row.dataset.gmId);
      });
    });
    content.querySelector(".gm-editor-add").addEventListener("click", () =>
      this.gmEditorCreate(content, kind));
    content.querySelector('[data-gm-io="import"]').addEventListener("click", () =>
      this.renderGmEditorImport(content, kind));
    content.querySelector('[data-gm-io="export"]').addEventListener("click", () =>
      this.renderGmEditorExport(content, kind));
  },

  gmEditorRow(id, initial, title, subtitle, sentTo) {
    // sentTo 없음 = 구 데이터(전체 공개), [] = 미발송(아무도 못 봄), [ids] = 발송됨
    const send = sentTo === undefined
      ? { cls: "", badge: "", tip: "전체 공개 (대상 미지정)" }
      : sentTo.length
        ? { cls: "", badge: `<b>${sentTo.length}</b>`, tip: `${sentTo.length}명에게 발송됨` }
        : { cls: " is-unsent", badge: "", tip: "미발송 — 아직 아무도 못 봅니다" };
    return `
      <button class="gm-editor-row" type="button" data-gm-id="${esc(id)}">
        <span class="phone-avatar">${esc(initial || "?")}</span>
        <span class="gm-editor-row-copy">
          <strong>${esc(title)}</strong>
          <small>${esc(subtitle)}</small>
        </span>
        <span class="gm-editor-row-send${send.cls}" data-gm-send aria-label="발송" data-tooltip="${esc(send.tip)}"><i class="fa-solid fa-paper-plane"></i>${send.badge}</span>
        <span class="gm-editor-row-del" data-gm-delete aria-label="삭제"><i class="fa-solid fa-trash"></i></span>
      </button>
    `;
  },

  // 발송: 대상 플레이어를 골라 그 순간 공개한다. 새로 추가된 대상에게만 소켓 알림.
  // 체크를 빼면 그 사람 폰에서 회수된다(정본의 sentTo에서 제거).
  async gmEditorSend(content, kind, id) {
    const list = foundry.utils.deepClone(this.editorData(kind));
    const item = list.find((x) => x.id === id);
    if (!item) return;
    const players = game.users.filter((user) => !user.isGM);
    if (!players.length) {
      ui.notifications.warn("MythPhone | 발송할 플레이어가 없습니다.");
      return;
    }

    // 구 데이터(sentTo 없음)는 전체 공개 상태였으므로 전원 체크로 시작
    const current = item.sentTo ?? players.map((user) => user.id);
    const label = kind === "messages" ? (item.name || "(이름 없음)") : (item.subject || "(제목 없음)");
    const rows = players.map((user) => `
      <label class="mp-send-target">
        <input type="checkbox" name="target" value="${user.id}" ${current.includes(user.id) ? "checked" : ""}>
        <span>${esc(userDisplayName(user))}${user.active ? "" : " (오프라인)"}</span>
      </label>`).join("");

    const picked = await foundry.applications.api.DialogV2.confirm({
      window: { title: "발송 대상" },
      content: `
        <p class="mp-send-title"><b>${esc(label)}</b> 을(를) 받을 사람을 고르세요.<br>
        <small>체크를 빼면 그 사람 폰에서 회수됩니다.</small></p>
        <div class="mp-send-targets">${rows}</div>`,
      yes: {
        label: "발송",
        icon: "fa-solid fa-paper-plane",
        callback: (event, button) =>
          Array.from(button.form.querySelectorAll('input[name="target"]:checked'))
            .map((input) => input.value)
      },
      no: { label: "취소" },
      modal: true,
      // X로 닫아도 reject 대신 null — 취소와 동일하게 처리 (기본값에 기대지 않고 명시)
      rejectClose: false
    });
    if (!Array.isArray(picked)) return;

    const fresh = picked.filter((userId) => !current.includes(userId));
    item.sentTo = picked;
    await this.saveEditorData(kind, list);
    // 데이터 자체는 updateSetting 훅으로 전 클라이언트에 동기화된다.
    // 소켓은 "지금 도착했다"는 알림 전용 — 새 수신자에게만 보낸다.
    if (fresh.length) {
      PhoneSocket.send("staged-send", {
        kind,
        itemId: id,
        targets: fresh,
        title: kind === "messages" ? (item.name || "") : (item.from?.name || ""),
        preview: kind === "messages" ? (item.preview || "") : (item.subject || "")
      });
    }
    ui.notifications.info(`MythPhone | ${picked.length}명에게 공개${fresh.length ? ` (신규 ${fresh.length}명 알림)` : ""}`);
    this.renderGmEditor(content, kind);
  },

  async gmEditorDelete(content, kind, id) {
    const item = this.editorData(kind).find((x) => x.id === id);
    const label = kind === "messages" ? (item?.name || "이 대화") : (item?.subject || "이 메일");
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "삭제 확인" },
      content: `<p><b>${esc(label)}</b> 을(를) 삭제할까요?<br>되돌릴 수 없습니다.</p>`,
      yes: { label: "삭제", icon: "fa-solid fa-trash" },
      no: { label: "취소" },
      modal: true
    });
    if (!ok) return;
    const list = this.editorData(kind).filter((x) => x.id !== id);
    await this.saveEditorData(kind, list);
    this.renderGmEditor(content, kind);
  },

  async gmEditorCreate(content, kind) {
    const list = foundry.utils.deepClone(this.editorData(kind));
    const id = foundry.utils.randomID();
    // sentTo: [] = 미발송으로 시작 — 발송 버튼을 누르기 전엔 플레이어 폰에 없다
    if (kind === "messages") {
      list.push({ id, name: "새 대화", initial: "?", preview: "", listTime: "", unread: 0, status: "", timelineTime: "", messages: [], sentTo: [] });
    } else {
      list.push({ id, from: { name: "새 보낸사람", address: "" }, subject: "새 메일", preview: "", time: "", unread: true, body: "", sentTo: [] });
    }
    await this.saveEditorData(kind, list);
    this.renderGmEditorDetail(content, kind, id);
  },

  renderGmEditorDetail(content, kind, id) {
    if (!game.user.isGM) { this.close(); return; }
    const list = foundry.utils.deepClone(this.editorData(kind));
    const item = list.find((x) => x.id === id);
    if (!item) { this.renderGmEditor(content, kind); return; }
    if (kind === "emails") { this.renderGmEmailDetail(content, list, item); return; }

    // ----- 메시지(문자) 편집: 말풍선을 실제 화면대로 쌓는다 -----
    content.closest(".smartphone-app-view")?.classList.remove("is-chat-open");
    this.gmComposeDir = this.gmComposeDir ?? "received";
    const bubbles = (item.messages || []).map((m, i) => `
      <div class="gm-bubble-row is-${m.direction === "sent" ? "sent" : "received"}" data-i="${i}">
        <p>${esc(m.text || "")}</p>
        <span class="gm-bubble-tools">
          <button type="button" data-gm-flip="${i}" aria-label="방향 전환"><i class="fa-solid fa-right-left"></i></button>
          <button type="button" data-gm-edit="${i}" aria-label="편집"><i class="fa-solid fa-pen"></i></button>
          <button type="button" data-gm-bdel="${i}" aria-label="삭제"><i class="fa-solid fa-trash"></i></button>
        </span>
      </div>`).join("");

    content.innerHTML = `
      <header class="phone-page-header gm-editor-header gm-editor-detail">
        <button class="gm-editor-back" type="button" aria-label="목록"><i class="fa-solid fa-chevron-left"></i></button>
        <p>연출 편집 · 메시지</p>
        <h2>${esc(item.name || "새 대화")}</h2>
      </header>
      <div class="gm-editor-scroll">
        <div class="gm-meta">
          <label class="gm-fld"><span>상대 이름</span><input data-gm-field="name" value="${esc(item.name || "")}"></label>
          <label class="gm-fld"><span>상태 표시</span><input data-gm-field="status" value="${esc(item.status || "")}"></label>
          <label class="gm-fld"><span>목록 시각</span><input data-gm-field="listTime" value="${esc(item.listTime || "")}"></label>
          <label class="gm-fld"><span>안읽음 수</span><input data-gm-field="unread" type="number" min="0" value="${esc(String(item.unread ?? 0))}"></label>
          <label class="gm-fld gm-full"><span>타임라인 라벨</span><input data-gm-field="timelineTime" value="${esc(item.timelineTime || "")}"></label>
        </div>
        <div class="gm-builder-head"><span>플레이어 폰에 그대로 보이는 화면</span><b>말풍선 ${item.messages?.length || 0}개</b></div>
        <div class="gm-canvas">
          ${bubbles || `<p class="gm-canvas-empty">아래에서 말풍선을 추가하세요.</p>`}
        </div>
      </div>
      <div class="gm-compose">
        <div class="gm-seg">
          <button type="button" data-gm-dir="received" class="${this.gmComposeDir === "received" ? "is-on" : ""}">받음</button>
          <button type="button" data-gm-dir="sent" class="${this.gmComposeDir === "sent" ? "is-on" : ""}">보냄</button>
        </div>
        <textarea class="gm-compose-input" rows="1" placeholder="말풍선 내용 · Enter로 추가"></textarea>
        <button class="gm-compose-add" type="button">추가</button>
      </div>
    `;

    // 연속 입력 중이면 재렌더 후 입력창에 포커스를 돌려준다
    if (this.gmFocusCompose) {
      this.gmFocusCompose = false;
      const input = content.querySelector(".gm-compose-input");
      input?.focus();
      content.querySelector(".gm-canvas")?.scrollTo({ top: 999999 });
    }

    const harvest = () => {
      content.querySelectorAll("[data-gm-field]").forEach((el) => {
        const key = el.dataset.gmField;
        if (key === "unread") item.unread = Number(el.value) || 0;
        else item[key] = el.value;
      });
      item.initial = Array.from(item.name || "?")[0] || "?";
      const last = item.messages?.[item.messages.length - 1];
      item.preview = last ? (last.text || "") : "";
    };
    const commit = async (rerender = true) => {
      harvest();
      await this.saveEditorData(kind, list);
      if (rerender) this.renderGmEditorDetail(content, kind, id);
    };

    content.querySelector(".gm-editor-back").addEventListener("click", async () => {
      await commit(false);
      this.renderGmEditor(content, kind);
    });
    content.querySelectorAll("[data-gm-dir]").forEach((btn) =>
      btn.addEventListener("click", () => {
        this.gmComposeDir = btn.dataset.gmDir;
        content.querySelectorAll("[data-gm-dir]").forEach((b) => b.classList.toggle("is-on", b === btn));
      }));

    const addBubble = async () => {
      const input = content.querySelector(".gm-compose-input");
      const text = input.value.trim();
      if (!text) return;
      item.messages = item.messages || [];
      item.messages.push({ direction: this.gmComposeDir === "sent" ? "sent" : "received", text });
      this.gmFocusCompose = true;
      await commit();
    };
    content.querySelector(".gm-compose-add").addEventListener("click", addBubble);
    content.querySelector(".gm-compose-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); addBubble(); }
    });

    content.querySelectorAll("[data-gm-flip]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const m = item.messages[Number(btn.dataset.gmFlip)];
        m.direction = m.direction === "sent" ? "received" : "sent";
        await commit();
      }));
    content.querySelectorAll("[data-gm-bdel]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        item.messages.splice(Number(btn.dataset.gmBdel), 1);
        await commit();
      }));
    content.querySelectorAll("[data-gm-edit]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.gmEdit);
        const row = content.querySelector(`.gm-bubble-row[data-i="${i}"]`);
        const p = row?.querySelector("p");
        if (!p) return;
        const ta = document.createElement("textarea");
        ta.className = "gm-bubble-edit";
        ta.value = item.messages[i].text || "";
        p.replaceWith(ta);
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        const done = async () => {
          item.messages[i].text = ta.value.trim();
          await commit();
        };
        ta.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ta.blur(); }
        });
        ta.addEventListener("blur", done, { once: true });
      }));
  },

  renderGmEmailDetail(content, list, item) {
    content.closest(".smartphone-app-view")?.classList.remove("is-chat-open");
    item.from = item.from || { name: "", address: "" };
    content.innerHTML = `
      <header class="phone-page-header gm-editor-header gm-editor-detail">
        <button class="gm-editor-back" type="button" aria-label="목록"><i class="fa-solid fa-chevron-left"></i></button>
        <p>연출 편집 · 이메일</p>
        <h2>${esc(item.subject || "새 메일")}</h2>
      </header>
      <div class="gm-editor-scroll">
        <div class="gm-meta">
          <label class="gm-fld"><span>보낸사람 이름</span><input data-gm-field="from.name" value="${esc(item.from.name || "")}"></label>
          <label class="gm-fld"><span>보낸사람 주소</span><input data-gm-field="from.address" value="${esc(item.from.address || "")}"></label>
          <label class="gm-fld gm-full"><span>제목</span><input data-gm-field="subject" value="${esc(item.subject || "")}"></label>
          <label class="gm-fld"><span>표시 시각</span><input data-gm-field="time" value="${esc(item.time || "")}"></label>
          <label class="gm-fld"><span>상태</span>
            <select data-gm-field="unread">
              <option value="true" ${item.unread ? "selected" : ""}>안읽음</option>
              <option value="false" ${!item.unread ? "selected" : ""}>읽음</option>
            </select>
          </label>
          <label class="gm-fld gm-full"><span>본문</span><textarea data-gm-field="body" rows="9">${esc(item.body || "")}</textarea></label>
        </div>
      </div>
      <div class="gm-compose gm-compose-save">
        <button class="gm-compose-add gm-save-all" type="button"><i class="fa-solid fa-check"></i> 저장</button>
      </div>
    `;

    const harvest = () => {
      content.querySelectorAll("[data-gm-field]").forEach((el) => {
        const key = el.dataset.gmField;
        if (key === "unread") item.unread = el.value === "true";
        else if (key === "from.name") item.from.name = el.value;
        else if (key === "from.address") item.from.address = el.value;
        else item[key] = el.value;
      });
      const firstLine = String(item.body || "").split("\n").find((line) => line.trim()) || "";
      item.preview = firstLine.trim().slice(0, 60);
    };
    const commit = async () => {
      harvest();
      await this.saveEditorData("emails", list);
    };
    content.querySelector(".gm-editor-back").addEventListener("click", async () => {
      await commit();
      this.renderGmEditor(content, "emails");
    });
    content.querySelector(".gm-save-all").addEventListener("click", async () => {
      await commit();
      ui.notifications.info("MythPhone | 저장되었습니다.");
    });
  },

  renderGmEditorExport(content, kind) {
    const json = JSON.stringify(this.editorData(kind), null, 2);
    content.innerHTML = `
      <header class="phone-page-header gm-editor-header gm-editor-detail">
        <button class="gm-editor-back" type="button" aria-label="뒤로"><i class="fa-solid fa-chevron-left"></i></button>
        <p>연출 편집 · 내보내기</p>
        <h2>${kind === "messages" ? "메시지" : "이메일"} JSON</h2>
      </header>
      <div class="gm-editor-scroll">
        <textarea class="gm-json" readonly rows="16">${esc(json)}</textarea>
      </div>
      <div class="gm-compose gm-compose-save">
        <button class="gm-compose-add gm-json-copy" type="button"><i class="fa-solid fa-copy"></i> 복사</button>
      </div>
    `;
    content.querySelector(".gm-editor-back").addEventListener("click", () => this.renderGmEditor(content, kind));
    content.querySelector(".gm-json-copy").addEventListener("click", async () => {
      const ta = content.querySelector(".gm-json");
      try {
        await navigator.clipboard.writeText(ta.value);
        ui.notifications.info("MythPhone | 클립보드에 복사했습니다.");
      } catch (error) {
        ta.select();
        ui.notifications.warn("MythPhone | 자동 복사 실패 — 직접 복사하세요.");
      }
    });
  },

  renderGmEditorImport(content, kind) {
    content.innerHTML = `
      <header class="phone-page-header gm-editor-header gm-editor-detail">
        <button class="gm-editor-back" type="button" aria-label="뒤로"><i class="fa-solid fa-chevron-left"></i></button>
        <p>연출 편집 · 가져오기</p>
        <h2>${kind === "messages" ? "메시지" : "이메일"} JSON</h2>
      </header>
      <div class="gm-editor-scroll">
        <p class="gm-import-hint">JSON 배열을 붙여넣으면 현재 목록을 <b>덮어씁니다.</b></p>
        <textarea class="gm-json" rows="15" placeholder='[ { "id": "...", ... } ]'></textarea>
      </div>
      <div class="gm-compose gm-compose-save">
        <button class="gm-compose-add gm-json-apply" type="button"><i class="fa-solid fa-file-import"></i> 덮어쓰기</button>
      </div>
    `;
    content.querySelector(".gm-editor-back").addEventListener("click", () => this.renderGmEditor(content, kind));
    content.querySelector(".gm-json-apply").addEventListener("click", async () => {
      const raw = content.querySelector(".gm-json").value.trim();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        ui.notifications.error("MythPhone | JSON 형식 오류입니다.");
        return;
      }
      if (!Array.isArray(parsed)) {
        ui.notifications.error("MythPhone | 최상위는 배열이어야 합니다.");
        return;
      }
      parsed.forEach((entry) => { if (entry && !entry.id) entry.id = foundry.utils.randomID(); });
      await this.saveEditorData(kind, parsed);
      ui.notifications.info("MythPhone | 가져오기 완료.");
      this.renderGmEditor(content, kind);
    });
  },
};
