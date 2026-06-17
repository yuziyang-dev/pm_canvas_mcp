#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: kitRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function nodeMajorMinor() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  return { major, minor };
}

const { major, minor } = nodeMajorMinor();
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`Node.js ${process.versions.node} is too old. Please install Node.js >= 22.5.0.`);
  process.exit(1);
}

try {
  await import("node:sqlite");
} catch {
  console.error("This Node.js runtime does not expose node:sqlite. Please use Node.js >= 22.5.0, preferably the latest LTS/current release.");
  process.exit(1);
}

mkdirSync(resolve(kitRoot, "data"), { recursive: true });
mkdirSync(resolve(kitRoot, "storage"), { recursive: true });

console.log("Installing npm dependencies...");
run("npm", ["install"]);

console.log("");
console.log("Generating MCP config snippets...");
run("node", ["scripts/print-config.mjs"]);

console.log("");
console.log("Running healthcheck...");
run("npm", ["run", "healthcheck"]);

console.log("");
console.log("Install complete. Copy the generated config snippet into Cursor, Claude Desktop, Codex, or another MCP client, then restart that client.");
