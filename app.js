const $ = s => document.querySelector(s);
const els = {
  login: $("#loginPanel"), nickname: $("#nicknamePanel"), game: $("#gameArea"),
  account: $("#account"), title: $("#gameTitle"), phase: $("#phasePill"),
  lobby: $("#lobbyView"), vote: $("#voteView"), playing: $("#playingView"), finished: $("#finishedView")
};
let me = null, socket = null, state = null, toastTimer;
function toast(message) {
  const node = $("#toast"); node.textContent = message; node.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
}
function showOnly(which) {
  [els.lobby, els.vote, els.playing, els.finished].forEach(x => x.classList.add("hidden"));
  which.classList.remove("hidden");
}
async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get("login") === "error") toast("카카오 로그인에 실패했습니다. 설정을 확인해 주세요.");
  if (params.get("login") === "cancelled") toast("로그인이 취소되었습니다.");
  if (params.has("login")) history.replaceState({}, "", "/");
  try {
    const data = await fetch("/api/me").then(r => r.json());
    me = data.user;
  } catch {}
  if (!me) { els.login.classList.remove("hidden"); return; }
  if (!me.nickname) {
    els.nickname.classList.remove("hidden");
    $("#nicknameInput").value = "";
    return;
  }
  enterGame();
}
function enterGame() {
  els.login.classList.add("hidden"); els.nickname.classList.add("hidden"); els.game.classList.remove("hidden");
  els.account.innerHTML = `<span>✦ ${escapeHtml(me.nickname)}</span> <button id="changeNicknameBtn" type="button">닉네임 변경</button> <button id="logoutBtn" type="button">로그아웃</button>`;
  $("#changeNicknameBtn").onclick = async () => {
    const next = prompt("새 게임 닉네임을 입력해 주세요. (2~12자)", me.nickname);
    if (next === null) return;
    const nickname = next.trim();
    if (nickname.length < 2 || nickname.length > 12) return toast("닉네임은 2~12자로 입력해 주세요.");
    try {
      const response = await fetch("/api/nickname/change", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({nickname})});
      const data = await response.json();
      if (!response.ok) return toast(data.error || "닉네임 변경에 실패했습니다.");
      me = data.user;
      els.account.querySelector("span").textContent = `✦ ${me.nickname}`;
      toast("닉네임이 변경되었습니다!");
    } catch { toast("서버에 연결할 수 없습니다. 다시 시도해 주세요."); }
  };
  $("#logoutBtn").onclick = async () => { await fetch("/auth/logout", {method:"POST"}); location.reload(); };
  socket = io();
  socket.on("connect", () => toast("게임룸에 입장했습니다!"));
  socket.on("state", render);
  socket.on("notice", toast);
  socket.on("disconnect", () => toast("연결이 끊겼습니다. 재접속을 시도합니다."));
  setInterval(() => {
    if (!state || state.phase !== "playing" || !state.turnDeadline) return;
    const remaining = Math.max(0, Math.ceil((state.turnDeadline - Date.now()) / 1000));
    const banner = $("#turnBanner");
    if (banner && state.turnPlayerId === me.id) banner.textContent = `✨ 내 차례입니다! ${remaining}초 안에 단어를 입력해 주세요.`;
    else if (banner) {
      const current = state.players.find(p => p.id === state.turnPlayerId);
      banner.textContent = `⏳ ${current ? current.name : "다음 참가자"}님의 차례 · ${remaining}초 남음`;
    }
  }, 250);
  $("#leaveGameBtn").onclick = () => {
    if (confirm("게임에서 나갈까요? 다시 참가하려면 재접속해야 합니다.")) {
      socket.emit("leave-game");
      socket.disconnect();
      location.reload();
    }
  };
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function render(s) {
  state = s;
  $("#playerCount").textContent = s.players.length;
  $("#sideCount").textContent = s.players.length;
  $("#hostLabel").textContent = s.hostId === me.id ? "✦ 내가 방장" : "방장 진행 중";
  const mineHost = s.hostId === me.id;
  document.querySelectorAll(".select-btn").forEach(b => b.disabled = !mineHost || s.phase !== "lobby");
  document.querySelectorAll(".select-btn").forEach(b => b.style.opacity = b.disabled ? ".5" : "1");
  $("#beginVoted").classList.toggle("hidden", !mineHost);
  $("#restartBtn").classList.toggle("hidden", !mineHost);
  $("#activityText").textContent = s.lastMessage;
  const current = s.players.find(p => p.id === s.turnPlayerId);
  const alive = s.players.filter(p => p.lives > 0);
  $("#playersList").innerHTML = s.players.length ? s.players.map(p => `
    <div class="player-row ${p.isTurn ? "active" : ""} ${!p.connected ? "disconnected" : ""}">
      <div class="avatar">${escapeHtml(p.name.slice(0,1))}</div>
      <div class="player-info"><b>${escapeHtml(p.name)} ${p.id === s.hostId ? "✦" : ""}</b><small>${p.lives === 0 ? "탈락" : p.isTurn ? "지금 차례!" : p.connected ? "참가 중" : "연결 끊김"}</small></div>
      <div class="hearts">${"❤️".repeat(p.lives)}${"🖤".repeat(3-p.lives)}</div>
    </div>`).join("") : '<div class="no-players">아직 참가자가 없습니다.</div>';
  if (s.phase === "lobby") {
    els.title.textContent = "게임 대기실"; els.phase.textContent = "WAITING"; showOnly(els.lobby);
  } else if (s.phase === "voting") {
    els.title.textContent = "초성 투표"; els.phase.textContent = "VOTING"; showOnly(els.vote);
    $("#suggestions").innerHTML = s.suggestions.length ? s.suggestions.map(item => `
      <div class="suggestion"><b>${escapeHtml(item.text)}</b><button class="${s.myVote === item.text ? "voted" : ""}" data-vote="${escapeHtml(item.text)}">투표 · ${item.votes}표</button></div>`).join("") : '<div class="no-players">첫 번째 초성을 제안해 주세요!</div>';
    $("#suggestions").querySelectorAll("[data-vote]").forEach(b => b.onclick = () => socket.emit("vote", b.dataset.vote));
  } else if (s.phase === "playing") {
    els.title.textContent = s.mode === "initial" ? "초성게임" : "끝말잇기"; els.phase.textContent = "PLAYING"; showOnly(els.playing);
    $("#missionLabel").textContent = s.mode === "initial" ? "오늘의 초성" : "현재 단어";
    $("#missionWord").textContent = s.mode === "initial" ? s.consonant : s.currentWord;
    $("#ruleHint").textContent = s.mode === "initial" ? "단어의 초성이 미션과 정확히 일치해야 해요." : `마지막 글자 '${[...s.currentWord].at(-1)}'로 시작하는 단어를 입력하세요.`;
    const isMine = s.turnPlayerId === me.id;
    const secondsLeft = s.turnDeadline ? Math.max(0, Math.ceil((s.turnDeadline - Date.now()) / 1000)) : 20;
    $("#turnBanner").textContent = isMine ? `✨ 내 차례입니다! ${secondsLeft}초 안에 단어를 입력해 주세요.` : `⏳ ${current ? current.name : "다음 참가자"}님의 차례 · ${secondsLeft}초 남음`;
    $("#turnBanner").classList.toggle("mine", isMine);
    $("#wordInput").disabled = !isMine; $("#wordForm button").disabled = !isMine;
    $("#usedCount").textContent = s.usedWords.length;
    $("#usedWords").innerHTML = s.usedWords.map(w => `<span class="word-chip">${escapeHtml(w)}</span>`).join("");
  } else if (s.phase === "finished") {
    els.title.textContent = "게임 종료"; els.phase.textContent = "FINISHED"; showOnly(els.finished);
    const winner = s.players.find(p => p.id === s.winner);
    $("#winnerName").textContent = winner ? `${winner.name} 우승!` : "우승자 없음";
  }
}
$("#nicknameForm").addEventListener("submit", async e => {
  e.preventDefault();
  const nickname = $("#nicknameInput").value.trim();
  const response = await fetch("/api/nickname", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname})});
  const data = await response.json();
  if (!response.ok) return toast(data.error || "닉네임을 확인해 주세요.");
  me = data.user; enterGame();
});
document.querySelectorAll(".select-btn").forEach(b => b.addEventListener("click", () => {
  if (!socket) return;
  socket.emit("start", b.dataset.mode);
}));
$("#proposalForm").addEventListener("submit", e => {
  e.preventDefault(); const value = $("#proposalInput").value.trim();
  if (value) { socket.emit("propose", value); $("#proposalInput").value = ""; }
});
$("#beginVoted").onclick = () => socket?.emit("begin-voted");
$("#wordForm").addEventListener("submit", e => {
  e.preventDefault(); const input = $("#wordInput");
  if (input.value.trim()) { socket.emit("play-word", input.value); input.value = ""; input.focus(); }
});
$("#restartBtn").onclick = () => socket?.emit("restart");
$("#copyLink").onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); toast("초대 링크를 복사했습니다!"); }
  catch { toast("주소창의 링크를 복사해 주세요."); }
};
boot();
