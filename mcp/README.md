# Canvas PRD MCP Server

这个 MCP server 让 Cursor、Claude Desktop、Codex 等 MCP 客户端可以把聊天内容、HTML 原型和产品关键决策写入当前 Canvas PRD 数据库，生成可在网页工作台中打开的设计单。

## 启动方式

在项目根目录运行：

```bash
npm run mcp:canvas
```

MCP 客户端配置示例：

```json
{
  "mcpServers": {
    "prd-canvas": {
      "command": "node",
      "args": [
        "/Volumes/Game Drive/prd-canvas-tool-product-package/mcp/canvas-mcp-server.mjs"
      ],
      "env": {
        "PRD_CANVAS_BASE_URL": "http://127.0.0.1:5180",
        "PRD_CANVAS_MCP_OWNER_USERNAME": "yuziyang",
        "DATABASE_PATH": "data/prd-canvas.sqlite",
        "STORAGE_ROOT": "/Volumes/ENERJOY-PUBLIC-DES/prd-canvas-storage"
      }
    }
  }
}
```

`PRD_CANVAS_MCP_OWNER_USERNAME` 建议设置成网页里已经创建过的账号，这样 MCP 生成的设计单会归属于这个账号，回到网页后该账号有编辑权限。

## 主要工具

- `prd_canvas_generate_canvas_from_context`：从聊天内容、关键决策、HTML 原型生成完整设计单。
- `prd_canvas_import_html_prototype`：上传 HTML 原型并附加到页面节点。
- `prd_canvas_upsert_page_node`：创建或更新页面节点。
- `prd_canvas_create_transition`：创建页面跳转线。
- `prd_canvas_create_group`：创建业务分组。
- `prd_canvas_generate_markdown`：生成面向 vibe coding 的 PRD Markdown，可保存到 NAS 导出目录。
- `prd_canvas_validate_project`：检查需求背景、目标、页面、原型和跳转是否完整。
- `prd_canvas_get_generation_events`：读取生成过程事件，便于客户端展示进度。

## 数据位置

- 数据库：`data/prd-canvas.sqlite`
- 文件资源：`/Volumes/ENERJOY-PUBLIC-DES/prd-canvas-storage`
- 网页入口：`http://127.0.0.1:5180/canvas.html`

MCP 只新增数据读写入口，不改 Canvas 工作台内部交互。
