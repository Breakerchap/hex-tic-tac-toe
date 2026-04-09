const test = require("node:test");
const assert = require("node:assert/strict");

const perf = require("../hex_tictactoe_perf_helpers.js");

const dirs = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];

function keyOf(q, r) {
  return `${q},${r}`;
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

function hexDistance(a, b = { q: 0, r: 0 }) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -a.q - a.r - (-b.q - b.r);
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

const orbitRingCache = new Map();

function getOrbitRingLegacy(radius) {
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

function orbitStepLegacy(hex) {
  const radius = hexDistance(hex);
  if (radius === 0) {
    return { ...hex };
  }

  const ring = getOrbitRingLegacy(radius);
  const index = ring.findIndex((candidate) => equalHex(candidate, hex));
  if (index === -1) {
    return { ...hex };
  }

  return { ...ring[(index + 1) % ring.length] };
}

test("orbitStepFast matches legacy orbit stepping on radius 0-10", () => {
  for (let radius = 0; radius <= 10; radius += 1) {
    const ring = radius === 0 ? [{ q: 0, r: 0 }] : getOrbitRingLegacy(radius);

    for (const hex of ring) {
      const fast = perf.orbitStepFast(hex);
      const legacy = orbitStepLegacy(hex);
      assert.deepEqual(fast, legacy, `Mismatch for hex ${keyOf(hex.q, hex.r)}`);
      assert.equal(hexDistance(fast), hexDistance(hex));
    }
  }
});

test("orbitStepFast completes a full cycle", () => {
  for (let radius = 1; radius <= 8; radius += 1) {
    const ring = getOrbitRingLegacy(radius);
    let current = { ...ring[0] };

    for (let i = 0; i < ring.length; i += 1) {
      current = perf.orbitStepFast(current);
    }

    assert.deepEqual(current, ring[0], `Expected to return to start for radius ${radius}`);
  }
});

test("getVisibleAxialBounds returns tighter candidate ranges than legacy square sweep", () => {
  const width = 1440;
  const height = 900;
  const hexSize = 9.24;
  const params = {
    width,
    height,
    hexSize,
    offsetX: width / 2,
    offsetY: height / 2,
    marginHexes: 2
  };

  const bounds = perf.getVisibleAxialBounds(params);
  assert.ok(bounds.minQ <= bounds.maxQ);
  assert.ok(bounds.minR <= bounds.maxR);

  const newCandidates = (bounds.maxQ - bounds.minQ + 1) * (bounds.maxR - bounds.minR + 1);

  const legacyRadius = Math.ceil(Math.max(width, height) / hexSize) + 6;
  const legacyCandidates = (legacyRadius * 2 + 1) ** 2;

  assert.ok(newCandidates < legacyCandidates, `${newCandidates} should be < ${legacyCandidates}`);
});

test("getNewestTwoSerials returns the latest serial numbers", () => {
  assert.deepEqual(perf.getNewestTwoSerials({}), []);
  assert.deepEqual(perf.getNewestTwoSerials({ a: { serial: 9 } }), [9]);

  const cells = {
    a: { serial: 17 },
    b: { serial: 4 },
    c: { serial: 52 },
    d: { serial: 30 }
  };

  assert.deepEqual(perf.getNewestTwoSerials(cells), [52, 30]);
});
