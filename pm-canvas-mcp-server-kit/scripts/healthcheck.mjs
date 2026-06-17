#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = resolve(kitRoot, "mcp/canvas-mcp-server.mjs");
const databasePath = resolve(kitRoot, "data/prd-canvas.sqlite");
const storageRoot = resolve(kitRoot, "storage");

mkdirSync(dirname(databasePath), { recursive: true });
mkdirSync(storageRoot, { recursive: true });

const client = new Client({ name: "pm-canvas-mcp-healthcheck", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: [serverPath],
  env: {
    ...process.env,
    PRD_CANVAS_BASE_URL: process.env.PRD_CANVAS_BASE_URL || "http://127.0.0.1:5180",
    DATABASE_PATH: databasePath,
    STORAGE_ROOT: storageRoot,
  },
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  const required = [
    "prd_canvas_generate_canvas_from_context",
    "prd_canvas_import_html_prototype",
    "prd_canvas_generate_markdown",
    "prd_canvas_validate_project",
  ];
  const missing = required.filter((name) => !toolNames.includes(name));
  if (missing.length) {
    throw new Error(`Missing expected tools: ${missing.join(", ")}`);
  }
  const users = await client.callTool({
    name: "prd_canvas_list_users",
    arguments: { response_format: "json" },
  });
  if (users.isError) {
    throw new Error(users.content?.[0]?.text || "prd_canvas_list_users failed");
  }
  console.log("PM Canvas MCP healthcheck passed.");
  console.log(`Tools: ${toolNames.length}`);
  console.log(toolNames.map((name) => `- ${name}`).join("\n"));
} finally {
  await client.close().catch(() => {});
}
