import { escapeHTML as esc, userDisplayName } from "../utils.js";
import { PhoneStore } from "../store.js";

const MODULE_ID = "myth-phone";

export const contactsMethods = {
  renderContacts(content) {
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
  },

  renderContactForm(content, actorId = null) {
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
  },
};
