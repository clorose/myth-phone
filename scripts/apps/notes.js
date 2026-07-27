const MODULE_ID = "myth-phone";

export const notesMethods = {
  renderNotes(content) {
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
  },
};
