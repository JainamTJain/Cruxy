/**
 * Temporarily stub node_modules/server-only so tsx can load server modules
 * outside Next.js, then restore the package.
 */
const fs = require("fs");
const { spawnSync } = require("child_process");

const target = require.resolve("server-only");
const original = fs.readFileSync(target, "utf8");
fs.writeFileSync(target, "module.exports = {};\n");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/with-server-only-stub.cjs <cmd> [args...]");
  fs.writeFileSync(target, original);
  process.exit(2);
}

try {
  const result = spawnSync(args[0], args.slice(1), {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  process.exit(result.status ?? 1);
} finally {
  fs.writeFileSync(target, original);
}
