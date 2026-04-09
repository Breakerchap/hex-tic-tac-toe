(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.HexTicTacToePerf = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SQRT3 = Math.sqrt(3);

  const ORBIT_DIRS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 }
  ];

  const orbitRingCache = new Map();

  function keyOf(q, r) {
    return `${q},${r}`;
  }

  function addHex(a, b) {
    return { q: a.q + b.q, r: a.r + b.r };
  }

  function scaleHex(a, n) {
    return { q: a.q * n, r: a.r * n };
  }

  function hexDistance(a, b = { q: 0, r: 0 }) {
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    const ds = -a.q - a.r - (-b.q - b.r);
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
  }

  function pixelToAxialFraction(x, y, size) {
    return {
      q: ((SQRT3 / 3) * x - (1 / 3) * y) / size,
      r: ((2 / 3) * y) / size
    };
  }

  function getVisibleAxialBounds(params) {
    const width = params.width;
    const height = params.height;
    const offsetX = params.offsetX;
    const offsetY = params.offsetY;
    const hexSize = params.hexSize;
    const marginHexes = params.marginHexes == null ? 2 : params.marginHexes;

    const marginPx = Math.max(hexSize * marginHexes, hexSize * 1.2);
    const corners = [
      { x: -marginPx, y: -marginPx },
      { x: width + marginPx, y: -marginPx },
      { x: -marginPx, y: height + marginPx },
      { x: width + marginPx, y: height + marginPx }
    ];

    let minQ = Infinity;
    let maxQ = -Infinity;
    let minR = Infinity;
    let maxR = -Infinity;

    for (const corner of corners) {
      const worldX = corner.x - offsetX;
      const worldY = corner.y - offsetY;
      const axial = pixelToAxialFraction(worldX, worldY, hexSize);
      minQ = Math.min(minQ, axial.q);
      maxQ = Math.max(maxQ, axial.q);
      minR = Math.min(minR, axial.r);
      maxR = Math.max(maxR, axial.r);
    }

    return {
      minQ: Math.floor(minQ) - 1,
      maxQ: Math.ceil(maxQ) + 1,
      minR: Math.floor(minR) - 1,
      maxR: Math.ceil(maxR) + 1
    };
  }

  function getOrbitRingEntry(radius) {
    if (orbitRingCache.has(radius)) {
      return orbitRingCache.get(radius);
    }

    const ring = [];
    const indexByKey = new Map();

    if (radius <= 0) {
      const emptyEntry = { ring, indexByKey };
      orbitRingCache.set(radius, emptyEntry);
      return emptyEntry;
    }

    let hex = scaleHex(ORBIT_DIRS[4], radius);
    for (let side = 0; side < 6; side += 1) {
      for (let step = 0; step < radius; step += 1) {
        const key = keyOf(hex.q, hex.r);
        indexByKey.set(key, ring.length);
        ring.push({ q: hex.q, r: hex.r });
        hex = addHex(hex, ORBIT_DIRS[side]);
      }
    }

    const entry = { ring, indexByKey };
    orbitRingCache.set(radius, entry);
    return entry;
  }

  function orbitStepFast(hex) {
    const radius = hexDistance(hex);
    if (radius === 0) {
      return { q: hex.q, r: hex.r };
    }

    const entry = getOrbitRingEntry(radius);
    const index = entry.indexByKey.get(keyOf(hex.q, hex.r));
    if (index == null) {
      return { q: hex.q, r: hex.r };
    }

    const next = entry.ring[(index + 1) % entry.ring.length];
    return { q: next.q, r: next.r };
  }

  function getNewestTwoSerials(cells) {
    let newest = -Infinity;
    let second = -Infinity;

    for (const cell of Object.values(cells)) {
      if (cell.serial > newest) {
        second = newest;
        newest = cell.serial;
      } else if (cell.serial > second) {
        second = cell.serial;
      }
    }

    const serials = [];
    if (Number.isFinite(newest)) {
      serials.push(newest);
    }
    if (Number.isFinite(second)) {
      serials.push(second);
    }
    return serials;
  }

  return {
    pixelToAxialFraction,
    getVisibleAxialBounds,
    orbitStepFast,
    getNewestTwoSerials
  };
}));
