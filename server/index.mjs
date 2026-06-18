import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createServer as createViteServer } from "vite";
import { ZipFile } from "yazl";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 5180);
const dbPath = resolve(rootDir, process.env.DATABASE_PATH || "data/prd-canvas.sqlite");
const storageRoot = resolve(process.env.STORAGE_ROOT || "/Volumes/ENERJOY-PUBLIC-DES/prd-canvas-storage");
const cookieName = "prd_canvas_session";
const sessionDays = 30;

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

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anchor_type TEXT NOT NULL,
    anchor_json TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const statements = {
  userByUsername: db.prepare("SELECT * FROM users WHERE lower(username) = lower(?)"),
  userById: db.prepare("SELECT id, username, display_name, created_at FROM users WHERE id = ?"),
  insertUser: db.prepare("INSERT INTO users (id, username, display_name, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)"),
  insertSession: db.prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"),
  sessionUser: db.prepare(`
    SELECT users.id, users.username, users.display_name, users.created_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > ?
  `),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
	  listDesigns: db.prepare(`
	    SELECT designs.id, designs.title, designs.product, designs.status, designs.owner_id, designs.data_json, designs.created_at,
	           designs.updated_at, designs.submitted_at, users.display_name AS owner_name
	    FROM designs
    JOIN users ON users.id = designs.owner_id
    ORDER BY datetime(designs.updated_at) DESC
  `),
  getDesign: db.prepare(`
    SELECT designs.*, users.display_name AS owner_name
    FROM designs
    JOIN users ON users.id = designs.owner_id
    WHERE designs.id = ?
  `),
  insertDesign: db.prepare("INSERT INTO designs (id, title, product, status, owner_id, data_json, created_at, updated_at, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"),
  updateDesign: db.prepare("UPDATE designs SET title = ?, product = ?, status = ?, data_json = ?, updated_at = ?, submitted_at = ? WHERE id = ?"),
  deleteDesign: db.prepare("DELETE FROM designs WHERE id = ?"),
  insertFile: db.prepare("INSERT INTO files (id, design_id, owner_id, kind, original_name, mime_type, relative_path, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"),
  deleteFilesForDesign: db.prepare("DELETE FROM files WHERE design_id = ?"),
  getFile: db.prepare("SELECT * FROM files WHERE id = ?"),
  listComments: db.prepare(`
    SELECT comments.*, users.display_name AS author_name
    FROM comments
    JOIN users ON users.id = comments.author_id
    WHERE comments.design_id = ?
    ORDER BY datetime(comments.created_at) ASC
  `),
  insertComment: db.prepare("INSERT INTO comments (id, design_id, author_id, anchor_type, anchor_json, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  deleteCommentsForDesign: db.prepare("DELETE FROM comments WHERE design_id = ?"),
};

function nowISO() {
  return new Date().toISOString();
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(hashPassword(password, salt).hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return Object.fromEntries(raw.split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return null;
    return [decodeURIComponent(part.slice(0, index).trim()), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

function setSessionCookie(res, token, expiresAt) {
  res.setHeader("Set-Cookie", `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function safeError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readJson(req, limitBytes = 80 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      const error = new Error("payload_too_large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function publicUser(row) {
  return row ? {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
  } : null;
}

function getCurrentUser(req) {
  const token = parseCookies(req)[cookieName];
  if (!token) return null;
  return publicUser(statements.sessionUser.get(token, nowISO()));
}

function requireUser(req, res) {
  const user = getCurrentUser(req);
  if (!user) safeError(res, 401, "请先登录");
  return user;
}

function createSession(res, userId) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000).toISOString();
  statements.insertSession.run(token, userId, expires, nowISO());
  setSessionCookie(res, token, expires);
}

function normalizeStatus(doc) {
  const meta = doc?.meta || {};
  return meta.requirementStatus === "done" && meta.submittedAt ? "done" : "writing";
}

function parseStoredDoc(dataJson) {
  let parsed = {};
  try { parsed = JSON.parse(dataJson || "{}"); } catch {}
  return unwrapStoredDoc(parsed);
}

function unwrapStoredDoc(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  if (Array.isArray(value.nodes) || value.schema || value.meta) return value;
  if (value.doc && typeof value.doc === "object") return unwrapStoredDoc(value.doc);
  if (value.data && typeof value.data === "object") return unwrapStoredDoc(value.data);
  return value;
}

function designPageCount(doc) {
  const candidates = [
    doc?.nodes,
    doc?.pages,
    doc?.canvas?.nodes,
    doc?.project?.nodes,
    doc?.data?.nodes,
  ];
  const pages = candidates.find((items) => Array.isArray(items));
  return pages ? pages.length : 0;
}

function htmlToPlainText(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (!/[<&]/.test(raw)) return raw;
  return raw
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(div|p|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function buildDesignSearchText(row, doc) {
  const chunks = [
    row.title,
    row.product,
    row.status === "done" && row.submitted_at ? "已完成" : "编写中",
    row.owner_name,
    doc?.meta?.name,
    doc?.meta?.product,
    doc?.meta?.background,
    doc?.meta?.dataGoals,
    doc?.meta?.expGoals,
    doc?.meta?.analysisUrl,
    ...(Array.isArray(doc?.groups) ? doc.groups.map((g) => g?.name) : []),
  ];
  const nodes = Array.isArray(doc?.nodes) ? doc.nodes : [];
  nodes.forEach((node) => {
    chunks.push(node?.name, node?.note, node?.expGoal, node?.protoName);
    if (node?.docTableBaseCells && typeof node.docTableBaseCells === "object") {
      chunks.push(...Object.values(node.docTableBaseCells).flat());
    }
    if (Array.isArray(node?.docTableRows)) {
      node.docTableRows.forEach((rowItem) => chunks.push(rowItem?.label, ...(Array.isArray(rowItem?.cells) ? rowItem.cells : [])));
    }
    if (Array.isArray(node?.competitors)) {
      node.competitors.forEach((item) => chunks.push(item?.caption));
    }
  });
  const nodeById = Object.fromEntries(nodes.map((node) => [node?.id, node]).filter(([id]) => id));
  if (Array.isArray(doc?.edges)) {
    doc.edges.forEach((edge) => {
      chunks.push(edge?.label, nodeById[edge?.from]?.name, nodeById[edge?.to]?.name);
    });
  }
  try {
    const comments = statements.listComments.all(row.id);
    comments.forEach((comment) => {
      chunks.push(comment?.content);
      try {
        const anchor = JSON.parse(comment?.anchor_json || "{}");
        chunks.push(anchor?.label, anchor?.quote);
      } catch {}
    });
  } catch {}
  return chunks.map(htmlToPlainText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 24000);
}

function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

function sanitizeCommentAnchor(anchor) {
  const raw = anchor && typeof anchor === "object" ? anchor : {};
  const type = raw.type === "prototype" ? "prototype" : "text";
  return {
    type,
    nodeId: String(raw.nodeId || "").slice(0, 120),
    sectionId: String(raw.sectionId || "").slice(0, 160),
    xPct: clampPct(raw.xPct),
    yPct: clampPct(raw.yPct),
    quote: String(raw.quote || "").trim().slice(0, 240),
    label: String(raw.label || "").trim().slice(0, 160),
    assetSrc: String(raw.assetSrc || "").slice(0, 1024),
  };
}

function summarizeComment(row) {
  let anchor = {};
  try { anchor = JSON.parse(row.anchor_json || "{}"); } catch {}
  return {
    id: row.id,
    designId: row.design_id,
    authorId: row.author_id,
    authorName: row.author_name || "同事",
    anchor: sanitizeCommentAnchor(anchor),
    content: row.content,
    createdAt: row.created_at,
  };
}

function summarizeDesign(row, user) {
  const doc = parseStoredDoc(row.data_json);
  const updated = row.updated_at || row.created_at;
  return {
    id: row.id,
    title: row.title || doc?.meta?.name || "未命名设计单",
    product: row.product || doc?.meta?.product || "ShutEye",
    status: row.status === "done" && row.submitted_at ? "done" : "writing",
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    createdAt: row.created_at,
    updatedAt: updated,
    submittedAt: row.submitted_at || "",
    pageCount: designPageCount(doc),
    searchText: buildDesignSearchText(row, doc),
    canEdit: !!user && row.owner_id === user.id,
  };
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
  };
  return map[mimeType] || "";
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const mimeType = match[1] || "application/octet-stream";
  const payload = match[3] || "";
  const buffer = match[2] ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  return { buffer, mimeType };
}

function contentTypeForPath(path, fallback = "application/octet-stream") {
  const ext = extname(path).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
  };
  return map[ext] || fallback;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function exportSlug(value, fallback = "item") {
  const raw = htmlToPlainText(value || "").toLowerCase();
  const ascii = raw
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const id = ascii || fallback;
  return id.replace(/-{2,}/g, "-") || fallback;
}

function escapeMarkdownCell(value) {
  return htmlToPlainText(value || "未填写").replace(/\|/g, "\\|").replace(/\n+/g, " / ").trim() || "未填写";
}

function exportMdValue(value, fallback = "未填写") {
  const text = exportHtmlToMarkdown(value).trim();
  return text || fallback;
}

function exportHtmlToMarkdown(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (!/[<&]/.test(raw)) return raw.replace(/\n{3,}/g, "\n\n").trim();
  const text = raw
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs, label) => {
      const href = (attrs.match(/\bhref=(["'])(.*?)\1/i) || attrs.match(/\bhref=([^\s>]+)/i) || [])[2] || (attrs.match(/\bhref=([^\s>]+)/i) || [])[1] || "";
      const body = htmlToPlainText(label) || href;
      return href ? `[${body}](${href})` : body;
    })
    .replace(/<img\b([^>]*)>/gi, (_, attrs) => {
      const alt = (attrs.match(/\balt=(["'])(.*?)\1/i) || [])[2] || "";
      return alt ? `[图片: ${alt}]` : "[图片]";
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
    .replace(/&quot;/g, '"');
  return text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

function extractImageSourcesFromHtml(value) {
  const raw = String(value || "");
  if (!raw || !/<img\b/i.test(raw)) return [];
  const sources = [];
  raw.replace(/<img\b([^>]*)>/gi, (_, attrs) => {
    const src = (attrs.match(/\bsrc=(["'])(.*?)\1/i) || attrs.match(/\bsrc=([^\s>]+)/i) || [])[2] || (attrs.match(/\bsrc=([^\s>]+)/i) || [])[1] || "";
    const alt = (attrs.match(/\balt=(["'])(.*?)\1/i) || [])[2] || "";
    if (src) sources.push({ src, alt });
    return "";
  });
  return sources;
}

function fileIdFromAssetSrc(src) {
  const raw = String(src || "");
  const match = raw.match(/\/api\/files\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function bufferFromAssetSrc(src) {
  const raw = String(src || "");
  if (!raw) return null;
  if (/^data:/i.test(raw)) {
    const parsed = dataUrlToBuffer(raw);
    return parsed ? { ...parsed, originalName: "", sourceType: "data-url" } : null;
  }
  const fileId = fileIdFromAssetSrc(raw);
  if (fileId) {
    const file = statements.getFile.get(fileId);
    if (!file) return null;
    const abs = safeStoragePath(file.relative_path);
    if (!abs || !existsSync(abs)) return null;
    return {
      buffer: readFileSync(abs),
      mimeType: file.mime_type || contentTypeForPath(abs),
      originalName: file.original_name || fileId,
      sourceType: "uploaded-file",
      fileId,
    };
  }
  return null;
}

function uniqueExportPath(path, used) {
  const clean = String(path || "asset").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!used.has(clean)) {
    used.add(clean);
    return clean;
  }
  const dot = clean.lastIndexOf(".");
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";
  let index = 2;
  while (used.has(`${base}-${index}${ext}`)) index += 1;
  const next = `${base}-${index}${ext}`;
  used.add(next);
  return next;
}

function buildExportPackage(row, doc, user) {
  const now = nowISO();
  const nodes = Array.isArray(doc?.nodes) ? doc.nodes : [];
  const edges = Array.isArray(doc?.edges) ? doc.edges : [];
  const groups = Array.isArray(doc?.groups) ? doc.groups : [];
  const nodeById = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const title = row?.title || doc?.meta?.name || "未命名设计单";
  const product = row?.product || doc?.meta?.product || "ShutEye";
  const status = normalizeStatus(doc);
  const rootSlug = exportSlug(title, "prd-canvas-export");
  const usedPaths = new Set();
  const files = [];
  const warnings = [];
  const assetRefs = [];
  const assetBySrc = new Map();

  const addFile = (path, content, type = "document", mimeType = contentTypeForPath(path)) => {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ""), "utf8");
    const finalPath = uniqueExportPath(path, usedPaths);
    files.push({ path: finalPath, buffer, type, mimeType, sha256: sha256(buffer), size: buffer.length });
    return finalPath;
  };

  const addAsset = ({ src, desiredPath, role, label, fallbackMime = "application/octet-stream" }) => {
    const raw = String(src || "");
    if (!raw) return null;
    if (assetBySrc.has(raw)) return assetBySrc.get(raw);
    const resolved = bufferFromAssetSrc(raw);
    if (!resolved) {
      const external = {
        source: raw,
        path: "",
        role,
        label,
        status: "external",
        mimeType: "",
        size: 0,
      };
      assetRefs.push(external);
      assetBySrc.set(raw, external);
      warnings.push(`资源未打包，仅保留外部引用：${label || raw.slice(0, 80)}`);
      return external;
    }
    const mimeType = resolved.mimeType || fallbackMime;
    const ext = extensionFromMime(mimeType, resolved.originalName || desiredPath) || ".bin";
    const pathWithExt = extname(desiredPath || "") ? desiredPath : `${desiredPath || "assets/file"}${ext}`;
    const finalPath = addFile(pathWithExt, resolved.buffer, "asset", mimeType);
    const ref = {
      source: raw,
      path: finalPath,
      role,
      label,
      status: "packaged",
      mimeType,
      size: resolved.buffer.length,
      sha256: sha256(resolved.buffer),
      originalName: resolved.originalName || "",
    };
    assetRefs.push(ref);
    assetBySrc.set(raw, ref);
    return ref;
  };

  nodes.forEach((node, index) => {
    const slug = exportSlug(node?.name, `page-${index + 1}`);
    if (node?.proto) {
      const isHtml = node.protoKind === "html" || /^data:text\/html/i.test(String(node.proto));
      addAsset({
        src: node.proto,
        desiredPath: isHtml ? `assets/prototypes/${slug}.html` : `assets/images/prototypes/${slug}`,
        role: isHtml ? "html-prototype" : "image-prototype",
        label: `${node.name || `页面 ${index + 1}`}原型`,
        fallbackMime: isHtml ? "text/html" : "image/png",
      });
    }
    (node?.competitors || []).forEach((item, compIndex) => {
      if (!item?.img) return;
      addAsset({
        src: item.img,
        desiredPath: `assets/images/references/${slug}-reference-${compIndex + 1}`,
        role: "competitor-reference",
        label: item.caption || `${node.name || `页面 ${index + 1}`}竞品参考 ${compIndex + 1}`,
        fallbackMime: "image/png",
      });
    });
    const richFields = [
      { value: node?.note, label: `${node?.name || `页面 ${index + 1}`} 页面说明` },
      { value: node?.expGoal, label: `${node?.name || `页面 ${index + 1}`} 体验目标` },
      ...Object.values(node?.docTableBaseCells || {}).flat().map((value, i) => ({ value, label: `${node?.name || `页面 ${index + 1}`} 表格基础图片 ${i + 1}` })),
      ...(node?.docTableRows || []).flatMap((rowItem, rowIndex) => (rowItem?.cells || []).map((value, cellIndex) => ({ value, label: `${node?.name || `页面 ${index + 1}`} 自定义表格 ${rowIndex + 1}-${cellIndex + 1}` }))),
    ];
    richFields.forEach((field, fieldIndex) => {
      extractImageSourcesFromHtml(field.value).forEach((img, imageIndex) => {
        addAsset({
          src: img.src,
          desiredPath: `assets/images/doc/${slug}-doc-${fieldIndex + 1}-${imageIndex + 1}`,
          role: "document-image",
          label: img.alt || field.label,
          fallbackMime: "image/png",
        });
      });
    });
  });
  [
    { value: doc?.meta?.background, label: "需求背景" },
    { value: doc?.meta?.dataGoals, label: "数据目标" },
    { value: doc?.meta?.expGoals, label: "体验目标" },
  ].forEach((field, fieldIndex) => {
    extractImageSourcesFromHtml(field.value).forEach((img, imageIndex) => {
      addAsset({
        src: img.src,
        desiredPath: `assets/images/doc/project-${fieldIndex + 1}-${imageIndex + 1}`,
        role: "document-image",
        label: img.alt || field.label,
        fallbackMime: "image/png",
      });
    });
  });

  const assetPathFor = (src) => assetBySrc.get(String(src || ""))?.path || "";
  const pageSlug = (node, index = 0) => exportSlug(node?.name, `page-${index + 1}`);
  const pageOkfPath = (node, index = 0) => `okf/pages/${pageSlug(node, index)}.md`;
  const pageMarkdownLink = (node, index = 0) => `[${node?.name || `页面 ${index + 1}`}](${pageOkfPath(node, index).replace(/^okf\//, "./")})`;

  const requirements = [];
  requirements.push(`# ${title}`);
  requirements.push("");
  requirements.push(`创建人：${doc?.meta?.createdBy || row?.owner_name || "未填写"}`);
  requirements.push(`创建时间：${doc?.meta?.createdAt || row?.created_at || "未填写"}`);
  requirements.push(`最近修改：${doc?.meta?.updatedAt || row?.updated_at || "未填写"}`);
  requirements.push(`所属产品：${product}`);
  requirements.push(`设计单状态：${status === "done" ? "已完成" : "编写中"}`);
  requirements.push(`页面数量：${nodes.length}`);
  requirements.push("");
  requirements.push("## 一、需求背景");
  requirements.push("");
  requirements.push(exportMdValue(doc?.meta?.background));
  requirements.push("");
  requirements.push("## 二、目标");
  requirements.push("");
  requirements.push("### 数据目标");
  requirements.push("");
  requirements.push(exportMdValue(doc?.meta?.dataGoals));
  requirements.push("");
  requirements.push("### 体验目标");
  requirements.push("");
  requirements.push(exportMdValue(doc?.meta?.expGoals));
  requirements.push("");
  requirements.push("## 三、总流程");
  requirements.push("");
  if (edges.length) {
    edges.forEach((edge) => {
      const from = nodeById[edge.from];
      const to = nodeById[edge.to];
      requirements.push(`- ${from?.name || "未知页面"} → ${to?.name || "未知页面"}：${exportMdValue(edge.label, "未命名操作")}`);
    });
  } else {
    requirements.push("未填写");
  }
  requirements.push("");
  requirements.push("## 四、页面明细");
  requirements.push("");
  if (!nodes.length) {
    requirements.push("未填写");
  }
  nodes.forEach((node, index) => {
    const protoPath = assetPathFor(node.proto);
    const baseCells = node.docTableBaseCells && typeof node.docTableBaseCells === "object" ? node.docTableBaseCells : {};
    const customRows = Array.isArray(node.docTableRows) ? node.docTableRows : [];
    const outgoing = edges.filter((edge) => edge.from === node.id);
    requirements.push(`### ${index + 1}. ${node.name || "未命名页面"}`);
    requirements.push("");
    requirements.push(`节点 ID：\`${node.id}\``);
    requirements.push(`原型文件：${protoPath ? `\`${protoPath}\`` : "未添加"}`);
    requirements.push("");
    requirements.push("#### 页面说明");
    requirements.push("");
    requirements.push(exportMdValue(node.note));
    (baseCells.note || []).forEach((cell, cellIndex) => {
      requirements.push("");
      requirements.push(`补充说明 ${cellIndex + 1}：${exportMdValue(cell)}`);
    });
    requirements.push("");
    requirements.push("#### 体验目标");
    requirements.push("");
    requirements.push(exportMdValue(node.expGoal));
    (baseCells.expGoal || []).forEach((cell, cellIndex) => {
      requirements.push("");
      requirements.push(`补充目标 ${cellIndex + 1}：${exportMdValue(cell)}`);
    });
    if (customRows.length) {
      requirements.push("");
      requirements.push("#### 补充记录");
      requirements.push("");
      customRows.forEach((rowItem) => {
        requirements.push(`- ${exportMdValue(rowItem.label, "自定义项")}`);
        (rowItem.cells || []).forEach((cell, cellIndex) => {
          requirements.push(`  - 内容 ${cellIndex + 1}：${exportMdValue(cell)}`);
        });
      });
    }
    requirements.push("");
    requirements.push("#### 页面跳转");
    requirements.push("");
    if (outgoing.length) {
      requirements.push("| 触发方式 | 跳转目标 |");
      requirements.push("|---|---|");
      outgoing.forEach((edge) => {
        const target = nodeById[edge.to];
        requirements.push(`| ${escapeMarkdownCell(edge.label || "未命名操作")} | ${escapeMarkdownCell(target?.name || "未知页面")} |`);
      });
    } else {
      requirements.push("未填写");
    }
    if (node.competitors?.length) {
      requirements.push("");
      requirements.push("#### 竞品参考");
      requirements.push("");
      node.competitors.forEach((item, refIndex) => {
        const path = assetPathFor(item.img);
        requirements.push(`- 参考 ${refIndex + 1}：${exportMdValue(item.caption)}${path ? `（${path}）` : ""}`);
      });
    }
    requirements.push("");
  });

  const readme = `# ${title} 导出包

这是 PRD Canvas 稳定机器导出的需求资源包。

推荐阅读顺序：

1. \`requirements.md\`
2. \`okf/index.md\`
3. \`assets/prototypes/\` 和 \`assets/images/\`
4. \`canvas.json\`

如需重新导入 Canvas，请使用 \`canvas.json\`。评论内容不包含在本导出包内。
`;

  const okfIndex = `---
type: Product Requirement Export
title: ${title}
product: ${product}
timestamp: ${now}
---

# ${title}

- 项目概览：[project.md](./project.md)
- 页面明细：${nodes.length ? nodes.map((node, index) => pageMarkdownLink(node, index)).join("、") : "未填写"}
- 总流程：[flows/main_flow.md](./flows/main_flow.md)
- 业务分组：${groups.length ? groups.map((group, index) => `[${group.name || `分组 ${index + 1}`}](./groups/${exportSlug(group.name, `group-${index + 1}`)}.md)`).join("、") : "未填写"}
- 竞品参考：[references/competitor_refs.md](./references/competitor_refs.md)
`;

  const projectMd = `---
type: Product Requirement Project
title: ${title}
product: ${product}
status: ${status}
timestamp: ${now}
---

# ${title}

## 需求背景

${exportMdValue(doc?.meta?.background)}

## 数据目标

${exportMdValue(doc?.meta?.dataGoals)}

## 体验目标

${exportMdValue(doc?.meta?.expGoals)}
`;

  const flowMd = [
    "---",
    "type: Product Requirement Flow",
    `title: ${title} 总流程`,
    `product: ${product}`,
    `timestamp: ${now}`,
    "---",
    "",
    `# ${title} 总流程`,
    "",
    edges.length ? "| 起点 | 触发方式 | 终点 |\n|---|---|---|" : "未填写",
    ...edges.map((edge) => {
      const from = nodeById[edge.from];
      const to = nodeById[edge.to];
      const fromIndex = Math.max(0, nodes.findIndex((node) => node.id === edge.from));
      const toIndex = Math.max(0, nodes.findIndex((node) => node.id === edge.to));
      return `| ${from ? pageMarkdownLink(from, fromIndex) : "未知页面"} | ${escapeMarkdownCell(edge.label || "未命名操作")} | ${to ? pageMarkdownLink(to, toIndex) : "未知页面"} |`;
    }),
  ].join("\n");

  const competitorMd = [
    "---",
    "type: Product Requirement References",
    `title: ${title} 竞品参考`,
    `product: ${product}`,
    `timestamp: ${now}`,
    "---",
    "",
    "# 竞品参考",
    "",
  ];
  let hasCompetitor = false;
  nodes.forEach((node, nodeIndex) => {
    (node.competitors || []).forEach((item, refIndex) => {
      hasCompetitor = true;
      competitorMd.push(`## ${node.name || `页面 ${nodeIndex + 1}`} · 参考 ${refIndex + 1}`);
      competitorMd.push("");
      competitorMd.push(exportMdValue(item.caption));
      const path = assetPathFor(item.img);
      if (path) competitorMd.push(`\n资源：../../${path}`);
      competitorMd.push("");
    });
  });
  if (!hasCompetitor) competitorMd.push("未填写");

  addFile("README.md", readme);
  addFile("requirements.md", requirements.join("\n").replace(/\n{3,}/g, "\n\n"));
  addFile("canvas.json", JSON.stringify(doc || {}, null, 2), "source", "application/json; charset=utf-8");
  addFile("okf/index.md", okfIndex);
  addFile("okf/project.md", projectMd);
  addFile("okf/flows/main_flow.md", flowMd);
  addFile("okf/references/competitor_refs.md", competitorMd.join("\n"));
  addFile("assets/thumbnails/README.md", "# thumbnails\n\n缩略图目录保留给后续版本生成，不影响当前资源包使用。\n");

  nodes.forEach((node, index) => {
    const outgoing = edges.filter((edge) => edge.from === node.id);
    const protoPath = assetPathFor(node.proto);
    const pageMd = `---
type: Product Requirement Page
id: ${node.id}
title: ${node.name || "未命名页面"}
product: ${product}
prototype: ${protoPath ? `../../${protoPath}` : ""}
tags: [page, prototype]
---

# ${node.name || "未命名页面"}

## 页面说明

${exportMdValue(node.note)}

## 体验目标

${exportMdValue(node.expGoal)}

## 页面跳转

${outgoing.length ? outgoing.map((edge) => {
  const target = nodeById[edge.to];
  const targetIndex = Math.max(0, nodes.findIndex((item) => item.id === edge.to));
  return `- ${exportMdValue(edge.label, "未命名操作")} → ${target ? `[${target.name || "未命名页面"}](./${pageSlug(target, targetIndex)}.md)` : "未知页面"}`;
}).join("\n") : "未填写"}
`;
    addFile(pageOkfPath(node, index), pageMd);
  });

  groups.forEach((group, index) => {
    const groupNodes = (group.nodeIds || []).map((id) => nodeById[id]).filter(Boolean);
    const body = `---
type: Product Requirement Group
id: ${group.id || `group-${index + 1}`}
title: ${group.name || `分组 ${index + 1}`}
product: ${product}
timestamp: ${now}
---

# ${group.name || `分组 ${index + 1}`}

${groupNodes.length ? groupNodes.map((node) => {
  const nodeIndex = Math.max(0, nodes.findIndex((item) => item.id === node.id));
  return `- ${pageMarkdownLink(node, nodeIndex)}`;
}).join("\n") : "未填写"}
`;
    addFile(`okf/groups/${exportSlug(group.name, `group-${index + 1}`)}.md`, body);
  });

  const manifest = {
    schema: "prd-canvas-export/1.0",
    exportId: `exp_${randomUUID()}`,
    projectId: row?.id || "",
    title,
    product,
    status,
    exportedAt: now,
    exportedBy: {
      id: user?.id || "",
      name: user?.displayName || "",
    },
    createdBy: {
      id: doc?.meta?.ownerId || row?.owner_id || "",
      name: doc?.meta?.createdBy || row?.owner_name || "",
    },
    createdAt: doc?.meta?.createdAt || row?.created_at || "",
    updatedAt: doc?.meta?.updatedAt || row?.updated_at || "",
    pageCount: nodes.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    assetCount: assetRefs.filter((asset) => asset.status === "packaged").length,
    assets: assetRefs,
    files: files.map((file) => ({
      path: file.path,
      type: file.type,
      mimeType: file.mimeType,
      size: file.size,
      sha256: file.sha256,
    })),
  };
  addFile("manifest.json", JSON.stringify(manifest, null, 2), "manifest", "application/json; charset=utf-8");
  addFile("export-log.json", JSON.stringify({
    exportedAt: now,
    generator: "prd-canvas-exporter/1.0",
    warnings,
    assetCount: manifest.assetCount,
    missingAssetCount: assetRefs.filter((asset) => asset.status !== "packaged").length,
  }, null, 2), "log", "application/json; charset=utf-8");

  return {
    title,
    zipName: `${rootSlug}-export.zip`,
    files,
  };
}

function sendZip(res, packageData) {
  const zip = new ZipFile();
  packageData.files.forEach((file) => {
    zip.addBuffer(file.buffer, file.path, {
      mtime: new Date(),
      mode: 0o100644,
    });
  });
  zip.end();
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(packageData.zipName)}"`,
  });
  zip.outputStream.pipe(res);
}

function safeStoragePath(relativePath) {
  const normalized = normalize(relativePath || "").replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = resolve(storageRoot, normalized);
  if (!abs.startsWith(storageRoot)) return null;
  return abs;
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  try {
    if (req.method === "POST" && path === "/api/auth/register") {
      const body = await readJson(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const displayName = String(body.displayName || username).trim();
      if (!/^[\w.@\-\u4e00-\u9fa5]{2,40}$/u.test(username)) return safeError(res, 400, "账号需要 2-40 个字符");
      if (password.length < 6) return safeError(res, 400, "密码至少 6 位");
      if (statements.userByUsername.get(username)) return safeError(res, 409, "账号已存在");
      const id = randomUUID();
      const now = nowISO();
      const { hash, salt } = hashPassword(password);
      statements.insertUser.run(id, username, displayName || username, hash, salt, now);
      createSession(res, id);
      return sendJson(res, 201, { user: publicUser(statements.userById.get(id)) });
    }

    if (req.method === "POST" && path === "/api/auth/login") {
      const body = await readJson(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const row = statements.userByUsername.get(username);
      if (!row || !verifyPassword(password, row.salt, row.password_hash)) return safeError(res, 401, "账号或密码不正确");
      createSession(res, row.id);
      return sendJson(res, 200, { user: publicUser(row) });
    }

    if (req.method === "POST" && path === "/api/auth/logout") {
      const token = parseCookies(req)[cookieName];
      if (token) statements.deleteSession.run(token);
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && path === "/api/me") {
      return sendJson(res, 200, { user: getCurrentUser(req) });
    }

    if (req.method === "GET" && path === "/api/designs") {
      const user = requireUser(req, res);
      if (!user) return;
      const scope = url.searchParams.get("scope") || "mine";
      const rows = statements.listDesigns.all();
      const filtered = scope === "mine" ? rows.filter((row) => row.owner_id === user.id) : rows;
      return sendJson(res, 200, { designs: filtered.map((row) => summarizeDesign(row, user)) });
    }

    if (req.method === "POST" && path === "/api/designs") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readJson(req);
      const id = body.id || randomUUID();
      const now = nowISO();
      const doc = body.doc && typeof body.doc === "object" ? body.doc : {};
      doc.meta = {
        ...(doc.meta || {}),
        createdAt: (doc.meta || {}).createdAt || now,
        createdBy: user.displayName,
        ownerId: user.id,
        updatedAt: now,
      };
      const title = String(doc.meta.name || body.title || "未命名设计单").trim() || "未命名设计单";
      const product = String(doc.meta.product || body.product || "ShutEye").trim() || "ShutEye";
      const status = normalizeStatus(doc);
      statements.insertDesign.run(id, title, product, status, user.id, JSON.stringify(doc), doc.meta.createdAt, now, doc.meta.submittedAt || null);
      return sendJson(res, 201, { design: summarizeDesign({ id, title, product, status, owner_id: user.id, owner_name: user.displayName, created_at: doc.meta.createdAt, updated_at: now, submitted_at: doc.meta.submittedAt || "", data_json: JSON.stringify(doc) }, user), doc });
    }

    const designMatch = path.match(/^\/api\/designs\/([^/]+)$/);
    if (designMatch && req.method === "GET") {
      const user = requireUser(req, res);
      if (!user) return;
      const row = statements.getDesign.get(designMatch[1]);
      if (!row) return safeError(res, 404, "设计单不存在");
      return sendJson(res, 200, {
        design: summarizeDesign(row, user),
        doc: parseStoredDoc(row.data_json),
      });
    }

    if (designMatch && req.method === "PUT") {
      const user = requireUser(req, res);
      if (!user) return;
      const row = statements.getDesign.get(designMatch[1]);
      if (!row) return safeError(res, 404, "设计单不存在");
      if (row.owner_id !== user.id) return safeError(res, 403, "只有创建者可以编辑这个设计单");
      const body = await readJson(req);
      const doc = body.doc && typeof body.doc === "object" ? body.doc : null;
      if (!doc) return safeError(res, 400, "缺少设计单数据");
      const now = nowISO();
      doc.meta = {
        ...(doc.meta || {}),
        createdAt: doc.meta?.createdAt || row.created_at,
        createdBy: doc.meta?.createdBy || row.owner_name || user.displayName,
        ownerId: row.owner_id,
        updatedAt: now,
      };
      const status = normalizeStatus(doc);
      const submittedAt = status === "done" ? doc.meta.submittedAt || now : null;
      const title = String(doc.meta.name || "未命名设计单").trim() || "未命名设计单";
      const product = String(doc.meta.product || "ShutEye").trim() || "ShutEye";
      statements.updateDesign.run(title, product, status, JSON.stringify(doc), now, submittedAt, row.id);
      const next = statements.getDesign.get(row.id);
      return sendJson(res, 200, { design: summarizeDesign(next, user), doc });
    }

	    if (designMatch && req.method === "DELETE") {
	      const user = requireUser(req, res);
	      if (!user) return;
	      const row = statements.getDesign.get(designMatch[1]);
	      if (!row) return safeError(res, 404, "设计单不存在");
	      if (row.owner_id !== user.id) return safeError(res, 403, "只有创建者可以删除这个设计单");
	      statements.deleteCommentsForDesign.run(row.id);
	      statements.deleteFilesForDesign.run(row.id);
	      statements.deleteDesign.run(row.id);
	      for (const rel of [join("uploads", row.id), join("exports", row.id)]) {
        const abs = safeStoragePath(rel);
        if (abs && existsSync(abs)) rmSync(abs, { recursive: true, force: true });
      }
	      return sendJson(res, 200, { ok: true, id: row.id });
	    }

	    const commentsMatch = path.match(/^\/api\/designs\/([^/]+)\/comments$/);
	    if (commentsMatch && req.method === "GET") {
	      const user = requireUser(req, res);
	      if (!user) return;
	      const row = statements.getDesign.get(commentsMatch[1]);
	      if (!row) return safeError(res, 404, "设计单不存在");
	      return sendJson(res, 200, { comments: statements.listComments.all(row.id).map(summarizeComment) });
	    }

	    if (commentsMatch && req.method === "POST") {
	      const user = requireUser(req, res);
	      if (!user) return;
	      const row = statements.getDesign.get(commentsMatch[1]);
	      if (!row) return safeError(res, 404, "设计单不存在");
	      const body = await readJson(req, 1024 * 1024);
	      const content = String(body.content || "").trim();
	      if (!content) return safeError(res, 400, "评论内容不能为空");
	      if (content.length > 2000) return safeError(res, 400, "评论内容最多 2000 字");
	      const anchor = sanitizeCommentAnchor(body.anchor);
	      const id = randomUUID();
	      const created = nowISO();
	      statements.insertComment.run(id, row.id, user.id, anchor.type, JSON.stringify(anchor), content, created);
	      const comment = statements.listComments.all(row.id).map(summarizeComment).find((item) => item.id === id);
	      return sendJson(res, 201, { comment });
	    }

	    const exportMatch = path.match(/^\/api\/designs\/([^/]+)\/export-md$/);
    if (exportMatch && req.method === "POST") {
      const user = requireUser(req, res);
      if (!user) return;
      const row = statements.getDesign.get(exportMatch[1]);
      if (!row) return safeError(res, 404, "设计单不存在");
      const body = await readJson(req, 10 * 1024 * 1024);
      const markdown = String(body.markdown || "");
      const exportDir = join(storageRoot, "exports", row.id);
      mkdirSync(exportDir, { recursive: true });
      const filePath = join(exportDir, "requirement.md");
      writeFileSync(filePath, markdown, "utf8");
      return sendJson(res, 200, { ok: true, url: `/api/export/${row.id}/requirement.md` });
    }

    const exportPackageMatch = path.match(/^\/api\/designs\/([^/]+)\/export-package$/);
    if (exportPackageMatch && req.method === "POST") {
      const user = requireUser(req, res);
      if (!user) return;
      const row = statements.getDesign.get(exportPackageMatch[1]);
      if (!row) return safeError(res, 404, "设计单不存在");
      const body = await readJson(req, 120 * 1024 * 1024);
      const bodyDoc = body.doc && typeof body.doc === "object" ? body.doc : null;
      const doc = bodyDoc && row.owner_id === user.id ? unwrapStoredDoc(bodyDoc) : parseStoredDoc(row.data_json);
      const packageData = buildExportPackage(row, doc, user);
      sendZip(res, packageData);
      return;
    }

    if (req.method === "POST" && path === "/api/files") {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readJson(req);
      const designId = body.designId ? String(body.designId) : null;
      if (designId) {
        const row = statements.getDesign.get(designId);
        if (!row) return safeError(res, 404, "设计单不存在");
        if (row.owner_id !== user.id) return safeError(res, 403, "只有创建者可以上传资源");
      }
      const originalName = sanitizeFileName(body.name || body.originalName || "file");
      const kind = String(body.kind || "asset").replace(/[^\w-]/g, "_");
      let mimeType = String(body.mimeType || "application/octet-stream");
      let buffer = null;
      if (body.dataUrl) {
        const parsed = dataUrlToBuffer(body.dataUrl);
        if (!parsed) return safeError(res, 400, "文件数据格式不正确");
        buffer = parsed.buffer;
        mimeType = body.mimeType || parsed.mimeType;
      } else if (typeof body.text === "string") {
        buffer = Buffer.from(body.text, "utf8");
        mimeType = body.mimeType || "text/html";
      } else {
        return safeError(res, 400, "缺少文件数据");
      }
      const fileId = randomUUID();
      const ext = extensionFromMime(mimeType, originalName);
      const folder = designId || "unassigned";
      const relDir = join("uploads", folder, kind);
      mkdirSync(join(storageRoot, relDir), { recursive: true });
      const fileName = `${fileId}${ext}`;
      const relPath = join(relDir, fileName);
      const absPath = safeStoragePath(relPath);
      if (!absPath) return safeError(res, 400, "文件路径不安全");
      writeFileSync(absPath, buffer);
      const created = nowISO();
      statements.insertFile.run(fileId, designId, user.id, kind, originalName, mimeType, relPath, buffer.length, created);
      return sendJson(res, 201, {
        file: {
          id: fileId,
          url: `/api/files/${fileId}`,
          kind,
          originalName,
          mimeType,
          size: buffer.length,
          createdAt: created,
        },
      });
    }

    const fileMatch = path.match(/^\/api\/files\/([^/]+)$/);
    if (fileMatch && req.method === "GET") {
      const user = requireUser(req, res);
      if (!user) return;
      const file = statements.getFile.get(fileMatch[1]);
      if (!file) return safeError(res, 404, "文件不存在");
      const abs = safeStoragePath(file.relative_path);
      if (!abs || !existsSync(abs)) return safeError(res, 404, "文件不存在");
      const stat = statSync(abs);
      res.writeHead(200, {
        "Content-Type": file.mime_type || contentTypeForPath(abs),
        "Content-Length": stat.size,
        "Cache-Control": "private, max-age=31536000, immutable",
      });
      createReadStream(abs).pipe(res);
      return;
    }

    const exported = path.match(/^\/api\/export\/([^/]+)\/requirement\.md$/);
    if (exported && req.method === "GET") {
      const user = requireUser(req, res);
      if (!user) return;
      const row = statements.getDesign.get(exported[1]);
      if (!row) return safeError(res, 404, "设计单不存在");
      const abs = join(storageRoot, "exports", row.id, "requirement.md");
      if (!existsSync(abs)) return safeError(res, 404, "导出文件不存在");
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(row.title || "requirement")}.md"`,
      });
      createReadStream(abs).pipe(res);
      return;
    }

    return false;
  } catch (error) {
    if (error?.status === 413 || error?.message === "payload_too_large") return safeError(res, 413, "上传内容过大");
    console.error(error);
    return safeError(res, 500, "服务端处理失败");
  }
}

async function main() {
  const vite = await createViteServer({
    root: rootDir,
    server: { middlewareMode: true, host, hmr: { host: "localhost" } },
    appType: "spa",
  });

  const server = createServer(async (req, res) => {
    if (req.url?.startsWith("/api/")) {
      const handled = await handleApi(req, res);
      if (handled !== false) return;
    }
    vite.middlewares(req, res, () => {
      sendText(res, 404, "Not found");
    });
  });

  server.listen(port, host, () => {
    console.log(`PRD Canvas local server`);
    console.log(`  Local:   http://localhost:${port}/canvas.html`);
    console.log(`  Network: http://10.88.4.197:${port}/canvas.html`);
    console.log(`  DB:      ${dbPath}`);
    console.log(`  Storage: ${storageRoot}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
