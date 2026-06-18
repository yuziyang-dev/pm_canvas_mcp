#!/usr/bin/env node
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(rootDir, process.env.DATABASE_PATH || "data/prd-canvas.sqlite");
const storageRoot = resolve(process.env.STORAGE_ROOT || "/Volumes/ENERJOY-PUBLIC-DES/prd-canvas-storage");
const baseUrl = (process.env.PRD_CANVAS_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5180}`).replace(/\/$/, "");
const htmlProtoRatio = 844 / 390;
const nodeWidth = 320;
const rowGap = 420;
const colGap = 520;
const characterLimit = 28000;

const products = ["ShutEye", "GrowMe", "JustFit", "Max Cleaner"];
const checklist = [
  "页面加载与网络状态相关：加载中、空状态、数据丢失、无网",
  "表单输入相关：字符长度限制、异常输入、错误状态、按钮禁用逻辑、提交后的反馈与引导",
  "卡片/列表/信息流类：空状态与引导、点击范围",
  "弹窗/toast相关：出现时机、退出机制、前后页面跳转逻辑",
  "文案：所有文案定稿（或预期最大字数）",
  "多语言：是否需要做多语言（特别是视频动画等）；多语言文案长度预估",
  "不同用户的需求差异：订阅 vs 非订阅用户流程差异，看到的页面是否有区别",
  "需求冲突：与现有弹窗 / 功能冲突排查 + 处理策略",
];

mkdirSync(dirname(dbPath), { recursive: true });
mkdirSync(storageRoot, { recursive: true });
mkdirSync(join(storageRoot, "uploads"), { recursive: true });
mkdirSync(join(storageRoot, "exports"), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS designs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    product TEXT NOT NULL,
    status TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    submitted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    design_id TEXT,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const stmt = {
  listUsers: db.prepare("SELECT id, username, display_name, created_at FROM users ORDER BY datetime(created_at) ASC"),
  userByUsername: db.prepare("SELECT id, username, display_name, created_at FROM users WHERE lower(username) = lower(?)"),
  userById: db.prepare("SELECT id, username, display_name, created_at FROM users WHERE id = ?"),
  insertUser: db.prepare("INSERT INTO users (id, username, display_name, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)"),
  listDesigns: db.prepare(`
    SELECT designs.id, designs.title, designs.product, designs.status, designs.owner_id, designs.created_at,
           designs.updated_at, designs.submitted_at, users.username AS owner_username, users.display_name AS owner_name,
           designs.data_json
    FROM designs
    JOIN users ON users.id = designs.owner_id
    ORDER BY datetime(designs.updated_at) DESC
  `),
  getDesign: db.prepare(`
    SELECT designs.*, users.username AS owner_username, users.display_name AS owner_name
    FROM designs
    JOIN users ON users.id = designs.owner_id
    WHERE designs.id = ?
  `),
  insertDesign: db.prepare("INSERT INTO designs (id, title, product, status, owner_id, data_json, created_at, updated_at, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"),
  updateDesign: db.prepare("UPDATE designs SET title = ?, product = ?, status = ?, data_json = ?, updated_at = ?, submitted_at = ? WHERE id = ?"),
  insertFile: db.prepare("INSERT INTO files (id, design_id, owner_id, kind, original_name, mime_type, relative_path, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"),
  listFilesForDesign: db.prepare("SELECT * FROM files WHERE design_id = ? ORDER BY datetime(created_at) DESC"),
};

const generationJobs = new Map();

const server = new McpServer({
  name: "prd-canvas-mcp-server",
  version: "0.1.0",
});

const ResponseFormat = z.enum(["markdown", "json"]).default("markdown").describe("Return 'markdown' for human-readable output or 'json' for machine-readable output.");
const Product = z.enum(products).default("ShutEye").describe("所属产品。");
const Status = z.enum(["writing", "done"]).optional().describe("设计单状态：writing=编写中，done=已完成。");

function nowISO() {
  return new Date().toISOString();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return { hash, salt };
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

function createServiceUser() {
  const id = randomUUID();
  const username = "mcp-agent";
  const displayName = "Canvas MCP Agent";
  const { hash, salt } = hashPassword(randomBytes(24).toString("hex"));
  const created = nowISO();
  stmt.insertUser.run(id, username, displayName, hash, salt, created);
  return publicUser(stmt.userById.get(id));
}

function resolveOwner(ownerUsername) {
  const explicit = String(ownerUsername || process.env.PRD_CANVAS_MCP_OWNER_USERNAME || "").trim();
  if (explicit) {
    const row = stmt.userByUsername.get(explicit);
    if (!row) {
      throw new Error(`找不到账号「${explicit}」。请先在网页里创建该账号，或去掉 owner_username 参数让 MCP 使用默认账号。`);
    }
    return publicUser(row);
  }

  const osUser = String(process.env.USER || "").trim();
  if (osUser) {
    const row = stmt.userByUsername.get(osUser);
    if (row) return publicUser(row);
  }

  const rows = stmt.listUsers.all();
  const humans = rows.filter((row) => row.username !== "mcp-agent");
  if (humans.length === 1) return publicUser(humans[0]);

  const service = stmt.userByUsername.get("mcp-agent");
  return service ? publicUser(service) : createServiceUser();
}

function normalizeProduct(product) {
  return products.includes(product) ? product : "ShutEye";
}

function statusFromDoc(doc) {
  return doc?.meta?.requirementStatus === "done" && doc?.meta?.submittedAt ? "done" : "writing";
}

function blankDoc(owner, seed = {}) {
  const now = nowISO();
  const product = normalizeProduct(seed.product || "ShutEye");
  return {
    schema: "prd-canvas/1.0",
    meta: {
      name: seed.title || "",
      product,
      requirementStatus: "writing",
      background: seed.background || "",
      dataGoals: seed.dataGoals || "",
      expGoals: seed.expGoals || "",
      analysisUrl: seed.analysisUrl || "",
      date: todayISO(),
      createdAt: now,
      createdBy: owner.displayName,
      ownerId: owner.id,
      updatedAt: now,
      setupDone: true,
      docOrder: [],
      docSortMode: "flow",
      docGroupView: true,
      docShowPageTransitions: true,
      keyDecisions: seed.decisions || [],
      mcpContext: seed.conversation ? { conversation: seed.conversation, importedAt: now } : undefined,
      mcpGenerated: !!seed.mcpGenerated,
    },
    nodes: [],
    edges: [],
    groups: [],
  };
}

function summarizeDesign(row, viewer = null) {
  let doc = {};
  try { doc = JSON.parse(row.data_json || "{}"); } catch {}
  const pageCount = Array.isArray(doc.nodes) ? doc.nodes.length : 0;
  const status = row.status === "done" && row.submitted_at ? "done" : "writing";
  return {
    id: row.id,
    title: row.title || doc?.meta?.name || "未命名设计单",
    product: normalizeProduct(row.product || doc?.meta?.product),
    status,
    ownerId: row.owner_id,
    ownerUsername: row.owner_username,
    ownerName: row.owner_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at || "",
    pageCount,
    canEdit: !!viewer && row.owner_id === viewer.id,
    url: `${baseUrl}/canvas.html`,
  };
}

function loadDesign(id) {
  const row = stmt.getDesign.get(id);
  if (!row) throw new Error(`设计单不存在：${id}`);
  let doc;
  try {
    doc = JSON.parse(row.data_json || "{}");
  } catch {
    throw new Error(`设计单数据损坏，无法解析 JSON：${id}`);
  }
  return { row, doc };
}

function saveDesign(row, doc) {
  const now = nowISO();
  doc.meta = {
    ...(doc.meta || {}),
    name: String(doc.meta?.name || row.title || "未命名设计单").trim() || "未命名设计单",
    product: normalizeProduct(doc.meta?.product || row.product),
    ownerId: row.owner_id,
    createdAt: doc.meta?.createdAt || row.created_at || now,
    createdBy: doc.meta?.createdBy || row.owner_name || "Unknown",
    updatedAt: now,
  };
  const status = statusFromDoc(doc);
  if (status !== "done") doc.meta.submittedAt = "";
  const submittedAt = status === "done" ? doc.meta.submittedAt || now : null;
  stmt.updateDesign.run(doc.meta.name, doc.meta.product, status, JSON.stringify(doc), now, submittedAt, row.id);
  return loadDesign(row.id);
}

function createDesign(owner, doc) {
  const id = randomUUID();
  const now = nowISO();
  doc.meta = {
    ...(doc.meta || {}),
    name: String(doc.meta?.name || "未命名设计单").trim() || "未命名设计单",
    product: normalizeProduct(doc.meta?.product || "ShutEye"),
    createdAt: doc.meta?.createdAt || now,
    createdBy: doc.meta?.createdBy || owner.displayName,
    ownerId: owner.id,
    updatedAt: now,
  };
  const status = statusFromDoc(doc);
  const submittedAt = status === "done" ? doc.meta.submittedAt || now : null;
  stmt.insertDesign.run(id, doc.meta.name, doc.meta.product, status, owner.id, JSON.stringify(doc), doc.meta.createdAt, now, submittedAt);
  return loadDesign(id);
}

function sanitizeFileName(name) {
  const raw = String(name || "file").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return raw.slice(0, 140) || "file";
}

function extensionFromMime(mimeType, fallbackName) {
  const ext = extname(fallbackName || "");
  if (ext) return ext;
  const map = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "text/html": ".html",
    "text/markdown": ".md",
    "application/json": ".json",
  };
  return map[mimeType] || "";
}

function safeStoragePath(relativePath) {
  const normalized = normalize(relativePath || "").replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = resolve(storageRoot, normalized);
  if (!abs.startsWith(storageRoot)) return null;
  return abs;
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const mimeType = match[1] || "application/octet-stream";
  const payload = match[3] || "";
  const buffer = match[2] ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  return { buffer, mimeType };
}

function writeManagedFile({ ownerId, designId = null, kind = "asset", originalName = "file", mimeType = "application/octet-stream", buffer }) {
  const fileId = randomUUID();
  const safeName = sanitizeFileName(originalName);
  const safeKind = String(kind || "asset").replace(/[^\w-]/g, "_");
  const ext = extensionFromMime(mimeType, safeName);
  const folder = designId || "unassigned";
  const relDir = join("uploads", folder, safeKind);
  mkdirSync(join(storageRoot, relDir), { recursive: true });
  const relPath = join(relDir, `${fileId}${ext}`);
  const absPath = safeStoragePath(relPath);
  if (!absPath) throw new Error("文件路径不安全，已拒绝写入。");
  writeFileSync(absPath, buffer);
  const created = nowISO();
  stmt.insertFile.run(fileId, designId, ownerId, safeKind, safeName, mimeType, relPath, buffer.length, created);
  return {
    id: fileId,
    url: `/api/files/${fileId}`,
    absoluteUrl: `${baseUrl}/api/files/${fileId}`,
    kind: safeKind,
    originalName: safeName,
    mimeType,
    size: buffer.length,
    createdAt: created,
  };
}

function htmlToText(html) {
  if (!html) return "";
  if (!/[<&]/.test(String(html))) return String(html);
  return String(html)
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(div|p|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function htmlToMarkdownText(html) {
  if (!html) return "";
  if (!/[<&]/.test(String(html))) return String(html).replace(/\n{3,}/g, "\n\n").trim();
  return String(html)
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs, label) => {
      const href = (attrs.match(/\bhref=(["'])(.*?)\1/i) || attrs.match(/\bhref=([^\s>]+)/i) || [])[2]
        || (attrs.match(/\bhref=([^\s>]+)/i) || [])[1]
        || "";
      const text = htmlToText(label) || href;
      return href ? `[${text}](${href})` : text;
    })
    .replace(/<img\b([^>]*)>/gi, (_, attrs) => {
      const alt = (attrs.match(/\balt=(["'])(.*?)\1/i) || [])[2] || "";
      return alt ? `[image: ${alt}]` : "[image attached]";
    })
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, "==$1==")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(div|p|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function mdValue(value, fallback = "-") {
  const text = htmlToMarkdownText(value).trim();
  return text || fallback;
}

function mdField(label, value, indent = "- ") {
  const body = mdValue(value);
  const lines = body.split("\n");
  if (lines.length === 1) return `${indent}${label}: ${lines[0]}`;
  const childIndent = " ".repeat(indent.length);
  return [`${indent}${label}:`, ...lines.map((line) => `${childIndent}${line}`)].join("\n");
}

function listify(items, fallback = "无") {
  const clean = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
  return clean.length ? clean.map((item) => `- ${item}`).join("\n") : fallback;
}

function pageMarkdown(node, doc) {
  const outgoing = (doc.edges || []).filter((edge) => edge.from === node.id);
  const incoming = (doc.edges || []).filter((edge) => edge.to === node.id);
  const lines = [];
  lines.push(`### ${node.name || "未命名页面"} [${node.id}]`);
  lines.push(`- prototype: ${node.proto ? (node.protoKind === "html" ? `[html](${node.proto})` : `[image](${node.proto})`) : "none"}`);
  if (node.protoName) lines.push(`- prototype_name: ${node.protoName}`);
  lines.push("");
  lines.push("#### 页面说明");
  lines.push(mdField("主说明", node.note));
  lines.push("");
  lines.push("#### 体验目标");
  lines.push(mdField("主目标", node.expGoal));
  lines.push("");
  lines.push("#### 页面跳转");
  if (outgoing.length) {
    outgoing.forEach((edge) => {
      const target = (doc.nodes || []).find((item) => item.id === edge.to);
      lines.push(`- 通过「${mdValue(edge.label, "未命名操作")}」跳转至「${target ? target.name || target.id : edge.to}」`);
    });
  } else {
    lines.push("- 无下游跳转");
  }
  if (incoming.length) {
    lines.push("");
    lines.push("#### 入口来源");
    incoming.forEach((edge) => {
      const source = (doc.nodes || []).find((item) => item.id === edge.from);
      lines.push(`- 从「${source ? source.name || source.id : edge.from}」通过「${mdValue(edge.label, "未命名操作")}」进入`);
    });
  }
  if (Array.isArray(node.competitors) && node.competitors.length) {
    lines.push("");
    lines.push("#### 竞品参考");
    node.competitors.forEach((item, index) => {
      lines.push(mdField(`参考 ${index + 1}${item.img ? " [image attached]" : ""}`, item.caption));
    });
  }
  return lines.join("\n").trimEnd();
}

function toMarkdown(doc) {
  const lines = [];
  lines.push(`# PRD · ${doc.meta?.name || "未命名设计单"}`);
  lines.push(`> schema: ${doc.schema || "prd-canvas/1.0"} | product: ${doc.meta?.product || "ShutEye"} | date: ${doc.meta?.date || todayISO()} | status: ${doc.meta?.requirementStatus || "writing"}`);
  lines.push(`> created_by: ${doc.meta?.createdBy || "-"} | created_at: ${doc.meta?.createdAt || "-"} | updated_at: ${doc.meta?.updatedAt || "-"}`);
  if (doc.meta?.analysisUrl) lines.push(`> analysis: ${doc.meta.analysisUrl}`);
  lines.push("");
  lines.push("## 1. 需求背景");
  lines.push(mdValue(doc.meta?.background));
  lines.push("");
  lines.push("## 2. 目标");
  lines.push(mdField("数据目标", doc.meta?.dataGoals));
  lines.push(mdField("体验目标", doc.meta?.expGoals));
  lines.push("");
  lines.push("## 3. 关键决策");
  lines.push(listify(doc.meta?.keyDecisions));
  lines.push("");
  lines.push("## 4. 总流程");
  if ((doc.edges || []).length) {
    doc.edges.forEach((edge) => {
      const from = (doc.nodes || []).find((node) => node.id === edge.from);
      const to = (doc.nodes || []).find((node) => node.id === edge.to);
      lines.push(`- ${from ? from.name || from.id : edge.from} --[${mdValue(edge.label, "跳转")}]--> ${to ? to.name || to.id : edge.to}`);
    });
  } else {
    lines.push("none");
  }
  const groups = doc.groups || [];
  if (groups.length) {
    lines.push("");
    lines.push("## 5. 业务分组");
    groups.forEach((group) => {
      const names = (group.nodeIds || []).map((id) => (doc.nodes || []).find((node) => node.id === id)?.name || id);
      lines.push(`- ${group.name || group.id}: ${names.join(" / ") || "无页面"}`);
    });
  }
  lines.push("");
  lines.push("## 6. 页面明细");
  (doc.nodes || []).forEach((node) => {
    lines.push(pageMarkdown(node, doc));
    lines.push("");
  });
  const context = doc.meta?.mcpContext?.conversation;
  if (context) {
    lines.push("## 7. 原始聊天上下文摘录");
    lines.push(String(context).slice(0, 5000));
    if (String(context).length > 5000) lines.push("\n> 已截断，完整上下文保存在 Canvas JSON 的 meta.mcpContext.conversation。");
  }
  lines.push("");
  lines.push("## 8. 提交前检查清单");
  checklist.forEach((item) => lines.push(`- [ ] ${item}`));
  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim() + "\n";
}

function truncateForContent(text) {
  const raw = String(text || "");
  if (raw.length <= characterLimit) return raw;
  return `${raw.slice(0, characterLimit)}\n\n... Response truncated at ${characterLimit} characters. Use response_format='json' or narrower filters for more detail.`;
}

function asToolResult(output, responseFormat = "markdown", markdown = null) {
  const text = responseFormat === "json" ? JSON.stringify(output, null, 2) : (markdown || JSON.stringify(output, null, 2));
  return {
    content: [{ type: "text", text: truncateForContent(text) }],
    structuredContent: output,
  };
}

function toolError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}

function registerTool(name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      return await handler(args || {});
    } catch (error) {
      return toolError(error);
    }
  });
}

function nodeSummary(node) {
  return {
    id: node.id,
    name: node.name,
    hasPrototype: !!node.proto,
    prototypeKind: node.protoKind || "",
    prototypeUrl: node.proto || "",
    x: node.x,
    y: node.y,
  };
}

function designSummaryMarkdown(items, title = "设计单") {
  const lines = [`# ${title}`, ""];
  if (!items.length) {
    lines.push("暂无设计单。");
    return lines.join("\n");
  }
  items.forEach((item) => {
    lines.push(`- **${item.title}** (${item.id})`);
    lines.push(`  - 产品: ${item.product}`);
    lines.push(`  - 状态: ${item.status === "done" ? "已完成" : "编写中"}`);
    lines.push(`  - 页面数: ${item.pageCount}`);
    lines.push(`  - 创建者: ${item.ownerName || item.ownerUsername || item.ownerId}`);
    lines.push(`  - 最近更新: ${item.updatedAt}`);
  });
  return lines.join("\n");
}

function resolveNode(doc, idOrName, label = "节点") {
  const raw = String(idOrName || "").trim();
  if (!raw) throw new Error(`缺少${label} ID 或名称。`);
  const exact = (doc.nodes || []).find((node) => node.id === raw || node.name === raw);
  if (exact) return exact;
  const fuzzy = (doc.nodes || []).find((node) => String(node.name || "").toLowerCase().includes(raw.toLowerCase()));
  if (fuzzy) return fuzzy;
  throw new Error(`找不到${label}「${raw}」。请先用 prd_canvas_upsert_page_node 创建页面节点，或传入正确 node_id。`);
}

function nextNodePosition(doc) {
  const index = (doc.nodes || []).length;
  return {
    x: 120 + (index % 3) * colGap,
    y: 120 + Math.floor(index / 3) * rowGap,
  };
}

function upsertNode(doc, input) {
  const now = nowISO();
  const nodeId = input.node_id || input.id || randomUUID().slice(0, 8);
  const pos = nextNodePosition(doc);
  const index = (doc.nodes || []).findIndex((node) => node.id === nodeId);
  const base = index >= 0 ? doc.nodes[index] : {
    id: nodeId,
    x: Number.isFinite(input.x) ? input.x : pos.x,
    y: Number.isFinite(input.y) ? input.y : pos.y,
    name: input.name || "未命名页面",
    note: "",
    expGoal: "",
    proto: null,
    protoKind: "",
    protoRatio: undefined,
    protoName: "",
    competitors: [],
    createdAt: now,
  };
  const next = {
    ...base,
    ...(input.name !== undefined ? { name: input.name || base.name || "未命名页面" } : {}),
    ...(input.note !== undefined ? { note: input.note || "" } : {}),
    ...(input.exp_goal !== undefined ? { expGoal: input.exp_goal || "" } : {}),
    ...(input.expGoal !== undefined ? { expGoal: input.expGoal || "" } : {}),
    ...(input.prototype_url !== undefined ? { proto: input.prototype_url || null } : {}),
    ...(input.proto !== undefined ? { proto: input.proto || null } : {}),
    ...(input.prototype_kind !== undefined ? { protoKind: input.prototype_kind || "" } : {}),
    ...(input.protoKind !== undefined ? { protoKind: input.protoKind || "" } : {}),
    ...(input.prototype_ratio !== undefined ? { protoRatio: input.prototype_ratio } : {}),
    ...(input.protoRatio !== undefined ? { protoRatio: input.protoRatio } : {}),
    ...(input.prototype_name !== undefined ? { protoName: input.prototype_name || "" } : {}),
    ...(Number.isFinite(input.x) ? { x: input.x } : {}),
    ...(Number.isFinite(input.y) ? { y: input.y } : {}),
    updatedAt: now,
  };
  if (index >= 0) {
    doc.nodes[index] = next;
  } else {
    doc.nodes.push(next);
  }
  doc.meta.docOrder = normalizeDocOrder(doc.meta.docOrder, doc.nodes);
  return next;
}

function normalizeDocOrder(order, nodes) {
  const existing = new Set((nodes || []).map((node) => node.id));
  const out = Array.isArray(order) ? order.filter((id) => existing.has(id)) : [];
  (nodes || []).forEach((node) => {
    if (!out.includes(node.id)) out.push(node.id);
  });
  return out;
}

function appendEvent(jobId, phase, message, data = {}) {
  const event = { id: randomUUID(), at: nowISO(), phase, message, data };
  const job = generationJobs.get(jobId) || { id: jobId, status: "running", events: [] };
  job.events.push(event);
  generationJobs.set(jobId, job);
  return event;
}

function finishJob(jobId, status, data = {}) {
  const job = generationJobs.get(jobId) || { id: jobId, events: [] };
  job.status = status;
  job.finishedAt = nowISO();
  job.data = data;
  generationJobs.set(jobId, job);
  return job;
}

function inferPagesFromText(text) {
  const source = String(text || "");
  const lines = source.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const candidates = [];
  const pattern = /(?:页面|页|screen|page|流程|状态)[:：\s-]*([^，。；;\n]{2,32})/i;
  for (const line of lines) {
    const match = line.match(pattern);
    if (match?.[1]) candidates.push(match[1].replace(/[「」"'`]/g, "").trim());
  }
  const unique = [...new Set(candidates)].slice(0, 8);
  if (unique.length) return unique.map((name) => ({ name }));
  return [{ name: "核心页面", note: source.slice(0, 500) }];
}

function normalizePageSpecs(input) {
  const pages = Array.isArray(input.pages) && input.pages.length
    ? input.pages
    : Array.isArray(input.html_prototypes) && input.html_prototypes.length
      ? input.html_prototypes.map((proto, index) => ({
        name: proto.page_name || proto.name || `页面 ${index + 1}`,
        note: proto.note || "",
        exp_goal: proto.exp_goal || "",
        prototype_name: proto.name,
      }))
      : inferPagesFromText([input.conversation, input.background].filter(Boolean).join("\n"));

  return pages.map((page, index) => ({
    id: page.id || `p${String(index + 1).padStart(2, "0")}`,
    name: String(page.name || `页面 ${index + 1}`).trim() || `页面 ${index + 1}`,
    note: page.note || page.description || "",
    exp_goal: page.exp_goal || page.expGoal || "",
    prototype_name: page.prototype_name || page.prototypeName || page.name || "",
    group: page.group || "",
  }));
}

function validateDoc(doc) {
  const issues = [];
  const warnings = [];
  if (!String(doc.meta?.name || "").trim()) issues.push("缺少设计单标题。");
  if (!String(htmlToText(doc.meta?.background || "")).trim()) warnings.push("缺少需求背景。");
  if (!String(htmlToText(doc.meta?.dataGoals || "")).trim()) warnings.push("缺少数据目标。");
  if (!String(htmlToText(doc.meta?.expGoals || "")).trim()) warnings.push("缺少整体体验目标。");
  if (!Array.isArray(doc.nodes) || !doc.nodes.length) issues.push("缺少页面节点。");

  (doc.nodes || []).forEach((node) => {
    if (!String(node.name || "").trim()) issues.push(`节点 ${node.id} 缺少页面名称。`);
    if (!node.proto) warnings.push(`页面「${node.name || node.id}」缺少原型预览。`);
    if (!String(htmlToText(node.note || "")).trim()) warnings.push(`页面「${node.name || node.id}」缺少页面说明。`);
    if (!String(htmlToText(node.expGoal || "")).trim()) warnings.push(`页面「${node.name || node.id}」缺少体验目标。`);
  });

  const nodeIds = new Set((doc.nodes || []).map((node) => node.id));
  (doc.edges || []).forEach((edge) => {
    if (!nodeIds.has(edge.from)) issues.push(`跳转线 ${edge.id} 的起点不存在：${edge.from}`);
    if (!nodeIds.has(edge.to)) issues.push(`跳转线 ${edge.id} 的终点不存在：${edge.to}`);
    if (!String(edge.label || "").trim()) warnings.push(`跳转线 ${edge.id} 缺少触发条件/操作说明。`);
  });
  if ((doc.nodes || []).length > 1 && !(doc.edges || []).length) warnings.push("多个页面之间没有跳转线。");

  const maxScore = 100;
  const score = Math.max(0, maxScore - issues.length * 18 - warnings.length * 7);
  return {
    ok: issues.length === 0,
    score,
    issues,
    warnings,
    pageCount: (doc.nodes || []).length,
    transitionCount: (doc.edges || []).length,
    groupCount: (doc.groups || []).length,
  };
}

function validationMarkdown(validation) {
  const lines = [`# Canvas 校验结果`, "", `- 结果: ${validation.ok ? "可用" : "需要修复"}`, `- 分数: ${validation.score}`, `- 页面数: ${validation.pageCount}`, `- 跳转线: ${validation.transitionCount}`, ""];
  if (validation.issues.length) {
    lines.push("## 必须修复");
    validation.issues.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }
  if (validation.warnings.length) {
    lines.push("## 建议补充");
    validation.warnings.forEach((item) => lines.push(`- ${item}`));
  }
  return lines.join("\n");
}

server.registerResource(
  "prd_canvas_projects",
  "canvas://projects",
  {
    title: "Canvas PRD Projects",
    description: "当前数据库中的设计单列表。",
    mimeType: "application/json",
  },
  async (uri) => {
    const projects = stmt.listDesigns.all().map((row) => summarizeDesign(row));
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ projects }, null, 2) }],
    };
  },
);

server.registerResource(
  "prd_canvas_project",
  new ResourceTemplate("canvas://projects/{id}", {
    list: async () => ({
      resources: stmt.listDesigns.all().map((row) => ({
        uri: `canvas://projects/${row.id}`,
        name: row.title,
        description: `${row.product} · ${row.status === "done" ? "已完成" : "编写中"}`,
        mimeType: "application/json",
      })),
    }),
  }),
  {
    title: "Canvas PRD Project",
    description: "读取单个设计单的完整 Canvas JSON。",
    mimeType: "application/json",
  },
  async (uri, variables) => {
    const { doc } = loadDesign(variables.id);
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(doc, null, 2) }],
    };
  },
);

registerTool(
  "prd_canvas_list_users",
  {
    title: "List Canvas PRD Users",
    description: "列出本地 Canvas PRD 中已有账号。用于选择 owner_username，让 MCP 生成的设计单归属到正确 PM 账号。",
    inputSchema: {
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ response_format }) => {
    const users = stmt.listUsers.all().map(publicUser);
    const markdown = ["# Canvas PRD 账号", "", ...users.map((user) => `- ${user.displayName} (${user.username}) · ${user.id}`)].join("\n");
    return asToolResult({ users }, response_format, markdown);
  },
);

registerTool(
  "prd_canvas_list_projects",
  {
    title: "List Canvas PRD Projects",
    description: "分页列出设计单，可按创建者、产品和状态过滤。不会修改任何数据。",
    inputSchema: {
      scope: z.enum(["all", "mine"]).default("all").describe("all=全部公开设计单；mine=owner_username 对应账号的设计单。"),
      owner_username: z.string().optional().describe("创建者账号。scope=mine 时如果为空，会使用 PRD_CANVAS_MCP_OWNER_USERNAME、系统用户名或默认 MCP 账号。"),
      product: Product.optional(),
      status: Status,
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ scope, owner_username, product, status, limit, offset, response_format }) => {
    const owner = scope === "mine" ? resolveOwner(owner_username) : null;
    let rows = stmt.listDesigns.all();
    if (owner) rows = rows.filter((row) => row.owner_id === owner.id);
    if (product) rows = rows.filter((row) => row.product === product);
    if (status) rows = rows.filter((row) => (row.status === "done" && row.submitted_at ? "done" : "writing") === status);
    const total = rows.length;
    const pageRows = rows.slice(offset, offset + limit);
    const projects = pageRows.map((row) => summarizeDesign(row, owner));
    const output = {
      total,
      count: projects.length,
      offset,
      has_more: total > offset + projects.length,
      next_offset: total > offset + projects.length ? offset + projects.length : null,
      projects,
    };
    return asToolResult(output, response_format, designSummaryMarkdown(projects, "设计单列表"));
  },
);

registerTool(
  "prd_canvas_create_project",
  {
    title: "Create Canvas PRD Project",
    description: "创建一个空的需求设计单项目，后续可继续导入聊天内容、HTML 原型、页面节点、跳转线和分组。",
    inputSchema: {
      title: z.string().min(1).max(120).describe("设计单标题。"),
      product: Product,
      background: z.string().max(20000).optional().describe("需求背景，可为纯文本或轻量 HTML。"),
      data_goals: z.string().max(10000).optional().describe("数据目标。"),
      experience_goals: z.string().max(10000).optional().describe("整体体验目标。"),
      analysis_url: z.string().max(1000).optional().describe("需求分析文档或聊天记录链接。"),
      owner_username: z.string().optional().describe("让设计单归属到某个已存在账号；不填则自动推断。"),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    const owner = resolveOwner(input.owner_username);
    const doc = blankDoc(owner, {
      title: input.title,
      product: input.product,
      background: input.background || "",
      dataGoals: input.data_goals || "",
      expGoals: input.experience_goals || "",
      analysisUrl: input.analysis_url || "",
    });
    const { row } = createDesign(owner, doc);
    const design = summarizeDesign(row, owner);
    const markdown = `# 已创建设计单\n\n- 标题: ${design.title}\n- ID: ${design.id}\n- 产品: ${design.product}\n- 创建者: ${design.ownerName}\n- 打开: ${design.url}`;
    return asToolResult({ design, doc }, input.response_format, markdown);
  },
);

registerTool(
  "prd_canvas_get_project",
  {
    title: "Get Canvas PRD Project",
    description: "读取某个设计单的完整 Canvas JSON，可选同时返回面向 AI/vibe coding 的 Markdown。",
    inputSchema: {
      project_id: z.string().min(1).describe("设计单 ID。"),
      include_markdown: z.boolean().default(false).describe("是否同时生成 Markdown。"),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ project_id, include_markdown, response_format }) => {
    const { row, doc } = loadDesign(project_id);
    const design = summarizeDesign(row);
    const markdown = include_markdown ? toMarkdown(doc) : `# ${design.title}\n\n- ID: ${design.id}\n- 产品: ${design.product}\n- 状态: ${design.status === "done" ? "已完成" : "编写中"}\n- 页面数: ${design.pageCount}`;
    return asToolResult({ design, doc, markdown: include_markdown ? markdown : undefined }, response_format, markdown);
  },
);

registerTool(
  "prd_canvas_import_context",
  {
    title: "Import Conversation Context",
    description: "把大模型聊天内容、产品关键决策、需求背景和目标写入指定设计单。适合先收集上下文，再让模型补页面和流程。",
    inputSchema: {
      project_id: z.string().min(1),
      conversation: z.string().max(200000).optional().describe("需求讨论原文或总结。"),
      decisions: z.array(z.string().max(1000)).max(80).default([]).describe("聊天过程中已确定的产品关键决策。"),
      background: z.string().max(20000).optional(),
      data_goals: z.string().max(10000).optional(),
      experience_goals: z.string().max(10000).optional(),
      append: z.boolean().default(true).describe("true=追加到已有上下文；false=覆盖已有上下文。"),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    const { row, doc } = loadDesign(input.project_id);
    const previous = doc.meta?.mcpContext?.conversation || "";
    doc.meta = {
      ...(doc.meta || {}),
      background: input.background !== undefined ? input.background : doc.meta?.background,
      dataGoals: input.data_goals !== undefined ? input.data_goals : doc.meta?.dataGoals,
      expGoals: input.experience_goals !== undefined ? input.experience_goals : doc.meta?.expGoals,
      keyDecisions: input.append ? [...(doc.meta?.keyDecisions || []), ...(input.decisions || [])] : (input.decisions || []),
      mcpContext: {
        ...(doc.meta?.mcpContext || {}),
        conversation: input.conversation
          ? (input.append && previous ? `${previous}\n\n${input.conversation}` : input.conversation)
          : previous,
        importedAt: nowISO(),
      },
    };
    const saved = saveDesign(row, doc);
    const validation = validateDoc(saved.doc);
    const markdown = `# 已导入需求上下文\n\n- 设计单: ${saved.row.title}\n- 关键决策: ${(input.decisions || []).length} 条\n- 校验分数: ${validation.score}`;
    return asToolResult({ design: summarizeDesign(saved.row), validation }, input.response_format, markdown);
  },
);

registerTool(
  "prd_canvas_upsert_page_node",
  {
    title: "Create or Update Page Node",
    description: "创建或更新页面节点。用于把一个需求页面写入 Canvas，包括页面说明、体验目标和原型资源 URL。",
    inputSchema: {
      project_id: z.string().min(1),
      node_id: z.string().optional().describe("已有节点 ID；不填则创建新节点。"),
      name: z.string().max(120).optional().describe("页面名称。"),
      note: z.string().max(20000).optional().describe("页面说明。"),
      exp_goal: z.string().max(10000).optional().describe("页面体验目标。"),
      x: z.number().optional(),
      y: z.number().optional(),
      prototype_url: z.string().optional().describe("已上传资源 URL，如 /api/files/{id}。"),
      prototype_kind: z.enum(["image", "html"]).optional(),
      prototype_ratio: z.number().positive().max(6).optional(),
      prototype_name: z.string().max(160).optional(),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    const { row, doc } = loadDesign(input.project_id);
    const node = upsertNode(doc, input);
    const saved = saveDesign(row, doc);
    const markdown = `# 页面节点已保存\n\n- 页面: ${node.name}\n- 节点 ID: ${node.id}\n- 原型: ${node.proto || "未添加"}`;
    return asToolResult({ design: summarizeDesign(saved.row), node: nodeSummary(node) }, input.response_format, markdown);
  },
);

registerTool(
  "prd_canvas_import_html_prototype",
  {
    title: "Import HTML Prototype",
    description: "上传 HTML 高保真原型并附加到页面节点。默认按 390:844 移动端比例展示，Canvas 中右键仍可调整比例。",
    inputSchema: {
      project_id: z.string().min(1),
      html: z.string().min(20).max(5_000_000).describe("完整 HTML 原型源码。"),
      file_name: z.string().max(160).default("prototype.html"),
      node_id: z.string().optional().describe("要附加的节点 ID；不填则新建节点。"),
      page_name: z.string().max(120).optional(),
      note: z.string().max(20000).optional(),
      exp_goal: z.string().max(10000).optional(),
      viewport_width: z.number().positive().max(2000).default(390),
      viewport_height: z.number().positive().max(3000).default(844),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    const { row, doc } = loadDesign(input.project_id);
    const file = writeManagedFile({
      ownerId: row.owner_id,
      designId: row.id,
      kind: "prototype",
      originalName: input.file_name,
      mimeType: "text/html",
      buffer: Buffer.from(input.html, "utf8"),
    });
    const node = upsertNode(doc, {
      node_id: input.node_id,
      name: input.page_name || input.file_name.replace(/\.html?$/i, "") || "HTML 原型页面",
      note: input.note,
      exp_goal: input.exp_goal,
      prototype_url: file.url,
      prototype_kind: "html",
      prototype_ratio: input.viewport_height / input.viewport_width,
      prototype_name: input.file_name,
    });
    const saved = saveDesign(row, doc);
    const markdown = `# HTML 原型已导入\n\n- 页面: ${node.name}\n- 节点 ID: ${node.id}\n- 文件: ${file.absoluteUrl}\n- 展示比例: ${input.viewport_width}:${input.viewport_height}`;
    return asToolResult({ design: summarizeDesign(saved.row), node: nodeSummary(node), file }, input.response_format, markdown);
  },
);

registerTool(
  "prd_canvas_create_transition",
  {
    title: "Create Page Transition",
    description: "在两个页面节点之间创建跳转线，表达按钮、条件、异常流或页面流转逻辑。",
    inputSchema: {
      project_id: z.string().min(1),
      from: z.string().min(1).describe("起点节点 ID 或页面名。"),
      to: z.string().min(1).describe("终点节点 ID 或页面名。"),
      label: z.string().max(1000).default("跳转").describe("触发动作、条件或跳转说明。"),
      allow_duplicate: z.boolean().default(false),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    const { row, doc } = loadDesign(input.project_id);
    const from = resolveNode(doc, input.from, "起点节点");
    const to = resolveNode(doc, input.to, "终点节点");
    if (from.id === to.id) throw new Error("起点和终点不能是同一个节点。");
    let edge = (doc.edges || []).find((item) => item.from === from.id && item.to === to.id);
    if (edge && !input.allow_duplicate) {
      edge.label = input.label || edge.label || "跳转";
    } else {
      edge = { id: randomUUID().slice(0, 8), from: from.id, to: to.id, label: input.label || "跳转" };
      doc.edges.push(edge);
    }
    const saved = saveDesign(row, doc);
    const markdown = `# 页面跳转已保存\n\n- ${from.name} --[${edge.label}]--> ${to.name}`;
    return asToolResult({ design: summarizeDesign(saved.row), edge }, input.response_format, markdown);
  },
);

registerTool(
  "prd_canvas_create_group",
  {
    title: "Create Business Group",
    description: "创建或更新业务分组，把多个页面节点收纳到同一流程模块里。",
    inputSchema: {
      project_id: z.string().min(1),
      name: z.string().min(1).max(120),
      node_ids: z.array(z.string()).default([]).describe("节点 ID 列表。"),
      page_names: z.array(z.string()).default([]).describe("页面名列表，会和 node_ids 合并。"),
      color_idx: z.number().int().min(0).max(9).optional(),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    const { row, doc } = loadDesign(input.project_id);
    const ids = new Set(input.node_ids || []);
    (input.page_names || []).forEach((name) => ids.add(resolveNode(doc, name, "分组页面").id));
    const validIds = [...ids].filter((id) => (doc.nodes || []).some((node) => node.id === id));
    if (!validIds.length) throw new Error("分组至少需要一个有效页面节点。");
    const existing = (doc.groups || []).find((group) => group.name === input.name);
    const group = existing || { id: randomUUID().slice(0, 8), name: input.name, nodeIds: [], colorIdx: (doc.groups || []).length % 10 };
    group.name = input.name;
    group.nodeIds = validIds;
    if (input.color_idx !== undefined) group.colorIdx = input.color_idx;
    if (!existing) doc.groups.push(group);
    const saved = saveDesign(row, doc);
    const markdown = `# 业务分组已保存\n\n- 分组: ${group.name}\n- 页面数: ${group.nodeIds.length}`;
    return asToolResult({ design: summarizeDesign(saved.row), group }, input.response_format, markdown);
  },
);

registerTool(
  "prd_canvas_generate_canvas_from_context",
  {
    title: "Generate Canvas From Context",
    description: "从聊天内容、关键决策、HTML 原型和可选的结构化页面/跳转/分组生成完整 Canvas PRD 设计单。该工具会创建新设计单并写入数据库与 NAS。",
    inputSchema: {
      title: z.string().min(1).max(120),
      product: Product,
      conversation: z.string().max(300000).optional(),
      decisions: z.array(z.string().max(1000)).max(100).default([]),
      background: z.string().max(20000).optional(),
      data_goals: z.string().max(10000).optional(),
      experience_goals: z.string().max(10000).optional(),
      analysis_url: z.string().max(1000).optional(),
      pages: z.array(z.object({
        id: z.string().optional(),
        name: z.string(),
        note: z.string().optional(),
        exp_goal: z.string().optional(),
        prototype_name: z.string().optional(),
        group: z.string().optional(),
      })).max(80).default([]).describe("推荐由客户端模型先从聊天中抽取页面列表。"),
      html_prototypes: z.array(z.object({
        name: z.string().default("prototype.html"),
        html: z.string().min(20).max(5_000_000),
        page_name: z.string().optional(),
        note: z.string().optional(),
        exp_goal: z.string().optional(),
      })).max(80).default([]),
      transitions: z.array(z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().default("跳转"),
      })).max(200).default([]),
      groups: z.array(z.object({
        name: z.string(),
        pages: z.array(z.string()).default([]),
      })).max(40).default([]),
      owner_username: z.string().optional(),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    const jobId = randomUUID();
    appendEvent(jobId, "start", "开始生成 Canvas 项目", { title: input.title, product: input.product });
    const owner = resolveOwner(input.owner_username);
    appendEvent(jobId, "owner", "已确定设计单创建者", { username: owner.username, displayName: owner.displayName });

    const doc = blankDoc(owner, {
      title: input.title,
      product: input.product,
      background: input.background || input.conversation || "",
      dataGoals: input.data_goals || "",
      expGoals: input.experience_goals || "",
      analysisUrl: input.analysis_url || "",
      decisions: input.decisions || [],
      conversation: input.conversation || "",
      mcpGenerated: true,
    });
    const created = createDesign(owner, doc);
    appendEvent(jobId, "project", "已创建设计单", { id: created.row.id });

    const pageSpecs = normalizePageSpecs(input);
    const prototypeByName = new Map((input.html_prototypes || []).map((proto, index) => [proto.page_name || proto.name || `页面 ${index + 1}`, proto]));
    pageSpecs.forEach((page, index) => {
      const proto = prototypeByName.get(page.prototype_name) || prototypeByName.get(page.name) || (input.html_prototypes || [])[index];
      const uploaded = proto ? writeManagedFile({
        ownerId: created.row.owner_id,
        designId: created.row.id,
        kind: "prototype",
        originalName: proto.name || `${page.name}.html`,
        mimeType: "text/html",
        buffer: Buffer.from(proto.html, "utf8"),
      }) : null;
      const node = upsertNode(created.doc, {
        node_id: page.id,
        name: page.name,
        note: page.note || proto?.note || "",
        exp_goal: page.exp_goal || proto?.exp_goal || "",
        x: 120 + (index % 3) * colGap,
        y: 120 + Math.floor(index / 3) * rowGap,
        prototype_url: uploaded?.url,
        prototype_kind: uploaded ? "html" : "",
        prototype_ratio: uploaded ? htmlProtoRatio : undefined,
        prototype_name: uploaded?.originalName || "",
      });
      appendEvent(jobId, "node", "已创建页面节点", { id: node.id, name: node.name, hasPrototype: !!uploaded });
    });

    const nodesByName = new Map(created.doc.nodes.map((node) => [node.name, node]));
    if ((input.transitions || []).length) {
      input.transitions.forEach((transition) => {
        const from = created.doc.nodes.find((node) => node.id === transition.from) || nodesByName.get(transition.from);
        const to = created.doc.nodes.find((node) => node.id === transition.to) || nodesByName.get(transition.to);
        if (!from || !to || from.id === to.id) return;
        created.doc.edges.push({ id: randomUUID().slice(0, 8), from: from.id, to: to.id, label: transition.label || "跳转" });
        appendEvent(jobId, "edge", "已创建页面跳转线", { from: from.name, to: to.name, label: transition.label || "跳转" });
      });
    } else {
      for (let i = 0; i < created.doc.nodes.length - 1; i += 1) {
        created.doc.edges.push({ id: randomUUID().slice(0, 8), from: created.doc.nodes[i].id, to: created.doc.nodes[i + 1].id, label: "下一步" });
      }
      if (created.doc.edges.length) appendEvent(jobId, "edge", "已按页面顺序生成默认跳转线", { count: created.doc.edges.length });
    }

    if ((input.groups || []).length) {
      input.groups.forEach((group, index) => {
        const ids = (group.pages || []).map((name) => created.doc.nodes.find((node) => node.id === name || node.name === name)?.id).filter(Boolean);
        if (!ids.length) return;
        created.doc.groups.push({ id: randomUUID().slice(0, 8), name: group.name, nodeIds: ids, colorIdx: index % 10 });
        appendEvent(jobId, "group", "已创建业务分组", { name: group.name, count: ids.length });
      });
    } else {
      const byGroup = new Map();
      pageSpecs.forEach((page) => {
        if (!page.group) return;
        const node = created.doc.nodes.find((item) => item.id === page.id || item.name === page.name);
        if (!node) return;
        byGroup.set(page.group, [...(byGroup.get(page.group) || []), node.id]);
      });
      [...byGroup.entries()].forEach(([name, ids], index) => {
        created.doc.groups.push({ id: randomUUID().slice(0, 8), name, nodeIds: ids, colorIdx: index % 10 });
      });
      if (!created.doc.groups.length && created.doc.nodes.length > 1) {
        created.doc.groups.push({ id: randomUUID().slice(0, 8), name: "核心流程", nodeIds: created.doc.nodes.map((node) => node.id), colorIdx: 0 });
      }
    }

    const saved = saveDesign(created.row, created.doc);
    const validation = validateDoc(saved.doc);
    const markdown = toMarkdown(saved.doc);
    const job = finishJob(jobId, "done", { projectId: saved.row.id, validation });
    const design = summarizeDesign(saved.row, owner);
    const summary = `# Canvas 已生成\n\n- 设计单: ${design.title}\n- ID: ${design.id}\n- 页面数: ${design.pageCount}\n- 跳转线: ${saved.doc.edges.length}\n- 分组: ${saved.doc.groups.length}\n- 校验分数: ${validation.score}\n- 打开: ${design.url}\n\n${validationMarkdown(validation)}`;
    return asToolResult({ job, design, doc: saved.doc, validation, markdown }, input.response_format, summary);
  },
);

registerTool(
  "prd_canvas_validate_project",
  {
    title: "Validate Canvas PRD Project",
    description: "校验设计单是否具备可交付给 vibe coding 的基本信息：背景、目标、页面、原型、跳转和页面说明。",
    inputSchema: {
      project_id: z.string().min(1),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ project_id, response_format }) => {
    const { doc } = loadDesign(project_id);
    const validation = validateDoc(doc);
    return asToolResult({ validation }, response_format, validationMarkdown(validation));
  },
);

registerTool(
  "prd_canvas_generate_markdown",
  {
    title: "Generate PRD Markdown",
    description: "基于 Canvas 项目生成适合 AI/vibe coding 使用的 Markdown；可选择保存到 NAS 导出目录并返回下载 URL。",
    inputSchema: {
      project_id: z.string().min(1),
      save_export: z.boolean().default(false),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ project_id, save_export, response_format }) => {
    const { row, doc } = loadDesign(project_id);
    const markdown = toMarkdown(doc);
    let exportInfo = null;
    if (save_export) {
      const exportDir = join(storageRoot, "exports", row.id);
      mkdirSync(exportDir, { recursive: true });
      const filePath = join(exportDir, "requirement.md");
      writeFileSync(filePath, markdown, "utf8");
      exportInfo = {
        url: `/api/export/${row.id}/requirement.md`,
        absoluteUrl: `${baseUrl}/api/export/${row.id}/requirement.md`,
        filePath,
        size: statSync(filePath).size,
      };
    }
    return asToolResult({ design: summarizeDesign(row), markdown, export: exportInfo }, response_format, markdown);
  },
);

registerTool(
  "prd_canvas_get_generation_events",
  {
    title: "Get Canvas Generation Events",
    description: "读取 MCP 高阶生成工具的阶段事件，方便客户端展示“正在生成页面、上传原型、创建跳转线”等过程。",
    inputSchema: {
      job_id: z.string().optional().describe("生成任务 ID；不填返回最近任务。"),
      limit: z.number().int().min(1).max(200).default(80),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ job_id, limit, response_format }) => {
    const jobs = [...generationJobs.values()].sort((a, b) => String(b.finishedAt || "").localeCompare(String(a.finishedAt || "")));
    const job = job_id ? generationJobs.get(job_id) : jobs[0];
    if (!job) throw new Error("暂无生成任务事件。请先调用 prd_canvas_generate_canvas_from_context。");
    const events = job.events.slice(-limit);
    const markdown = [`# 生成过程 · ${job.id}`, "", `- 状态: ${job.status}`, ...events.map((event) => `- ${event.at} · ${event.phase}: ${event.message}`)].join("\n");
    return asToolResult({ job: { ...job, events } }, response_format, markdown);
  },
);

registerTool(
  "prd_canvas_upload_asset",
  {
    title: "Upload Canvas PRD Asset",
    description: "上传图片、HTML、Markdown 或 JSON 资源到 NAS，并登记到 files 表。用于给页面节点、竞品参考或导出包准备资源 URL。",
    inputSchema: {
      project_id: z.string().optional().describe("关联的设计单 ID。"),
      owner_username: z.string().optional().describe("没有 project_id 时用于确定文件拥有者。"),
      kind: z.string().default("asset"),
      name: z.string().max(160).default("asset"),
      mime_type: z.string().default("application/octet-stream"),
      text: z.string().max(5_000_000).optional().describe("文本内容，如 HTML/Markdown/JSON。"),
      data_url: z.string().max(20_000_000).optional().describe("base64 data URL，用于图片等二进制内容。"),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    let ownerId;
    if (input.project_id) {
      const { row } = loadDesign(input.project_id);
      ownerId = row.owner_id;
    } else {
      ownerId = resolveOwner(input.owner_username).id;
    }
    let buffer;
    let mimeType = input.mime_type;
    if (input.data_url) {
      const parsed = dataUrlToBuffer(input.data_url);
      if (!parsed) throw new Error("data_url 格式不正确。");
      buffer = parsed.buffer;
      mimeType = input.mime_type || parsed.mimeType;
    } else if (typeof input.text === "string") {
      buffer = Buffer.from(input.text, "utf8");
    } else {
      throw new Error("请提供 text 或 data_url。");
    }
    const file = writeManagedFile({
      ownerId,
      designId: input.project_id || null,
      kind: input.kind,
      originalName: input.name,
      mimeType,
      buffer,
    });
    const markdown = `# 资源已上传\n\n- 文件: ${file.originalName}\n- URL: ${file.absoluteUrl}\n- 大小: ${file.size} bytes`;
    return asToolResult({ file }, input.response_format, markdown);
  },
);

server.registerPrompt(
  "prd_canvas_generate_from_chat",
  {
    title: "Generate Canvas PRD From Chat",
    description: "指导客户端模型从聊天记录和 HTML 原型生成可落地的 Canvas PRD 项目。",
    argsSchema: {
      project_title: z.string().describe("需求/设计单标题。"),
      product: Product,
    },
  },
  ({ project_title, product }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          `请把当前聊天内容整理为「${project_title}」的 Canvas PRD 项目，所属产品为 ${product}。`,
          "先抽取：需求背景、数据目标、体验目标、关键决策、页面列表、页面跳转、业务分组。",
          "如果聊天中包含 HTML 原型源码，请用 prd_canvas_generate_canvas_from_context 的 html_prototypes 传入；如果只有页面信息，先生成节点和跳转。",
          "生成后调用 prd_canvas_validate_project 检查缺失项，再调用 prd_canvas_generate_markdown 生成面向 vibe coding 的 PRD Markdown。",
        ].join("\n"),
      },
    }],
  }),
);

async function main() {
  if (!existsSync(dbPath)) {
    console.error(`Canvas PRD MCP: database will be created at ${dbPath}`);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Canvas PRD MCP server running via stdio`);
  console.error(`DB: ${dbPath}`);
  console.error(`Storage: ${storageRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
