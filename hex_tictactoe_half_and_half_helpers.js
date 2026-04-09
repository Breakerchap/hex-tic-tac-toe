(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.HexTicTacToeHalf = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SHARED_KIND = "halfAndHalf";
  const CAPTURE_STEP = 0.25;

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function roundQuarter(value) {
    return Math.round(clamp01(value) / CAPTURE_STEP) * CAPTURE_STEP;
  }

  function isHalfAndHalfCell(cell) {
    return Boolean(cell && cell.kind === SHARED_KIND);
  }

  function getCellControl(cell) {
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
      const rawP1 = cell.capture && typeof cell.capture[1] === "number" ? cell.capture[1] : 0.5;
      const p1 = roundQuarter(rawP1);
      const p2 = roundQuarter(1 - p1);
      return { 1: p1, 2: p2 };
    }

    return { 1: 0, 2: 0 };
  }

  function buildCellFromControl(control) {
    const p1 = roundQuarter(control[1]);
    const p2 = roundQuarter(1 - p1);

    if (p1 >= 1) {
      return { owner: 1, kind: "stone" };
    }
    if (p2 >= 1) {
      return { owner: 2, kind: "stone" };
    }

    return {
      owner: 0,
      kind: SHARED_KIND,
      capture: {
        1: p1,
        2: p2
      }
    };
  }

  function cellCountsForOwner(cell, owner) {
    const control = getCellControl(cell);
    return control[owner] >= 0.5;
  }

  function canPlaceOnCellInHalfMode(cell, placingOwner) {
    if (!cell || (placingOwner !== 1 && placingOwner !== 2)) {
      return false;
    }

    const other = placingOwner === 1 ? 2 : 1;
    const control = getCellControl(cell);
    return control[other] > 0 && control[placingOwner] < 1;
  }

  function resolveHalfAndHalfPlacement(existingCell, placingOwner) {
    if (placingOwner !== 1 && placingOwner !== 2) {
      return null;
    }

    if (!existingCell) {
      return {
        owner: placingOwner,
        kind: "stone"
      };
    }

    if (!canPlaceOnCellInHalfMode(existingCell, placingOwner)) {
      return null;
    }

    const other = placingOwner === 1 ? 2 : 1;
    const control = getCellControl(existingCell);
    const nextOwnerControl = roundQuarter(control[placingOwner] + CAPTURE_STEP);
    const nextOtherControl = roundQuarter(1 - nextOwnerControl);

    return buildCellFromControl({
      [placingOwner]: nextOwnerControl,
      [other]: nextOtherControl
    });
  }

  return {
    SHARED_KIND,
    CAPTURE_STEP,
    isHalfAndHalfCell,
    getCellControl,
    cellCountsForOwner,
    canPlaceOnCellInHalfMode,
    resolveHalfAndHalfPlacement
  };
}));
