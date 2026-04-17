(function () {
  const internals = window.HexTicTacToeInternals;
  if (!internals) {
    return;
  }

  const {
    ui,
    game,
    normaliseTimerConfig,
    ensureClockState,
    setTimerInputs,
    syncClockTickerFromState,
    render,
    centreBoard,
    broadcastOnlineState,
    makeInitialState,
    getSelectedModeKeys,
    formatClock,
    updateClockUI: originalUpdateClockUI,
    updateStatus: originalUpdateStatus
  } = internals;

  function normaliseTurnOrder(value) {
    if (value === "p2First" || value === "random") {
      return value;
    }
    return "p1First";
  }

  function resolveStartingPlayer(turnOrder) {
    if (turnOrder === "p2First") {
      return 2;
    }
    if (turnOrder === "random") {
      return Math.random() < 0.5 ? 1 : 2;
    }
    return 1;
  }

  function updateTurnOrderSummary() {
    const input = document.getElementById("turnOrderInput");
    const summary = document.getElementById("turnOrderSummaryText");
    if (!input || !summary) {
      return;
    }
    const turnOrder = normaliseTurnOrder(input.value);
    if (turnOrder === "p2First") {
      summary.textContent = "Player 2 starts";
    } else if (turnOrder === "random") {
      summary.textContent = "Random first player";
    } else {
      summary.textContent = "Player 1 starts";
    }
  }

  function normaliseEgyptianCap(value) {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) {
      return 12;
    }
    return Math.max(1, Math.min(120, parsed));
  }

  function syncEgyptianCapFromInput() {
    const capInput = document.getElementById("egyptianCapInput");
    const capSummary = document.getElementById("egyptianCapSummaryText");
    const cap = normaliseEgyptianCap(capInput?.value);
    game.egyptianStoneCap = cap;
    if (capInput) {
      capInput.value = String(cap);
    }
    if (capSummary) {
      capSummary.textContent = `Cap: ${cap} stones/player`;
    }
  }

  window.updateClockUI = function () {
    originalUpdateClockUI();
    const boardClockP1 = document.getElementById("boardClockP1");
    const boardClockP2 = document.getElementById("boardClockP2");
    const boardClockP1Time = document.getElementById("boardClockP1Time");
    const boardClockP2Time = document.getElementById("boardClockP2Time");

    if (!boardClockP1 || !boardClockP2 || !boardClockP1Time || !boardClockP2Time) {
      return;
    }

    if (!game.state) {
      boardClockP1Time.textContent = "--:--";
      boardClockP2Time.textContent = "--:--";
      boardClockP1.classList.remove("active", "flagged");
      boardClockP2.classList.remove("active", "flagged");
      return;
    }

    ensureClockState(game.state);
    const clock = game.state.clock;
    boardClockP1Time.textContent = formatClock(clock.remaining[1]);
    boardClockP2Time.textContent = formatClock(clock.remaining[2]);
    const activePlayer = clock.activePlayer === 2 ? 2 : 1;
    const flaggedPlayer = clock.flaggedPlayer || 0;
    boardClockP1.classList.toggle("active", activePlayer === 1 && !flaggedPlayer);
    boardClockP2.classList.toggle("active", activePlayer === 2 && !flaggedPlayer);
    boardClockP1.classList.toggle("flagged", flaggedPlayer === 1);
    boardClockP2.classList.toggle("flagged", flaggedPlayer === 2);
  };

  window.updateStatus = function () {
    originalUpdateStatus();
    if (game.state && !game.state.openingMoveDone) {
      ui.subturnText.textContent = "Opening move: 1 placement";
    }
    updateTurnOrderSummary();
    window.updateClockUI();
  };

  window.newGame = function (modeKeys = getSelectedModeKeys(), timerConfig = game.timerConfig, turnOrder = (document.getElementById("turnOrderInput")?.value || game.turnOrder || "p1First")) {
    game.timerConfig = normaliseTimerConfig(timerConfig);
    game.turnOrder = normaliseTurnOrder(turnOrder);
    syncEgyptianCapFromInput();
    setTimerInputs(game.timerConfig);
    const input = document.getElementById("turnOrderInput");
    if (input) {
      input.value = game.turnOrder;
    }
    updateTurnOrderSummary();

    game.state = makeInitialState(modeKeys, game.timerConfig, game.egyptianStoneCap);
    const startingPlayer = resolveStartingPlayer(game.turnOrder);
    game.state.startingPlayer = startingPlayer;
    game.state.turnPlayer = startingPlayer;
    // Opening turn is always a single placement, regardless of who starts.
    game.state.movesLeftInTurn = 1;
    ensureClockState(game.state);
    game.state.clock.activePlayer = startingPlayer;
    game.history = [];
    centreBoard();
    window.updateStatus();
    syncClockTickerFromState();
    render();
    broadcastOnlineState({ intent: "newGame" });
  };

  document.getElementById("turnOrderInput")?.addEventListener("change", updateTurnOrderSummary);
  game.turnOrder = normaliseTurnOrder(game.turnOrder || "p1First");
  const input = document.getElementById("turnOrderInput");
  if (input) {
    input.value = game.turnOrder;
  }
  syncEgyptianCapFromInput();
  // Keep global identifier bindings in sync with patched implementations.
  // This ensures existing listeners calling `newGame()`/`updateStatus()` use these patched versions.
  try {
    newGame = window.newGame;
    updateStatus = window.updateStatus;
    updateClockUI = window.updateClockUI;
  } catch (error) {
    // Non-fatal in environments where global bindings are not writable.
  }
  updateTurnOrderSummary();
  window.updateStatus();
})();
