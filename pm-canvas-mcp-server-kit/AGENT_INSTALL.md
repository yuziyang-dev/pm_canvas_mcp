# Agent Install Guide

You are installing the Canvas PRD MCP Server for a user.

## Goal

Make the `prd-canvas` MCP server available in the user's MCP client so the client can create Canvas PRD projects from chat context, HTML prototypes, page nodes, transitions, groups, and Markdown exports.

## Steps

1. Open a terminal in this folder.
2. Run:

   ```bash
   node scripts/install.mjs
   ```

3. If the script reports an old Node.js runtime, install or select Node.js `>=22.5.0`, then run the script again.
4. After installation, read the generated config snippets:

   - `generated/cursor-mcp.json`
   - `generated/claude_desktop_config.fragment.json`
   - `generated/codex-config.fragment.toml`

5. Add the matching snippet to the user's target MCP client:

   - Cursor project config: `.cursor/mcp.json`
   - Claude Desktop on macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Codex config: `~/.codex/config.toml`

6. Restart the MCP client.
7. Ask the client to list MCP tools or call `prd_canvas_list_projects`.

## Important

- Do not send secrets or tokens through chat.
- Do not commit `data/`, `storage/`, `generated/`, or `node_modules/`.
- If the user wants this MCP server to write into an existing Canvas PRD web app, set these env values in the MCP config:

  - `DATABASE_PATH`
  - `STORAGE_ROOT`
  - `PRD_CANVAS_BASE_URL`
  - optional `PRD_CANVAS_MCP_OWNER_USERNAME`

## Smoke Test Prompt

After configuration, ask the MCP client:

```text
请列出 Canvas PRD MCP 工具，然后创建一个测试设计单，包含两个页面节点、一条跳转线，并生成 Markdown。
```
