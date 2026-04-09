const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const perfHelpers = window.HexTicTacToePerf || {};
const timerHelpers = window.HexTicTacToeTimer || {};
const halfHelpers = window.HexTicTacToeHalf || {};

const ui = {
  modePicker: document.getElementById("modePicker"),
  newGameBtn: document.getElementById("newGameBtn"),
  undoBtn: document.getElementById("undoBtn"),
  centreBtn: document.getElementById("centreBtn"),
  turnBig: document.getElementById("turnBig"),
  subturnText: document.getElementById("subturnText"),
  roundText: document.getElementById("roundText"),
  movesLeftText: document.getElementById("movesLeftText"),
  duckPhaseText: document.getElementById("duckPhaseText"),
  winnerText: document.getElementById("winnerText"),
  modeName: document.getElementById("modeName"),
  modeSummary: document.getElementById("modeSummary"),
  modePills: document.getElementById("modePills"),
  log: document.getElementById("log"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlayHint: document.getElementById("overlayHint"),
  coordText: document.getElementById("coordText"),
  zoomText: document.getElementById("zoomText"),
  timerMinutesInput: document.getElementById("timerMinutesInput"),
  timerIncrementInput: document.getElementById("timerIncrementInput"),
  timerEnabledInput: document.getElementById("timerEnabledInput"),
  applyTimerBtn: document.getElementById("applyTimerBtn"),
  timerSummaryText: document.getElementById("timerSummaryText"),
  p1ClockText: document.getElementById("p1ClockText"),
  p2ClockText: document.getElementById("p2ClockText"),
  onlineCreateBtn: document.getElementById("onlineCreateBtn"),
  onlineJoinBtn: document.getElementById("onlineJoinBtn"),
  onlineLeaveBtn: document.getElementById("onlineLeaveBtn"),
  onlineRoomInput: document.getElementById("onlineRoomInput"),
  onlineStatusText: document.getElementById("onlineStatusText"),
  onlineRoomText: document.getElementById("onlineRoomText"),
  onlineRoleText: document.getElementById("onlineRoleText")
};

const SQRT3 = Math.sqrt(3);
const WIN_LENGTH = 6;
const MAX_PLACEMENT_DISTANCE = 8;
const CLOCK_TICK_MS = 100;
const DEFAULT_TIMER_CONFIG = {
  enabled: true,
  initialMinutes: 5,
  incrementSeconds: 2
};
const HEX_VERTEX_UNIT = Array.from({ length: 6 }, (_, i) => {
  const angle = Math.PI / 180 * (60 * i - 30);
  return {
    x: Math.cos(angle),
    y: Math.sin(angle)
  };
});

const getVisibleBounds = perfHelpers.getVisibleAxialBounds || function legacyVisibleBounds(params) {
  const radius = Math.ceil(Math.max(params.width, params.height) / params.hexSize) + 6;
  const centerWorld = {
    x: (params.width / 2) - params.offsetX,
    y: (params.height / 2) - params.offsetY
  };
  const centerHex = pixelToAxial(centerWorld.x, centerWorld.y, params.hexSize);
  return {
    minQ: centerHex.q - radius,
    maxQ: centerHex.q + radius,
    minR: centerHex.r - radius,
    maxR: centerHex.r + radius
  };
};

const getRecentSerials = perfHelpers.getNewestTwoSerials || function legacyRecentSerials(cells) {
  return Object.values(cells)
    .map((cell) => cell.serial)
    .sort((a, b) => b - a)
    .slice(0, 2);
};

const SHARED_TILE_KIND = halfHelpers.SHARED_KIND || "halfAndHalf";
const HALF_CAPTURE_STEP = halfHelpers.CAPTURE_STEP || 0.25;
const isHalfAndHalfCell = halfHelpers.isHalfAndHalfCell || function localIsHalfAndHalfCell(cell) {
  return Boolean(cell && cell.kind === SHARED_TILE_KIND);
};
const getCellControl = halfHelpers.getCellControl || function localGetCellControl(cell) {
  if (!cell) {
    return { 1: 0, 2: 0 };
  }
  if (cell.kind === "stone") {
    return {
      1: cell.owner === 1 ? 1 : 0,
      2: cell.owner === 2 ? 1 : 0
    };
  }
  if (isHalfAndHalfCell(cell)) {
    const p1 = typeof cell.capture?.[1] === "number" ? cell.capture[1] : 0.5;
    return { 1: p1, 2: 1 - p1 };
  }
  return { 1: 0, 2: 0 };
};
const cellCountsForOwner = halfHelpers.cellCountsForOwner || function localCellCountsForOwner(cell, owner) {
  return getCellControl(cell)[owner] >= 0.5;
};
const canPlaceOnCellInHalfMode = halfHelpers.canPlaceOnCellInHalfMode || function localCanPlaceOnCellInHalfMode(cell, placingOwner) {
  if (!cell || (placingOwner !== 1 && placingOwner !== 2)) {
    return false;
  }
  const other = placingOwner === 1 ? 2 : 1;
  const control = getCellControl(cell);
  return control[other] > 0 && control[placingOwner] < 1;
};
const resolveHalfAndHalfPlacement = halfHelpers.resolveHalfAndHalfPlacement || function localResolveHalfAndHalfPlacement(existingCell, placingOwner) {
  if (placingOwner !== 1 && placingOwner !== 2) {
    return null;
  }
  if (!existingCell) {
    return { owner: placingOwner, kind: "stone" };
  }
  if (!canPlaceOnCellInHalfMode(existingCell, placingOwner)) {
    return null;
  }
  const other = placingOwner === 1 ? 2 : 1;
  const control = getCellControl(existingCell);
  const steppedOwnerControl = Math.min(1, control[placingOwner] + HALF_CAPTURE_STEP);
  const nextOwnerControl = Math.round(steppedOwnerControl / HALF_CAPTURE_STEP) * HALF_CAPTURE_STEP;
  const nextOtherControl = Math.max(0, 1 - nextOwnerControl);
  if (nextOwnerControl >= 1) {
    return { owner: placingOwner, kind: "stone" };
  }
  return {
    owner: 0,
    kind: SHARED_TILE_KIND,
    capture: {
      [placingOwner]: nextOwnerControl,
      [other]: nextOtherControl
    }
  };
};

const normaliseTimerConfig = timerHelpers.normaliseTimerConfig || function localNormaliseTimerConfig(config) {
  const safe = config || {};
  return {
    enabled: Boolean(safe.enabled),
    initialMinutes: Math.max(1, Math.min(180, Math.round(Number(safe.initialMinutes) || 5))),
    incrementSeconds: Math.max(0, Math.min(120, Math.round(Number(safe.incrementSeconds) || 2)))
  };
};

const createClockState = timerHelpers.createClockState || function localCreateClockState(config) {
  const timer = normaliseTimerConfig(config);
  const initialSeconds = timer.initialMinutes * 60;
  return {
    enabled: timer.enabled,
    initialSeconds,
    incrementSeconds: timer.incrementSeconds,
    remaining: {
      1: initialSeconds,
      2: initialSeconds
    },
    activePlayer: 1,
    flaggedPlayer: 0
  };
};

const formatClock = timerHelpers.formatClock || function localFormatClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const applyElapsedToClock = timerHelpers.applyElapsed || function localApplyElapsedToClock(clock, elapsedSeconds) {
  if (!clock || !clock.enabled || clock.flaggedPlayer) {
    return { expiredPlayer: 0 };
  }
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  if (elapsed <= 0) {
    return { expiredPlayer: 0 };
  }
  const activePlayer = clock.activePlayer === 2 ? 2 : 1;
  const nextRemaining = Math.max(0, clock.remaining[activePlayer] - elapsed);
  clock.remaining[activePlayer] = nextRemaining;
  if (nextRemaining === 0) {
    clock.flaggedPlayer = activePlayer;
    return { expiredPlayer: activePlayer };
  }
  return { expiredPlayer: 0 };
};

const switchClockTurn = timerHelpers.switchTurnWithIncrement || function localSwitchClockTurn(clock, nextPlayer) {
  if (!clock) {
    return;
  }
  const current = clock.activePlayer === 2 ? 2 : 1;
  if (clock.enabled && !clock.flaggedPlayer) {
    clock.remaining[current] += Math.max(0, Number(clock.incrementSeconds) || 0);
  }
  clock.activePlayer = nextPlayer === 2 ? 2 : 1;
};

const BASE_MODE = {
  name: "Classic",
  summary: "Standard rules with the origin start and the 8-hex placement limit.",
  hint: "No special mode active.",
  tags: ["Standard"]
};

const MODES = {
  duck: {
    name: "Duck",
    summary: "After your placements, move the duck to any empty hex. Nobody can place on the duck.",
    hint: "The duck moves after your placement phase.",
    tags: ["Duck", "Blocker"]
  },
  orbit: {
    name: "Orbit",
    summary: "At the end of every full turn, each stone moves 1 hex along its orbit ring. Ducks stay put.",
    hint: "Faint lines show the next orbit step for stones only.",
    tags: ["Rotation", "Dynamic"]
  },
  echo: {
    name: "Echo",
    summary: "Each placement and bird move schedules an echo two full turns later at the mirrored coordinate across the origin, if that hex is open.",
    hint: "Echo targets are shown as faint outlines, including bird echoes.",
    tags: ["Delayed copy", "Mirror"]
  },
  kingDuck: {
    name: "King Duck",
    summary: "Duck rules apply, but after the duck moves, adjacent empty hexes become panic zones until the next bird move.",
    hint: "The duck leaves a panic ring behind it after it moves.",
    tags: ["Duck", "Panic"]
  },
  meteorAccounting: {
    name: "Meteor",
    summary: "Every 3 full turns, all occupied hexes tied for farthest distance from the origin are deleted.",
    hint: "The outer edge gets cleared every 3 rounds.",
    tags: ["Meteor", "Cleanup"]
  },
  halfAndHalf: {
    name: "Half & Half",
    summary: "Capture on occupied enemy tiles advances ownership by 25% each time. A hex counts for a player only once they control at least 50%.",
    hint: "Captures shift control by +25%. Reach >=50% to count in lines.",
    tags: ["Capture", "Shared line"]
  }
};

const dirs = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];

const lineAxes = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: 1, r: -1 }
];

const BIRD_KINDS = ["duck", "kingDuck"];

function keyOf(q, r) {
  return `${q},${r}`;
}

function parseKey(key) {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

function hexDistance(a, b = { q: 0, r: 0 }) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -a.q - a.r - (-b.q - b.r);
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

function axialToPixel(hex, size) {
  return {
    x: size * SQRT3 * (hex.q + hex.r / 2),
    y: size * 1.5 * hex.r
  };
}

function pixelToAxial(x, y, size) {
  const q = ((SQRT3 / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return axialRound({ q, r });
}

function axialRound(frac) {
  let q = Math.round(frac.q);
  let r = Math.round(frac.r);
  let s = Math.round(-frac.q - frac.r);

  const qDiff = Math.abs(q - frac.q);
  const rDiff = Math.abs(r - frac.r);
  const sDiff = Math.abs(s + frac.q + frac.r);

  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s;
  } else if (rDiff > sDiff) {
    r = -q - s;
  }

  return { q, r };
}

function neighbours(hex) {
  return dirs.map((d) => ({ q: hex.q + d.q, r: hex.r + d.r }));
}

function addHex(a, b) {
  return { q: a.q + b.q, r: a.r + b.r };
}

function scaleHex(a, n) {
  return { q: a.q * n, r: a.r * n };
}

function equalHex(a, b) {
  return a.q === b.q && a.r === b.r;
}

function towardsOrigin(hex) {
  if (hex.q === 0 && hex.r === 0) {
    return null;
  }

  const options = neighbours(hex);
  options.sort((a, b) => hexDistance(a) - hexDistance(b));
  return options[0];
}

const orbitRingCache = new Map();

function getOrbitRing(radius) {
  if (orbitRingCache.has(radius)) {
    return orbitRingCache.get(radius);
  }

  const ring = [];
  if (radius <= 0) {
    orbitRingCache.set(radius, ring);
    return ring;
  }

  let hex = scaleHex(dirs[4], radius);
  for (let side = 0; side < 6; side += 1) {
    for (let step = 0; step < radius; step += 1) {
      ring.push({ ...hex });
      hex = addHex(hex, dirs[side]);
    }
  }

  orbitRingCache.set(radius, ring);
  return ring;
}

function orbitStep(hex) {
  if (perfHelpers.orbitStepFast) {
    return perfHelpers.orbitStepFast(hex);
  }

  const radius = hexDistance(hex);
  if (radius === 0) {
    return { ...hex };
  }

  const ring = getOrbitRing(radius);
  const index = ring.findIndex((candidate) => equalHex(candidate, hex));
  if (index === -1) {
    return { ...hex };
  }

  return { ...ring[(index + 1) % ring.length] };
}

function cloneState(state) {
  return structuredClone(state);
}

const game = {
  viewport: {
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    baseHexSize: 28
  },
  hoverHex: { q: 0, r: 0 },
  isPanning: false,
  panLast: { x: 0, y: 0 },
  previewModeKeys: [],
  modeUiSignature: "",
  renderScheduled: false,
  timerConfig: normaliseTimerConfig(DEFAULT_TIMER_CONFIG),
  clockRuntime: {
    intervalId: null,
    lastTickAt: 0
  },
  state: null,
  history: []
};

const online = {
  socket: null,
  pendingAction: null,
  isConnected: false,
  roomCode: "",
  clientId: null,
  assignedPlayer: null,
  lastRevision: 0,
  applyingRemoteState: false
};

function normaliseModeKeys(modeKeys) {
  const seen = new Set();
  const ordered = [];
  for (const key of Object.keys(MODES)) {
    if (modeKeys.includes(key) && !seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  return ordered;
}

function modeKeySignature(modeKeys) {
  return normaliseModeKeys(modeKeys).join("|");
}

function getModeConfig(modeKeys) {
  const keys = normaliseModeKeys(modeKeys);
  if (keys.length === 0) {
    return BASE_MODE;
  }

  const activeModes = keys.map((key) => MODES[key]);
  return {
    name: activeModes.map((mode) => mode.name).join(" + "),
    summary: activeModes.length === 1
      ? activeModes[0].summary
      : activeModes.map((mode) => `${mode.name}: ${mode.summary}`).join(" "),
    hint: activeModes.length === 1
      ? activeModes[0].hint
      : activeModes.map((mode) => mode.hint).join(" "),
    tags: [...new Set(activeModes.flatMap((mode) => mode.tags))]
  };
}

function hasMode(state, modeKey) {
  return state.modeKeys.includes(modeKey);
}

function usesBirdMode(state) {
  return hasMode(state, "duck")
    || hasMode(state, "kingDuck");
}

function usesPanicBirdMode(state) {
  return hasMode(state, "kingDuck");
}

function getBirdMoveKinds(state) {
  return BIRD_KINDS.filter((birdKind) => hasMode(state, birdKind));
}

function getBirdMoveLabel(birdMoveKind = "duck") {
  return birdMoveKind === "kingDuck" ? "king duck" : "duck";
}

function getBirdMoveTitle(birdMoveKind = "duck") {
  return birdMoveKind === "kingDuck" ? "King duck" : "Duck";
}

function getSelectedModeKeys() {
  return Array.from(ui.modePicker.querySelectorAll(".modeToggle.active")).map((button) => button.dataset.mode);
}

function setSelectedModeKeys(modeKeys) {
  const active = new Set(normaliseModeKeys(modeKeys));
  for (const button of ui.modePicker.querySelectorAll(".modeToggle")) {
    const isActive = active.has(button.dataset.mode);
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
  game.previewModeKeys = [...active];
  setModeUI(game.previewModeKeys);
}

function makeInitialState(modeKeys, timerConfig = game.timerConfig) {
  const activeModeKeys = normaliseModeKeys(modeKeys);
  return {
    modeKeys: activeModeKeys,
    cells: {},
    turnPlayer: 1,
    movesLeftInTurn: 1,
    openingMoveDone: false,
    winner: 0,
    round: 1,
    turnCount: 0,
    birds: {
      duck: null,
      kingDuck: null
    },
    duckPhase: false,
    birdMovesPending: [],
    currentBirdMoveKind: null,
    panicZones: {},
    pendingEchoes: [],
    lastPlacedThisTurn: [],
    lastPlacement: null,
    lastPlacedByPlayer: { 1: null, 2: null },
    moveSerial: 0,
    log: ["Game started."],
    accountingEvents: [],
    clock: createClockState(timerConfig)
  };
}

function setModeUI(modeKeys) {
  const mode = getModeConfig(modeKeys);
  game.modeUiSignature = modeKeySignature(modeKeys);
  ui.modeName.textContent = mode.name;
  ui.modeSummary.textContent = mode.summary;
  ui.overlayTitle.textContent = mode.name;
  ui.overlayHint.textContent = mode.hint;
  ui.modePills.innerHTML = "";
  mode.tags.forEach((tag) => {
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = tag;
    ui.modePills.appendChild(pill);
  });
}

function pushLog(text) {
  game.state.log.unshift(text);
  game.state.log = game.state.log.slice(0, 26);
}

function renderLog() {
  ui.log.innerHTML = "";
  for (const entry of game.state.log) {
    const div = document.createElement("div");
    div.className = "logEntry";
    div.textContent = entry;
    ui.log.appendChild(div);
  }
}

function getTimerConfigFromInputs() {
  return normaliseTimerConfig({
    enabled: ui.timerEnabledInput.checked,
    initialMinutes: ui.timerMinutesInput.value,
    incrementSeconds: ui.timerIncrementInput.value
  });
}

function setTimerInputs(timerConfig) {
  ui.timerEnabledInput.checked = Boolean(timerConfig.enabled);
  ui.timerMinutesInput.value = String(timerConfig.initialMinutes);
  ui.timerIncrementInput.value = String(timerConfig.incrementSeconds);
  ui.timerSummaryText.textContent = timerConfig.enabled
    ? `${timerConfig.initialMinutes}m +${timerConfig.incrementSeconds}s`
    : "Disabled";
}

function ensureClockState(state) {
  if (!state.clock) {
    state.clock = createClockState(game.timerConfig);
    return;
  }
  if (!state.clock.remaining) {
    state.clock.remaining = {
      1: state.clock.initialSeconds || 300,
      2: state.clock.initialSeconds || 300
    };
  }
  if (!state.clock.activePlayer) {
    state.clock.activePlayer = 1;
  }
  if (!state.clock.incrementSeconds && state.clock.incrementSeconds !== 0) {
    state.clock.incrementSeconds = game.timerConfig.incrementSeconds;
  }
  if (!state.clock.initialSeconds) {
    state.clock.initialSeconds = Math.max(
      Number(state.clock.remaining[1]) || 300,
      Number(state.clock.remaining[2]) || 300
    );
  }
  if (!state.clock.flaggedPlayer) {
    state.clock.flaggedPlayer = 0;
  }
}

function updateClockUI() {
  if (!game.state) {
    ui.p1ClockText.textContent = "--:--";
    ui.p2ClockText.textContent = "--:--";
    return;
  }
  ensureClockState(game.state);
  const clock = game.state.clock;
  ui.p1ClockText.textContent = formatClock(clock.remaining[1]);
  ui.p2ClockText.textContent = formatClock(clock.remaining[2]);
}

function stopClockTicker() {
  if (game.clockRuntime.intervalId) {
    window.clearInterval(game.clockRuntime.intervalId);
    game.clockRuntime.intervalId = null;
  }
  game.clockRuntime.lastTickAt = 0;
}

function handleClockExpiry(expiredPlayer) {
  if (!game.state || game.state.winner) {
    return;
  }
  const winningPlayer = expiredPlayer === 1 ? 2 : 1;
  game.state.winner = winningPlayer;
  pushLog(`Player ${expiredPlayer} ran out of time. Player ${winningPlayer} wins on time.`);
  stopClockTicker();
  updateStatus();
  render();
  broadcastOnlineState();
}

function applyClockElapsedIfNeeded() {
  if (!game.state || !game.state.clock) {
    return;
  }
  const clock = game.state.clock;
  if (!clock.enabled || clock.flaggedPlayer || game.state.winner) {
    return;
  }
  const now = Date.now();
  if (!game.clockRuntime.lastTickAt) {
    game.clockRuntime.lastTickAt = now;
    return;
  }
  const elapsedSeconds = (now - game.clockRuntime.lastTickAt) / 1000;
  game.clockRuntime.lastTickAt = now;
  const result = applyElapsedToClock(clock, elapsedSeconds);
  updateClockUI();
  if (result.expiredPlayer) {
    handleClockExpiry(result.expiredPlayer);
  }
}

function syncClockTickerFromState() {
  if (!game.state) {
    stopClockTicker();
    return;
  }

  ensureClockState(game.state);
  game.clockRuntime.lastTickAt = Date.now();
  const shouldRun = game.state.clock.enabled && !game.state.winner && !game.state.clock.flaggedPlayer;
  if (!shouldRun) {
    stopClockTicker();
    updateClockUI();
    return;
  }

  if (!game.clockRuntime.intervalId) {
    game.clockRuntime.intervalId = window.setInterval(() => {
      applyClockElapsedIfNeeded();
    }, CLOCK_TICK_MS);
  }
  updateClockUI();
}

function canUseAdminControls() {
  return !online.roomCode || online.assignedPlayer === 1;
}

function canActForCurrentTurn() {
  if (!online.roomCode) {
    return true;
  }
  if (online.assignedPlayer == null) {
    return false;
  }
  return game.state && game.state.turnPlayer === online.assignedPlayer;
}

function updateOnlineControls() {
  const inRoom = Boolean(online.roomCode);
  const admin = canUseAdminControls();
  ui.onlineCreateBtn.disabled = inRoom;
  ui.onlineJoinBtn.disabled = inRoom;
  ui.onlineRoomInput.disabled = inRoom;
  ui.onlineLeaveBtn.disabled = !inRoom;
  ui.newGameBtn.disabled = inRoom && !admin;
  ui.undoBtn.disabled = inRoom && !admin;
  ui.applyTimerBtn.disabled = inRoom && !admin;
  ui.timerMinutesInput.disabled = inRoom && !admin;
  ui.timerIncrementInput.disabled = inRoom && !admin;
  ui.timerEnabledInput.disabled = inRoom && !admin;
  for (const button of ui.modePicker.querySelectorAll(".modeToggle")) {
    button.disabled = inRoom && !admin;
  }
}

function updateOnlineStatusUI() {
  ui.onlineStatusText.textContent = `Online: ${online.isConnected ? "connected" : "offline"}`;
  ui.onlineRoomText.textContent = online.roomCode ? `Room: ${online.roomCode}` : "Room: -";
  const role = online.assignedPlayer == null ? "spectator" : `player ${online.assignedPlayer}`;
  ui.onlineRoleText.textContent = online.roomCode ? `Role: ${role}` : "Role: local";
  updateOnlineControls();
}

function getSocketUrl() {
  if (!window.location.host) {
    return null;
  }
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
}

function closeOnlineSocket() {
  if (online.socket) {
    online.socket.close();
    online.socket = null;
  }
}

function sendOnlineMessage(message) {
  if (!online.socket || online.socket.readyState !== WebSocket.OPEN) {
    return;
  }
  online.socket.send(JSON.stringify(message));
}

function connectOnline(afterConnect) {
  if (online.socket && online.socket.readyState === WebSocket.OPEN) {
    if (afterConnect) {
      afterConnect();
    }
    return;
  }
  if (online.socket && online.socket.readyState === WebSocket.CONNECTING) {
    online.pendingAction = afterConnect || null;
    return;
  }

  const wsUrl = getSocketUrl();
  if (!wsUrl) {
    pushLog("Online mode needs the game served over HTTP(S), not file://.");
    updateStatus();
    return;
  }

  online.pendingAction = afterConnect || null;
  online.socket = new WebSocket(wsUrl);

  online.socket.addEventListener("open", () => {
    online.isConnected = true;
    updateOnlineStatusUI();
    if (online.pendingAction) {
      const action = online.pendingAction;
      online.pendingAction = null;
      action();
    }
  });

  online.socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      handleOnlineMessage(message);
    } catch (error) {
      console.error("Failed to parse online message:", error);
    }
  });

  online.socket.addEventListener("close", () => {
    online.isConnected = false;
    online.roomCode = "";
    online.assignedPlayer = null;
    online.clientId = null;
    online.lastRevision = 0;
    online.pendingAction = null;
    updateOnlineStatusUI();
  });
}

function updateAssignmentFromMessage(message) {
  if (!message.playerAssignments || !online.clientId) {
    return;
  }
  online.assignedPlayer = message.playerAssignments[online.clientId] || null;
}

function applyRemoteState(state, revision) {
  if (!state) {
    return;
  }
  online.applyingRemoteState = true;
  game.state = cloneState(state);
  ensureClockState(game.state);
  game.timerConfig = normaliseTimerConfig({
    enabled: game.state.clock.enabled,
    initialMinutes: Math.round(game.state.clock.initialSeconds / 60),
    incrementSeconds: game.state.clock.incrementSeconds
  });
  setTimerInputs(game.timerConfig);
  setSelectedModeKeys(game.state.modeKeys);
  updateStatus();
  syncClockTickerFromState();
  render();
  online.applyingRemoteState = false;
  if (typeof revision === "number") {
    online.lastRevision = revision;
  }
}

function handleOnlineMessage(message) {
  if (message.type === "welcome") {
    online.clientId = message.clientId;
    updateOnlineStatusUI();
    return;
  }

  if (message.type === "roomJoined") {
    online.roomCode = message.roomCode || "";
    updateAssignmentFromMessage(message);
    if (typeof message.revision === "number") {
      online.lastRevision = message.revision;
    }
    if (message.state) {
      applyRemoteState(message.state, message.revision);
    } else if (online.roomCode && game.state) {
      broadcastOnlineState();
    }
    updateOnlineStatusUI();
    return;
  }

  if (message.type === "presence") {
    updateAssignmentFromMessage(message);
    updateOnlineStatusUI();
    return;
  }

  if (message.type === "stateUpdate") {
    updateAssignmentFromMessage(message);
    if (typeof message.revision === "number" && message.revision <= online.lastRevision) {
      return;
    }
    applyRemoteState(message.state, message.revision);
    return;
  }

  if (message.type === "error" && message.message) {
    pushLog(`Online error: ${message.message}`);
    updateStatus();
  }
}

function createOnlineRoom() {
  connectOnline(() => {
    sendOnlineMessage({ type: "createRoom" });
  });
}

function joinOnlineRoom() {
  const roomCode = ui.onlineRoomInput.value.trim().toUpperCase();
  if (!roomCode) {
    pushLog("Enter a room code before joining.");
    updateStatus();
    return;
  }
  connectOnline(() => {
    sendOnlineMessage({ type: "joinRoom", roomCode });
  });
}

function leaveOnlineRoom() {
  if (online.socket && online.socket.readyState === WebSocket.OPEN && online.roomCode) {
    sendOnlineMessage({ type: "leaveRoom" });
  }
  online.roomCode = "";
  online.assignedPlayer = null;
  online.lastRevision = 0;
  closeOnlineSocket();
  updateOnlineStatusUI();
}

function broadcastOnlineState() {
  if (online.applyingRemoteState) {
    return;
  }
  if (!online.roomCode || !online.socket || online.socket.readyState !== WebSocket.OPEN) {
    return;
  }
  sendOnlineMessage({
    type: "stateUpdate",
    state: game.state
  });
}

function saveHistory() {
  game.history.push(cloneState(game.state));
  if (game.history.length > 80) {
    game.history.shift();
  }
}

function restoreFromHistory() {
  if (game.history.length === 0) {
    return;
  }
  game.state = game.history.pop();
  ensureClockState(game.state);
  updateStatus();
  syncClockTickerFromState();
  render();
  broadcastOnlineState();
}

function replaceTrackedHex(state, fromHex, toHex) {
  if (state.lastPlacement && equalHex(state.lastPlacement, fromHex)) {
    state.lastPlacement = { ...toHex };
  }

  state.lastPlacedThisTurn = state.lastPlacedThisTurn.map((placedHex) => (
    equalHex(placedHex, fromHex) ? { ...toHex } : placedHex
  ));

  for (const owner of [1, 2]) {
    const placed = state.lastPlacedByPlayer[owner];
    if (placed && equalHex(placed, fromHex)) {
      state.lastPlacedByPlayer[owner] = { ...toHex };
    }
  }
}

function transformTrackedHexes(state, transform) {
  if (state.lastPlacement) {
    state.lastPlacement = transform(state.lastPlacement);
  }
  state.lastPlacedThisTurn = state.lastPlacedThisTurn.map((hex) => transform(hex));
  for (const owner of [1, 2]) {
    if (state.lastPlacedByPlayer[owner]) {
      state.lastPlacedByPlayer[owner] = transform(state.lastPlacedByPlayer[owner]);
    }
  }
}

function getBirdHex(state, birdKind) {
  return state.birds[birdKind] ? { ...state.birds[birdKind] } : null;
}

function getBirdEntries(state) {
  return BIRD_KINDS
    .filter((birdKind) => state.birds[birdKind])
    .map((birdKind) => ({ birdKind, hex: state.birds[birdKind] }));
}

function getBirdAt(state, hex) {
  for (const birdKind of BIRD_KINDS) {
    const birdHex = state.birds[birdKind];
    if (birdHex && equalHex(birdHex, hex)) {
      return birdKind;
    }
  }
  return null;
}

function getCellAt(state, hex) {
  return state.cells[keyOf(hex.q, hex.r)] || null;
}

function isStoneOccupied(state, hex) {
  return Boolean(getCellAt(state, hex));
}

function isHexOpen(state, hex) {
  return !isStoneOccupied(state, hex) && !getBirdAt(state, hex);
}

function isHexOpenForBird(state, hex, birdKind) {
  const birdAt = getBirdAt(state, hex);
  return !isStoneOccupied(state, hex) && (!birdAt || birdAt === birdKind);
}

function getPlacementAnchorHexes(state) {
  return [
    ...Object.keys(state.cells).map((key) => parseKey(key)),
    ...getBirdEntries(state).map((entry) => ({ ...entry.hex }))
  ];
}

function rebuildPanicZones(state) {
  state.panicZones = {};
  const kingDuckHex = getBirdHex(state, "kingDuck");
  if (!kingDuckHex) {
    return;
  }

  for (const n of neighbours(kingDuckHex)) {
    if (!isOccupied(state, n)) {
      state.panicZones[keyOf(n.q, n.r)] = true;
    }
  }
}

function isHexBlockedBySpecials(state, hex) {
  if (getBirdAt(state, hex)) {
    return true;
  }
  if (state.panicZones[keyOf(hex.q, hex.r)]) {
    return true;
  }
  return false;
}

function isOccupied(state, hex) {
  return isStoneOccupied(state, hex) || Boolean(getBirdAt(state, hex));
}

function isWithinPlacementRange(state, hex) {
  const anchorHexes = getPlacementAnchorHexes(state);
  if (anchorHexes.length === 0) {
    return equalHex(hex, { q: 0, r: 0 });
  }

  return anchorHexes.some((anchorHex) => hexDistance(anchorHex, hex) <= MAX_PLACEMENT_DISTANCE);
}

function canPlaceOnOccupiedHex(state, hex, owner = state.turnPlayer) {
  if (!hasMode(state, "halfAndHalf")) {
    return false;
  }
  return canPlaceOnCellInHalfMode(getCellAt(state, hex), owner);
}

function isLegalByBaseRules(state, hex, options = {}) {
  const allowOccupied = Boolean(options.allowOccupied);
  if (state.winner) {
    return false;
  }
  if (!allowOccupied && isOccupied(state, hex)) {
    return false;
  }
  if (isHexBlockedBySpecials(state, hex)) {
    return false;
  }
  if (!isWithinPlacementRange(state, hex)) {
    return false;
  }
  return true;
}

function isLegalPlacement(state, hex) {
  const allowOccupied = canPlaceOnOccupiedHex(state, hex, state.turnPlayer);
  if (!isLegalByBaseRules(state, hex, { allowOccupied })) {
    return false;
  }

  const occupiedByStone = isStoneOccupied(state, hex);
  if (occupiedByStone && !allowOccupied) {
    return false;
  }
  return true;
}

function placeStone(state, hex, owner, kind = "stone") {
  state.moveSerial += 1;
  state.cells[keyOf(hex.q, hex.r)] = {
    owner,
    kind,
    serial: state.moveSerial
  };
  state.lastPlacement = { ...hex };
  state.lastPlacedByPlayer[owner] = { ...hex };
  state.lastPlacedThisTurn.push({ ...hex });
}

function removeStone(state, hex) {
  delete state.cells[keyOf(hex.q, hex.r)];
}

function moveBird(state, hex, birdMoveKind = "duck") {
  state.birds[birdMoveKind] = { ...hex };
  rebuildPanicZones(state);
}

function countsForOwnerAt(state, pos, owner) {
  const cell = getCellAt(state, pos);
  return cellCountsForOwner(cell, owner);
}

function getLineCount(state, start, owner, dir) {
  let count = 1;
  for (const sign of [1, -1]) {
    let step = 1;
    while (true) {
      const pos = {
        q: start.q + dir.q * step * sign,
        r: start.r + dir.r * step * sign
      };
      if (!countsForOwnerAt(state, pos, owner)) {
        break;
      }
      count += 1;
      step += 1;
    }
  }
  return count;
}

function checkWinnerFrom(state, hex) {
  const cell = getCellAt(state, hex);
  if (!cell) {
    return 0;
  }

  const owners = [];
  if (cellCountsForOwner(cell, 1)) {
    owners.push(1);
  }
  if (cellCountsForOwner(cell, 2)) {
    owners.push(2);
  }

  for (const owner of owners) {
    for (const dir of lineAxes) {
      if (getLineCount(state, hex, owner, dir) >= WIN_LENGTH) {
        return owner;
      }
    }
  }
  return 0;
}

function auditWholeBoardForWinner(state) {
  for (const key of Object.keys(state.cells)) {
    const pos = parseKey(key);
    const winner = checkWinnerFrom(state, pos);
    if (winner) {
      return winner;
    }
  }
  return 0;
}

function queueEcho(state, echo) {
  if (!hasMode(state, "echo")) {
    return;
  }
  state.pendingEchoes.push({
    targetTurn: state.turnCount + 2,
    ...echo,
    source: { ...echo.source }
  });
}

function resolveEchoes(state) {
  if (!hasMode(state, "echo")) {
    return;
  }
  const remain = [];
  for (const echo of state.pendingEchoes) {
    if (echo.targetTurn > state.turnCount) {
      remain.push(echo);
      continue;
    }
    const target = { q: -echo.source.q, r: -echo.source.r };
    if (echo.kind === "bird") {
      if (!isHexOpenForBird(state, target, echo.birdKind)) {
        pushLog(`Echoed ${getBirdMoveLabel(echo.birdKind)} could not appear at (${target.q}, ${target.r}).`);
        continue;
      }
      moveBird(state, target, echo.birdKind);
      pushLog(`Echo moved ${getBirdMoveTitle(echo.birdKind)} to (${target.q}, ${target.r}).`);
      continue;
    }
    if (!isHexOpen(state, target)) {
      pushLog(`Echo at (${target.q}, ${target.r}) could not appear.`);
      continue;
    }
    placeStone(state, target, echo.owner, "stone");
    pushLog(`Echo placed Player ${echo.owner} at (${state.lastPlacement.q}, ${state.lastPlacement.r}).`);
  }
  state.pendingEchoes = remain;
}

function getOrbitDestination(state, fromHex) {
  const rotated = orbitStep(fromHex);
  return getBirdAt(state, rotated) ? { ...fromHex } : rotated;
}

function resolveOrbit(state) {
  if (!hasMode(state, "orbit")) {
    return;
  }
  const nextCells = {};
  const originalCells = Object.entries(state.cells).map(([key, cell]) => ({ key, cell }));
  for (const entry of originalCells) {
    const pos = parseKey(entry.key);
    const rotated = getOrbitDestination(state, pos);
    nextCells[keyOf(rotated.q, rotated.r)] = { ...entry.cell };
  }
  state.cells = nextCells;
  rebuildPanicZones(state);
  transformTrackedHexes(state, (hex) => getOrbitDestination(state, hex));
  pushLog("Orbit moved every stone 1 step along its ring.");
}

function getMeteorTargets(state) {
  let farthestDistance = -1;
  const farthest = [];

  for (const [key, cell] of Object.entries(state.cells)) {
    const pos = parseKey(key);
    const dist = hexDistance(pos);
    if (dist > farthestDistance) {
      farthestDistance = dist;
      farthest.length = 0;
      farthest.push({ type: "stone", pos, cell });
    } else if (dist === farthestDistance) {
      farthest.push({ type: "stone", pos, cell });
    }
  }

  for (const { birdKind, hex } of getBirdEntries(state)) {
    const dist = hexDistance(hex);
    if (dist > farthestDistance) {
      farthestDistance = dist;
      farthest.length = 0;
      farthest.push({ type: "bird", birdKind, pos: { ...hex } });
    } else if (dist === farthestDistance) {
      farthest.push({ type: "bird", birdKind, pos: { ...hex } });
    }
  }

  return {
    farthestDistance,
    farthest
  };
}

function resolveMeteorAccounting(state) {
  if (!hasMode(state, "meteorAccounting")) {
    return;
  }
  if (state.turnCount % 3 !== 0) {
    return;
  }

  const { farthestDistance, farthest } = getMeteorTargets(state);

  if (farthest.length === 0) {
    pushLog("Meteor found nothing to remove.");
    return;
  }

  for (const entry of farthest) {
    if (entry.type === "bird") {
      state.birds[entry.birdKind] = null;
    } else {
      removeStone(state, entry.pos);
    }
  }
  rebuildPanicZones(state);
  const coords = farthest.map((entry) => (
    entry.type === "bird"
      ? `${getBirdMoveTitle(entry.birdKind)} at (${entry.pos.q}, ${entry.pos.r})`
      : `stone at (${entry.pos.q}, ${entry.pos.r})`
  )).join(", ");
  const line = `Meteor removed ${farthest.length} tile${farthest.length === 1 ? "" : "s"} at distance ${farthestDistance}: ${coords}.`;
  state.accountingEvents.push(line);
  pushLog(line);
}

function checkForWinner(state) {
  const winner = auditWholeBoardForWinner(state);
  if (winner && !state.winner) {
    state.winner = winner;
    pushLog(`Player ${winner} wins.`);
  }
  return winner;
}

function endTurn(state) {
  ensureClockState(state);
  applyClockElapsedIfNeeded();
  const previousPlayer = state.turnPlayer;
  state.turnCount += 1;
  state.round += 1;

  resolveEchoes(state);
  resolveOrbit(state);
  resolveMeteorAccounting(state);

  if (checkForWinner(state)) {
    syncClockTickerFromState();
    return;
  }

  const nextPlayer = previousPlayer === 1 ? 2 : 1;
  switchClockTurn(state.clock, nextPlayer);
  state.turnPlayer = nextPlayer;
  state.movesLeftInTurn = 2;
  state.duckPhase = false;
  state.birdMovesPending = [];
  state.currentBirdMoveKind = null;
  state.lastPlacedThisTurn = [];
  syncClockTickerFromState();
}

function finishSubmove(state) {
  state.movesLeftInTurn -= 1;
  if (!state.openingMoveDone) {
    state.openingMoveDone = true;
  }

  if (usesBirdMode(state) && state.movesLeftInTurn <= 0 && state.lastPlacedThisTurn.length >= 1) {
    const birdMoves = getBirdMoveKinds(state);
    if (birdMoves.length > 0) {
      state.duckPhase = true;
      state.currentBirdMoveKind = birdMoves[0];
      state.birdMovesPending = birdMoves.slice(1);
      state.movesLeftInTurn = 1 + state.birdMovesPending.length;
      return;
    }
  }

  if (state.movesLeftInTurn <= 0) {
    endTurn(state);
  }
}

function placeResolvedTile(state, hex, owner, kind, capture = null) {
  state.moveSerial += 1;
  const nextCell = {
    owner,
    kind,
    serial: state.moveSerial
  };
  if (kind === SHARED_TILE_KIND && capture) {
    nextCell.capture = {
      1: capture[1],
      2: capture[2]
    };
  }
  state.cells[keyOf(hex.q, hex.r)] = nextCell;
  state.lastPlacement = { ...hex };
  state.lastPlacedByPlayer[state.turnPlayer] = { ...hex };
  state.lastPlacedThisTurn.push({ ...hex });
}

function placeTurnTile(state, hex, owner) {
  const existingCell = getCellAt(state, hex);
  const canUseHalfMode = hasMode(state, "halfAndHalf");
  const resolvedCell = canUseHalfMode
    ? resolveHalfAndHalfPlacement(existingCell, owner)
    : (existingCell ? null : { owner, kind: "stone" });

  if (!resolvedCell) {
    return null;
  }

  if (resolvedCell.kind === "stone") {
    placeStone(state, hex, resolvedCell.owner, "stone");
  } else {
    placeResolvedTile(
      state,
      hex,
      resolvedCell.owner,
      resolvedCell.kind,
      resolvedCell.capture
    );
  }

  queueEcho(state, {
    kind: "stone",
    owner,
    source: state.lastPlacement
  });

  if (!existingCell) {
    return `Player ${owner} placed at (${state.lastPlacement.q}, ${state.lastPlacement.r}).`;
  }
  if (isHalfAndHalfCell(existingCell) && resolvedCell.kind === "stone") {
    return `Player ${owner} fully captured shared tile at (${state.lastPlacement.q}, ${state.lastPlacement.r}).`;
  }
  if (resolvedCell.kind === SHARED_TILE_KIND) {
    const control = getCellControl(resolvedCell);
    return `Player ${owner} captured to ${Math.round(control[owner] * 100)}% at (${state.lastPlacement.q}, ${state.lastPlacement.r}).`;
  }
  return `Player ${owner} placed at (${state.lastPlacement.q}, ${state.lastPlacement.r}).`;
}

function clickPlacement(hex) {
  const state = game.state;
  if (!canActForCurrentTurn()) {
    return;
  }
  applyClockElapsedIfNeeded();

  if (state.winner) {
    return;
  }

  if (state.duckPhase) {
    const birdMoveKind = state.currentBirdMoveKind || "duck";
    const currentBirdHex = getBirdHex(state, birdMoveKind);
    if ((currentBirdHex && equalHex(currentBirdHex, hex)) || !isHexOpenForBird(state, hex, birdMoveKind)) {
      return;
    }
    saveHistory();
    moveBird(state, hex, birdMoveKind);
    queueEcho(state, {
      kind: "bird",
      birdKind: birdMoveKind,
      source: hex
    });
    pushLog(`${getBirdMoveTitle(birdMoveKind)} moved to (${hex.q}, ${hex.r}).`);
    if (state.birdMovesPending.length > 0) {
      state.currentBirdMoveKind = state.birdMovesPending.shift();
      state.movesLeftInTurn = 1 + state.birdMovesPending.length;
    } else {
      state.duckPhase = false;
      state.currentBirdMoveKind = null;
      state.movesLeftInTurn = 0;
      endTurn(state);
    }
    updateStatus();
    syncClockTickerFromState();
    render();
    broadcastOnlineState();
    return;
  }

  if (!isLegalPlacement(state, hex)) {
    return;
  }

  saveHistory();
  const placementLog = placeTurnTile(state, hex, state.turnPlayer);
  if (!placementLog) {
    return;
  }
  pushLog(placementLog);

  if (checkForWinner(state)) {
    updateStatus();
    syncClockTickerFromState();
    render();
    broadcastOnlineState();
    return;
  }

  finishSubmove(state);
  updateStatus();
  syncClockTickerFromState();
  render();
  broadcastOnlineState();
}

function updateStatus() {
  const state = game.state;
  ensureClockState(state);
  if (game.modeUiSignature !== modeKeySignature(state.modeKeys)) {
    setModeUI(state.modeKeys);
  }

  ui.turnBig.textContent = state.winner ? `Player ${state.winner} wins` : `Player ${state.turnPlayer}`;
  ui.turnBig.className = `turnBig ${state.winner === 2 || state.turnPlayer === 2 ? "playerP2" : "playerP1"}`;
  ui.roundText.textContent = String(state.round);
  ui.movesLeftText.textContent = String(state.movesLeftInTurn);
  ui.duckPhaseText.textContent = state.duckPhase ? "Yes" : "No";
  ui.winnerText.textContent = state.winner ? `Player ${state.winner}` : "None";

  if (!state.openingMoveDone) {
    ui.subturnText.textContent = "Opening move: 1 placement";
  } else if (state.duckPhase) {
    ui.subturnText.textContent = `Move the ${getBirdMoveLabel(state.currentBirdMoveKind)} to any empty hex`;
  } else {
    ui.subturnText.textContent = `${state.movesLeftInTurn} placement${state.movesLeftInTurn === 1 ? "" : "s"} left this turn`;
  }

  updateClockUI();
  renderLog();
  updateOnlineStatusUI();
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function screenToWorld(x, y) {
  return {
    x: (x - game.viewport.offsetX),
    y: (y - game.viewport.offsetY)
  };
}

function worldToScreen(x, y) {
  return {
    x: x + game.viewport.offsetX,
    y: y + game.viewport.offsetY
  };
}

function currentHexSize() {
  return game.viewport.baseHexSize * game.viewport.zoom;
}

function drawHex(x, y, size, fill, stroke, lineWidth = 1) {
  ctx.beginPath();
  for (let i = 0; i < HEX_VERTEX_UNIT.length; i += 1) {
    const px = x + size * HEX_VERTEX_UNIT[i].x;
    const py = y + size * HEX_VERTEX_UNIT[i].y;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawGrid() {
  const size = currentHexSize();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const bounds = getVisibleBounds({
    width: w,
    height: h,
    offsetX: game.viewport.offsetX,
    offsetY: game.viewport.offsetY,
    hexSize: size,
    marginHexes: 2
  });

  for (let r = bounds.minR; r <= bounds.maxR; r += 1) {
    for (let q = bounds.minQ; q <= bounds.maxQ; q += 1) {
      const hex = { q, r };
      const world = axialToPixel(hex, size);
      const screen = worldToScreen(world.x, world.y);
      if (screen.x < -size * 2 || screen.y < -size * 2 || screen.x > w + size * 2 || screen.y > h + size * 2) {
        continue;
      }

      let fill = "rgba(255, 255, 255, 0.025)";
      let stroke = "rgba(255, 255, 255, 0.08)";

      if (usesPanicBirdMode(game.state) && game.state.panicZones[keyOf(hex.q, hex.r)]) {
        fill = "rgba(255, 179, 92, 0.16)";
        stroke = "rgba(255, 179, 92, 0.46)";
      }

      if (equalHex(hex, game.hoverHex)) {
        fill = "rgba(255, 255, 255, 0.08)";
        stroke = "rgba(255, 255, 255, 0.25)";
      }

      drawHex(screen.x, screen.y, size - 1, fill, stroke, 1);
    }
  }
}

function drawOriginIndicator() {
  const size = currentHexSize();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const originWorld = axialToPixel({ q: 0, r: 0 }, size);
  const originScreen = worldToScreen(originWorld.x, originWorld.y);
  const padding = 34;
  const markerX = Math.max(padding, Math.min(w - padding, originScreen.x));
  const markerY = Math.max(padding, Math.min(h - padding, originScreen.y));
  const offscreen = Math.abs(markerX - originScreen.x) > 0.5 || Math.abs(markerY - originScreen.y) > 0.5;

  ctx.save();
  if (originScreen.x >= -size * 2 && originScreen.y >= -size * 2 && originScreen.x <= w + size * 2 && originScreen.y <= h + size * 2) {
    drawHex(originScreen.x, originScreen.y, size - 1, "rgba(118, 227, 168, 0.08)", "rgba(118, 227, 168, 0.28)", 1.2);
  }
  ctx.strokeStyle = "rgba(118, 227, 168, 0.45)";
  ctx.lineWidth = 1.6;
  drawHex(markerX, markerY, 13, null, "rgba(118, 227, 168, 0.45)", 1.6);

  if (offscreen) {
    const dx = originScreen.x - markerX;
    const dy = originScreen.y - markerY;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    ctx.beginPath();
    ctx.moveTo(markerX + ux * 8, markerY + uy * 8);
    ctx.lineTo(markerX + ux * 18, markerY + uy * 18);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEchoTargets() {
  if (!hasMode(game.state, "echo")) {
    return;
  }

  const size = currentHexSize();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  for (const echo of game.state.pendingEchoes) {
    const hex = { q: -echo.source.q, r: -echo.source.r };
    const world = axialToPixel(hex, size);
    const screen = worldToScreen(world.x, world.y);
    if (screen.x < -size * 2 || screen.y < -size * 2 || screen.x > w + size * 2 || screen.y > h + size * 2) {
      continue;
    }

    const countdown = Math.max(0, echo.targetTurn - game.state.turnCount);
    const isBirdEcho = echo.kind === "bird";
    const fill = isBirdEcho
      ? (echo.birdKind === "kingDuck" ? "rgba(255, 179, 92, 0.10)" : "rgba(255, 215, 94, 0.10)")
      : (echo.owner === 1 ? "rgba(109, 198, 255, 0.08)" : "rgba(255, 140, 140, 0.08)");
    const stroke = isBirdEcho
      ? (echo.birdKind === "kingDuck" ? "rgba(255, 179, 92, 0.34)" : "rgba(255, 215, 94, 0.32)")
      : (echo.owner === 1 ? "rgba(109, 198, 255, 0.28)" : "rgba(255, 140, 140, 0.28)");
    ctx.save();
    ctx.setLineDash([6, 5]);
    drawHex(screen.x, screen.y, size * 0.68, fill, stroke, 1.5);
    ctx.restore();

    ctx.fillStyle = isBirdEcho
      ? (echo.birdKind === "kingDuck" ? "rgba(255, 179, 92, 0.84)" : "rgba(255, 215, 94, 0.84)")
      : (echo.owner === 1 ? "rgba(109, 198, 255, 0.7)" : "rgba(255, 140, 140, 0.7)");
    ctx.font = `${Math.max(10, size * 0.33)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(isBirdEcho ? `\u{1F986} ${countdown}` : String(countdown), screen.x, screen.y);
  }
}

function drawMeteorPreview() {
  if (!hasMode(game.state, "meteorAccounting")) {
    return;
  }

  const size = currentHexSize();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const { farthestDistance, farthest } = getMeteorTargets(game.state);
  const remainder = game.state.turnCount % 3;
  const turnsUntilMeteor = remainder === 0 ? 3 : 3 - remainder;

  if (farthest.length > 0) {
    for (const entry of farthest) {
      const world = axialToPixel(entry.pos, size);
      const screen = worldToScreen(world.x, world.y);
      if (screen.x < -size * 2 || screen.y < -size * 2 || screen.x > w + size * 2 || screen.y > h + size * 2) {
        continue;
      }

      ctx.save();
      ctx.setLineDash([8, 5]);
      drawHex(
        screen.x,
        screen.y,
        size * (entry.type === "bird" ? 1.03 : 0.95),
        "rgba(255, 179, 92, 0.07)",
        "rgba(255, 179, 92, 0.88)",
        2
      );
      ctx.restore();
    }
  }

  const meterText = farthestDistance >= 0
    ? `Meteor in ${turnsUntilMeteor} turn${turnsUntilMeteor === 1 ? "" : "s"} | target distance ${farthestDistance}`
    : `Meteor in ${turnsUntilMeteor} turn${turnsUntilMeteor === 1 ? "" : "s"}`;
  ctx.fillStyle = "rgba(255, 196, 120, 0.88)";
  ctx.font = `${Math.max(11, size * 0.32)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(meterText, w / 2, 12);
}

function drawOrbitPreview() {
  if (!hasMode(game.state, "orbit")) {
    return;
  }

  const size = currentHexSize();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  for (const key of Object.keys(game.state.cells)) {
    const fromHex = parseKey(key);
    const toHex = getOrbitDestination(game.state, fromHex);
    if (equalHex(fromHex, toHex)) {
      continue;
    }

    const fromWorld = axialToPixel(fromHex, size);
    const toWorld = axialToPixel(toHex, size);
    const from = worldToScreen(fromWorld.x, fromWorld.y);
    const to = worldToScreen(toWorld.x, toWorld.y);
    if (from.x < -size * 2 || from.y < -size * 2 || from.x > w + size * 2 || from.y > h + size * 2) {
      continue;
    }

    ctx.strokeStyle = "rgba(210, 230, 255, 0.18)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.save();
    ctx.setLineDash([4, 4]);
    drawHex(to.x, to.y, size * 0.42, "rgba(210, 230, 255, 0.02)", "rgba(210, 230, 255, 0.22)", 1);
    ctx.restore();
  }
}

function drawBirdPiece(birdKind, birdHex, size) {
  const world = axialToPixel(birdHex, size);
  const screen = worldToScreen(world.x, world.y);
  const isKingDuck = birdKind === "kingDuck";
  const fill = isKingDuck ? "#ffcf63" : "#ffd75e";
  const stroke = isKingDuck ? "rgba(255, 179, 92, 0.95)" : "rgba(255,255,255,0.55)";

  if (isKingDuck) {
    drawHex(screen.x, screen.y, size * 0.93, "rgba(255, 179, 92, 0.12)", "rgba(255, 179, 92, 0.7)", 2.2);
  }

  drawHex(screen.x, screen.y, size * 0.78, fill, stroke, isKingDuck ? 2 : 1.6);
  ctx.fillStyle = "rgba(40, 25, 0, 0.85)";
  ctx.font = `${Math.max(12, size * 0.78)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("\u{1F986}", screen.x, screen.y + 1);

  if (isKingDuck) {
    ctx.strokeStyle = "rgba(255, 245, 188, 0.9)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(screen.x - size * 0.24, screen.y - size * 0.32);
    ctx.lineTo(screen.x - size * 0.1, screen.y - size * 0.5);
    ctx.lineTo(screen.x, screen.y - size * 0.34);
    ctx.lineTo(screen.x + size * 0.1, screen.y - size * 0.5);
    ctx.lineTo(screen.x + size * 0.24, screen.y - size * 0.32);
    ctx.stroke();
  }
}

function drawPieces() {
  const size = currentHexSize();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const recentSerials = getRecentSerials(game.state.cells);
  const recentSerialSet = new Set(recentSerials);
  const newestSerial = recentSerials[0];

  for (const [key, cell] of Object.entries(game.state.cells)) {
    const hex = parseKey(key);
    const world = axialToPixel(hex, size);
    const screen = worldToScreen(world.x, world.y);
    if (screen.x < -size * 2 || screen.y < -size * 2 || screen.x > w + size * 2 || screen.y > h + size * 2) {
      continue;
    }

    const colour = cell.owner === 1 ? "#6dc6ff" : "#ff8c8c";
    if (recentSerialSet.has(cell.serial)) {
      const isNewest = cell.serial === newestSerial;
      const recentStroke = isHalfAndHalfCell(cell)
        ? "rgba(255, 255, 255, 0.85)"
        : (cell.owner === 1 ? "rgba(109, 198, 255, 0.9)" : "rgba(255, 140, 140, 0.9)");
      drawHex(
        screen.x,
        screen.y,
        size * (isNewest ? 0.97 : 0.91),
        "rgba(255, 255, 255, 0.05)",
        recentStroke,
        isNewest ? 3 : 2
      );
    }

    if (isHalfAndHalfCell(cell)) {
      const control = getCellControl(cell);
      const splitAt = Math.min(0.98, Math.max(0.02, control[1]));
      const blend = ctx.createLinearGradient(
        screen.x - size * 0.72,
        screen.y,
        screen.x + size * 0.72,
        screen.y
      );
      blend.addColorStop(0, "#6dc6ff");
      blend.addColorStop(splitAt, "#6dc6ff");
      blend.addColorStop(splitAt, "#ff8c8c");
      blend.addColorStop(1, "#ff8c8c");
      drawHex(screen.x, screen.y, size * 0.78, blend, "rgba(255,255,255,0.6)", 1.7);
      const dividerX = (screen.x - size * 0.72) + (size * 1.44 * splitAt);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = Math.max(1.2, size * 0.06);
      ctx.beginPath();
      ctx.moveTo(dividerX, screen.y - size * 0.6);
      ctx.lineTo(dividerX, screen.y + size * 0.6);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.font = `${Math.max(9, size * 0.28)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(
        `${Math.round(control[1] * 100)}/${Math.round(control[2] * 100)}`,
        screen.x,
        screen.y - size * 0.84
      );
    } else {
      drawHex(screen.x, screen.y, size * 0.78, colour, "rgba(255,255,255,0.45)", 1.5);
    }
    ctx.fillStyle = "rgba(6, 12, 23, 0.52)";
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, size * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const { birdKind, hex } of getBirdEntries(game.state)) {
    const world = axialToPixel(hex, size);
    const screen = worldToScreen(world.x, world.y);
    if (screen.x < -size * 2 || screen.y < -size * 2 || screen.x > w + size * 2 || screen.y > h + size * 2) {
      continue;
    }
    drawBirdPiece(birdKind, hex, size);
  }
}

function drawWinnerLineHint() {
  if (!game.state.lastPlacement) {
    return;
  }
  const size = currentHexSize();
  const last = game.state.lastPlacement;
  const lastCell = getCellAt(game.state, last);
  if (!lastCell) {
    return;
  }

  const owners = [];
  if (game.state.winner && cellCountsForOwner(lastCell, game.state.winner)) {
    owners.push(game.state.winner);
  }
  if (cellCountsForOwner(lastCell, 1) && !owners.includes(1)) {
    owners.push(1);
  }
  if (cellCountsForOwner(lastCell, 2) && !owners.includes(2)) {
    owners.push(2);
  }

  for (const owner of owners) {
    for (const dir of lineAxes) {
      if (getLineCount(game.state, last, owner, dir) < WIN_LENGTH) {
        continue;
      }

      let minStep = 0;
      let maxStep = 0;
      while (true) {
        const pos = { q: last.q + dir.q * (minStep - 1), r: last.r + dir.r * (minStep - 1) };
        if (!countsForOwnerAt(game.state, pos, owner)) {
          break;
        }
        minStep -= 1;
      }
      while (true) {
        const pos = { q: last.q + dir.q * (maxStep + 1), r: last.r + dir.r * (maxStep + 1) };
        if (!countsForOwnerAt(game.state, pos, owner)) {
          break;
        }
        maxStep += 1;
      }

      const a = axialToPixel({ q: last.q + dir.q * minStep, r: last.r + dir.r * minStep }, size);
      const b = axialToPixel({ q: last.q + dir.q * maxStep, r: last.r + dir.r * maxStep }, size);
      const sa = worldToScreen(a.x, a.y);
      const sb = worldToScreen(b.x, b.y);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
      ctx.stroke();
      return;
    }
  }
}

function renderNow() {
  if (!game.state) {
    return;
  }

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  drawGrid();
  drawOriginIndicator();
  drawEchoTargets();
  drawMeteorPreview();
  drawOrbitPreview();
  drawWinnerLineHint();
  drawPieces();

  ui.zoomText.textContent = `Zoom ${game.viewport.zoom.toFixed(2)}x`;
  ui.coordText.textContent = `Hex: (${game.hoverHex.q}, ${game.hoverHex.r})`;
}

function render() {
  if (game.renderScheduled) {
    return;
  }
  game.renderScheduled = true;
  window.requestAnimationFrame(() => {
    game.renderScheduled = false;
    renderNow();
  });
}

function centreBoard() {
  game.viewport.offsetX = canvas.clientWidth / 2;
  game.viewport.offsetY = canvas.clientHeight / 2;
  game.viewport.zoom = 1;
  render();
}

function newGame(modeKeys = getSelectedModeKeys(), timerConfig = game.timerConfig) {
  game.timerConfig = normaliseTimerConfig(timerConfig);
  setTimerInputs(game.timerConfig);
  game.state = makeInitialState(modeKeys, game.timerConfig);
  ensureClockState(game.state);
  game.history = [];
  centreBoard();
  updateStatus();
  syncClockTickerFromState();
  render();
  broadcastOnlineState();
}

function fillModePicker() {
  for (const [key, mode] of Object.entries(MODES)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "modeToggle";
    button.dataset.mode = key;
    button.textContent = mode.name;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      if (!canUseAdminControls()) {
        return;
      }
      const nextModeKeys = new Set(getSelectedModeKeys());
      if (nextModeKeys.has(key)) {
        nextModeKeys.delete(key);
      } else {
        nextModeKeys.add(key);
      }
      setSelectedModeKeys([...nextModeKeys]);
    });
    ui.modePicker.appendChild(button);
  }
}

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (game.isPanning) {
    const dx = event.clientX - game.panLast.x;
    const dy = event.clientY - game.panLast.y;
    if (dx === 0 && dy === 0) {
      return;
    }
    game.viewport.offsetX += dx;
    game.viewport.offsetY += dy;
    game.panLast = { x: event.clientX, y: event.clientY };
    render();
    return;
  }

  const world = screenToWorld(x, y);
  const nextHoverHex = pixelToAxial(world.x, world.y, currentHexSize());
  if (equalHex(nextHoverHex, game.hoverHex)) {
    return;
  }
  game.hoverHex = nextHoverHex;
  render();
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button === 1 || event.button === 2) {
    game.isPanning = true;
    game.panLast = { x: event.clientX, y: event.clientY };
  }
});

window.addEventListener("mouseup", () => {
  game.isPanning = false;
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  const before = screenToWorld(mouseX, mouseY);

  const factor = event.deltaY < 0 ? 1.12 : 0.89;
  game.viewport.zoom = Math.min(3.8, Math.max(0.33, game.viewport.zoom * factor));

  const after = screenToWorld(mouseX, mouseY);
  game.viewport.offsetX += (after.x - before.x);
  game.viewport.offsetY += (after.y - before.y);
  render();
}, { passive: false });

canvas.addEventListener("click", (event) => {
  if (event.button !== 0) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const world = screenToWorld(x, y);
  const hex = pixelToAxial(world.x, world.y, currentHexSize());
  clickPlacement(hex);
});

ui.newGameBtn.addEventListener("click", () => {
  if (!canUseAdminControls()) {
    return;
  }
  newGame(getSelectedModeKeys(), getTimerConfigFromInputs());
});

ui.undoBtn.addEventListener("click", () => {
  if (!canUseAdminControls()) {
    return;
  }
  restoreFromHistory();
});

ui.centreBtn.addEventListener("click", () => {
  centreBoard();
});

ui.applyTimerBtn.addEventListener("click", () => {
  if (!canUseAdminControls()) {
    return;
  }
  const timerConfig = getTimerConfigFromInputs();
  newGame(getSelectedModeKeys(), timerConfig);
});

function refreshTimerSummaryFromInputs() {
  const timerConfig = getTimerConfigFromInputs();
  ui.timerSummaryText.textContent = timerConfig.enabled
    ? `${timerConfig.initialMinutes}m +${timerConfig.incrementSeconds}s`
    : "Disabled";
}

ui.timerMinutesInput.addEventListener("input", refreshTimerSummaryFromInputs);
ui.timerIncrementInput.addEventListener("input", refreshTimerSummaryFromInputs);
ui.timerEnabledInput.addEventListener("change", refreshTimerSummaryFromInputs);

ui.onlineCreateBtn.addEventListener("click", () => {
  createOnlineRoom();
});

ui.onlineJoinBtn.addEventListener("click", () => {
  joinOnlineRoom();
});

ui.onlineLeaveBtn.addEventListener("click", () => {
  leaveOnlineRoom();
});

window.addEventListener("resize", resizeCanvas);

fillModePicker();
setTimerInputs(game.timerConfig);
updateOnlineStatusUI();
setSelectedModeKeys([]);
newGame([], game.timerConfig);
resizeCanvas();
