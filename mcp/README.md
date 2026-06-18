# Canvas PRD MCP Server

这个 MCP server 让 Cursor、Claude Desktop、Codex 等 MCP 客户端可以把聊天内容、HTML 原型和产品关键决策写入 Canvas PRD，生成可在网页工作台中打开的设计单。

它支持两种模式：

- 中心服务模式：设置 `PRD_CANVAS_API_TOKEN` 后，MCP 通过 HTTP API 写入共享 Canvas PRD 服务，适合团队同事在各自电脑上使用。
- 本地离线模式：未设置 `PRD_CANVAS_API_TOKEN` 时，MCP 写入本机 SQLite 和本机 storage，仅适合单机测试。

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
        "PRD_CANVAS_API_TOKEN": "",
        "PRD_CANVAS_MCP_OWNER_USERNAME": "yuziyang",
        "DATABASE_PATH": "data/prd-canvas.sqlite",
        "STORAGE_ROOT": "/Volumes/ENERJOY-PUBLIC-DES/prd-canvas-storage"
      }
    }
  }
}
```

团队分发时应设置 `PRD_CANVAS_BASE_URL` 为共享服务地址、`PRD_CANVAS_API_TOKEN` 为服务端 token、`PRD_CANVAS_MCP_OWNER_USERNAME` 为网页里已经创建过的账号。这样 MCP 生成的设计单会归属于这个账号，回到网页后该账号有编辑权限，其他登录用户可浏览。

## 主要工具

- `prd_canvas_generate_canvas_from_context`：从聊天内容、关键决策、HTML 原型生成完整设计单。
- `prd_canvas_import_html_prototype`：上传 HTML 原型并附加到页面节点。
- `prd_canvas_upsert_page_node`：创建或更新页面节点。
- `prd_canvas_delete_page_node`：删除页面节点，并自动清理相关跳转线、分组引用和文档排序。
- `prd_canvas_arrange_canvas`：按跳转关系和业务分组自动整理画布节点，避免生成后堆叠。
- `prd_canvas_create_transition`：创建页面跳转线。
- `prd_canvas_delete_transition`：删除错误或多余的页面跳转线。
- `prd_canvas_create_group`：创建业务分组。
- `prd_canvas_delete_group`：删除业务分组但保留组内页面节点。
- `prd_canvas_generate_markdown`：生成面向 vibe coding 的 PRD Markdown，可保存到 NAS 导出目录。
- `prd_canvas_validate_project`：检查需求背景、目标、页面、原型和跳转是否完整。
- `prd_canvas_get_generation_events`：读取生成过程事件，便于客户端展示进度。

## 数据位置

- 中心服务模式：数据库和文件资源由 Canvas PRD Web 服务读写。
- 本地离线模式数据库：`data/prd-canvas.sqlite`
- 本地离线模式文件资源：`/Volumes/ENERJOY-PUBLIC-DES/prd-canvas-storage`
- 网页入口：`http://127.0.0.1:5180/canvas.html`

MCP 只新增数据读写入口，不改 Canvas 工作台内部交互。
