#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = resolve(kitRoot, "mcp/canvas-mcp-server.mjs");
const databasePath = resolve(kitRoot, "data/prd-canvas.sqlite");
const storageRoot = resolve(kitRoot, "storage");
const generatedDir = resolve(kitRoot, "generated");

mkdirSync(generatedDir, { recursive: true });

const env = {
  PRD_CANVAS_BASE_URL: "http://127.0.0.1:5180",
  DATABASE_PATH: databasePath,
  STORAGE_ROOT: storageRoot,
};

const cursor = {
  mcpServers: {
    "prd-canvas": {
      command: "node",
      args: [serverPath],
      env,
    },
  },
};

const claude = cursor;

const codex = `[mcp_servers.prd-canvas]
command = "node"
args = ["${serverPath.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"]

[mcp_servers.prd-canvas.env]
PRD_CANVAS_BASE_URL = "${env.PRD_CANVAS_BASE_URL}"
DATABASE_PATH = "${databasePath.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"
STORAGE_ROOT = "${storageRoot.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"
`;

writeFileSync(resolve(generatedDir, "cursor-mcp.json"), JSON.stringify(cursor, null, 2) + "\n", "utf8");
writeFileSync(resolve(generatedDir, "claude_desktop_config.fragment.json"), JSON.stringify(claude, null, 2) + "\n", "utf8");
writeFileSync(resolve(generatedDir, "codex-config.fragment.toml"), codex, "utf8");

console.log("Generated MCP config snippets:");
console.log(`- ${resolve(generatedDir, "cursor-mcp.json")}`);
console.log(`- ${resolve(generatedDir, "claude_desktop_config.fragment.json")}`);
console.log(`- ${resolve(generatedDir, "codex-config.fragment.toml")}`);
console.log("");
console.log("Server command:");
console.log(`node "${serverPath}"`);
