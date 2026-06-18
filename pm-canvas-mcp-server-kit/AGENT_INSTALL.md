# Agent Install Guide

You are installing the Canvas PRD MCP Server for a user.

## Goal

Make the `prd-canvas` MCP server available in the user's MCP client so the client can create Canvas PRD projects from chat context, HTML prototypes, page nodes, transitions, groups, and Markdown exports.

## Steps

1. Open a terminal in this folder.
2. Decide the mode:

   - Shared central mode: use this when the user's MCP output must appear in the team's Canvas PRD web app.
   - Local/offline mode: use this only for isolated testing on this computer.

3. For shared central mode, ask the user for these values and run install with them in the environment:

   - `PRD_CANVAS_BASE_URL`: the Canvas PRD web app URL, for example `http://192.168.x.x:5180`
   - `PRD_CANVAS_API_TOKEN`: the token configured on the Canvas PRD server
   - `PRD_CANVAS_MCP_OWNER_USERNAME`: the user's Canvas PRD login username

   ```bash
   PRD_CANVAS_BASE_URL="http://192.168.x.x:5180" \
   PRD_CANVAS_API_TOKEN="..." \
   PRD_CANVAS_MCP_OWNER_USERNAME="alice" \
   node scripts/install.mjs
   ```

4. For local/offline mode, run:

   ```bash
   node scripts/install.mjs
   ```

5. If the script reports an old Node.js runtime, install or select Node.js `>=22.5.0`, then run the script again.
6. After installation, read the generated config snippets:

   - `generated/cursor-mcp.json`
   - `generated/claude_desktop_config.fragment.json`
   - `generated/codex-config.fragment.toml`

7. Add the matching snippet to the user's target MCP client:

   - Cursor project config: `.cursor/mcp.json`
   - Claude Desktop on macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Codex config: `~/.codex/config.toml`

8. Restart the MCP client.
9. Ask the client to list MCP tools or call `prd_canvas_list_projects`.

## Important

- Do not send secrets or tokens through chat.
- Do not commit `data/`, `storage/`, `generated/`, or `node_modules/`.
- If the user wants this MCP server to write into an existing Canvas PRD web app, do not point the MCP at a copied SQLite file. Use central API mode with:

  - `PRD_CANVAS_BASE_URL`
  - `PRD_CANVAS_API_TOKEN`
  - `PRD_CANVAS_MCP_OWNER_USERNAME`

- In central API mode, `DATABASE_PATH` and `STORAGE_ROOT` are local fallback values only. Core data and uploaded assets are written through HTTP to the shared Canvas PRD service.

## Smoke Test Prompt

After configuration, ask the MCP client:

```text
请列出 Canvas PRD MCP 工具，然后创建一个测试设计单，包含两个页面节点、一条跳转线，并生成 Markdown。
```
