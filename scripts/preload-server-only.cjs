/**
 * Allow Node/tsx scripts to import modules that start with `import "server-only"`.
 * Patches both Module._load and Module.prototype.require (tsx may bypass _load).
 */
const Module = require("module");
const path = require("path");
const stub = require("./empty-server-only.cjs");

function isServerOnly(request) {
  const id = String(request ?? "");
  return (
    id === "server-only" ||
    id.endsWith(`${path.sep}server-only`) ||
    id.endsWith(`${path.sep}server-only${path.sep}index.js`) ||
    id.includes(`${path.sep}node_modules${path.sep}server-only`)
  );
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (isServerOnly(request)) return stub;
  return originalLoad.apply(this, arguments);
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (request) {
  if (isServerOnly(request)) return stub;
  return originalRequire.apply(this, arguments);
};
