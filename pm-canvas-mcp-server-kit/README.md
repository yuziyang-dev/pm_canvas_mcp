# PM Canvas MCP Server Kit

这个文件夹是一个可分发的 MCP 安装包。把整个文件夹发给别人后，对方可以让 Cursor、Codex、Claude Desktop 或其他支持 MCP 的客户端安装它。

它提供的能力包括：

- 从聊天内容生成需求项目。
- 导入 HTML 高保真原型作为页面节点预览。
- 创建页面节点、页面跳转线和业务分组。
- 生成面向 vibe coding 的 PRD Markdown。
- 上传图片/HTML/Markdown/JSON 资源。
- 校验需求背景、目标、页面说明、原型、跳转信息是否完整。
- 读取生成过程事件，便于客户端展示生成进度。

## 安装

要求：

- Node.js `>=22.5.0`
- npm

在这个文件夹内运行：

```bash
node scripts/install.mjs
```

安装脚本会：

1. 检查 Node.js 和 `node:sqlite`。
2. 安装 npm 依赖。
3. 创建本地 `data/` 和 `storage/`。
4. 生成 MCP 客户端配置片段到 `generated/`。
5. 运行健康检查，确认 MCP server 能列出工具。

## 客户端配置

安装后查看：

- `generated/cursor-mcp.json`
- `generated/claude_desktop_config.fragment.json`
- `generated/codex-config.fragment.toml`

把对应片段复制到目标客户端配置中，然后重启客户端。

### Cursor

项目级配置通常放在：

```text
.cursor/mcp.json
```

### Claude Desktop

macOS 配置通常放在：

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

### Codex

配置通常放在：

```text
~/.codex/config.toml
```

## 运行方式

MCP 客户端会以 stdio 方式启动：

```bash
node mcp/canvas-mcp-server.mjs
```

也可以手动检查：

```bash
npm run healthcheck
```

## 数据位置

默认数据保存在当前文件夹内：

- SQLite：`data/prd-canvas.sqlite`
- 文件资源：`storage/`

这些目录是运行态数据，不要提交到 Git，也不要当作安装包的一部分长期分发。

## 连接已有 Canvas PRD 网页服务

如果要让 MCP 生成的数据直接出现在某个已有 Canvas PRD 网页服务里，请修改 MCP 配置里的环境变量：

```json
{
  "PRD_CANVAS_BASE_URL": "http://127.0.0.1:5180",
  "DATABASE_PATH": "/path/to/prd-canvas.sqlite",
  "STORAGE_ROOT": "/path/to/prd-canvas-storage",
  "PRD_CANVAS_MCP_OWNER_USERNAME": "your-login-username"
}
```

`PRD_CANVAS_MCP_OWNER_USERNAME` 应该是网页里已经创建过的账号。这样 MCP 创建的设计单会归属到该账号，回到网页后有编辑权限。

## 常用工具

- `prd_canvas_generate_canvas_from_context`
- `prd_canvas_import_html_prototype`
- `prd_canvas_upsert_page_node`
- `prd_canvas_create_transition`
- `prd_canvas_create_group`
- `prd_canvas_generate_markdown`
- `prd_canvas_validate_project`
- `prd_canvas_get_generation_events`

## 给智能体的安装说明

如果你是 Cursor/Codex/Claude 里的智能体，请先阅读：

```text
AGENT_INSTALL.md
```

然后按其中步骤安装、配置和验证。
