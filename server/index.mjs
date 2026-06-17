import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createServer as createViteServer } from "vite";

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
    SELECT designs.id, designs.title, designs.product, designs.status, designs.owner_id, designs.created_at,
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
  insertFile: db.prepare("INSERT INTO files (id, design_id, owner_id, kind, original_name, mime_type, relative_path, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"),
  getFile: db.prepare("SELECT * FROM files WHERE id = ?"),
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

function summarizeDesign(row, user) {
  let doc = null;
  try { doc = JSON.parse(row.data_json || "{}"); } catch {}
  const pageCount = Array.isArray(doc?.nodes) ? doc.nodes.length : 0;
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
    pageCount,
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
        doc: JSON.parse(row.data_json),
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
