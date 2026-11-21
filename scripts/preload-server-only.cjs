/** Allow tsx scripts to import modules that start with `import "server-only"`. */
const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad(request, parent, isMain);
};
