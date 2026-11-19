const express = require("express");
const http = require("http");
const session = require("express-session");
const axios = require("axios");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
});

app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, "public")));
io.engine.use(sessionMiddleware);

app.get("/auth/kakao", (req, res) => {
  const key = process.env.KAKAO_REST_API_KEY;
  const redirect = process.env.KAKAO_REDIRECT_URI;
  if (!key || !redirect) return res.status(500).send("카카오 로그인 환경변수가 설정되지 않았습니다. README를 확인해 주세요.");
  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("client_id", key);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  res.redirect(url.toString());
});

app.get("/auth/kakao/callback", async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error || !code) return res.redirect("/?login=cancelled");
    const tokenResponse = await axios.post(
      "https://kauth.kakao.com/oauth/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.KAKAO_REST_API_KEY,
        redirect_uri: process.env.KAKAO_REDIRECT_URI,
        code
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const profileResponse = await axios.get("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` }
    });
    const kakao = profileResponse.data;
    req.session.user = {
      id: String(kakao.id),
      kakaoName: kakao.kakao_account?.profile?.nickname || "카카오 사용자",
      nickname: null
    };
    req.session.save(() => res.redirect("/"));
  } catch (err) {
    console.error("Kakao OAuth error:", err.response?.data || err.message);
    res.redirect("/?login=error");
  }
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post("/api/nickname", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });
  const nickname = String(req.body.nickname || "").trim().replace(/[<>]/g, "").slice(0, 12);
  if (nickname.length < 2) return res.status(400).json({ error: "닉네임은 2~12자로 입력해 주세요." });
  req.session.user.nickname = nickname;
  req.session.save(() => res.json({ user: req.session.user }));
});

app.post("/api/nickname/change", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "로그인이 필요합니다." });
  const nickname = String(req.body.nickname || "").trim().replace(/[<>]/g, "").slice(0, 12);
  if (nickname.length < 2) return res.status(400).json({ error: "닉네임은 2~12자로 입력해 주세요." });
  req.session.user.nickname = nickname;
  const player = game.players.get(String(req.session.user.id));
  if (player) player.name = nickname;
  req.session.save(err => {
    if (err) return res.status(500).json({ error: "닉네임 저장에 실패했습니다. 다시 시도해 주세요." });
    if (player) {
      game.lastMessage = `${nickname}님이 닉네임을 변경했습니다.`;
      broadcast();
    }
    res.json({ user: req.session.user });
  });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

const INITIALS = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function getInitials(word) {
  return [...word].map(ch => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return ch;
    return INITIALS[Math.floor(code / 588)];
  }).join("");
}
const START_WORDS = ["사과", "학교", "기차", "바나나", "고양이", "토마토", "자동차", "라디오"];
const EXTRA_MODES = ["updown", "baseball", "math", "ox", "rps", "oddeven"];
const MODE_NAMES = {initial:"초성게임", chain:"끝말잇기", updown:"업다운",baseball:"숫자야구",math:"암산왕",ox:"OX퀴즈",rps:"가위바위보",oddeven:"홀짝 맞히기"};
const OX_QUESTIONS = [
  ["지구는 태양 주위를 돈다.", "O"], ["물은 표준 대기압에서 100°C에 끓는다.", "O"],
  ["대한민국의 수도는 부산이다.", "X"], ["한 주는 8일이다.", "X"],
  ["박쥐는 포유류다.", "O"], ["태양은 행성이다.", "X"],
  ["한글 자음 기본자는 ㄱ, ㄴ, ㅁ, ㅅ, ㅇ이다.", "O"], ["1킬로미터는 100미터이다.", "X"],
  ["고래는 아가미로 숨을 쉰다.", "X"], ["달은 지구의 자연위성이다.", "O"],
  ["삼각형의 내각의 합은 평면에서 180도다.", "O"], ["금성은 태양계에서 가장 바깥쪽 행성이다.", "X"],
  ["무지개는 일반적으로 일곱 가지 색으로 표현한다.", "O"], ["지구는 완벽한 정육면체이다.", "X"],
  ["거미는 곤충이다.", "X"], ["사람의 심장은 보통 네 개의 방으로 이루어져 있다.", "O"]
];
const randomInt = (min, max) => Math.floor(Math.random() * (max-min+1))+min;
function newBaseballNumber() { return [..."0123456789"].sort(() => Math.random()-0.5).slice(0,3).join(""); }
function makeChallenge(mode) {
  if (mode === "updown") return {prompt:"1부터 100까지 숫자를 맞혀보세요", secret:randomInt(1,100), hint:"숫자만 입력하세요 (1~100)."};
  if (mode === "baseball") return {prompt:"서로 다른 숫자 3개를 추리하세요", secret:newBaseballNumber(), hint:"예: 123 (중복 숫자 없이, 0으로 시작해도 돼요)."};
  if (mode === "math") {
    const op = ["+","-","×"][randomInt(0,2)]; let a=randomInt(2,20),b=randomInt(2,15);
    if (op === "-" && b > a) [a,b] = [b,a];
    return {prompt:`${a} ${op} ${b} = ?`, answer:String(op === "+" ? a+b : op === "-" ? a-b : a*b), hint:"정답 숫자를 입력하세요."};
  }
  if (mode === "ox") { const q = OX_QUESTIONS[randomInt(0,OX_QUESTIONS.length-1)]; return {prompt:q[0], answer:q[1], hint:"O 또는 X로 답해 주세요."}; }
  if (mode === "rps") return {prompt:"가위, 바위, 보 중 하나를 선택!",hint:"가위 / 바위 / 보 중 하나를 입력하세요."};
  if (mode === "oddeven") return {prompt:"다음에 뽑힐 숫자는 홀수? 짝수?",hint:"홀 또는 짝을 입력하세요."};
  return null;
}


let turnTimer = null;
let turnDeadline = null;
let turnTimerToken = 0;
const TURN_TIMEOUT_MS = 20_000;

const game = {
  players: new Map(),
  phase: "lobby",
  mode: null,
  turnOrder: [],
  turnIndex: 0,
  usedWords: [],
  currentWord: "",
  consonant: "",
  suggestions: [],
  votes: {},
  winner: null,
  hostId: null,
  lastMessage: "게임을 선택하고 친구들을 초대해 보세요.",
  challenge: null
};

function publicState() {
  const players = [...game.players.values()].map(p => ({
    id: p.id, name: p.name, lives: p.lives, connected: p.connected,
    isTurn: game.phase === "playing" && game.turnOrder[game.turnIndex] === p.id
  }));
  return {
    players, phase: game.phase, mode: game.mode, turnOrder: game.turnOrder,
    turnIndex: game.turnIndex, usedWords: game.usedWords,
    currentWord: game.currentWord, consonant: game.consonant,
    suggestions: game.suggestions.map(s => ({ text: s.text, votes: Object.values(game.votes).filter(v => v === s.text).length })),
    winner: game.winner, hostId: game.hostId, lastMessage: game.lastMessage,
    turnPlayerId: game.phase === "playing" ? game.turnOrder[game.turnIndex] : null,
    turnDeadline,
    challenge: game.challenge ? {prompt:game.challenge.prompt, hint:game.challenge.hint} : null
  };
}
function broadcast() { io.emit("state", publicState()); }
function clearTurnTimer() {
  turnTimerToken++;
  if (turnTimer) clearTimeout(turnTimer);
  turnTimer = null;
  turnDeadline = null;
}
function armTurnTimer() {
  clearTurnTimer();
  if (game.phase !== "playing") return;
  const currentId = game.turnOrder[game.turnIndex];
  if (!currentId) return;
  const token = turnTimerToken;
  turnDeadline = Date.now() + TURN_TIMEOUT_MS;
  turnTimer = setTimeout(() => {
    if (token !== turnTimerToken || game.phase !== "playing" || game.turnOrder[game.turnIndex] !== currentId) return;
    removePlayer(currentId, "20초 동안 응답이 없어 자동 퇴장했습니다.");
  }, TURN_TIMEOUT_MS);
}
function moveToNextTurn() {
  game.turnIndex = nextAliveIndex(game.turnIndex);
  if (EXTRA_MODES.includes(game.mode) && !["updown", "baseball"].includes(game.mode)) game.challenge = makeChallenge(game.mode);
  armTurnTimer();
}
function removePlayer(id, reason = "게임에서 나갔습니다.") {
  const player = game.players.get(id);
  if (!player) return;
  const oldIndex = game.turnOrder.indexOf(id);
  const wasTurn = game.phase === "playing" && oldIndex === game.turnIndex;
  const socket = player.socketId && io.sockets.sockets.get(player.socketId);
  if (socket) socket.disconnect(true);
  game.players.delete(id);
  game.turnOrder = game.turnOrder.filter(pid => pid !== id);
  if (oldIndex >= 0 && oldIndex < game.turnIndex) game.turnIndex--;
  if (game.turnIndex >= game.turnOrder.length) game.turnIndex = 0;
  if (game.hostId === id) game.hostId = [...game.players.values()].find(p => p.connected)?.id || [...game.players.keys()][0] || null;
  game.lastMessage = `${player.name}님이 ${reason}`;
  if (game.phase === "playing") {
    if (finishIfNeeded()) clearTurnTimer();
    else if (wasTurn) armTurnTimer();
  }
  if (game.players.size === 0) game.hostId = null;
  broadcast();
}
function alivePlayers() { return [...game.players.values()].filter(p => p.lives > 0); }
function nextAliveIndex(from) {
  if (!game.turnOrder.length) return 0;
  for (let step = 1; step <= game.turnOrder.length; step++) {
    const idx = (from + step) % game.turnOrder.length;
    const p = game.players.get(game.turnOrder[idx]);
    if (p && p.lives > 0) return idx;
  }
  return from;
}
function finishIfNeeded() {
  const alive = alivePlayers();
  if (alive.length <= 1 && game.phase === "playing") {
    game.phase = "finished";
    game.winner = alive[0]?.id || null;
    game.lastMessage = alive[0] ? `${alive[0].name}님이 최후의 1인으로 우승했습니다! 🏆` : "모든 참가자가 탈락했습니다.";
    return true;
  }
  return false;
}
function penalize(player, reason) {
  player.lives = Math.max(0, player.lives - 1);
  game.lastMessage = player.lives > 0
    ? `${player.name}님: ${reason} 생명 1개 차감! (남은 생명 ${player.lives})`
    : `${player.name}님 탈락!`;
  if (finishIfNeeded()) return;
  moveToNextTurn();
}
function startPlaying(mode, consonant = "", seed = "") {
  clearTurnTimer();
  game.mode = mode;
  game.consonant = consonant;
  game.phase = "playing";
  game.turnOrder = [...game.players.values()].filter(p => p.lives > 0).map(p => p.id);
  game.turnIndex = 0;
  game.usedWords = seed ? [seed] : [];
  game.currentWord = seed;
  game.winner = null;
  game.challenge = EXTRA_MODES.includes(mode) ? makeChallenge(mode) : null;
  game.lastMessage = mode === "chain"
    ? `첫 단어는 '${seed}'입니다. '${[...seed].at(-1)}'로 시작하는 단어를 이어 주세요!`
    : mode === "initial" ? `제시된 초성 '${consonant}'에 맞는 단어를 입력하세요!`
    : `${MODE_NAMES[mode]} 시작! 순서대로 도전하세요.`;
  armTurnTimer();
  broadcast();
}
function resetGame() {
  clearTurnTimer();
  game.phase = "lobby"; game.mode = null; game.turnOrder = []; game.turnIndex = 0;
  game.usedWords = []; game.currentWord = ""; game.consonant = "";
  game.suggestions = []; game.votes = {}; game.winner = null; game.challenge = null;
  for (const p of game.players.values()) p.lives = 3;
  game.lastMessage = "새 게임을 시작할 수 있습니다.";
  broadcast();
}

io.on("connection", socket => {
  const user = socket.request.session.user;
  if (!user?.nickname) { socket.disconnect(true); return; }
  const id = user.id;
  const existing = game.players.get(id);
  if (existing) {
    existing.connected = true;
    existing.socketId = socket.id;
  } else {
    game.players.set(id, { id, name: user.nickname, lives: 3, connected: true, socketId: socket.id });
  }
  if (!game.hostId) game.hostId = id;
  socket.data.playerId = id;
  broadcast();

  socket.on("propose", text => {
    if (game.phase !== "voting") return;
    const value = String(text || "").replace(/[^ㄱ-ㅎ]/g, "").slice(0, 8);
    if (!value || game.suggestions.some(s => s.text === value)) return socket.emit("notice", "새로운 초성을 입력해 주세요.");
    if (game.suggestions.length >= 20) return socket.emit("notice", "초성 제안은 최대 20개까지 가능합니다.");
    game.suggestions.push({ text: value, by: id });
    broadcast();
  });
  socket.on("vote", text => {
    if (game.phase !== "voting" || !game.suggestions.some(s => s.text === text)) return;
    game.votes[id] = text;
    broadcast();
  });
  socket.on("start", mode => {
    if (id !== game.hostId || !["initial", "chain", ...EXTRA_MODES].includes(mode) || game.phase !== "lobby") return;
    if (alivePlayers().length < 2) return socket.emit("notice", "게임을 시작하려면 참가자가 2명 이상 필요합니다.");
    if (mode === "initial") {
      game.mode = "initial"; game.phase = "voting"; game.suggestions = []; game.votes = {};
      game.lastMessage = "원하는 초성을 제안하고, 마음에 드는 초성에 투표하세요.";
      broadcast();
    } else if (mode === "chain") {
      startPlaying("chain", "", START_WORDS[Math.floor(Math.random() * START_WORDS.length)]);
    } else {
      startPlaying(mode);
    }
  });
  socket.on("begin-voted", () => {
    if (id !== game.hostId || game.phase !== "voting") return;
    const tally = game.suggestions.map(s => ({ text: s.text, votes: Object.values(game.votes).filter(v => v === s.text).length }));
    if (!tally.length) return socket.emit("notice", "먼저 초성을 하나 이상 제안해 주세요.");
    tally.sort((a,b) => b.votes - a.votes || a.text.localeCompare(b.text, "ko"));
    startPlaying("initial", tally[0].text);
  });
  socket.on("play-word", raw => {
    if (game.phase !== "playing") return;
    const player = game.players.get(id);
    if (!player || player.lives <= 0) return;
    if (game.turnOrder[game.turnIndex] !== id) return socket.emit("notice", "아직 내 차례가 아닙니다.");
    const word = String(raw || "").trim().replace(/\s+/g, "").slice(0, 30);
    if (EXTRA_MODES.includes(game.mode)) {
      const challenge = game.challenge;
      if (!challenge) return;
      let correct = false, result = "", solved = false;
      if (game.mode === "updown") {
        const guess = Number(word);
        if (!/^\d+$/.test(word) || guess < 1 || guess > 100) return socket.emit("notice", "1~100 사이의 숫자를 입력해 주세요.");
        correct = guess === challenge.secret; solved = correct;
        result = correct ? `정답 ${guess}!` : `${guess}보다 ${guess < challenge.secret ? "UP ↑" : "DOWN ↓"}!`;
      } else if (game.mode === "baseball") {
        if (!/^\d{3}$/.test(word) || new Set(word).size !== 3) return socket.emit("notice", "서로 다른 숫자 3자리를 입력해 주세요.");
        const strikes = [...word].filter((n,i) => n === challenge.secret[i]).length;
        const balls = [...word].filter((n,i) => n !== challenge.secret[i] && challenge.secret.includes(n)).length;
        correct = strikes === 3; solved = correct;
        result = correct ? `3스트라이크! 정답 ${word}!` : `${word} → ${strikes}S ${balls}B`;
      } else if (game.mode === "math") {
        if (!/^-?\d+$/.test(word)) return socket.emit("notice", "숫자로 답을 입력하세요.");
        correct = word === challenge.answer;
        result = correct ? `정답! ${challenge.prompt} ${challenge.answer}` : `오답! 정답은 ${challenge.answer}입니다.`;
      } else if (game.mode === "ox") {
        const choice = word.toUpperCase();
        if (!["O","X","ㅇ","ㅈ"].includes(choice)) return socket.emit("notice", "O 또는 X를 입력하세요.");
        correct = (choice === "ㅇ" ? "O" : choice === "ㅈ" ? "X" : choice) === challenge.answer;
        result = correct ? `정답! ${challenge.answer}` : `오답! 정답은 ${challenge.answer}입니다.`;
      } else if (game.mode === "rps") {
        if (!["가위","바위","보"].includes(word)) return socket.emit("notice", "가위, 바위, 보 중에서 입력해 주세요.");
        const options=["가위","바위","보"], computer=options[randomInt(0,2)];
        correct = word === computer || (word === "가위" && computer === "보") || (word === "바위" && computer === "가위") || (word === "보" && computer === "바위");
        result = `${word} vs 컴퓨터 ${computer} → ${word === computer ? "무승부 (통과)" : correct ? "승리!" : "패배!"}`;
      } else if (game.mode === "oddeven") {
        if (!["홀","짝","홀수","짝수"].includes(word)) return socket.emit("notice", "홀 또는 짝을 입력해 주세요.");
        const number=randomInt(1,99), choice=word.startsWith("홀") ? "홀" : "짝";
        correct = (number % 2 ? "홀" : "짝") === choice;
        result = `${choice} 선택 → ${number} (${number % 2 ? "홀" : "짝"}) ${correct ? "정답!" : "오답!"}`;
      }
      game.usedWords.push(`${player.name}: ${result}`);
      if (game.usedWords.length > 40) game.usedWords.shift();
      if (correct) {
        game.lastMessage = `${player.name}님: ${result}`;
        if (solved) game.challenge = makeChallenge(game.mode);
        moveToNextTurn();
      } else {
        penalize(player, result);
      }
      broadcast();
      return;
    }
    if (!/^[가-힣]{2,10}$/.test(word)) {
      penalize(player, "한글 2~10자의 단어가 아닙니다.");
    } else if (game.usedWords.includes(word)) {
      penalize(player, "이미 사용한 단어입니다.");
    } else if (game.mode === "initial" && getInitials(word) !== game.consonant) {
      penalize(player, `초성 '${game.consonant}'과 일치하지 않습니다.`);
    } else if (game.mode === "chain" && game.currentWord && [...word][0] !== [...game.currentWord].at(-1)) {
      penalize(player, ` '${[...game.currentWord].at(-1)}'로 시작해야 합니다.`);
    } else {
      game.usedWords.push(word);
      game.currentWord = word;
      game.lastMessage = `${player.name}님이 '${word}'을(를) 입력했습니다.`;
      if (finishIfNeeded()) { clearTurnTimer(); broadcast(); return; }
      moveToNextTurn();
    }
    if (game.phase === "playing" && game.turnOrder[game.turnIndex] === id) armTurnTimer();
    broadcast();
  });
  socket.on("leave-game", () => {
    removePlayer(id, "직접 게임에서 퇴장했습니다.");
  });
  socket.on("restart", () => {
    if (id !== game.hostId || !["finished", "playing", "voting"].includes(game.phase)) return;
    resetGame();
  });
  socket.on("disconnect", () => {
    const p = game.players.get(id);
    if (p && p.socketId === socket.id) {
      p.connected = false;
      if (game.hostId === id) {
        const nextHost = [...game.players.values()].find(candidate => candidate.connected);
        game.hostId = nextHost?.id || null;
      }
      broadcast();
    }
  });
});

server.listen(PORT, () => console.log(`Zeta mini games listening on ${PORT}`));
