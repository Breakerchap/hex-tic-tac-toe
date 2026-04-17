const path = require("path");

function safeJoinWithinRoot(rootDir, requestPath) {
  let decoded = String(requestPath || "").split("?")[0];
  try {
    decoded = decodeURIComponent(decoded);
  } catch (error) {
    return null;
  }

  const root = path.resolve(rootDir);
  const relative = decoded.replace(/^([/\\])+/, "");
  const fullPath = path.resolve(root, relative);
  const relToRoot = path.relative(root, fullPath);

  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    return null;
  }
  return fullPath;
}

module.exports = {
  safeJoinWithinRoot
};
