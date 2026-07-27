import { gmEditorMethods } from "./gm-editor.js";

const { ApplicationV2 } = foundry.applications.api;

// 연출 편집기 — 폰에서 분리된 독립 창(GM 전용, 좌측 Scene Controls에서 연다).
// 렌더링은 gmEditorMethods를 그대로 재사용한다(폰에 있던 명령형 innerHTML 방식).
// 이 창은 `#root`(빈 div) 하나만 프레임에 붙이고, 그 안을 gmEditorMethods가 직접 그린다.
export class GmEditorWindow extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "myth-phone-gm-editor",
    classes: ["mp-gm-app"],
    tag: "div",
    window: {
      title: "MythPhone · 연출 편집기",
      icon: "fa-solid fa-user-pen",
      resizable: true,
    },
    position: { width: 760, height: 680 },
  };

  // gmEditorMethods가 참조하는 인스턴스 상태
  tab = "messages";
  gmComposeDir = "received";
  gmFocusCompose = false;

  static #instance = null;

  // 좌측 Scene Controls 버튼·API가 호출하는 진입점
  static open() {
    if (!game.user.isGM) return null;
    this.#instance ??= new this();
    this.#instance.render(true);
    return this.#instance;
  }

  // 원격 GM이 정본을 바꾸면 열려 있는 창을 다시 그린다(상세 편집 중이면 건너뜀)
  static refreshIfOpen() {
    const app = this.#instance;
    if (!app?.rendered || !app._root) return;
    if (app._root.querySelector(".gm-editor-detail")) return;
    app.renderBody();
  }

  async _renderHTML() {
    return "";
  }

  _replaceHTML(_result, content) {
    content.innerHTML = `<div class="gm-editor-root"></div>`;
    this._root = content.querySelector(".gm-editor-root");
    this.renderBody();
  }

  renderBody() {
    if (this._root) this.renderGmEditor(this._root, this.tab);
  }
}

// 폰에 있던 렌더 로직을 창 인스턴스에 그대로 이식한다.
Object.assign(GmEditorWindow.prototype, gmEditorMethods);
