const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { safeJoinWithinRoot } = require("../server-path-utils.js");

test("safeJoinWithinRoot keeps valid paths under the root directory", () => {
  const root = path.resolve(process.cwd(), "public");
  const resolved = safeJoinWithinRoot(root, "/assets/app.js?cache=1");
  assert.equal(resolved, path.join(root, "assets", "app.js"));
});

test("safeJoinWithinRoot blocks parent-directory traversal", () => {
  const root = path.resolve(process.cwd(), "public");
  assert.equal(safeJoinWithinRoot(root, "/../secrets.txt"), null);
  assert.equal(safeJoinWithinRoot(root, "/..\\secrets.txt"), null);
  assert.equal(safeJoinWithinRoot(root, "/%2e%2e/%2e%2e/windows/system.ini"), null);
});

test("safeJoinWithinRoot blocks invalidly encoded paths", () => {
  const root = path.resolve(process.cwd(), "public");
  assert.equal(safeJoinWithinRoot(root, "/assets/%E0%A4%A.txt"), null);
});

test("safeJoinWithinRoot blocks sibling-prefix escape attempts", () => {
  const root = path.resolve(process.cwd(), "www");
  assert.equal(safeJoinWithinRoot(root, "/../www-archive/index.html"), null);
});
