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
  PRD_CANVAS_BASE_URL: process.env.PRD_CANVAS_BASE_URL || "http://127.0.0.1:5180",
  PRD_CANVAS_API_TOKEN: process.env.PRD_CANVAS_API_TOKEN || "",
  PRD_CANVAS_MCP_OWNER_USERNAME: process.env.PRD_CANVAS_MCP_OWNER_USERNAME || "",
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
PRD_CANVAS_API_TOKEN = "${env.PRD_CANVAS_API_TOKEN.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"
PRD_CANVAS_MCP_OWNER_USERNAME = "${env.PRD_CANVAS_MCP_OWNER_USERNAME.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"
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
console.log("");
if (env.PRD_CANVAS_API_TOKEN) {
  console.log("Mode: central Canvas PRD API");
  console.log(`Base URL: ${env.PRD_CANVAS_BASE_URL}`);
  console.log(`Owner username: ${env.PRD_CANVAS_MCP_OWNER_USERNAME || "(missing)"}`);
} else {
  console.log("Mode: local/offline SQLite. To write into a shared Canvas PRD service, rerun with PRD_CANVAS_API_TOKEN, PRD_CANVAS_BASE_URL, and PRD_CANVAS_MCP_OWNER_USERNAME.");
}
