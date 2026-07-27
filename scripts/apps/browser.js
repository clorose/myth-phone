import { escapeHTML as esc, debug } from "../utils.js";

const MODULE_ID = "myth-phone";

export const browserMethods = {
  browserSites() {
    return game.settings.get(MODULE_ID, "sites") ?? [];
  },

  renderBrowser(content) {
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
  },

  renderSiteForm(content) {
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
  },

  renderBrowserPage(content, url) {
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
  },
};
