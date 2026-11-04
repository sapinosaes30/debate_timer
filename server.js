const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingInterval: 25000,
  pingTimeout: 20000
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const SPEAKERS = [
  { id: "PM", name: "Prime Minister", side: "government", kind: "substantive" },
  { id: "LO", name: "Leader of Opposition", side: "opposition", kind: "substantive" },
  { id: "DPM", name: "Deputy Prime Minister", side: "government", kind: "substantive" },
  { id: "DLO", name: "Deputy Leader of Opposition", side: "opposition", kind: "substantive" },
  { id: "GW", name: "Government Whip", side: "government", kind: "substantive" },
  { id: "OW", name: "Opposition Whip", side: "opposition", kind: "substantive" },
  { id: "OR", name: "Opposition Reply", side: "opposition", kind: "reply" },
  { id: "GR", name: "Government Reply", side: "government", kind: "reply" }
];

const PRESETS = {
  standard: { label: "Preliminary (standard)", substantive: 6, reply: 3, grace: 1 },
  short: { label: "Preliminary (short)", substantive: 5, reply: 2, grace: 1 },
  semis: { label: "Quarterfinals / Semifinals", substantive: 7, reply: 3, grace: 1 },
  grand: { label: "Grand Final", substantive: 7, reply: 4, grace: 1 },
  extended: { label: "Extended Grand Final", substantive: 8, reply: 4, grace: 1 },
  custom: { label: "Custom", substantive: 7, reply: 4, grace: 1 }
};

function cleanRoom(value) {
  return String(value || "ROUND1").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "ROUND1";
}
function freshState() {
  return {
    room: "ROUND1",
    speakerIndex: 0,
    preset: "standard",
    substantiveMinutes: 6,
    replyMinutes: 3,
    graceSeconds: 60,
    remainingMs: 6 * 60 * 1000,
    durationMs: 6 * 60 * 1000,
    startedAt: null,
    running: false,
    finished: false,
    poiOverride: null,
    updatedAt: Date.now(),
    signalsFired: []
  };
}
function durationFor(state) {
  const speaker = SPEAKERS[state.speakerIndex];
  const minutes = speaker.kind === "reply" ? state.replyMinutes : state.substantiveMinutes;
  return Math.max(1, Number(minutes) || 1) * 60000;
}
function elapsedFor(state, now = Date.now()) {
  if (!state.startedAt) return Math.max(0, state.durationMs - state.remainingMs);
  return Math.max(0, state.durationMs - state.remainingMs + (now - state.startedAt));
}
function snapshot(state, now = Date.now()) {
  const elapsed = elapsedFor(state, now);
  const totalMs = state.durationMs + state.graceSeconds * 1000;
  const remainingMs = state.running
    ? Math.max(0, state.remainingMs - (now - state.startedAt))
    : state.remainingMs;
  const speaker = SPEAKERS[state.speakerIndex];
  const inGrace = elapsed >= state.durationMs && elapsed < totalMs && !state.finished;
  const poiAllowed = speaker.kind === "substantive" &&
    elapsed >= 60000 && elapsed < Math.max(60000, state.durationMs - 60000) &&
    !state.finished && state.poiOverride !== false;
  return {
    room: state.room,
    speakerIndex: state.speakerIndex,
    speaker,
    speakers: SPEAKERS,
    preset: state.preset,
    presets: PRESETS,
    substantiveMinutes: state.substantiveMinutes,
    replyMinutes: state.replyMinutes,
    graceSeconds: state.graceSeconds,
    durationMs: state.durationMs,
    elapsedMs: Math.min(elapsed, totalMs),
    remainingMs: Math.max(0, remainingMs),
    running: state.running,
    finished: state.finished,
    inGrace,
    poiAllowed,
    poiOverride: state.poiOverride,
    updatedAt: state.updatedAt
  };
}
function emitState(room) {
  const state = rooms.get(room);
  if (state) io.to(room).emit("state", snapshot(state));
}
function ensureRoom(room) {
  if (!rooms.has(room)) {
    const state = freshState();
    state.room = room;
    rooms.set(room, state);
  }
  return rooms.get(room);
}
function stopAndSetSpeaker(state, index) {
  state.speakerIndex = Math.max(0, Math.min(SPEAKERS.length - 1, index));
  state.running = false;
  state.finished = false;
  state.startedAt = null;
  state.poiOverride = null;
  state.signalsFired = [];
  state.durationMs = durationFor(state);
  state.remainingMs = state.durationMs;
  state.updatedAt = Date.now();
}

app.use(express.static(path.join(__dirname, "public")));
app.get("/display", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/health", (req, res) => res.json({ ok: true, rooms: rooms.size }));

io.on("connection", (socket) => {
  socket.on("join-room", (rawRoom) => {
    const room = cleanRoom(rawRoom);
    for (const joined of socket.rooms) if (joined !== socket.id) socket.leave(joined);
    socket.join(room);
    const state = ensureRoom(room);
    socket.emit("state", snapshot(state));
  });

  socket.on("command", (payload = {}) => {
    const room = cleanRoom(payload.room);
    const state = ensureRoom(room);
    const now = Date.now();
    const command = payload.action;

    if (command === "start") {
      if (!state.running && !state.finished) {
        state.startedAt = now;
        state.running = true;
      }
    } else if (command === "pause") {
      if (state.running) {
        state.remainingMs = Math.max(0, state.remainingMs - (now - state.startedAt));
        state.running = false;
        state.startedAt = null;
      }
    } else if (command === "reset") {
      stopAndSetSpeaker(state, state.speakerIndex);
    } else if (command === "next") {
      stopAndSetSpeaker(state, state.speakerIndex + 1);
    } else if (command === "previous") {
      stopAndSetSpeaker(state, state.speakerIndex - 1);
    } else if (command === "select-speaker") {
      stopAndSetSpeaker(state, Number(payload.index));
    } else if (command === "set-preset") {
      const key = Object.hasOwn(PRESETS, payload.preset) ? payload.preset : "standard";
      const p = PRESETS[key];
      state.preset = key;
      state.substantiveMinutes = p.substantive;
      state.replyMinutes = p.reply;
      state.graceSeconds = p.grace * 60;
      stopAndSetSpeaker(state, state.speakerIndex);
    } else if (command === "set-custom") {
      state.preset = "custom";
      state.substantiveMinutes = Math.max(1, Math.min(30, Number(payload.substantiveMinutes) || 7));
      state.replyMinutes = Math.max(1, Math.min(15, Number(payload.replyMinutes) || 4));
      state.graceSeconds = Math.max(0, Math.min(300, Number(payload.graceSeconds) || 0));
      stopAndSetSpeaker(state, state.speakerIndex);
    } else if (command === "set-poi") {
      state.poiOverride = payload.allowed === true ? null : false;
    } else if (command === "end") {
      state.running = false;
      state.finished = true;
      state.remainingMs = 0;
      state.startedAt = null;
    } else {
      return;
    }

    state.updatedAt = now;
    emitState(room);
  });

  socket.on("disconnect", () => {});
});

// Authoritative timer updates and one-shot signal events.
// The server emits marker events so sound does not depend on browser frame timing.
setInterval(() => {
  const now = Date.now();
  for (const [room, state] of rooms.entries()) {
    if (!state.running) continue;
    const elapsed = elapsedFor(state, now);
    const markers = [
      ["first-minute", 60000],
      ["final-minute", Math.max(60000, state.durationMs - 60000)],
      ["speech-end", state.durationMs],
      ["grace-end", state.durationMs + state.graceSeconds * 1000]
    ];
    for (const [name, at] of markers) {
      if (elapsed >= at && !state.signalsFired.includes(name)) {
        state.signalsFired.push(name);
        io.to(room).emit("signal", { name, at, room });
      }
    }
    if (elapsed >= state.durationMs + state.graceSeconds * 1000) {
      state.running = false;
      state.finished = true;
      state.remainingMs = 0;
      state.startedAt = null;
      state.updatedAt = now;
    }
    io.to(room).emit("tick", snapshot(state, now));
  }
}, 200);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Asian Parliamentary Timer running on port ${PORT}`);
});
