const test = require("node:test");
const assert = require("node:assert/strict");

const timer = require("../hex_tictactoe_timer_helpers.js");

test("normaliseTimerConfig clamps and normalises values", () => {
  const config = timer.normaliseTimerConfig({
    enabled: 1,
    initialMinutes: 999,
    incrementSeconds: -4
  });

  assert.deepEqual(config, {
    enabled: true,
    initialMinutes: 180,
    incrementSeconds: 0
  });
});

test("createClockState builds symmetric clocks", () => {
  const state = timer.createClockState({
    enabled: true,
    initialMinutes: 3,
    incrementSeconds: 2
  });

  assert.equal(state.enabled, true);
  assert.equal(state.initialSeconds, 180);
  assert.equal(state.remaining[1], 180);
  assert.equal(state.remaining[2], 180);
  assert.equal(state.activePlayer, 1);
  assert.equal(state.incrementSeconds, 2);
});

test("applyElapsed and switchTurnWithIncrement update active clock", () => {
  const clock = timer.createClockState({
    enabled: true,
    initialMinutes: 1,
    incrementSeconds: 2
  });

  const first = timer.applyElapsed(clock, 9.25);
  assert.equal(first.expiredPlayer, 0);
  assert.equal(Math.floor(clock.remaining[1]), 50);

  timer.switchTurnWithIncrement(clock, 2);
  assert.equal(clock.activePlayer, 2);
  assert.equal(Math.floor(clock.remaining[1]), 52);

  const second = timer.applyElapsed(clock, 60);
  assert.equal(second.expiredPlayer, 2);
  assert.equal(clock.flaggedPlayer, 2);
  assert.equal(clock.remaining[2], 0);
});

test("formatClock renders mm:ss", () => {
  assert.equal(timer.formatClock(0), "00:00");
  assert.equal(timer.formatClock(65.9), "01:05");
  assert.equal(timer.formatClock(599), "09:59");
});
