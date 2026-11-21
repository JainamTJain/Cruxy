/**
 * Redirect the `server-only` package to an empty stub so scripts can import
 * server modules outside Next.js (used by npm run test:cruxy / smoke).
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const stubUrl = pathToFileURL(path.join(here, "empty-server-only.cjs")).href;
const hookUrl = pathToFileURL(path.join(here, "server-only-resolve-hook.mjs")).href;

register(hookUrl, pathToFileURL(here + "/"), {
  data: { stub: stubUrl },
});
