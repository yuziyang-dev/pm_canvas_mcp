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
const apiToken = String(process.env.PRD_CANVAS_API_TOKEN || "").trim();
const useRemoteApi = !!apiToken;
const htmlProtoRatio = 844 / 390;
const nodeWidth = 180;
const nodeInset = 9;
const nodeMediaWidth = nodeWidth - nodeInset * 2 - 2;
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

let db = null;
let stmt = null;

if (!useRemoteApi) {
  mkdirSync(dirname(dbPath), { recursive: true });
  mkdirSync(storageRoot, { recursive: true });
  mkdirSync(join(storageRoot, "uploads"), { recursive: true });
  mkdirSync(join(storageRoot, "exports"), { recursive: true });

  db = new DatabaseSync(dbPath);
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

  stmt = {
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
}

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

function normalizeHtmlPrototypeRatio(value) {
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio <= 0) return htmlProtoRatio;
  const invertedDefault = 1 / htmlProtoRatio;
  if (ratio < 1 && Math.abs(ratio - invertedDefault) < 0.08) return htmlProtoRatio;
  return Math.min(4, Math.max(0.25, ratio));
}

function writeManagedFile({ ownerId, designId = null, kind = "asset", originalName = "file", mimeType = "application/octet-stream", buffer }) {
  if (useRemoteApi) throw new Error("远程 API 模式下不能写本地文件，请使用 remoteUploadFile。");
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

function activeOwnerUsername(ownerUsername) {
  const configured = String(process.env.PRD_CANVAS_MCP_OWNER_USERNAME || "").trim();
  if (useRemoteApi) return configured;
  return String(ownerUsername || configured || "").trim();
}

function absoluteApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function withAbsoluteFileUrl(file) {
  if (!file || typeof file !== "object") return file;
  return {
    ...file,
    absoluteUrl: file.absoluteUrl || (file.url ? absoluteApiUrl(file.url) : undefined),
  };
}

async function apiRequest(path, { method = "GET", body = null, ownerUsername = "", allowNoOwner = false } = {}) {
  if (!apiToken) throw new Error("远程 API 模式需要设置 PRD_CANVAS_API_TOKEN。");
  const owner = activeOwnerUsername(ownerUsername);
  if (!owner && !allowNoOwner) {
    throw new Error("远程 API 模式需要设置 PRD_CANVAS_MCP_OWNER_USERNAME，值必须是 Canvas PRD 网页里已经创建过的账号。");
  }
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    Accept: "application/json",
  };
  if (owner) headers["X-Canvas-Owner-Username"] = owner;
  if (body !== null) headers["Content-Type"] = "application/json; charset=utf-8";
  const res = await fetch(absoluteApiUrl(path), {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch {}
  }
  if (!res.ok) {
    const message = json?.error || text || `${res.status} ${res.statusText}`;
    throw new Error(`Canvas PRD API ${method} ${path} 失败：${message}`);
  }
  return json ?? {};
}

function remoteDesignSummary(design, viewer = null) {
  return {
    id: design.id,
    title: design.title || "未命名设计单",
    product: normalizeProduct(design.product),
    status: design.status === "done" ? "done" : "writing",
    ownerId: design.ownerId,
    ownerUsername: design.ownerUsername,
    ownerName: design.ownerName,
    createdAt: design.createdAt,
    updatedAt: design.updatedAt,
    submittedAt: design.submittedAt || "",
    pageCount: Number(design.pageCount || 0),
    canEdit: !!design.canEdit || (!!viewer && design.ownerId === viewer.id),
    url: `${baseUrl}/canvas.html`,
    searchText: design.searchText || "",
  };
}

async function remoteListUsers() {
  const data = await apiRequest("/api/mcp/users", { allowNoOwner: true });
  return (data.users || []).map((user) => ({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt,
  }));
}

async function remoteResolveOwner(ownerUsername) {
  const username = activeOwnerUsername(ownerUsername);
  if (!username) {
    throw new Error("请在 MCP 配置里设置 PRD_CANVAS_MCP_OWNER_USERNAME，值为你在 Canvas PRD 网页创建的账号。");
  }
  const users = await remoteListUsers();
  const owner = users.find((user) => String(user.username).toLowerCase() === username.toLowerCase());
  if (!owner) {
    throw new Error(`中心服务里找不到账号「${username}」。请先打开 Canvas PRD 网页注册该账号，再重启 MCP 客户端。`);
  }
  return owner;
}

async function remoteListDesigns({ scope = "all", owner_username = "", product = "", status = "", limit = 20, offset = 0 } = {}) {
  const owner = await remoteResolveOwner(owner_username);
  const data = await apiRequest(`/api/designs?scope=${encodeURIComponent(scope)}`, { ownerUsername: owner.username });
  let rows = (data.designs || []).map((design) => remoteDesignSummary(design, owner));
  if (product) rows = rows.filter((row) => row.product === product);
  if (status) rows = rows.filter((row) => row.status === status);
  const total = rows.length;
  rows = rows.slice(offset, offset + limit);
  return { owner, total, rows };
}

async function remoteCreateDesign(ownerUsername, doc) {
  const owner = await remoteResolveOwner(ownerUsername);
  const data = await apiRequest("/api/designs", { method: "POST", ownerUsername: owner.username, body: { doc } });
  return {
    owner,
    row: remoteDesignSummary(data.design, owner),
    doc: data.doc,
  };
}

async function remoteLoadDesign(projectId, ownerUsername = "") {
  const owner = await remoteResolveOwner(ownerUsername);
  const data = await apiRequest(`/api/designs/${encodeURIComponent(projectId)}`, { ownerUsername: owner.username });
  return {
    owner,
    row: remoteDesignSummary(data.design, owner),
    doc: data.doc,
  };
}

async function remoteSaveDesign(projectId, doc, ownerUsername = "") {
  const owner = await remoteResolveOwner(ownerUsername);
  const data = await apiRequest(`/api/designs/${encodeURIComponent(projectId)}`, {
    method: "PUT",
    ownerUsername: owner.username,
    body: { doc },
  });
  return {
    owner,
    row: remoteDesignSummary(data.design, owner),
    doc: data.doc,
  };
}

async function remoteUploadFile({ ownerUsername = "", designId = null, kind = "asset", originalName = "file", mimeType = "application/octet-stream", buffer = null, text = null, dataUrl = null }) {
  const owner = await remoteResolveOwner(ownerUsername);
  const body = {
    designId,
    kind,
    name: originalName,
    mimeType,
  };
  if (dataUrl) body.dataUrl = dataUrl;
  else if (typeof text === "string") body.text = text;
  else if (buffer) body.dataUrl = `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`;
  else throw new Error("远程上传缺少文件内容。");
  const data = await apiRequest("/api/files", {
    method: "POST",
    ownerUsername: owner.username,
    body,
  });
  return withAbsoluteFileUrl(data.file);
}

async function remoteSaveMarkdownExport(projectId, markdown, ownerUsername = "") {
  const owner = await remoteResolveOwner(ownerUsername);
  const data = await apiRequest(`/api/designs/${encodeURIComponent(projectId)}/export-md`, {
    method: "POST",
    ownerUsername: owner.username,
    body: { markdown },
  });
  return data?.url ? { ...data, absoluteUrl: absoluteApiUrl(data.url) } : data;
}

async function remoteRecordActivity({ ownerUsername = "", designId = "", phase = "work", message = "", detail = {}, progress = null, status = "running" } = {}) {
  if (!useRemoteApi) return null;
  try {
    return await apiRequest("/api/mcp/activity", {
      method: "POST",
      ownerUsername,
      body: {
        designId,
        phase,
        message,
        detail,
        progress,
        status,
      },
    });
  } catch (error) {
    console.error(`Canvas PRD MCP activity failed: ${error?.message || error}`);
    return null;
  }
}

function outputDesignSummary(row, viewer = null) {
  return useRemoteApi ? row : summarizeDesign(row, viewer);
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

function estimateWrappedLines(value, maxLines, charsPerLine) {
  const text = htmlToText(value || "").replace(/\s+/g, " ").trim();
  if (!text) return 0;
  return Math.max(1, Math.min(maxLines, Math.ceil(text.length / charsPerLine)));
}

function estimateNodeHeight(node) {
  const titleLines = estimateWrappedLines(node.name || "未命名页面", 2, 13) || 1;
  const descLines = estimateWrappedLines(node.note || node.expGoal || "", 3, 16);
  const titleHeight = 18 + titleLines * 18 + 14;
  const descHeight = descLines ? 14 + descLines * 15 + 12 : 18;
  const rawRatio = Number(node.protoRatio);
  const ratio = node.proto
    ? (node.protoKind === "html" ? normalizeHtmlPrototypeRatio(rawRatio) : (Number.isFinite(rawRatio) && rawRatio > 0 ? rawRatio : 0.55))
    : null;
  const mediaHeight = node.proto ? Math.max(70, nodeMediaWidth * ratio) : 70;
  return titleHeight + mediaHeight + descHeight;
}

function layeredLayout(items, edges, gapX = 200, gapY = 70, startX = 80, startY = 80) {
  if (!items.length) return {};
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  const outAdj = {};
  const inDeg = {};
  const preds = {};
  items.forEach((item) => {
    outAdj[item.id] = [];
    inDeg[item.id] = 0;
    preds[item.id] = [];
  });
  (edges || []).forEach((edge) => {
    if (!byId[edge.from] || !byId[edge.to] || edge.from === edge.to) return;
    outAdj[edge.from].push(edge.to);
    preds[edge.to].push(edge.from);
    inDeg[edge.to] += 1;
  });

  const connected = items.filter((item) => outAdj[item.id].length || preds[item.id].length);
  const isolated = items.filter((item) => !outAdj[item.id].length && !preds[item.id].length);
  const state = {};
  const backSet = new Set();
  function dfs(id) {
    state[id] = 1;
    outAdj[id].forEach((to) => {
      if (state[to] === 1) backSet.add(`${id}>${to}`);
      else if (!state[to]) dfs(to);
    });
    state[id] = 2;
  }
  const seedRoots = connected.filter((item) => inDeg[item.id] === 0).map((item) => item.id);
  (seedRoots.length ? seedRoots : connected.map((item) => item.id)).forEach((id) => {
    if (!state[id]) dfs(id);
  });

  const forwardPreds = {};
  connected.forEach((item) => {
    forwardPreds[item.id] = [];
  });
  (edges || []).forEach((edge) => {
    if (byId[edge.from] && byId[edge.to] && edge.from !== edge.to && !backSet.has(`${edge.from}>${edge.to}`)) {
      forwardPreds[edge.to].push(edge.from);
    }
  });

  const layer = {};
  const forwardRoots = connected.filter((item) => forwardPreds[item.id].length === 0).map((item) => item.id);
  (forwardRoots.length ? forwardRoots : [connected[0]?.id]).forEach((id) => {
    if (id) layer[id] = 0;
  });
  let changed = true;
  let guard = 0;
  while (changed && guard++ < items.length + 5) {
    changed = false;
    connected.forEach((item) => {
      const known = forwardPreds[item.id].filter((id) => layer[id] !== undefined);
      if (!known.length) return;
      const want = Math.max(...known.map((id) => layer[id])) + 1;
      if (layer[item.id] === undefined || want > layer[item.id]) {
        layer[item.id] = want;
        changed = true;
      }
    });
    connected.forEach((item) => {
      if (layer[item.id] === undefined && forwardPreds[item.id].length) {
        layer[item.id] = 0;
        changed = true;
      }
    });
  }
  connected.forEach((item) => {
    if (layer[item.id] === undefined) layer[item.id] = 0;
  });

  const cols = {};
  connected.forEach((item) => {
    (cols[layer[item.id]] = cols[layer[item.id]] || []).push(item.id);
  });
  const colKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);
  const orderIndex = {};
  colKeys.forEach((layerKey) => {
    cols[layerKey].forEach((id, index) => {
      orderIndex[id] = index;
    });
  });
  for (let pass = 0; pass < 4; pass += 1) {
    colKeys.forEach((layerKey) => {
      if (layerKey === colKeys[0]) return;
      cols[layerKey].sort((a, b) => {
        const av = preds[a].length ? preds[a].reduce((sum, id) => sum + (orderIndex[id] ?? 0), 0) / preds[a].length : orderIndex[a] ?? 0;
        const bv = preds[b].length ? preds[b].reduce((sum, id) => sum + (orderIndex[id] ?? 0), 0) / preds[b].length : orderIndex[b] ?? 0;
        return av - bv;
      });
      cols[layerKey].forEach((id, index) => {
        orderIndex[id] = index;
      });
    });
  }

  const pos = {};
  const colWidths = colKeys.map((layerKey) => Math.max(...cols[layerKey].map((id) => byId[id].w)));
  let x = startX;
  colKeys.forEach((layerKey, colIndex) => {
    let y = startY;
    cols[layerKey].forEach((id) => {
      pos[id] = { x, y };
      y += byId[id].h + gapY;
    });
    x += colWidths[colIndex] + gapX;
  });
  const colHeights = colKeys.map((layerKey) => {
    const ids = cols[layerKey];
    if (!ids?.length) return 0;
    const last = ids[ids.length - 1];
    return pos[last].y + byId[last].h - startY;
  });
  const maxH = Math.max(0, ...colHeights);
  colKeys.forEach((layerKey, colIndex) => {
    const offsetY = (maxH - colHeights[colIndex]) / 2;
    cols[layerKey].forEach((id) => {
      pos[id].y += offsetY;
    });
  });

  if (isolated.length) {
    const columns = Math.max(1, Math.min(isolated.length, Math.max(colKeys.length, 4)));
    const baseY = maxH > 0 ? startY + maxH + 160 : startY;
    let rowTop = baseY;
    for (let row = 0; row * columns < isolated.length; row += 1) {
      const slice = isolated.slice(row * columns, (row + 1) * columns);
      let rowX = startX;
      slice.forEach((item) => {
        pos[item.id] = { x: rowX, y: rowTop };
        rowX += item.w + gapX;
      });
      rowTop += Math.max(...slice.map((item) => item.h)) + gapY;
    }
  }
  return pos;
}

function computeNodeLayout(nodes, edges, options = {}) {
  return layeredLayout(
    nodes.map((node) => ({ id: node.id, w: nodeWidth, h: estimateNodeHeight(node) })),
    edges,
    options.gapX ?? 200,
    options.gapY ?? 70,
    options.startX ?? 80,
    options.startY ?? 80,
  );
}

function layoutWithGroups(doc, options = {}) {
  const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
  const edges = Array.isArray(doc.edges) ? doc.edges : [];
  const nodeById = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const groups = options.preserveGroups === false
    ? []
    : (doc.groups || []).map((group) => ({ ...group, nodeIds: (group.nodeIds || []).filter((id) => nodeById[id]) })).filter((group) => group.nodeIds.length);
  if (!groups.length) return computeNodeLayout(nodes, edges, options);

  const padX = 22;
  const padTop = 40;
  const padBottom = 26;
  const grouped = new Set();
  groups.forEach((group) => group.nodeIds.forEach((id) => grouped.add(id)));

  const groupInfo = {};
  groups.forEach((group) => {
    const subNodes = group.nodeIds.map((id) => nodeById[id]).filter(Boolean);
    const subEdges = edges.filter((edge) => group.nodeIds.includes(edge.from) && group.nodeIds.includes(edge.to));
    const localPos = computeNodeLayout(subNodes, subEdges, options);
    const minX = Math.min(...subNodes.map((node) => localPos[node.id]?.x ?? node.x ?? 0));
    const minY = Math.min(...subNodes.map((node) => localPos[node.id]?.y ?? node.y ?? 0));
    const maxX = Math.max(...subNodes.map((node) => (localPos[node.id]?.x ?? node.x ?? 0) + nodeWidth));
    const maxY = Math.max(...subNodes.map((node) => (localPos[node.id]?.y ?? node.y ?? 0) + estimateNodeHeight(node)));
    const normalized = {};
    subNodes.forEach((node) => {
      normalized[node.id] = {
        x: (localPos[node.id]?.x ?? node.x ?? 0) - minX,
        y: (localPos[node.id]?.y ?? node.y ?? 0) - minY,
      };
    });
    groupInfo[group.id] = {
      normalized,
      w: (maxX - minX) + padX * 2,
      h: (maxY - minY) + padTop + padBottom,
    };
  });

  const blockByNode = (nodeId) => {
    const group = groups.find((item) => item.nodeIds.includes(nodeId));
    return group ? `g:${group.id}` : nodeId;
  };
  const items = [];
  groups.forEach((group) => items.push({ id: `g:${group.id}`, w: groupInfo[group.id].w, h: groupInfo[group.id].h }));
  nodes.forEach((node) => {
    if (!grouped.has(node.id)) items.push({ id: node.id, w: nodeWidth, h: estimateNodeHeight(node) });
  });
  const topEdges = [];
  const seen = new Set();
  edges.forEach((edge) => {
    if (!nodeById[edge.from] || !nodeById[edge.to]) return;
    const from = blockByNode(edge.from);
    const to = blockByNode(edge.to);
    if (from === to) return;
    const key = `${from}>${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    topEdges.push({ from, to });
  });

  const topPos = layeredLayout(items, topEdges, options.blockGapX ?? 240, options.blockGapY ?? 100, options.startX ?? 80, options.startY ?? 80);
  const pos = {};
  nodes.forEach((node) => {
    if (!grouped.has(node.id) && topPos[node.id]) pos[node.id] = topPos[node.id];
  });
  groups.forEach((group) => {
    const blockPos = topPos[`g:${group.id}`];
    const info = groupInfo[group.id];
    if (!blockPos || !info) return;
    group.nodeIds.forEach((id) => {
      if (!nodeById[id]) return;
      const local = info.normalized[id];
      pos[id] = { x: blockPos.x + padX + local.x, y: blockPos.y + padTop + local.y };
    });
  });
  return pos;
}

function sanitizeDocRelations(doc) {
  const nodeIds = new Set((doc.nodes || []).map((node) => node.id));
  const beforeEdges = (doc.edges || []).length;
  doc.edges = (doc.edges || []).filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to);
  let removedGroupRefs = 0;
  const beforeGroups = (doc.groups || []).length;
  doc.groups = (doc.groups || []).map((group) => {
    const nextIds = (group.nodeIds || []).filter((id) => nodeIds.has(id));
    removedGroupRefs += (group.nodeIds || []).length - nextIds.length;
    return { ...group, nodeIds: nextIds };
  }).filter((group) => group.nodeIds.length);
  doc.meta = { ...(doc.meta || {}), docOrder: normalizeDocOrder(doc.meta?.docOrder, doc.nodes || []) };
  return {
    removedEdges: beforeEdges - doc.edges.length,
    removedGroupRefs,
    removedGroups: beforeGroups - doc.groups.length,
  };
}

function arrangeDocNodes(doc, options = {}) {
  if (!Array.isArray(doc.nodes) || !doc.nodes.length) {
    return { moved: [], total: 0, cleanup: sanitizeDocRelations(doc) };
  }
  const cleanup = sanitizeDocRelations(doc);
  const target = layoutWithGroups(doc, options);
  const moved = [];
  doc.nodes = doc.nodes.map((node) => {
    const pos = target[node.id];
    if (!pos) return node;
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    if (Math.round(Number(node.x || 0)) !== x || Math.round(Number(node.y || 0)) !== y) {
      moved.push({ id: node.id, name: node.name, from: { x: node.x || 0, y: node.y || 0 }, to: { x, y } });
    }
    return { ...node, x, y };
  });
  doc.meta = {
    ...(doc.meta || {}),
    docOrder: normalizeDocOrder(doc.meta?.docOrder, doc.nodes),
  };
  return { moved, total: doc.nodes.length, cleanup };
}

function deleteNodesFromDoc(doc, ids) {
  const nodeIds = new Set(ids);
  if (!nodeIds.size) throw new Error("请提供要删除的节点 ID 或页面名。");
  const removedNodes = (doc.nodes || []).filter((node) => nodeIds.has(node.id)).map((node) => ({ id: node.id, name: node.name }));
  if (!removedNodes.length) throw new Error("没有找到可删除的节点。");
  const removedIdSet = new Set(removedNodes.map((node) => node.id));
  const beforeEdges = (doc.edges || []).length;
  doc.nodes = (doc.nodes || []).filter((node) => !removedIdSet.has(node.id));
  doc.edges = (doc.edges || []).filter((edge) => !removedIdSet.has(edge.from) && !removedIdSet.has(edge.to));
  const beforeGroups = (doc.groups || []).length;
  let removedGroupRefs = 0;
  doc.groups = (doc.groups || []).map((group) => {
    const nextIds = (group.nodeIds || []).filter((id) => !removedIdSet.has(id));
    removedGroupRefs += (group.nodeIds || []).length - nextIds.length;
    return { ...group, nodeIds: nextIds };
  }).filter((group) => group.nodeIds.length);
  doc.meta = { ...(doc.meta || {}), docOrder: normalizeDocOrder(doc.meta?.docOrder, doc.nodes) };
  const cleanup = sanitizeDocRelations(doc);
  return {
    removedNodes,
    removedEdges: beforeEdges - doc.edges.length + cleanup.removedEdges,
    removedGroupRefs: removedGroupRefs + cleanup.removedGroupRefs,
    removedGroups: beforeGroups - doc.groups.length + cleanup.removedGroups,
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
  if (next.proto && next.protoKind === "html") {
    next.protoRatio = normalizeHtmlPrototypeRatio(next.protoRatio);
  }
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
    const projects = useRemoteApi
      ? (await remoteListDesigns({ scope: "all", limit: 100, offset: 0 })).rows
      : stmt.listDesigns.all().map((row) => summarizeDesign(row));
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ projects }, null, 2) }],
    };
  },
);

server.registerResource(
  "prd_canvas_project",
  new ResourceTemplate("canvas://projects/{id}", {
    list: async () => ({
      resources: (useRemoteApi
        ? (await remoteListDesigns({ scope: "all", limit: 100, offset: 0 })).rows
        : stmt.listDesigns.all().map((row) => summarizeDesign(row))
      ).map((row) => ({
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
    const { doc } = useRemoteApi ? await remoteLoadDesign(variables.id) : loadDesign(variables.id);
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
    const users = useRemoteApi ? await remoteListUsers() : stmt.listUsers.all().map(publicUser);
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
      owner_username: z.string().optional().describe("本地模式可指定创建者账号；中心服务模式固定使用 PRD_CANVAS_MCP_OWNER_USERNAME。"),
      product: Product.optional(),
      status: Status,
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ scope, owner_username, product, status, limit, offset, response_format }) => {
    if (useRemoteApi) {
      const { total, rows } = await remoteListDesigns({ scope, owner_username, product, status, limit, offset });
      const output = {
        total,
        count: rows.length,
        offset,
        has_more: total > offset + rows.length,
        next_offset: total > offset + rows.length ? offset + rows.length : null,
        projects: rows,
      };
      return asToolResult(output, response_format, designSummaryMarkdown(rows, "设计单列表"));
    }
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
      owner_username: z.string().optional().describe("本地模式可指定归属账号；中心服务模式固定使用 PRD_CANVAS_MCP_OWNER_USERNAME，忽略此参数。"),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    const owner = useRemoteApi ? await remoteResolveOwner(input.owner_username) : resolveOwner(input.owner_username);
    const doc = blankDoc(owner, {
      title: input.title,
      product: input.product,
      background: input.background || "",
      dataGoals: input.data_goals || "",
      expGoals: input.experience_goals || "",
      analysisUrl: input.analysis_url || "",
    });
    const { row } = useRemoteApi ? await remoteCreateDesign(owner.username, doc) : createDesign(owner, doc);
    await remoteRecordActivity({
      ownerUsername: owner.username,
      designId: row.id,
      phase: "project",
      message: `已创建设计单「${row.title || input.title}」`,
      detail: { title: row.title || input.title, product: row.product || input.product },
      progress: 12,
      status: "done",
    });
    const design = outputDesignSummary(row, owner);
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
    const { row, doc } = useRemoteApi ? await remoteLoadDesign(project_id) : loadDesign(project_id);
    const design = outputDesignSummary(row);
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
    const { owner, row, doc } = useRemoteApi ? await remoteLoadDesign(input.project_id) : { owner: null, ...loadDesign(input.project_id) };
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
    const saved = useRemoteApi ? await remoteSaveDesign(row.id, doc) : saveDesign(row, doc);
    await remoteRecordActivity({
      ownerUsername: owner?.username,
      designId: row.id,
      phase: "context",
      message: "已写入需求背景、目标与关键决策",
      detail: { decisions: (input.decisions || []).length, append: input.append },
      progress: 22,
      status: "done",
    });
    const validation = validateDoc(saved.doc);
    const markdown = `# 已导入需求上下文\n\n- 设计单: ${saved.row.title}\n- 关键决策: ${(input.decisions || []).length} 条\n- 校验分数: ${validation.score}`;
    return asToolResult({ design: outputDesignSummary(saved.row), validation }, input.response_format, markdown);
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
    const { owner, row, doc } = useRemoteApi ? await remoteLoadDesign(input.project_id) : { owner: null, ...loadDesign(input.project_id) };
    const node = upsertNode(doc, input);
    const saved = useRemoteApi ? await remoteSaveDesign(row.id, doc) : saveDesign(row, doc);
    await remoteRecordActivity({
      ownerUsername: owner?.username,
      designId: row.id,
      phase: "node",
      message: `已保存页面节点「${node.name || "未命名页面"}」`,
      detail: { nodeId: node.id, hasPrototype: !!node.proto, prototypeKind: node.protoKind || "" },
      progress: 45,
      status: "done",
    });
    const markdown = `# 页面节点已保存\n\n- 页面: ${node.name}\n- 节点 ID: ${node.id}\n- 原型: ${node.proto || "未添加"}`;
    return asToolResult({ design: outputDesignSummary(saved.row), node: nodeSummary(node) }, input.response_format, markdown);
  },
);

registerTool(
  "prd_canvas_delete_page_node",
  {
    title: "Delete Page Node",
    description: [
      "删除一个或多个页面节点，并自动清理相关跳转线、业务分组引用和文档排序引用。",
      "适合模型生成后发现多余页面、重复页面、错误页面时使用。",
      "注意：这是破坏性操作，被删除节点的页面说明和原型引用会从设计单中移除；已上传资源文件本身会保留为历史资源。",
    ].join("\n"),
    inputSchema: {
      project_id: z.string().min(1),
      node_ids: z.array(z.string()).default([]).describe("要删除的节点 ID 列表。"),
      page_names: z.array(z.string()).default([]).describe("要删除的页面名称列表，会和 node_ids 合并。"),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    const { owner, row, doc } = useRemoteApi ? await remoteLoadDesign(input.project_id) : { owner: null, ...loadDesign(input.project_id) };
    const ids = new Set(input.node_ids || []);
    (input.page_names || []).forEach((name) => ids.add(resolveNode(doc, name, "删除页面").id));
    const deletion = deleteNodesFromDoc(doc, [...ids]);
    const saved = useRemoteApi ? await remoteSaveDesign(row.id, doc) : saveDesign(row, doc);
    await remoteRecordActivity({
      ownerUsername: owner?.username,
      designId: row.id,
      phase: "delete",
      message: `已删除 ${deletion.removedNodes.length} 个页面节点`,
      detail: { nodes: deletion.removedNodes.map((node) => ({ id: node.id, name: node.name })), removedEdges: deletion.removedEdges },
      progress: 62,
      status: "done",
    });
    const markdown = [
      "# 页面节点已删除",
      "",
      `- 删除节点: ${deletion.removedNodes.map((node) => `${node.name || node.id}(${node.id})`).join("、")}`,
      `- 同步删除跳转线: ${deletion.removedEdges}`,
      `- 清理分组引用: ${deletion.removedGroupRefs}`,
      `- 删除空分组: ${deletion.removedGroups}`,
    ].join("\n");
    return asToolResult({ design: outputDesignSummary(saved.row), deletion }, input.response_format, markdown);
  },
);

registerTool(
  "prd_canvas_arrange_canvas",
  {
    title: "Arrange Canvas Nodes",
    description: [
      "按页面跳转关系自动整理画布节点位置，避免生成后节点堆在一起。",
      "默认会尊重业务分组：组内节点先整理，组和未分组节点再按整体流程排布。",
      "建议在批量创建/删除页面、创建跳转线、创建分组之后调用一次；prd_canvas_generate_canvas_from_context 已经会自动调用。",
    ].join("\n"),
    inputSchema: {
      project_id: z.string().min(1),
      preserve_groups: z.boolean().default(true).describe("true=尊重业务分组进行组感知布局；false=忽略分组，只按节点和跳转线排布。"),
      start_x: z.number().default(80).describe("整理后画布起始 X 坐标。"),
      start_y: z.number().default(80).describe("整理后画布起始 Y 坐标。"),
      gap_x: z.number().min(80).max(800).default(200).describe("同一流程层之间的横向间距。"),
      gap_y: z.number().min(40).max(600).default(70).describe("同一列节点之间的纵向间距。"),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async (input) => {
    const { owner, row, doc } = useRemoteApi ? await remoteLoadDesign(input.project_id) : { owner: null, ...loadDesign(input.project_id) };
    const arrangement = arrangeDocNodes(doc, {
      preserveGroups: input.preserve_groups,
      startX: input.start_x,
      startY: input.start_y,
      gapX: input.gap_x,
      gapY: input.gap_y,
    });
    const saved = useRemoteApi ? await remoteSaveDesign(row.id, doc) : saveDesign(row, doc);
    await remoteRecordActivity({
      ownerUsername: owner?.username,
      designId: row.id,
      phase: "layout",
      message: `已自动整理画布，移动 ${arrangement.moved.length} 个节点`,
      detail: { total: arrangement.total, moved: arrangement.moved.length, preserveGroups: input.preserve_groups },
      progress: 86,
      status: "done",
    });
    const markdown = [
      "# 画布已整理",
      "",
      `- 节点总数: ${arrangement.total}`,
      `- 移动节点: ${arrangement.moved.length}`,
      `- 清理无效跳转线: ${arrangement.cleanup.removedEdges}`,
      `- 清理无效分组引用: ${arrangement.cleanup.removedGroupRefs}`,
    ].join("\n");
    return asToolResult({ design: outputDesignSummary(saved.row), arrangement }, input.response_format, markdown);
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
    const { owner, row, doc } = useRemoteApi ? await remoteLoadDesign(input.project_id) : { owner: null, ...loadDesign(input.project_id) };
    const file = useRemoteApi
      ? await remoteUploadFile({
        designId: row.id,
        kind: "prototype",
        originalName: input.file_name,
        mimeType: "text/html",
        text: input.html,
      })
      : writeManagedFile({
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
    const saved = useRemoteApi ? await remoteSaveDesign(row.id, doc) : saveDesign(row, doc);
    await remoteRecordActivity({
      ownerUsername: owner?.username,
      designId: row.id,
      phase: "prototype",
      message: `已为「${node.name || "未命名页面"}」导入 HTML 原型`,
      detail: { nodeId: node.id, fileName: input.file_name, ratio: `${input.viewport_width}:${input.viewport_height}` },
      progress: 52,
      status: "done",
    });
    const markdown = `# HTML 原型已导入\n\n- 页面: ${node.name}\n- 节点 ID: ${node.id}\n- 文件: ${file.absoluteUrl}\n- 展示比例: ${input.viewport_width}:${input.viewport_height}`;
    return asToolResult({ design: outputDesignSummary(saved.row), node: nodeSummary(node), file }, input.response_format, markdown);
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
    const { owner, row, doc } = useRemoteApi ? await remoteLoadDesign(input.project_id) : { owner: null, ...loadDesign(input.project_id) };
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
    const saved = useRemoteApi ? await remoteSaveDesign(row.id, doc) : saveDesign(row, doc);
    await remoteRecordActivity({
      ownerUsername: owner?.username,
      designId: row.id,
      phase: "edge",
      message: `已创建页面跳转：${from.name} → ${to.name}`,
      detail: { from: from.name, to: to.name, label: edge.label || "跳转" },
      progress: 66,
      status: "done",
    });
    const markdown = `# 页面跳转已保存\n\n- ${from.name} --[${edge.label}]--> ${to.name}`;
    return asToolResult({ design: outputDesignSummary(saved.row), edge }, input.response_format, markdown);
  },
);

registerTool(
  "prd_canvas_delete_transition",
  {
    title: "Delete Page Transition",
    description: "删除一条或多条页面跳转线。可按 edge_id 删除，也可按起点/终点页面匹配删除，适合修正模型生成错的跳转关系。",
    inputSchema: {
      project_id: z.string().min(1),
      edge_ids: z.array(z.string()).default([]).describe("要删除的跳转线 ID 列表。"),
      transitions: z.array(z.object({
        from: z.string().min(1).describe("起点节点 ID 或页面名。"),
        to: z.string().min(1).describe("终点节点 ID 或页面名。"),
        label: z.string().optional().describe("可选；提供后只删除同起点、同终点且 label 一致的跳转线。"),
      })).default([]),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    const { owner, row, doc } = useRemoteApi ? await remoteLoadDesign(input.project_id) : { owner: null, ...loadDesign(input.project_id) };
    const removeIds = new Set(input.edge_ids || []);
    (input.transitions || []).forEach((transition) => {
      const from = resolveNode(doc, transition.from, "跳转线起点");
      const to = resolveNode(doc, transition.to, "跳转线终点");
      (doc.edges || []).forEach((edge) => {
        if (edge.from !== from.id || edge.to !== to.id) return;
        if (transition.label !== undefined && String(edge.label || "") !== String(transition.label || "")) return;
        removeIds.add(edge.id);
      });
    });
    if (!removeIds.size) throw new Error("没有找到要删除的跳转线。");
    const removedEdges = (doc.edges || []).filter((edge) => removeIds.has(edge.id));
    if (!removedEdges.length) throw new Error("没有找到匹配的跳转线。");
    doc.edges = (doc.edges || []).filter((edge) => !removeIds.has(edge.id));
    const cleanup = sanitizeDocRelations(doc);
    const saved = useRemoteApi ? await remoteSaveDesign(row.id, doc) : saveDesign(row, doc);
    await remoteRecordActivity({
      ownerUsername: owner?.username,
      designId: row.id,
      phase: "delete",
      message: `已删除 ${removedEdges.length} 条页面跳转线`,
      detail: { edges: removedEdges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to, label: edge.label || "" })) },
      progress: 68,
      status: "done",
    });
    const markdown = [
      "# 页面跳转线已删除",
      "",
      `- 删除跳转线: ${removedEdges.length}`,
      ...removedEdges.map((edge) => `  - ${edge.from} --[${edge.label || "跳转"}]--> ${edge.to} (${edge.id})`),
    ].join("\n");
    return asToolResult({ design: outputDesignSummary(saved.row), removedEdges, cleanup }, input.response_format, markdown);
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
    const { owner, row, doc } = useRemoteApi ? await remoteLoadDesign(input.project_id) : { owner: null, ...loadDesign(input.project_id) };
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
    const saved = useRemoteApi ? await remoteSaveDesign(row.id, doc) : saveDesign(row, doc);
    await remoteRecordActivity({
      ownerUsername: owner?.username,
      designId: row.id,
      phase: "group",
      message: `已保存业务分组「${group.name}」`,
      detail: { groupId: group.id, nodeCount: group.nodeIds.length },
      progress: 74,
      status: "done",
    });
    const markdown = `# 业务分组已保存\n\n- 分组: ${group.name}\n- 页面数: ${group.nodeIds.length}`;
    return asToolResult({ design: outputDesignSummary(saved.row), group }, input.response_format, markdown);
  },
);

registerTool(
  "prd_canvas_delete_group",
  {
    title: "Delete Business Group",
    description: "删除业务分组但保留组内页面节点。适合修正模型生成错的分组或拆散不合理模块。",
    inputSchema: {
      project_id: z.string().min(1),
      group_ids: z.array(z.string()).default([]).describe("要删除的分组 ID 列表。"),
      group_names: z.array(z.string()).default([]).describe("要删除的分组名称列表。"),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    const { owner, row, doc } = useRemoteApi ? await remoteLoadDesign(input.project_id) : { owner: null, ...loadDesign(input.project_id) };
    const removeIds = new Set(input.group_ids || []);
    (input.group_names || []).forEach((name) => {
      const raw = String(name || "").trim();
      const group = (doc.groups || []).find((item) => item.name === raw)
        || (doc.groups || []).find((item) => String(item.name || "").toLowerCase().includes(raw.toLowerCase()));
      if (!group) throw new Error(`找不到业务分组「${raw}」。`);
      removeIds.add(group.id);
    });
    if (!removeIds.size) throw new Error("请提供要删除的分组 ID 或名称。");
    const removedGroups = (doc.groups || []).filter((group) => removeIds.has(group.id)).map((group) => ({ id: group.id, name: group.name, nodeCount: (group.nodeIds || []).length }));
    if (!removedGroups.length) throw new Error("没有找到匹配的业务分组。");
    doc.groups = (doc.groups || []).filter((group) => !removeIds.has(group.id));
    const cleanup = sanitizeDocRelations(doc);
    const saved = useRemoteApi ? await remoteSaveDesign(row.id, doc) : saveDesign(row, doc);
    await remoteRecordActivity({
      ownerUsername: owner?.username,
      designId: row.id,
      phase: "delete",
      message: `已删除 ${removedGroups.length} 个业务分组`,
      detail: { groups: removedGroups },
      progress: 76,
      status: "done",
    });
    const markdown = [
      "# 业务分组已删除",
      "",
      `- 删除分组: ${removedGroups.map((group) => `${group.name || group.id}(${group.nodeCount}页)`).join("、")}`,
      "- 组内页面节点已保留",
    ].join("\n");
    return asToolResult({ design: outputDesignSummary(saved.row), removedGroups, cleanup }, input.response_format, markdown);
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
      owner_username: z.string().optional().describe("本地模式可指定归属账号；中心服务模式固定使用 PRD_CANVAS_MCP_OWNER_USERNAME，忽略此参数。"),
      response_format: ResponseFormat,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async (input) => {
    const jobId = randomUUID();
    appendEvent(jobId, "start", "开始生成 Canvas 项目", { title: input.title, product: input.product });
    const owner = useRemoteApi ? await remoteResolveOwner(input.owner_username) : resolveOwner(input.owner_username);
    appendEvent(jobId, "owner", "已确定设计单创建者", { username: owner.username, displayName: owner.displayName });
    await remoteRecordActivity({
      ownerUsername: owner.username,
      phase: "start",
      message: `开始生成「${input.title}」`,
      detail: { product: input.product, pageCount: (input.pages || []).length, prototypeCount: (input.html_prototypes || []).length },
      progress: 5,
      status: "running",
    });

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
    const created = useRemoteApi ? await remoteCreateDesign(owner.username, doc) : createDesign(owner, doc);
    const saveGenerationStep = async () => {
      const savedStep = useRemoteApi ? await remoteSaveDesign(created.row.id, created.doc, owner.username) : saveDesign(created.row, created.doc);
      created.row = savedStep.row;
      created.doc = savedStep.doc;
      return savedStep;
    };
    appendEvent(jobId, "project", "已创建设计单", { id: created.row.id });
    await remoteRecordActivity({
      ownerUsername: owner.username,
      designId: created.row.id,
      phase: "project",
      message: `已创建设计单「${created.row.title || input.title}」`,
      detail: { projectId: created.row.id },
      progress: 12,
      status: "running",
    });

    const pageSpecs = normalizePageSpecs(input);
    const prototypeByName = new Map((input.html_prototypes || []).map((proto, index) => [proto.page_name || proto.name || `页面 ${index + 1}`, proto]));
    for (const [index, page] of pageSpecs.entries()) {
      const proto = prototypeByName.get(page.prototype_name) || prototypeByName.get(page.name) || (input.html_prototypes || [])[index];
      const uploaded = proto
        ? (useRemoteApi
          ? await remoteUploadFile({
            ownerUsername: owner.username,
            designId: created.row.id,
            kind: "prototype",
            originalName: proto.name || `${page.name}.html`,
            mimeType: "text/html",
            text: proto.html,
          })
          : writeManagedFile({
            ownerId: created.row.owner_id,
            designId: created.row.id,
            kind: "prototype",
            originalName: proto.name || `${page.name}.html`,
            mimeType: "text/html",
            buffer: Buffer.from(proto.html, "utf8"),
          }))
        : null;
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
      await saveGenerationStep();
      await remoteRecordActivity({
        ownerUsername: owner.username,
        designId: created.row.id,
        phase: uploaded ? "prototype" : "node",
        message: uploaded ? `已上传并填充「${node.name}」原型` : `已创建页面节点「${node.name}」`,
        detail: { nodeId: node.id, pageIndex: index + 1, totalPages: pageSpecs.length, hasPrototype: !!uploaded },
        progress: Math.min(62, 18 + Math.round(((index + 1) / Math.max(1, pageSpecs.length)) * 42)),
        status: "running",
      });
    }

    const nodesByName = new Map(created.doc.nodes.map((node) => [node.name, node]));
    if ((input.transitions || []).length) {
      for (const transition of input.transitions || []) {
        const from = created.doc.nodes.find((node) => node.id === transition.from) || nodesByName.get(transition.from);
        const to = created.doc.nodes.find((node) => node.id === transition.to) || nodesByName.get(transition.to);
        if (!from || !to || from.id === to.id) continue;
        created.doc.edges.push({ id: randomUUID().slice(0, 8), from: from.id, to: to.id, label: transition.label || "跳转" });
        appendEvent(jobId, "edge", "已创建页面跳转线", { from: from.name, to: to.name, label: transition.label || "跳转" });
        await saveGenerationStep();
        await remoteRecordActivity({
          ownerUsername: owner.username,
          designId: created.row.id,
          phase: "edge",
          message: `已创建跳转线：${from.name} → ${to.name}`,
          detail: { from: from.name, to: to.name, label: transition.label || "跳转" },
          progress: 68,
          status: "running",
        });
      }
    } else {
      for (let i = 0; i < created.doc.nodes.length - 1; i += 1) {
        created.doc.edges.push({ id: randomUUID().slice(0, 8), from: created.doc.nodes[i].id, to: created.doc.nodes[i + 1].id, label: "下一步" });
      }
      if (created.doc.edges.length) appendEvent(jobId, "edge", "已按页面顺序生成默认跳转线", { count: created.doc.edges.length });
      if (created.doc.edges.length) await saveGenerationStep();
      if (created.doc.edges.length) await remoteRecordActivity({
        ownerUsername: owner.username,
        designId: created.row.id,
        phase: "edge",
        message: `已生成 ${created.doc.edges.length} 条默认页面跳转线`,
        detail: { count: created.doc.edges.length },
        progress: 68,
        status: "running",
      });
    }

    if ((input.groups || []).length) {
      for (const [index, group] of (input.groups || []).entries()) {
        const ids = (group.pages || []).map((name) => created.doc.nodes.find((node) => node.id === name || node.name === name)?.id).filter(Boolean);
        if (!ids.length) continue;
        created.doc.groups.push({ id: randomUUID().slice(0, 8), name: group.name, nodeIds: ids, colorIdx: index % 10 });
        appendEvent(jobId, "group", "已创建业务分组", { name: group.name, count: ids.length });
        await saveGenerationStep();
      }
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
      if (created.doc.groups.length) await saveGenerationStep();
    }
    if (created.doc.groups.length) await remoteRecordActivity({
      ownerUsername: owner.username,
      designId: created.row.id,
      phase: "group",
      message: `已创建 ${created.doc.groups.length} 个业务分组`,
      detail: { groups: created.doc.groups.map((group) => ({ id: group.id, name: group.name, nodeCount: (group.nodeIds || []).length })) },
      progress: 76,
      status: "running",
    });

    const arrangement = arrangeDocNodes(created.doc, { preserveGroups: true });
    appendEvent(jobId, "layout", "已自动整理画布节点", { total: arrangement.total, moved: arrangement.moved.length });
    await saveGenerationStep();
    await remoteRecordActivity({
      ownerUsername: owner.username,
      designId: created.row.id,
      phase: "layout",
      message: `已自动整理画布，移动 ${arrangement.moved.length} 个节点`,
      detail: { total: arrangement.total, moved: arrangement.moved.length },
      progress: 86,
      status: "running",
    });

    const saved = await saveGenerationStep();
    const validation = validateDoc(saved.doc);
    const markdown = toMarkdown(saved.doc);
    const job = finishJob(jobId, "done", { projectId: saved.row.id, validation });
    await remoteRecordActivity({
      ownerUsername: owner.username,
      designId: saved.row.id,
      phase: "done",
      message: `Canvas 已生成，校验分数 ${validation.score}`,
      detail: { pageCount: saved.doc.nodes.length, edgeCount: saved.doc.edges.length, groupCount: saved.doc.groups.length, validationScore: validation.score },
      progress: 100,
      status: "done",
    });
    const design = outputDesignSummary(saved.row, owner);
    const summary = `# Canvas 已生成\n\n- 设计单: ${design.title}\n- ID: ${design.id}\n- 页面数: ${design.pageCount}\n- 跳转线: ${saved.doc.edges.length}\n- 分组: ${saved.doc.groups.length}\n- 自动整理: 已移动 ${arrangement.moved.length} 个节点\n- 校验分数: ${validation.score}\n- 打开: ${design.url}\n\n${validationMarkdown(validation)}`;
    return asToolResult({ job, design, doc: saved.doc, validation, markdown, arrangement }, input.response_format, summary);
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
    const { doc } = useRemoteApi ? await remoteLoadDesign(project_id) : loadDesign(project_id);
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
    const { owner, row, doc } = useRemoteApi ? await remoteLoadDesign(project_id) : { owner: null, ...loadDesign(project_id) };
    const markdown = toMarkdown(doc);
    let exportInfo = null;
    if (save_export) {
      if (useRemoteApi) {
        exportInfo = await remoteSaveMarkdownExport(row.id, markdown);
      } else {
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
    }
    await remoteRecordActivity({
      ownerUsername: owner?.username,
      designId: row.id,
      phase: "markdown",
      message: save_export ? "已生成并保存 PRD Markdown" : "已生成 PRD Markdown",
      detail: { saveExport: save_export, exportUrl: exportInfo?.absoluteUrl || exportInfo?.url || "" },
      progress: 96,
      status: "done",
    });
    return asToolResult({ design: outputDesignSummary(row), markdown, export: exportInfo }, response_format, markdown);
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
      owner_username: z.string().optional().describe("本地模式下没有 project_id 时用于确定文件拥有者；中心服务模式固定使用 PRD_CANVAS_MCP_OWNER_USERNAME。"),
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
    let mimeType = input.mime_type;
    if (input.data_url) {
      const parsed = dataUrlToBuffer(input.data_url);
      if (!parsed) throw new Error("data_url 格式不正确。");
      mimeType = input.mime_type || parsed.mimeType;
    } else if (typeof input.text !== "string") {
      throw new Error("请提供 text 或 data_url。");
    }
    let file;
    if (useRemoteApi) {
      if (input.project_id) await remoteLoadDesign(input.project_id, input.owner_username);
      file = await remoteUploadFile({
        ownerUsername: input.owner_username,
        designId: input.project_id || null,
        kind: input.kind,
        originalName: input.name,
        mimeType,
        text: input.text,
        dataUrl: input.data_url,
      });
    } else {
      let ownerId;
      if (input.project_id) {
        const { row } = loadDesign(input.project_id);
        ownerId = row.owner_id;
      } else {
        ownerId = resolveOwner(input.owner_username).id;
      }
      let buffer;
      if (input.data_url) {
        const parsed = dataUrlToBuffer(input.data_url);
        if (!parsed) throw new Error("data_url 格式不正确。");
        buffer = parsed.buffer;
      } else {
        buffer = Buffer.from(input.text, "utf8");
      }
      file = writeManagedFile({
        ownerId,
        designId: input.project_id || null,
        kind: input.kind,
        originalName: input.name,
        mimeType,
        buffer,
      });
    }
    await remoteRecordActivity({
      ownerUsername: input.owner_username,
      designId: input.project_id || "",
      phase: "asset",
      message: `已上传资源「${file.originalName || input.name}」`,
      detail: { kind: input.kind, mimeType, size: file.size || 0 },
      progress: 35,
      status: "done",
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
          "如果后续手动新增/删除节点、修改跳转线或分组，请调用 prd_canvas_arrange_canvas 整理画布，避免节点堆叠。",
          "生成后调用 prd_canvas_validate_project 检查缺失项，再调用 prd_canvas_generate_markdown 生成面向 vibe coding 的 PRD Markdown。",
        ].join("\n"),
      },
    }],
  }),
);

async function main() {
  if (!useRemoteApi && !existsSync(dbPath)) {
    console.error(`Canvas PRD MCP: database will be created at ${dbPath}`);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Canvas PRD MCP server running via stdio`);
  if (useRemoteApi) {
    console.error(`Mode: central API`);
    console.error(`Base URL: ${baseUrl}`);
    console.error(`Owner username: ${process.env.PRD_CANVAS_MCP_OWNER_USERNAME || "(not set)"}`);
  } else {
    console.error(`Mode: local SQLite`);
    console.error(`DB: ${dbPath}`);
    console.error(`Storage: ${storageRoot}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
