import { escapeHTML as esc } from "../utils.js";
import { PhoneStore } from "../store.js";

const MODULE_ID = "myth-phone";

export const emailMethods = {
  renderEmail(content) {
    content.closest(".smartphone-app-view")?.classList.remove("is-chat-open");
    const emails = PhoneStore.visibleList("emails");

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
            ${PhoneStore.stagedUnread("emails", email) ? '<i class="phone-email-dot" aria-label="안 읽음"></i>' : "<i></i>"}
            <span class="phone-email-copy">
              <span class="phone-email-top">
                <strong>${esc(email.from?.name ?? "알 수 없음")}</strong>
                <time>${esc(PhoneStore.stagedTimeLabel(email))}</time>
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
  },

  renderEmailDetail(content, emailId) {
    const email = PhoneStore.visibleList("emails").find((item) => item.id === emailId);
    if (!email) {
      this.renderEmail(content);
      return;
    }
    PhoneStore.markStagedRead("emails", email); // 열면 읽음 — 목록 점이 사라진다

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
            <small>${[email.from?.address, PhoneStore.stagedTimeLabel(email, { detail: true })]
              .filter(Boolean).map((part) => esc(part)).join(" · ")}</small>
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
  },
};
