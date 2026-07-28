import { escapeHTML as esc, formatTime, userDisplayName } from "../utils.js";
import { debug, warn } from "../log.js";
import { PhoneStore } from "../store.js";

const MODULE_ID = "myth-phone";

export const chatMethods = {
  renderMessages(content) {
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
        ${PhoneStore.visibleList("messages").map((conversation) =>
          this.conversationItem(conversation)
        ).join("")}
      </div>
    `;

    this.bindConversationList(content, "messages");
  },

  renderBubbleTalk(content, section = "friends") {
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
    const chatFilter = isFriends ? "all" : (this.bubbleChatFilter ?? "all");
    const filtered = conversations.filter((room) =>
      chatFilter === "unread" ? room.unread > 0 : true);
    const unreadRooms = conversations.filter((room) => room.unread > 0).length;
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
      ${isFriends ? "" : `
      <div class="bubbletalk-filters">
        <button class="bubbletalk-filter ${chatFilter === "all" ? "is-active" : ""}" type="button" data-bubble-filter="all">전체</button>
        <button class="bubbletalk-filter ${chatFilter === "unread" ? "is-active" : ""}" type="button" data-bubble-filter="unread">안읽음${unreadRooms ? ` ${unreadRooms}` : ""}</button>
      </div>`}
      <div class="${isFriends ? "bubbletalk-friend-list" : "phone-conversation-list"}">
        ${isFriends
          ? this.bubbleTalkFriendItems()
          : conversations.length
            ? (filtered.length
                ? this.bubbleGroupedListHTML(filtered)
                : `<div class="bubbletalk-empty"><i class="fa-regular fa-comments"></i><p>해당하는 대화가 없습니다.</p></div>`)
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
        this.bubbleChatFilter = "all";
        this.renderBubbleTalk(content, button.dataset.bubbletalkSection);
      });
    });
    content.querySelectorAll("[data-bubble-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        this.bubbleChatFilter = button.dataset.bubbleFilter;
        this.renderBubbleTalk(content, section);
      });
    });
    content.querySelector(".bubbletalk-npc-chat")?.addEventListener("click", () => {
      this.renderNpcChatForm(content);
    });
    content.querySelector(".bubbletalk-group-create")?.addEventListener("click", () => {
      this.renderGroupChatForm(content);
    });
  },

  bubbleGroupedListHTML(rooms) {
    // 대화가 많을 때만 날짜 구획을 켠다 — 적을 땐 라벨이 방 1개씩 감싸 휑해지므로
    if (rooms.length < 8) {
      return rooms.map((room) => this.bubbleTalkConversationItem(room)).join("");
    }
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const buckets = { today: [], yesterday: [], older: [] };
    rooms.forEach((room) => {
      const time = room.listTime ?? 0;
      const key = time >= startOfToday ? "today" : time >= startOfYesterday ? "yesterday" : "older";
      buckets[key].push(room);
    });
    const labels = { today: "오늘", yesterday: "어제", older: "지난 대화" };
    return ["today", "yesterday", "older"]
      .filter((key) => buckets[key].length)
      .map((key) =>
        `<div class="bubbletalk-date-sep">${labels[key]}</div>`
        + buckets[key].map((room) => this.bubbleTalkConversationItem(room)).join(""))
      .join("");
  },

  renderGroupChatForm(content) {
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
  },

  renderNpcChatForm(content) {
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
  },

  bubbleTalkFriendItems() {
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
  },

  bindBubbleTalkFriends(content) {
    content.querySelectorAll(".bubbletalk-friend").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.conversationId) {
          this.renderBubbleTalkChat(content, button.dataset.conversationId);
        }
      });
    });
  },

  bubbleTalkConversationItem(conversation) {
    const isGroup = conversation.type === "group";
    return `
      <button class="bubbletalk-conversation ${conversation.unread ? "is-unread" : ""}" type="button"
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
  },

  bindBubbleTalkConversations(content) {
    content.querySelectorAll(".bubbletalk-conversation").forEach((button) => {
      button.addEventListener("click", () => {
        this.renderBubbleTalkChat(content, button.dataset.conversationId);
      });
    });
  },

  bindConversationList(content, app) {
    content.querySelectorAll(".phone-conversation").forEach((button) => {
      button.addEventListener("click", () => {
        this.renderChat(content, button.dataset.conversationId, app);
      });
    });

    this.bindListSearch(content, ".phone-conversation");
  },

  bindListSearch(content, itemSelector) {
    const search = content.querySelector('input[type="search"]');
    if (!search) return;
    search.addEventListener("input", () => {
      const query = search.value.trim().toLocaleLowerCase();
      content.querySelectorAll(itemSelector).forEach((item) => {
        item.hidden = !item.dataset.name.toLocaleLowerCase().includes(query);
      });
    });
  },

  conversationItem(conversation) {
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
  },

  renderBubbleTalkChat(content, conversationId) {
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
  },

  bubbleTalkMessage(message, conversation, { first = true, last = true } = {}) {
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
    // 버블톡은 시간 미표시(실시간 잡담). timestamp 값은 안읽음·읽음·정렬에만 쓰고 화면엔 안 그림.
    const meta = last && isSent && readCount
      ? `<span class="bubbletalk-message-meta"><b class="bubbletalk-read">${readCount}</b></span>`
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
  },

  sendBubbleMessage(conversation, text, image = null) {
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
  },

  openImagePopout(src) {
    try {
      const PopoutClass = foundry.applications?.apps?.ImagePopout ?? ImagePopout;
      new PopoutClass({ src, window: { title: "이미지" } }).render(true);
    } catch (error) {
      warn("이미지 팝업을 열 수 없어 새 창으로 대체합니다.", error);
      window.open(src, "_blank");
    }
  },

  bubbleTalkEntryView(entry, room) {
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
  },

  bubbleLogHTML(viewMessages, conversation) {
    const sameGroup = (a, b) => Boolean(a && b)
      && a.direction === b.direction && a.sender === b.sender;
    return viewMessages.map((message, index) => this.bubbleTalkMessage(message, conversation, {
      first: !sameGroup(viewMessages[index - 1], message),
      last: !sameGroup(message, viewMessages[index + 1])
    })).join("");
  },

  refreshOpenChatLog() {
    if (!this.openBubbleRoomId) return;
    const room = PhoneStore.rooms.get(this.openBubbleRoomId);
    const log = this.wrapper?.querySelector(".bubbletalk-chat-log");
    if (!room || !log) return;

    const viewMessages = room.messages.map((entry) => this.bubbleTalkEntryView(entry, room));
    log.innerHTML = this.bubbleLogHTML(viewMessages, room);
    log.lastElementChild?.scrollIntoView({ block: "end" });
  },

  updateAppBadges() {
    const button = this.wrapper?.querySelector('.smartphone-app-grid [data-app="bubbletalk"]');
    if (!button) return;
    button.querySelector(".smartphone-app-badge")?.remove();
    const total = PhoneStore.totalUnread();
    if (total) {
      button.insertAdjacentHTML("beforeend", `<b class="smartphone-app-badge">${total}</b>`);
    }
  },

  playNotificationTone() {
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
      warn("알림음을 재생할 수 없습니다.", error);
    }
  },

  onBubbleTalkMessage(room, entry) {
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
      if (game.settings.get(MODULE_ID, "notifEnabled")) {
        const text = (entry.text ?? "").trim() || (entry.image ? "사진" : "");
        const body = game.settings.get(MODULE_ID, "notifPreview") && text
          ? `${entry.authorName}: ${text.length > 40 ? text.slice(0, 40) + "…" : text}`
          : `${entry.authorName} 님의 새 메시지`;
        ui.notifications.info(`버블톡 | ${body}`);
      }
      if (game.settings.get(MODULE_ID, "notifSound")) this.playNotificationTone();
      this.updateAppBadges();
    }
  },

  // GM이 연출 메시지·이메일을 발송한 순간의 도착 알림 (대상자에게만).
  // 데이터 자체는 updateSetting 훅으로 동기화되므로 여기선 알림만 담당한다.
  onStagedDelivery(payload) {
    if (game.user.isGM || !payload.targets?.includes(game.user.id)) return;
    const label = payload.kind === "emails" ? "이메일" : "메시지";
    if (game.settings.get(MODULE_ID, "notifEnabled")) {
      const preview = (payload.preview ?? "").trim();
      const body = game.settings.get(MODULE_ID, "notifPreview") && preview
        ? `${payload.title}: ${preview.length > 40 ? preview.slice(0, 40) + "…" : preview}`
        : `새 ${label} 도착`;
      ui.notifications.info(`${label} | ${body}`);
    }
    if (game.settings.get(MODULE_ID, "notifSound")) this.playNotificationTone();
  },

  bubbleTalkTyping(conversation) {
    return `
      <div class="bubbletalk-message is-received">
        <span class="bubbletalk-message-avatar">${conversation.initial ?? "?"}</span>
        <div>
          <span class="bubbletalk-typing" role="status" aria-label="입력 중"><i></i><i></i><i></i></span>
        </div>
      </div>
    `;
  },

  renderChat(content, conversationId, app = "messages") {
    const conversation = PhoneStore.visibleList(app).find(
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
          `<p class="is-${message.direction}">${esc(message.text)}</p>`
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
  },
};
