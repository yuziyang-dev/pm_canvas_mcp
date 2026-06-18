import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import Fuse from "fuse.js";
import { pinyin } from "pinyin-pro";
import CanvasLogoMark from "./src/canvas-logo.jsx";

/* ============ 令牌:浅色玻璃画布工具 ============ */
const C = {
  paper: "#F0F4F8", surface: "#FFFFFF", glass: "rgba(255,255,255,.9)",
  ink: "#0F172A", soft: "#64748B", faint: "#94A3B8",
  line: "#E2E8F0", lineSoft: "#F8FAFC", canvas: "#F0F4F8", grid: "#CBD5E1",
  indigo: "#3B82F6", indigoSoft: "#EFF6FF",
  copper: "#2563EB", copperSoft: "#DBEAFE",
  sed: "#10B981", sedSoft: "#ECFDF5",
  shadow: "0 8px 32px -4px rgba(15,23,42,.08), 0 4px 12px -2px rgba(15,23,42,.04)",
};
const serif = '-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const sans = '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Roboto,Helvetica,Arial,system-ui,sans-serif';
const mono = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
const RTE_IMAGE_MIN_W = 120;
const RTE_IMAGE_SNAP = 10;
const RTE_PREVIEW_MIN_SCALE = 0.25;
const RTE_PREVIEW_MAX_SCALE = 5;
const RTE_EDITABLE_LINK_ATTR = "data-rte-editable-link";
const RTE_LINK_ID_ATTR = "data-rte-link-id";

const STORE = "prdcanvas:v1";
const LOCAL_USER_NAME = "Yuziyang";
const uid = () => Math.random().toString(36).slice(2, 9);
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
const NODE_W = 180, NODE_H = 132;
const NODE_TITLE_LINE_H = 18;
const NODE_DESC_LINE_H = 15;
const NODE_TITLE_PAD_TOP = 18;
const NODE_TITLE_PAD_BOTTOM = 14;
const NODE_DESC_PAD_TOP = 14;
const NODE_DESC_PAD_BOTTOM = 12;
const NODE_TITLE_MAX_LINES = 2;
const NODE_DESC_MAX_LINES = 3;
const NODE_TITLE_WRAP_UNITS = 13;
const NODE_DESC_WRAP_UNITS = 16;
const NODE_INSET = 10;
const NODE_NO_DESC_BOTTOM_H = 12;
const NODE_MEDIA_W = NODE_W - NODE_INSET * 2 - 2;
const NODE_MEDIA_RADIUS = 10;
const NODE_EMPTY_MEDIA_RADIUS = 10;
const EDGE_BACK_EXIT = 86;
const EDGE_BACK_DIP = 84;
const EDGE_BACK_LANE_GAP = 48;
const EDGE_BACK_CONFLICT_Y = 58;
// 间距:连线后中点标签(宽100)要落在两节点之间的空白里,故水平拉开 ≥ NODE_W + 标签 + 余量
const GAP_X = 150;            // 列间距(双击/粘贴的多节点)
const GAP_Y = 90;             // 行间距
const LINK_DX = NODE_W + 160; // 拖锚点落空白时,新节点相对源节点左缘的水平偏移
const PASTE_PER_ROW = 4;
// 分组底色块配色:透明底板 + 清晰边框 + 色板预览
const GROUP_COLORS = [
  { bg: "rgba(59,130,246,.18)", activeBg: "rgba(59,130,246,.28)", border: "rgba(37,99,235,.56)", text: "#2563EB", swatch: "#3B82F6", ring: "rgba(59,130,246,.18)", shadow: "rgba(37,99,235,.14)" },
  { bg: "rgba(6,182,212,.18)", activeBg: "rgba(6,182,212,.28)", border: "rgba(8,145,178,.56)", text: "#0E7490", swatch: "#06B6D4", ring: "rgba(6,182,212,.18)", shadow: "rgba(8,145,178,.14)" },
  { bg: "rgba(20,184,166,.18)", activeBg: "rgba(20,184,166,.28)", border: "rgba(15,118,110,.56)", text: "#0F766E", swatch: "#14B8A6", ring: "rgba(20,184,166,.18)", shadow: "rgba(15,118,110,.14)" },
  { bg: "rgba(16,185,129,.18)", activeBg: "rgba(16,185,129,.28)", border: "rgba(4,120,87,.56)", text: "#047857", swatch: "#10B981", ring: "rgba(16,185,129,.18)", shadow: "rgba(4,120,87,.14)" },
  { bg: "rgba(132,204,22,.18)", activeBg: "rgba(132,204,22,.28)", border: "rgba(77,124,15,.5)", text: "#4D7C0F", swatch: "#84CC16", ring: "rgba(132,204,22,.18)", shadow: "rgba(77,124,15,.12)" },
  { bg: "rgba(245,158,11,.2)", activeBg: "rgba(245,158,11,.3)", border: "rgba(180,83,9,.54)", text: "#B45309", swatch: "#F59E0B", ring: "rgba(245,158,11,.2)", shadow: "rgba(180,83,9,.14)" },
  { bg: "rgba(249,115,22,.18)", activeBg: "rgba(249,115,22,.28)", border: "rgba(194,65,12,.54)", text: "#C2410C", swatch: "#F97316", ring: "rgba(249,115,22,.18)", shadow: "rgba(194,65,12,.14)" },
  { bg: "rgba(244,63,94,.16)", activeBg: "rgba(244,63,94,.26)", border: "rgba(190,18,60,.5)", text: "#BE123C", swatch: "#F43F5E", ring: "rgba(244,63,94,.16)", shadow: "rgba(190,18,60,.13)" },
  { bg: "rgba(168,85,247,.16)", activeBg: "rgba(168,85,247,.26)", border: "rgba(126,34,206,.5)", text: "#7E22CE", swatch: "#A855F7", ring: "rgba(168,85,247,.16)", shadow: "rgba(126,34,206,.13)" },
  { bg: "rgba(100,116,139,.16)", activeBg: "rgba(100,116,139,.25)", border: "rgba(71,85,105,.5)", text: "#475569", swatch: "#64748B", ring: "rgba(100,116,139,.16)", shadow: "rgba(71,85,105,.12)" },
];
function groupColorIndex(idx) {
  const n = Number(idx);
  const i = Number.isFinite(n) ? n : 0;
  return ((i % GROUP_COLORS.length) + GROUP_COLORS.length) % GROUP_COLORS.length;
}
function groupColor(idx) {
  return GROUP_COLORS[groupColorIndex(idx)];
}
function safeDomId(v) {
  return String(v || "").replace(/[^a-zA-Z0-9_-]/g, "-");
}
function linkTextKey(v) {
  return String(v || "").trim().replace(/\s+/g, "").replace(/\/+$/, "").toLowerCase();
}
function linkLabelLooksLikeHref(label, href) {
  const text = linkTextKey(label);
  const raw = String(href || "").trim();
  if (!text || !raw) return false;
  const candidates = [raw];
  try {
    const url = new URL(raw, typeof window !== "undefined" ? window.location.href : "http://localhost");
    candidates.push(url.href, url.origin + url.pathname + url.search + url.hash);
    if (/^https?:$/i.test(url.protocol)) candidates.push(url.href.replace(/^https?:\/\//i, ""));
  } catch {}
  return candidates.some((candidate) => linkTextKey(candidate) === text);
}
function isEditableRichLink(link) {
  if (!link) return false;
  if (link.getAttribute(RTE_EDITABLE_LINK_ATTR) === "1") return true;
  return !linkLabelLooksLikeHref(link.textContent || "", link.getAttribute("href") || "");
}
function markEditableLinksInSelection(editor, href) {
  if (!editor || typeof window === "undefined") return;
  const sel = window.getSelection?.();
  const links = new Set();
  let safeHref = "";
  try { safeHref = new URL(href, window.location.href).href; } catch {}
  const matchesHref = (link) => {
    if (!href) return true;
    const raw = link.getAttribute("href") || "";
    if (raw === href) return true;
    try { return new URL(raw, window.location.href).href === safeHref; } catch { return false; }
  };
  const add = (link) => {
    if (link && editor.contains(link) && link.matches?.("a[href]") && matchesHref(link)) links.add(link);
  };
  if (sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    const anchorEl = sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement;
    const focusEl = sel.focusNode?.nodeType === 1 ? sel.focusNode : sel.focusNode?.parentElement;
    add(anchorEl?.closest?.("a[href]"));
    add(focusEl?.closest?.("a[href]"));
    editor.querySelectorAll("a[href]").forEach((link) => {
      try { if (range.intersectsNode(link)) add(link); } catch {}
    });
  }
  if (!links.size) {
    const candidates = Array.from(editor.querySelectorAll("a[href]")).filter(matchesHref);
    if (candidates.length) links.add(candidates[candidates.length - 1]);
  }
  links.forEach((link) => {
    link.setAttribute(RTE_EDITABLE_LINK_ATTR, "1");
    link.setAttribute("data-rte-link-kind", "hyperlink");
  });
}
function placeCaretInsideEditableLine(editor, line) {
  if (!editor || !line || typeof window === "undefined") return false;
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(line);
  range.collapse(false);
  const sel = window.getSelection?.();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}
function escapeHtmlAttrValue(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const blankDoc = () => ({
  schema: "prd-canvas/1.0",
  meta: { name: "", product: "ShutEye", requirementStatus: "writing", background: "", dataGoals: "", expGoals: "", analysisUrl: "", date: todayISO(), createdAt: nowISO(), createdBy: LOCAL_USER_NAME, updatedAt: nowISO(), setupDone: false, docOrder: [], docSortMode: "flow", docGroupView: true, docShowPageTransitions: true },
  nodes: [], // {id,x,y,name,note,expGoal,proto(dataURL),protoKind:"image"|"html",competitors:[{id,caption,img}]}
  edges: [], // {id,from,to,label}
  groups: [], // {id,name,nodeIds:[],colorIdx}
});

async function load() { try { const r = await window.storage.get(STORE); return r && r.value ? JSON.parse(r.value) : null; } catch { return null; } }
async function save(d) { try { await window.storage.set(STORE, JSON.stringify(d)); } catch {} }
function fileToB64(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
function fileToText(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.onerror = rej; r.readAsText(f); }); }
function imageRatioFromData(dataUrl) { return new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalHeight / im.naturalWidth); im.onerror = () => res(null); im.src = dataUrl; }); }
const PROTO_FILE_ACCEPT = "image/*,.html,.htm,text/html";
const HTML_PROTO_VIEWPORT_W = 390;
const HTML_PROTO_VIEWPORT_H = 844;
const HTML_PROTO_DEFAULT_RATIO = HTML_PROTO_VIEWPORT_H / HTML_PROTO_VIEWPORT_W;
const HTML_PROTO_MIN_RATIO = 0.25;
const HTML_PROTO_MAX_RATIO = 4;
function isImageFile(file) { return !!file && !!file.type && file.type.startsWith("image/"); }
function isHtmlFile(file) {
  if (!file) return false;
  return /html/i.test(file.type || "") || /\.(html?|xhtml)$/i.test(file.name || "");
}
function isProtoFile(file) { return isImageFile(file) || isHtmlFile(file); }
function htmlToDataUrl(text) { return `data:text/html;charset=utf-8,${encodeURIComponent(String(text || ""))}`; }
async function uploadManagedFile(payload) {
  if (!window.prdApi?.uploadFile) return null;
  try {
    const result = await window.prdApi.uploadFile(payload);
    return result?.file || null;
  } catch (error) {
    console.warn("file upload failed, fallback to inline data", error);
    return null;
  }
}
function htmlProtoRatio(value) {
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio > 0 ? Math.min(HTML_PROTO_MAX_RATIO, Math.max(HTML_PROTO_MIN_RATIO, ratio)) : HTML_PROTO_DEFAULT_RATIO;
}
function parseHtmlProtoRatioInput(input) {
  const text = String(input || "").trim().replace(/[：×xX]/g, ":");
  if (!text) return null;
  const pair = text.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  if (pair) {
    const w = Number(pair[1]);
    const h = Number(pair[2]);
    if (w > 0 && h > 0) return htmlProtoRatio(h / w);
  }
  const ratio = Number(text);
  return Number.isFinite(ratio) && ratio > 0 ? htmlProtoRatio(ratio) : null;
}
function formatHtmlProtoRatio(value) {
  const ratio = htmlProtoRatio(value);
  return `${HTML_PROTO_VIEWPORT_W}:${Math.round(HTML_PROTO_VIEWPORT_W * ratio)}`;
}
function htmlFromDataUrl(src) {
  const value = String(src || "");
  if (!/^data:text\/html/i.test(value)) return "";
  const comma = value.indexOf(",");
  if (comma < 0) return "";
  const payload = value.slice(comma + 1);
  try {
    if (/;base64[,;]/i.test(value.slice(0, comma + 1)) && typeof atob === "function") return atob(payload);
    return decodeURIComponent(payload);
  } catch {
    return "";
  }
}
function protoKindFromSrc(src, fallback = "image") {
  if (!src) return "";
  if (fallback === "html") return "html";
  return /^data:text\/html/i.test(String(src)) ? "html" : "image";
}
function isHtmlProto(nodeOrSrc) {
  if (!nodeOrSrc) return false;
  if (typeof nodeOrSrc === "string") return protoKindFromSrc(nodeOrSrc) === "html";
  return protoKindFromSrc(nodeOrSrc.proto, nodeOrSrc.protoKind) === "html";
}
async function fileToProtoPayload(file) {
  if (!isProtoFile(file)) return null;
  if (isHtmlFile(file)) {
    const text = await fileToText(file);
    const uploaded = await uploadManagedFile({ kind: "prototype", name: file.name || "prototype.html", mimeType: file.type || "text/html", text });
    return { proto: uploaded?.url || htmlToDataUrl(text), protoKind: "html", protoRatio: HTML_PROTO_DEFAULT_RATIO, protoName: file.name || "prototype.html" };
  }
  const data = await fileToB64(file);
  const ratio = await imageRatioFromData(data);
  const uploaded = await uploadManagedFile({ kind: "prototype", name: file.name || "prototype-image", mimeType: file.type || "image/png", dataUrl: data });
  return { proto: uploaded?.url || data, protoKind: "image", protoRatio: ratio, protoName: file.name || "" };
}
async function htmlTextToProtoPayload(text, name = "AI HTML 原型") {
  const uploaded = await uploadManagedFile({ kind: "prototype", name: `${name}.html`, mimeType: "text/html", text });
  return { proto: uploaded?.url || htmlToDataUrl(text), protoKind: "html", protoRatio: HTML_PROTO_DEFAULT_RATIO, protoName: name };
}
async function imageFileToManagedSrc(file, kind = "image") {
  if (!file) return "";
  const data = await fileToB64(file);
  const uploaded = await uploadManagedFile({ kind, name: file.name || `${kind}.png`, mimeType: file.type || "image/png", dataUrl: data });
  return uploaded?.url || data;
}
function looksLikeStandaloneHtml(text) {
  const s = String(text || "").trim();
  return s.length > 40 && /<!doctype\s+html|<html[\s>]|<body[\s>]|<script[\s>]|<style[\s>]/i.test(s);
}

// 富文本(HTML)→ 纯文本:列表转 "- ",换行保留,去标签
function htmlToText(html) {
  if (!html) return "";
  if (!/[<&]/.test(html)) return html; // 本就是纯文本
  let s = html
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(div|p|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  return s.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}
const tx = (v) => htmlToText(v) || "-";
const productCatalog = [
  { name: "ShutEye", mark: "S", color: "#3B82F6" },
  { name: "GrowMe", mark: "G", color: "#10B981" },
  { name: "JustFit", mark: "J", color: "#8B5CF6" },
  { name: "Max Cleaner", mark: "M", color: "#06B6D4" },
];
function getProductMeta(name) {
  return productCatalog.find((item) => item.name === name) || productCatalog[0];
}
const timeBucketOrder = ["今天", "本周", "本月", "更早"];
const statusOrder = ["writing", "done"];
const dateScopeOptions = [
  ["week", "本周"],
  ["month", "本月"],
  ["quarter", "本季度"],
  ["year", "本年"],
  ["older", "更早"],
];
const submissionChecklist = [
  { id: "loading", text: "页面加载与网络状态相关：加载中、空状态、数据丢失、无网" },
  { id: "form", text: "表单输入相关：字符长度限制、异常输入、错误状态、按钮禁用逻辑、提交后的反馈与引导" },
  { id: "cards", text: "卡片/列表/信息流类：空状态与引导、点击范围" },
  { id: "modal", text: "弹窗/toast相关：出现时机、退出机制、前后页面跳转逻辑" },
  { id: "copy", text: "文案：所有文案定稿（或预期最大字数）" },
  { id: "locale", text: "多语言：是否需要做多语言（特别是视频动画等）；多语言文案长度预估" },
  { id: "segments", text: "不同用户的需求差异：订阅 vs 非订阅用户流程差异，看到的页面是否有区别" },
  { id: "conflict", text: "需求冲突：与现有弹窗 / 功能冲突排查 + 处理策略" },
];
function parseDateTime(value) {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function isSameLocalDay(a, b = new Date()) {
  return a && b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
function pad2(n) { return String(n).padStart(2, "0"); }
function formatDocTime(value) {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  const date = parseDateTime(value);
  if (!date) return String(value);
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (isSameLocalDay(date)) return `今天 ${time}`;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${time}`;
}
function formatRecentEdit(card) {
  const date = parseDateTime(card?.updatedAt || card?.updated);
  if (date && isSameLocalDay(date)) return `今天 ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  return card?.updated || "更早";
}
function matchesDateScope(bucket, scope) {
  const key = bucket || "更早";
  if (scope === "week") return key === "今天" || key === "本周";
  if (scope === "month") return key === "今天" || key === "本周" || key === "本月";
  if (scope === "quarter" || scope === "year") return key !== "更早";
  if (scope === "older") return key === "更早";
  return true;
}
function clampLines(text, maxLines, charsPerLine) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return [""];
  const lines = [];
  let rest = raw;
  while (rest && lines.length < maxLines) {
    lines.push(rest.slice(0, charsPerLine));
    rest = rest.slice(charsPerLine);
  }
  if (rest && lines.length) lines[lines.length - 1] = lines[lines.length - 1].slice(0, Math.max(0, charsPerLine - 1)) + "…";
  return lines;
}
function textUnit(ch) {
  if (/\s/.test(ch)) return 0.35;
  if (/[\u3000-\u9fff\uff00-\uffef]/.test(ch)) return 1;
  if (/[A-Z0-9]/.test(ch)) return 0.68;
  return 0.56;
}
function wrapTextLines(text, maxLines, maxUnits) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return [""];
  const lines = [];
  let line = "";
  let units = 0;
  for (const ch of raw) {
    const nextUnits = units + textUnit(ch);
    if (line && nextUnits > maxUnits) {
      lines.push(line.trim());
      line = ch;
      units = textUnit(ch);
      if (lines.length === maxLines) break;
    } else {
      line += ch;
      units = nextUnits;
    }
  }
  if (line && lines.length < maxLines) lines.push(line.trim());
  const consumed = lines.join("").replace(/\s+/g, "").length;
  const total = raw.replace(/\s+/g, "").length;
  if (consumed < total && lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/.$/, "…");
  return lines.length ? lines : [""];
}
function nodeTitleText(n) { return n?.name || "未命名页面"; }
function nodeDescText(n) { return htmlToText(n?.expGoal); }
function nodeTitleLines(n) { return wrapTextLines(nodeTitleText(n), NODE_TITLE_MAX_LINES, NODE_TITLE_WRAP_UNITS); }
function nodeDescLines(n) {
  const text = nodeDescText(n);
  return text ? wrapTextLines(text, NODE_DESC_MAX_LINES, NODE_DESC_WRAP_UNITS) : [];
}
function nodeTitleH(n) { return NODE_TITLE_PAD_TOP + nodeTitleLines(n).length * NODE_TITLE_LINE_H + NODE_TITLE_PAD_BOTTOM; }
function nodeDescH(n) {
  const lines = nodeDescLines(n);
  return lines.length ? NODE_DESC_PAD_TOP + lines.length * NODE_DESC_LINE_H + NODE_DESC_PAD_BOTTOM : NODE_NO_DESC_BOTTOM_H;
}
function smoothRoundRectPath(w, h, r, x0 = 0, y0 = 0) {
  const radius = Math.min(r, w / 2, h / 2);
  const exponent = 4.6;
  const steps = 8;
  const fmt = (v) => Number(v.toFixed(3));
  const corner = (cx, cy, start, end) => {
    const points = [];
    for (let i = 1; i <= steps; i++) {
      const t = start + ((end - start) * i) / steps;
      const cos = Math.cos(t), sin = Math.sin(t);
      const x = x0 + cx + radius * Math.sign(cos) * Math.pow(Math.abs(cos), 2 / exponent);
      const y = y0 + cy + radius * Math.sign(sin) * Math.pow(Math.abs(sin), 2 / exponent);
      points.push(`L${fmt(x)} ${fmt(y)}`);
    }
    return points.join(" ");
  };
  return [
    `M${fmt(x0 + radius)} ${fmt(y0)}`,
    `L${fmt(x0 + w - radius)} ${fmt(y0)}`,
    corner(w - radius, radius, -Math.PI / 2, 0),
    `L${fmt(x0 + w)} ${fmt(y0 + h - radius)}`,
    corner(w - radius, h - radius, 0, Math.PI / 2),
    `L${fmt(x0 + radius)} ${fmt(y0 + h)}`,
    corner(radius, h - radius, Math.PI / 2, Math.PI),
    `L${fmt(x0)} ${fmt(y0 + radius)}`,
    corner(radius, radius, Math.PI, (Math.PI * 3) / 2),
    "Z",
  ].join(" ");
}

function defaultImgH(n) { return n.proto ? NODE_MEDIA_W * (n.protoRatio || 0.55) : 70; }
function routeNodeH(n, imgH = defaultImgH, titleH = nodeTitleH, descH = nodeDescH) { return imgH(n) + titleH(n) + descH(n); }
function routeAnchorY(n, imgH = defaultImgH, titleH = nodeTitleH) { return n.y + titleH(n) + imgH(n) / 2; }
function isBackRoute(f, t) { return (t.x + NODE_W / 2) <= (f.x + NODE_W / 2) + 4; }
function edgeMetric(edge, nodesById, imgH = defaultImgH, titleH = nodeTitleH, descH = nodeDescH) {
  const f = nodesById[edge.from], t = nodesById[edge.to];
  if (!f || !t) return null;
  const a = { x: f.x + NODE_W, y: routeAnchorY(f, imgH, titleH) };
  const b = { x: t.x, y: routeAnchorY(t, imgH, titleH) };
  const back = isBackRoute(f, t);
  const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
  const baseDip = Math.max(f.y + routeNodeH(f, imgH, titleH, descH), t.y + routeNodeH(t, imgH, titleH, descH), a.y, b.y) + EDGE_BACK_DIP;
  return { edge, f, t, a, b, back, left, right, midX: (a.x + b.x) / 2, baseDip };
}
function routeSpanConflicts(a, b) {
  const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const midClose = Math.abs(a.midX - b.midX) < 150;
  return overlap > 24 || (overlap > -44 && midClose);
}
function buildEdgeRoutes(edges, nodes, imgH = defaultImgH, titleH = nodeTitleH, descH = nodeDescH) {
  const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const metrics = edges.map((edge, index) => {
    const metric = edgeMetric(edge, nodesById, imgH, titleH, descH);
    return metric ? { ...metric, index } : null;
  }).filter(Boolean);
  const backPlaced = [];
  const laneById = {};
  metrics.filter((m) => m.back).sort((a, b) => a.baseDip - b.baseDip || a.left - b.left || a.index - b.index).forEach((m) => {
    let lane = 0;
    while (backPlaced.some((p) => routeSpanConflicts(m, p) && Math.abs((m.baseDip + lane * EDGE_BACK_LANE_GAP) - p.dip) < EDGE_BACK_CONFLICT_Y)) lane += 1;
    const dip = m.baseDip + lane * EDGE_BACK_LANE_GAP;
    laneById[m.edge.id] = lane;
    backPlaced.push({ ...m, lane, dip });
  });
  return { nodesById, imgH, titleH, descH, laneById, maxBackLane: Math.max(0, ...Object.values(laneById)) };
}
function edgeGeometry(edge, routes) {
  const m = edgeMetric(edge, routes.nodesById, routes.imgH, routes.titleH, routes.descH);
  if (!m) return null;
  const { a, b, back } = m;
  if (!back) {
    const mx = (a.x + b.x) / 2;
    return { path: `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`, lx: (a.x + b.x) / 2, ly: (a.y + b.y) / 2, back: false };
  }
  const lane = routes.laneById[edge.id] || 0;
  const spread = Math.min(lane, 4) * 14;
  const outX = a.x + EDGE_BACK_EXIT + spread;
  const inX = b.x - EDGE_BACK_EXIT - spread;
  const dip = m.baseDip + lane * EDGE_BACK_LANE_GAP;
  return {
    path: `M${a.x},${a.y} C${outX},${a.y} ${outX},${dip} ${m.midX},${dip} C${inX},${dip} ${inX},${b.y} ${b.x},${b.y}`,
    lx: m.midX,
    ly: dip,
    back: true,
  };
}

/* ============ AI 视图格式化 ============ */
function htmlToMarkdownText(html) {
  if (!html) return "";
  if (!/[<&]/.test(String(html))) return String(html).replace(/\n{3,}/g, "\n\n").trim();
  let s = String(html)
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs, label) => {
      const href = (attrs.match(/\bhref=(["'])(.*?)\1/i) || attrs.match(/\bhref=([^\s>]+)/i) || [])[2] || (attrs.match(/\bhref=([^\s>]+)/i) || [])[1] || "";
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
    .replace(/&quot;/g, '"');
  return s.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
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
function pageDocMarkdown(n, doc) {
  const baseCells = docTableBaseExtraCells(n.docTableBaseCells);
  const customRows = docTableRows(n.docTableRows, 1);
  const outgoing = doc.edges.filter((e) => e.from === n.id);
  const lines = [];
  lines.push(`### ${n.name || "未命名页面"} [${n.id}]`);
    lines.push(`- prototype: ${n.proto ? (isHtmlProto(n) ? "[html prototype attached]" : "[image attached]") : "none"}`);
  lines.push("");
  lines.push("#### 页面说明");
  lines.push(mdField("主说明", n.note));
  baseCells.note.forEach((cell, index) => lines.push(mdField(`补充说明 ${index + 1}`, cell)));
  lines.push("");
  lines.push("#### 体验目标");
  lines.push(mdField("主目标", n.expGoal));
  baseCells.expGoal.forEach((cell, index) => lines.push(mdField(`补充目标 ${index + 1}`, cell)));
  if (customRows.length) {
    lines.push("");
    lines.push("#### 补充记录");
    customRows.forEach((row, rowIndex) => {
      const title = mdValue(row.label, `自定义项 ${rowIndex + 1}`);
      lines.push(`- ${title}`);
      row.cells.forEach((cell, cellIndex) => lines.push(mdField(row.cells.length > 1 ? `内容 ${cellIndex + 1}` : "内容", cell, "  - ")));
    });
  }
  lines.push("");
  if (outgoing.length) {
    lines.push("#### 页面跳转");
    outgoing.forEach((e) => {
      const target = doc.nodes.find((x) => x.id === e.to);
      lines.push(`- 通过「${mdValue(e.label, "未命名操作")}」跳转至「${target ? target.name || "未命名页面" : "?"}」`);
    });
    lines.push("");
  }
  if (n.competitors && n.competitors.length) {
    lines.push("#### 竞品参考");
    n.competitors.forEach((c, ci) => lines.push(mdField(`参考 ${ci + 1}${c.img ? " [image attached]" : ""}`, c.caption)));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
function toAI(doc) {
  const L = [];
  L.push("# PRD · " + (doc.meta.name || "未命名"));
  L.push(`> schema: ${doc.schema} | date: ${doc.meta.date}` + (doc.meta.analysisUrl ? ` | analysis: ${doc.meta.analysisUrl}` : ""));
  L.push("\n## BACKGROUND\n" + tx(doc.meta.background));
  L.push("\n## DATA_GOALS\n" + tx(doc.meta.dataGoals));
  L.push("\n## EXPERIENCE_GOALS_OVERALL\n" + tx(doc.meta.expGoals));
  L.push("\n## PAGES");
  doc.nodes.forEach((n) => L.push(pageDocMarkdown(n, doc) + "\n"));
  L.push("## FLOW_TRANSITIONS");
  if (doc.edges.length) {
    doc.edges.forEach((e) => {
      const f = doc.nodes.find((n) => n.id === e.from), t = doc.nodes.find((n) => n.id === e.to);
      L.push(`- ${f ? f.name || f.id : "?"} --[${e.label || "跳转"}]--> ${t ? t.name || t.id : "?"}`);
    });
  } else L.push("none");
  // 分支统计
  const branches = doc.nodes.filter((n) => doc.edges.filter((e) => e.from === n.id).length > 1);
  if (branches.length) {
    L.push("\n## BRANCH_POINTS");
    branches.forEach((n) => L.push(`- ${n.name || n.id}: ${doc.edges.filter((e) => e.from === n.id).length} 分支`));
  }
  return L.join("\n");
}

/* ============ 通用件 ============ */
function Btn({ children, onClick, disabled, kind = "primary", small }) {
  const st = { fontFamily: sans, cursor: disabled ? "not-allowed" : "pointer", border: "none", borderRadius: 999, fontWeight: 600, padding: small ? "7px 13px" : "9px 17px", fontSize: small ? 12 : 13, boxShadow: kind === "primary" ? "0 1px 3px rgba(37,99,235,.22)" : "none", transition: "background .16s, color .16s, border-color .16s, box-shadow .16s" };
  const v = { primary: { background: disabled ? C.faint : C.indigo, color: "#fff" }, ghost: { background: "rgba(255,255,255,.72)", color: C.soft, border: `1px solid ${C.line}` }, copper: { background: C.copper, color: "#fff" } };
  return <button onClick={onClick} disabled={disabled} style={{ ...st, ...v[kind] }}>{children}</button>;
}
const fieldStyle = { width: "100%", borderRadius: 10, padding: "9px 11px", fontSize: 13.5, border: `1px solid ${C.line}`, background: C.surface, color: C.ink, fontFamily: sans, outline: "none", boxShadow: "0 1px 2px rgba(15,23,42,.02)" };

function normalizeDoc(d) {
  const base = blankDoc();
  const doc = d && typeof d === "object" ? d : base;
  const meta = { ...base.meta, ...(doc.meta || {}) };
  if (!meta.createdAt) meta.createdAt = meta.date || nowISO();
  if (!meta.createdBy) meta.createdBy = LOCAL_USER_NAME;
  if (!meta.updatedAt) meta.updatedAt = meta.date === todayISO() ? nowISO() : meta.date;
  const submitted = meta.requirementStatus === "done" && !!meta.submittedAt;
  meta.requirementStatus = submitted ? "done" : "writing";
  if (!submitted) meta.submittedAt = "";
  return {
    ...base,
    ...doc,
    meta,
    nodes: Array.isArray(doc.nodes) ? doc.nodes.map((n) => ({
      ...n,
      protoKind: n?.proto ? protoKindFromSrc(n.proto, n.protoKind) : "",
      protoRatio: n?.proto ? (protoKindFromSrc(n.proto, n.protoKind) === "html" ? htmlProtoRatio(n.protoRatio) : n.protoRatio) : n?.protoRatio,
    })) : [],
    edges: Array.isArray(doc.edges) ? doc.edges : [],
    groups: Array.isArray(doc.groups) ? doc.groups : [],
  };
}
function touchDoc(d) {
  return { ...d, meta: { ...(d.meta || {}), updatedAt: nowISO() } };
}
function docHasContent(d) {
  if (!d) return false;
  const meta = d.meta || {};
  return !!(
    (meta.name || "").trim()
    || htmlToText(meta.background).trim()
    || htmlToText(meta.dataGoals).trim()
    || htmlToText(meta.expGoals).trim()
    || (d.nodes || []).length
    || (d.edges || []).length
  );
}
function seedRequirementDoc(seed) {
  const d = blankDoc();
  const submittedAt = seed.statusTone === "done" && seed.submittedAt ? seed.submittedAt : "";
  const requirementStatus = submittedAt ? "done" : "writing";
  return {
    ...d,
    meta: {
      ...d.meta,
      name: seed.title || "",
      product: getProductMeta(seed.product || seed.project).name,
      requirementStatus,
      background: seed.description || "",
      dataGoals: seed.dataGoals || "",
      expGoals: seed.expGoals || "",
      date: todayISO(),
      createdAt: nowISO(),
      createdBy: LOCAL_USER_NAME,
      updatedAt: seed.updatedAt || nowISO(),
      submittedAt,
      submissionChecklist: submittedAt ? Object.fromEntries(submissionChecklist.map((item) => [item.id, true])) : {},
      setupDone: true,
    },
  };
}
function docWordCount(doc) {
  const text = [
    doc?.meta?.background,
    doc?.meta?.dataGoals,
    doc?.meta?.expGoals,
    ...(doc?.nodes || []).flatMap((n) => [n.name, n.note, n.expGoal]),
  ].map(htmlToText).join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}
function compactSearchText(values) {
  return values.flat(Infinity).map(htmlToText).map((v) => String(v || "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
function docSearchText(doc) {
  const nodes = Array.isArray(doc?.nodes) ? doc.nodes : [];
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]).filter(([id]) => id));
  return compactSearchText([
    doc?.meta?.name,
    doc?.meta?.product,
    doc?.meta?.background,
    doc?.meta?.dataGoals,
    doc?.meta?.expGoals,
    doc?.meta?.analysisUrl,
    ...(Array.isArray(doc?.groups) ? doc.groups.map((g) => g?.name) : []),
    ...nodes.flatMap((n) => [
      n?.name,
      n?.note,
      n?.expGoal,
      n?.protoName,
      n?.docTableBaseCells ? Object.values(n.docTableBaseCells).flat() : [],
      Array.isArray(n?.docTableRows) ? n.docTableRows.flatMap((row) => [row?.label, ...(Array.isArray(row?.cells) ? row.cells : [])]) : [],
      Array.isArray(n?.competitors) ? n.competitors.map((c) => c?.caption) : [],
    ]),
    ...(Array.isArray(doc?.edges) ? doc.edges.flatMap((e) => [e?.label, nodeById[e?.from]?.name, nodeById[e?.to]?.name]) : []),
  ]).slice(0, 24000);
}
function isSubmittedDoc(doc) {
  return doc?.meta?.requirementStatus === "done" && !!doc?.meta?.submittedAt;
}
function currentRequirementCard(doc) {
  const name = doc?.meta?.name || "未命名设计单";
  const product = getProductMeta(doc?.meta?.product);
  const submittedDone = isSubmittedDoc(doc);
  const statusTone = submittedDone ? "done" : "writing";
  const status = statusTone === "done" ? "已完成" : "编写中";
  const summary = htmlToText(doc?.meta?.background) || "从这里进入画布继续整理页面、文档和交付链接。";
  return {
    id: "current",
    kind: "current",
    product: product.name,
    project: product.name,
    projectMark: product.mark,
    projectColor: product.color,
    title: name,
    description: summary,
    status,
    statusTone,
    requirementStatus: doc?.meta?.requirementStatus || "writing",
    submittedAt: doc?.meta?.submittedAt || "",
    icon: "canvas",
    owners: ["你"],
    ownerName: doc?.meta?.createdBy || "你",
    updated: doc?.meta?.date || todayISO(),
    updatedAt: doc?.meta?.updatedAt || doc?.meta?.date || nowISO(),
    timeBucket: "今天",
    pageCount: (doc?.nodes || []).length,
    wordCount: docWordCount(doc),
    searchText: docSearchText(doc),
    primaryAction: "继续编辑",
  };
}
function dateBucketFromISO(value) {
  const date = parseDateTime(value);
  if (!date) return "更早";
  if (isSameLocalDay(date)) return "今天";
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays <= 7) return "本周";
  if (diffDays <= 31) return "本月";
  if (diffDays <= 92) return "本季度";
  if (diffDays <= 366) return "本年";
  return "更早";
}
function designSummaryToCard(design) {
  const product = getProductMeta(design?.product);
  const statusTone = design?.status === "done" && design?.submittedAt ? "done" : "writing";
  const ownerName = design?.ownerName || "未设置";
  return {
    id: design.id,
    kind: "server",
    product: product.name,
    project: product.name,
    projectMark: product.mark,
    projectColor: product.color,
    title: design.title || "未命名设计单",
    description: design.canEdit ? "你创建的设计单" : `${ownerName} 创建的公开设计单`,
    status: statusStyles[statusTone].label,
    statusTone,
    requirementStatus: statusTone,
    submittedAt: design.submittedAt || "",
    icon: "canvas",
    owners: [ownerName.slice(0, 1).toUpperCase() || "U"],
    ownerName,
    ownerId: design.ownerId,
    canEdit: !!design.canEdit,
    updated: dateBucketFromISO(design.updatedAt),
    updatedAt: design.updatedAt || design.createdAt || nowISO(),
    timeBucket: dateBucketFromISO(design.updatedAt || design.createdAt),
    pageCount: design.pageCount || 0,
    wordCount: 0,
    searchText: design.searchText || "",
    primaryAction: design.canEdit ? "继续编辑" : "只读浏览",
  };
}
const requirementSeeds = [
  {
    id: "reset-password",
    product: "ShutEye",
    project: "ShutEye",
    projectMark: "S",
    projectColor: "#3B82F6",
    title: "重置密码网页",
    description: "梳理 ShutEye 重置密码流程,统一 reset password 页面与登录跳转逻辑。",
    dataGoals: "降低重置后跳错页面比例,减少客服进线。",
    expGoals: "用户能在 10 秒内理解状态并完成下一步。",
    status: "编写中",
    statusTone: "writing",
    icon: "document",
    owners: ["P", "D", "R"],
    updated: "今天",
    updatedAt: nowISO(),
    timeBucket: "今天",
    pageCount: 4,
    wordCount: 12,
  },
  {
    id: "checkout-guard",
    product: "GrowMe",
    project: "GrowMe",
    projectMark: "G",
    projectColor: "#10B981",
    title: "订阅支付异常兜底",
    description: "补齐支付失败、卡验证、价格变更与优惠券失效的页面状态。",
    dataGoals: "订阅支付失败后的回收率提升 8%。",
    expGoals: "用户能清晰知道失败原因与可恢复路径。",
    status: "编写中",
    statusTone: "writing",
    icon: "flow",
    owners: ["M", "D"],
    updated: "2 天前",
    timeBucket: "本周",
    pageCount: 6,
    wordCount: 28,
  },
  {
    id: "onboarding",
    product: "JustFit",
    project: "JustFit",
    projectMark: "J",
    projectColor: "#8B5CF6",
    title: "首次使用引导",
    description: "重构安装后首屏、权限说明、基础设置和首次任务创建链路。",
    dataGoals: "首日激活率提升 15%。",
    expGoals: "减少配置负担,让用户先看到核心价值。",
    status: "已完成",
    statusTone: "done",
    submittedAt: "2026-06-10T10:20:00+08:00",
    icon: "image",
    owners: ["A", "Y"],
    updated: "上周",
    timeBucket: "本月",
    pageCount: 8,
    wordCount: 46,
  },
  {
    id: "mobile-settings",
    product: "Max Cleaner",
    project: "Max Cleaner",
    projectMark: "M",
    projectColor: "#06B6D4",
    title: "移动端设置页分层",
    description: "重新组织账号、通知、订阅与隐私设置,减少隐藏入口。",
    dataGoals: "设置项搜索与客服相关问题下降 10%。",
    expGoals: "用户能在两步内找到常用设置。",
    status: "编写中",
    statusTone: "writing",
    icon: "document",
    owners: ["J", "D"],
    updated: "5 天前",
    timeBucket: "本周",
    pageCount: 5,
    wordCount: 31,
  },
];
const statusStyles = {
  writing: { bg: "#DBEAFE", text: "#2563EB", label: "编写中" },
  done: { bg: "#DCFCE7", text: "#166534", label: "已完成" },
};
function realRequirementStatusTone(card) {
  return card?.statusTone === "done" && !!card?.submittedAt ? "done" : "writing";
}
function withRealRequirementStatus(card) {
  const statusTone = realRequirementStatusTone(card);
  return { ...card, statusTone, status: statusStyles[statusTone].label };
}
const lifecycleStages = [
  { key: "discussion", label: "讨论", icon: "chat", hint: "收集想法、问题和业务背景" },
  { key: "analysis", label: "需求分析", icon: "analysis", hint: "沉淀目标、约束和判断依据" },
  { key: "canvas", label: "Canvas设计单", icon: "canvas", hint: "画原型、流程图并同步文档" },
  { key: "prd", label: "PRD", icon: "document", hint: "输出开发可消费的产品文档" },
  { key: "design", label: "设计", icon: "image", hint: "进入视觉与交互设计协同" },
  { key: "dev", label: "开发", icon: "code", hint: "同步开发范围与实现状态" },
  { key: "test", label: "测试", icon: "test", hint: "记录用例、风险和验收结果" },
  { key: "launch", label: "上线", icon: "rocket", hint: "追踪发布、复盘和知识沉淀" },
];
const lifecycleStageIndex = lifecycleStages.reduce((acc, item, index) => ({ ...acc, [item.key]: index }), {});
function lifecycleStageForCard(card) {
  return card?.stage || "canvas";
}
function lifecycleStageLabel(key) {
  return lifecycleStages.find((item) => item.key === key)?.label || "Canvas设计单";
}
function requirementArtifacts(card) {
  const hasCanvas = card?.kind === "current" || (card?.pageCount || 0) > 0;
  const statusTone = realRequirementStatusTone(card);
  return [
    { key: "analysis", label: "分析", done: true },
    { key: "canvas", label: `Canvas ${card?.pageCount || 0}页`, done: hasCanvas },
    { key: "prd", label: "PRD", done: statusTone === "done" },
  ];
}
function ManagerIcon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    back: <><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    analysis: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l3-4 3 2 4-6" /><path d="M17 7h3v3" /></>,
    folder: <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2.5h6.5A2.5 2.5 0 0 1 21 10v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17z" />,
    document: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h6" /></>,
    canvas: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 15l3-3 2 2 3-4 2 3" /><circle cx="9" cy="9" r="1.3" /></>,
    knowledge: <><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5z" /><path d="M5 4.5v17" /><path d="M9 7h7" /><path d="M9 11h6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    team: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    flow: <><path d="M6 6h5v5H6z" /><path d="M13 13h5v5h-5z" /><path d="M11 8.5h3.5A2.5 2.5 0 0 1 17 11v2" /></>,
    image: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 16l-5-5-4 4-2-2-5 5" /></>,
    dots: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    chevron: <path d="M8 9l4 4 4-4" />,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8" /><path d="M8 13h5" /></>,
    code: <><path d="M8 9l-4 3 4 3" /><path d="M16 9l4 3-4 3" /><path d="M14 5l-4 14" /></>,
    test: <><path d="M9 2v6l-5 9a3 3 0 0 0 2.6 4.5h10.8A3 3 0 0 0 20 17L15 8V2" /><path d="M8 2h8" /><path d="M7 15h10" /></>,
    rocket: <><path d="M4.5 16.5c-1.5 1.3-2 3-2 5 2 0 3.7-.5 5-2" /><path d="M9 15l-2-2c.5-3 2-5.5 4.5-7.5C14 3.5 17 2.5 21.5 2.5c0 4.5-1 7.5-3 10-2 2.5-4.5 4-7.5 4.5z" /><path d="M15 8.5h.01" /></>,
    check: <><path d="M20 6L9 17l-5-5" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6.5 6l1 14h9l1-14" /><path d="M10 11v5" /><path d="M14 11v5" /></>,
  };
  return <svg {...common}>{paths[name] || paths.document}</svg>;
}

function AppToast({ toast }) {
  if (!toast || typeof document === "undefined") return null;
  return createPortal(
    <div data-app-toast="1" style={{ position: "fixed", top: 22, left: "50%", transform: "translateX(-50%)", zIndex: 10050, minHeight: 42, maxWidth: "calc(100vw - 32px)", display: "inline-flex", alignItems: "center", gap: 10, padding: "0 16px 0 12px", borderRadius: 999, background: "rgba(15,23,42,.94)", color: "#fff", boxShadow: "0 16px 42px rgba(15,23,42,.24)", fontFamily: sans, fontSize: 13, fontWeight: 850, letterSpacing: 0, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, background: "rgba(16,185,129,.18)", color: "#34D399", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <ManagerIcon name="check" size={14} />
      </span>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{toast.message}</span>
    </div>,
    document.body
  );
}

function EditSubmittedConfirmModal({ onCancel, onConfirm }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-edit-submitted-confirm="1" style={{ position: "fixed", inset: 0, zIndex: 10040, background: "rgba(15,23,42,.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>
      <div style={{ width: 440, maxWidth: "calc(100vw - 32px)", borderRadius: 20, border: `1px solid ${C.line}`, background: C.glass, boxShadow: "0 24px 80px rgba(15,23,42,.22)", padding: 22, fontFamily: sans, color: C.ink }}>
        <div style={{ fontSize: 18, lineHeight: 1.25, fontWeight: 900, marginBottom: 8 }}>确认进入二次编辑？</div>
        <div style={{ color: C.soft, fontSize: 13, lineHeight: 1.75, marginBottom: 18 }}>
          已提交的设计单开始二次修改后，会通知设计师暂停当前设计。进入编辑后，本次提交状态会撤回，提交前 Checklist 会重置；需要重新逐项确认并提交成功后，设计师再继续设计。
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn kind="ghost" onClick={onCancel}>取消</Btn>
          <Btn onClick={onConfirm}>确认编辑</Btn>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ManagerSidebar({ active = "设计单", currentUser = null, onLogout = null }) {
  const displayName = currentUser?.displayName || "Yuziyang";
  const initials = displayName.slice(0, 2).toUpperCase();
  return (
    <aside className="manager-sidebar" style={{ position: "fixed", left: 16, top: 8, bottom: 8, width: 176, background: C.glass, border: `1px solid ${C.line}`, borderRadius: 18, padding: 10, display: "flex", flexDirection: "column", flexShrink: 0, boxShadow: "0 8px 32px -4px rgba(15,23,42,.08), 0 4px 12px -2px rgba(15,23,42,.04)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", zIndex: 10 }}>
      <div style={{ padding: "10px 10px 12px", display: "flex", alignItems: "center", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 850, fontSize: 14, minWidth: 0 }}>
          <CanvasLogoMark size={30} color={C.indigo} />
          需求画布
        </div>
      </div>
      <div className="manager-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 0 14px", display: "flex", flexDirection: "column", gap: 4 }}>
        <ManagerNav active={active === "需求分析"} icon="analysis" label="需求分析" />
        <ManagerNav active={active === "设计单"} icon="folder" label="设计单" />
        <ManagerNav active={active === "PRD"} icon="document" label="PRD" />
        <ManagerNav active={active === "团队知识库"} icon="knowledge" label="团队知识库" />
      </div>
      <div style={{ padding: "12px 8px 4px", borderTop: `1px solid ${C.lineSoft}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 28, height: 28, borderRadius: 999, background: "#E2E8F0", color: C.soft, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, flexShrink: 0 }}>{initials}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
            <button type="button" onClick={onLogout || undefined} disabled={!onLogout} style={{ border: "none", background: "transparent", padding: 0, margin: 0, fontFamily: sans, fontSize: 10, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: onLogout ? "pointer" : "default" }}>{onLogout ? "退出登录" : "本地体验环境"}</button>
          </div>
        </div>
      </div>
    </aside>
  );
}

const MANAGER_LIST_GRID = "minmax(220px,1.42fr) minmax(104px,.48fr) minmax(112px,.5fr) minmax(126px,.54fr) minmax(112px,.5fr) minmax(154px,.72fr)";
const MANAGER_FUSE_KEYS = [
  { name: "title", weight: 0.34 },
  { name: "titlePinyin", weight: 0.12 },
  { name: "titlePinyinCompact", weight: 0.12 },
  { name: "titleInitials", weight: 0.12 },
  { name: "pageText", weight: 0.16 },
  { name: "bodyText", weight: 0.1 },
  { name: "bodyPinyin", weight: 0.06 },
  { name: "bodyPinyinCompact", weight: 0.06 },
  { name: "bodyInitials", weight: 0.06 },
  { name: "aliases", weight: 0.12 },
  { name: "product", weight: 0.06 },
  { name: "status", weight: 0.04 },
  { name: "owner", weight: 0.04 },
  { name: "all", weight: 0.02 },
];

function useDebouncedValue(value, delay = 180) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase().replace(/[，。！？、；："'“”‘’（）()[\]{}<>《》|\\/.,!?;:\-_+*=~`@#$%^&\s]+/g, "");
}

function safePinyinText(value, pattern = "pinyin") {
  const raw = String(value || "").slice(0, 6000);
  if (!raw) return "";
  try {
    const result = pinyin(raw, { toneType: "none", type: "array", pattern });
    return Array.isArray(result) ? result.join(" ") : String(result || "");
  } catch {
    try {
      return String(pinyin(raw, { toneType: "none", pattern }) || "");
    } catch {
      return "";
    }
  }
}

function managerSearchAliases(value) {
  const raw = String(value || "");
  const aliases = [];
  const add = (...items) => aliases.push(...items);
  if (raw.includes("密码")) add("mima", "mm");
  if (raw.includes("重置")) add("chongzhi", "cz");
  if (raw.includes("密码") && raw.includes("重置")) add("mimachongzhi", "mmcz");
  if (raw.includes("登录")) add("denglu", "dl");
  if (raw.includes("注册")) add("zhuce", "zc");
  if (raw.includes("需求")) add("xuqiu", "xq");
  if (raw.includes("设计")) add("sheji", "sj");
  if (raw.includes("页面")) add("yemian", "ym");
  if (raw.includes("原型")) add("yuanxing", "yx");
  if (raw.includes("流程")) add("liucheng", "lc");
  if (raw.includes("评论")) add("pinglun", "pl");
  if (raw.includes("跳转")) add("tiaozhuan", "tz");
  if (raw.includes("完成")) add("wancheng", "wc");
  return [...new Set(aliases)].join(" ");
}

function buildManagerSearchEntry(card) {
  const statusTone = realRequirementStatusTone(card);
  const status = statusStyles[statusTone]?.label || card.status || "";
  const owner = card.ownerName || (Array.isArray(card.owners) ? card.owners.join(" ") : "");
  const pageText = compactSearchText([card.pageText, `${card.pageCount || 0}页`]);
  const bodyText = compactSearchText([card.description, card.searchText]);
  const title = String(card.title || "");
  const base = compactSearchText([title, card.product, card.project, status, owner, pageText, bodyText]);
  const pinyinSource = compactSearchText([title, card.product, owner, bodyText.slice(0, 6000)]);
  const titlePinyin = safePinyinText(title);
  const bodyPinyin = safePinyinText(pinyinSource);
  const titleInitials = normalizeSearchText(safePinyinText(title, "first"));
  const bodyInitials = normalizeSearchText(safePinyinText(pinyinSource, "first"));
  const aliases = managerSearchAliases(base);
  const haystack = normalizeSearchText([base, titlePinyin, bodyPinyin, titleInitials, bodyInitials, aliases].join(" "));
  return {
    card,
    id: card.id,
    title,
    product: String(card.product || card.project || ""),
    status,
    owner,
    pageText,
    bodyText,
    titlePinyin,
    titlePinyinCompact: normalizeSearchText(titlePinyin),
    titleInitials,
    bodyPinyin,
    bodyPinyinCompact: normalizeSearchText(bodyPinyin),
    bodyInitials,
    aliases,
    haystack,
    all: base,
  };
}

function managerQueryTerms(query) {
  return String(query || "").trim().split(/\s+/).map((term) => term.trim()).filter(Boolean).slice(0, 8);
}

function directSearchBonus(entry, terms) {
  let bonus = 0;
  const title = normalizeSearchText(entry.title);
  const titlePinyin = entry.titlePinyinCompact || normalizeSearchText(entry.titlePinyin);
  const titleInitials = entry.titleInitials || "";
  const all = entry.haystack || normalizeSearchText([entry.title, entry.product, entry.status, entry.owner, entry.pageText, entry.bodyText, entry.bodyPinyin, entry.bodyInitials, entry.aliases].join(" "));
  terms.forEach((term) => {
    const q = normalizeSearchText(term);
    if (!q) return;
    if (title === q) bonus += 0.28;
    else if (title.includes(q)) bonus += 0.2;
    if (titlePinyin.includes(q) || titleInitials.includes(q)) bonus += 0.16;
    if (all.includes(q)) bonus += 0.08;
  });
  return bonus;
}

function directSearchScore(entry, terms) {
  const title = normalizeSearchText(entry.title);
  const titlePinyin = entry.titlePinyinCompact || normalizeSearchText(entry.titlePinyin);
  const titleInitials = entry.titleInitials || "";
  const haystack = entry.haystack || normalizeSearchText(entry.all);
  let score = 0;
  for (const term of terms) {
    const q = normalizeSearchText(term);
    if (!q) continue;
    if (title === q) {
      score -= 1.2;
      continue;
    }
    if (title.includes(q)) {
      score -= 0.95;
      continue;
    }
    if (titlePinyin.includes(q)) {
      score -= 0.82;
      continue;
    }
    if (titleInitials.includes(q)) {
      score -= 0.76;
      continue;
    }
    const index = haystack.indexOf(q);
    if (index >= 0) {
      score -= 0.48;
      score += Math.min(index, 20000) / 100000;
      continue;
    }
    return null;
  }
  return score;
}

function fuzzySearchCards(cards, query) {
  const terms = managerQueryTerms(query);
  if (!terms.length) return cards;
  const entries = cards.map(buildManagerSearchEntry);
  const directRanked = entries
    .map((entry, index) => {
      const score = directSearchScore(entry, terms);
      return score === null ? null : { entry, index, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || a.index - b.index);
  const fuse = new Fuse(entries, {
    includeScore: true,
    threshold: 0.42,
    distance: 120,
    ignoreLocation: true,
    minMatchCharLength: 1,
    keys: MANAGER_FUSE_KEYS,
  });
  const hits = new Map();
  terms.forEach((term) => {
    const termResults = fuse.search(term).filter((result) => Number(result.score ?? 1) <= 0.58);
    termResults.forEach((result) => {
      const id = result.item.id;
      const current = hits.get(id) || { entry: result.item, count: 0, score: 0 };
      current.count += 1;
      current.score += Number(result.score ?? 0.6);
      hits.set(id, current);
    });
  });
  const ranked = [...hits.values()]
    .filter((item) => item.count >= terms.length)
    .map((item) => ({
      card: item.entry.card,
      id: item.entry.id,
      score: item.score / Math.max(1, item.count) - directSearchBonus(item.entry, terms),
    }))
    .sort((a, b) => a.score - b.score)
    .map((item) => item);
  const merged = [];
  const seen = new Set();
  directRanked.forEach((item) => {
    if (seen.has(item.entry.id)) return;
    seen.add(item.entry.id);
    merged.push(item.entry.card);
  });
  ranked.forEach((item) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    merged.push(item.card);
  });
  return merged;
}

function HighlightedSearchText({ text, query }) {
  const source = String(text || "");
  const terms = managerQueryTerms(query).filter((term) => term.length >= 1);
  const direct = terms.find((term) => source.toLowerCase().includes(term.toLowerCase()));
  if (!direct) return source;
  const index = source.toLowerCase().indexOf(direct.toLowerCase());
  if (index < 0) return source;
  return (
    <>
      {source.slice(0, index)}
      <mark style={{ background: "#DBEAFE", color: C.indigo, borderRadius: 4, padding: "0 2px" }}>{source.slice(index, index + direct.length)}</mark>
      {source.slice(index + direct.length)}
    </>
  );
}

function RequirementManager({ doc, onOpenCanvas, onCreate, onDelete, serverCards = null, serverMode = false, scope = "mine", onScopeChange, currentUser = null, onLogout = null, loading = false }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 180);
  const [dateScope, setDateScope] = useState("month");
  const [rowMenu, setRowMenu] = useState(null);
  const cards = useMemo(() => (serverCards ? serverCards : [currentRequirementCard(doc), ...requirementSeeds]).map(withRealRequirementStatus), [doc, serverCards]);
  const dateScopedCards = useMemo(() => {
    const passDate = (card) => matchesDateScope(card.timeBucket, dateScope);
    return cards.filter((card) => passDate(card));
  }, [cards, dateScope]);
  const scopedCards = useMemo(() => fuzzySearchCards(dateScopedCards, debouncedQuery), [dateScopedCards, debouncedQuery]);
  const filtered = useMemo(() => {
    if (filter === "all") return scopedCards;
    return scopedCards.filter((card) => card.statusTone === filter);
  }, [scopedCards, filter]);
  const tabCounts = useMemo(() => ({
    all: scopedCards.length,
    writing: scopedCards.filter((c) => c.statusTone === "writing").length,
    done: scopedCards.filter((c) => c.statusTone === "done").length,
  }), [scopedCards]);
  const writingCount = cards.filter((c) => c.statusTone === "writing").length;
  const doneCount = cards.filter((c) => c.statusTone === "done").length;
  useEffect(() => {
    if (!rowMenu) return undefined;
    const close = () => setRowMenu(null);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [rowMenu]);
  const openRowMenu = (event, card) => {
    event.preventDefault();
    event.stopPropagation();
    const width = 172;
    const height = card?.canEdit ? 98 : 92;
    setRowMenu({
      card,
      x: Math.min(event.clientX, window.innerWidth - width - 12),
      y: Math.min(event.clientY, window.innerHeight - height - 12),
    });
  };
  const runMenuAction = (event, action) => {
    event.preventDefault();
    event.stopPropagation();
    const card = rowMenu?.card;
    setRowMenu(null);
    action?.(card);
  };
  return (
    <div style={{ height: "100vh", minHeight: "100vh", position: "relative", background: C.paper, backgroundImage: `radial-gradient(${C.grid} 1px, transparent 1px)`, backgroundSize: "24px 24px", color: C.ink, fontFamily: sans, overflow: "hidden" }}>
      <style>{`
        *{box-sizing:border-box}
        .manager-nav:hover{background:rgba(239,246,255,.68)!important;color:${C.indigo}!important}
        .manager-list-row{transition:background .18s,transform .12s,box-shadow .18s}
        .manager-list-row:hover{background:rgba(255,255,255,.68)!important;transform:translateY(-1px);box-shadow:0 2px 8px -2px rgba(15,23,42,.08)}
        .manager-primary-btn:hover{background:#2563EB!important;transform:translateY(-1px)}
        .manager-tab[data-active="false"]:hover{background:rgba(255,255,255,.72);color:${C.ink}}
        .manager-scroll::-webkit-scrollbar{display:none}
        .manager-scroll{-ms-overflow-style:none;scrollbar-width:none}
        @media(max-width:1080px){.manager-sidebar{display:none!important}.manager-main{padding:20px!important}.manager-header{gap:14px;align-items:flex-start!important;flex-direction:column!important}.manager-actions{width:100%;justify-content:space-between}.manager-search{width:100%!important}}
        @media(max-width:720px){.manager-content{min-height:0!important}.manager-list-scroll{overflow-x:auto!important}.manager-list-table{min-width:760px!important}.manager-panel-head{align-items:flex-start!important;flex-direction:column!important}.manager-date-filter{align-self:flex-start}}
      `}</style>
      <ManagerSidebar active="设计单" currentUser={currentUser} onLogout={onLogout} />

      <main className="manager-main" style={{ height: "100vh", minHeight: "100vh", overflow: "hidden", padding: "30px 28px 28px 224px", display: "flex", flexDirection: "column" }}>
        <header className="manager-header" style={{ flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, marginBottom: 22 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.12, fontWeight: 900, letterSpacing: 0, color: "#111827" }}>设计单管理</h1>
            <p style={{ margin: "8px 0 0", color: C.soft, fontSize: 14, lineHeight: 1.55 }}>集中管理设计单,按状态和最近编辑快速查找,当前 {writingCount} 个编写中、{doneCount} 个已完成。</p>
          </div>
          <button type="button" className="manager-primary-btn" onClick={onCreate} style={{ height: 38, border: "none", borderRadius: 10, padding: "0 16px", background: C.indigo, color: "#fff", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: sans, fontSize: 13, fontWeight: 850, cursor: "pointer", boxShadow: "0 8px 18px rgba(37,99,235,.18)", transition: "background .16s,transform .16s", flexShrink: 0 }}>
            <ManagerIcon name="plus" size={16} />
            新建设计单
          </button>
        </header>

        <section className="manager-content" style={{ flex: 1, minHeight: 0, background: C.glass, border: `1px solid ${C.line}`, borderRadius: 20, boxShadow: C.shadow, overflow: "hidden", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", display: "flex", flexDirection: "column" }}>
          <div className="manager-panel-head" style={{ flexShrink: 0, padding: "16px 22px", borderBottom: `1px solid ${C.line}`, background: "rgba(255,255,255,.52)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div className="manager-status-filter" style={{ height: 38, display: "inline-flex", alignItems: "center", gap: 4, padding: 4, borderRadius: 12, background: "#F8FAFC", border: `1px solid ${C.line}`, boxShadow: "0 8px 22px -18px rgba(15,23,42,.18)" }}>
              {serverMode && [
                ["mine", "我的设计单"],
                ["public", "公开浏览"],
              ].map(([key, label]) => (
                <button key={key} type="button" className="manager-tab" data-active={scope === key ? "true" : "false"} onClick={() => onScopeChange?.(key)}
                  style={{ height: 28, border: "none", borderRadius: 9, padding: "0 12px", background: scope === key ? C.indigoSoft : "transparent", color: scope === key ? C.indigo : C.soft, fontFamily: sans, fontSize: 12, fontWeight: 850, cursor: "pointer", transition: "background .16s,color .16s" }}>{label}</button>
              ))}
              {serverMode && <span style={{ width: 1, height: 18, background: C.line, margin: "0 4px" }} />}
              {[
                ["all", "全部", tabCounts.all],
                ["writing", "编写中", tabCounts.writing],
                ["done", "已完成", tabCounts.done],
              ].map(([key, label, count]) => (
                <button key={key} type="button" className="manager-tab" data-active={filter === key ? "true" : "false"} onClick={() => setFilter(key)}
                  style={{ height: 28, border: "none", borderRadius: 9, padding: "0 12px", background: filter === key ? C.indigoSoft : "transparent", color: filter === key ? C.indigo : C.soft, fontFamily: sans, fontSize: 12, fontWeight: 850, cursor: "pointer", transition: "background .16s,color .16s" }}>{label}（{count}）</button>
              ))}
            </div>
            <div className="manager-actions" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <label className="manager-search" style={{ width: 240, height: 34, borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", color: C.faint }}>
                <ManagerIcon name="search" size={15} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索设计单..." style={{ minWidth: 0, flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: sans, color: C.ink, fontSize: 12.5 }} />
              </label>
              <label className="manager-date-filter" style={{ height: 34, display: "inline-flex", alignItems: "center", border: `1px solid ${C.line}`, borderRadius: 10, background: C.surface, padding: "0 10px 0 12px", color: C.soft, fontSize: 12.5, fontWeight: 750 }}>
                <span style={{ position: "relative", height: "100%", display: "inline-flex", alignItems: "center" }}>
                  <select value={dateScope} onChange={(e) => setDateScope(e.target.value)} style={{ height: "100%", minWidth: 58, border: "none", background: "transparent", color: C.soft, fontFamily: sans, fontSize: 12.5, fontWeight: 750, padding: "0 18px 0 0", outline: "none", cursor: "pointer", appearance: "none", WebkitAppearance: "none", MozAppearance: "none" }}>
                    {dateScopeOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <span style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: C.soft, pointerEvents: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <ManagerIcon name="chevron" size={14} />
                  </span>
                </span>
              </label>
            </div>
          </div>
          <div className="manager-list-scroll manager-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
            <div className="manager-list-table" style={{ minWidth: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: MANAGER_LIST_GRID, alignItems: "center", minHeight: 46, padding: "0 22px", borderBottom: `1px solid ${C.line}`, background: "rgba(248,250,252,.78)", color: C.soft, fontSize: 11, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase", position: "sticky", top: 0, zIndex: 1 }}>
                <div>需求名称</div>
                <div>产品</div>
                <div>设计单状态</div>
                <div>已产出页面数</div>
                <div>最近编辑</div>
                <div>负责人</div>
              </div>
              {filtered.map((card) => (
                <RequirementListRow key={card.id} card={card} query={debouncedQuery} onOpenCanvas={onOpenCanvas} onContextMenu={openRowMenu} />
              ))}
              {!filtered.length && (
                <div style={{ minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center", color: C.soft, fontWeight: 800 }}>{loading ? "正在加载设计单..." : debouncedQuery.trim() ? "没有找到相关设计单" : scope === "mine" ? "这里还没有你的设计单，点击右上角新建一个。" : "暂无可公开浏览的设计单"}</div>
              )}
            </div>
          </div>
	        </section>
	      </main>
      {rowMenu && typeof document !== "undefined" && createPortal((
        <div data-manager-row-menu="1" onPointerDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", left: rowMenu.x, top: rowMenu.y, zIndex: 1000, width: 172, padding: 6, borderRadius: 14, border: `1px solid ${C.line}`, background: "rgba(255,255,255,.96)", boxShadow: "0 18px 46px rgba(15,23,42,.16)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", fontFamily: sans }}>
          <button type="button" onClick={(e) => runMenuAction(e, onOpenCanvas)}
            style={{ width: "100%", height: 36, border: "none", borderRadius: 10, background: "transparent", color: C.ink, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", fontFamily: sans, fontSize: 13, fontWeight: 800, cursor: "pointer", textAlign: "left" }}>
            <ManagerIcon name="canvas" size={15} />
            打开设计单
          </button>
          <button type="button" disabled={!rowMenu.card?.canEdit || !onDelete} onClick={(e) => runMenuAction(e, onDelete)}
            style={{ width: "100%", height: 36, border: "none", borderRadius: 10, background: "transparent", color: rowMenu.card?.canEdit && onDelete ? C.copper : C.faint, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", fontFamily: sans, fontSize: 13, fontWeight: 800, cursor: rowMenu.card?.canEdit && onDelete ? "pointer" : "not-allowed", textAlign: "left", opacity: rowMenu.card?.canEdit && onDelete ? 1 : 0.66 }}>
            <ManagerIcon name="trash" size={15} />
            删除设计单
          </button>
          {(!rowMenu.card?.canEdit || !onDelete) && (
            <div style={{ padding: "5px 10px 4px", color: C.faint, fontSize: 11, lineHeight: 1.45, fontWeight: 750 }}>只有创建者可以删除</div>
          )}
        </div>
      ), document.body)}
	    </div>
	  );
	}
function ManagerNav({ icon, label, active }) {
  return (
    <button type="button" className="manager-nav" style={{ width: "100%", border: "none", borderRadius: 12, background: active ? "rgba(239,246,255,.68)" : "transparent", color: active ? C.indigo : C.soft, minHeight: 42, padding: "0 10px", display: "flex", alignItems: "center", gap: 10, fontFamily: sans, fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "background .16s,color .16s", flexShrink: 0 }}>
      <ManagerIcon name={icon} size={18} />
      {label}
    </button>
  );
}
function RequirementListRow({ card, query = "", onOpenCanvas, onContextMenu }) {
  const product = getProductMeta(card.product);
  const statusTone = realRequirementStatusTone(card);
  const tone = statusStyles[statusTone] || statusStyles.writing;
  const isCurrent = card.kind === "current";
  const recentEdit = formatRecentEdit(card);
  const ownerLabel = card.ownerName || (Array.isArray(card.owners) && card.owners.length ? card.owners.join("、") : "未设置");
  const ownerInitial = ownerLabel.trim().slice(0, 1).toUpperCase() || "U";
  const open = () => onOpenCanvas?.(card);
  return (
    <button type="button" className="manager-list-row" onClick={open} onContextMenu={(e) => onContextMenu?.(e, card)}
      style={{ width: "100%", border: "none", borderBottom: `1px solid ${C.lineSoft}`, background: isCurrent ? "linear-gradient(90deg,rgba(248,251,255,.72) 0%,rgba(255,255,255,.42) 72%)" : "rgba(255,255,255,.42)", cursor: "pointer", display: "grid", gridTemplateColumns: MANAGER_LIST_GRID, alignItems: "center", minHeight: 64, padding: "0 22px", gap: 0, textAlign: "left", fontFamily: sans, color: C.ink }}>
      <div style={{ minWidth: 0, display: "flex", alignItems: "center" }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, lineHeight: 1.35, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><HighlightedSearchText text={card.title} query={query} /></span>
        </span>
      </div>
      <div>
        <span style={{ display: "inline-flex", alignItems: "center", height: 22, borderRadius: 999, padding: "0 8px", background: `${product.color}12`, color: product.color, fontSize: 11, fontWeight: 900 }}>{product.name}</span>
      </div>
      <div>
        <span style={{ display: "inline-flex", alignItems: "center", height: 22, borderRadius: 999, padding: "0 8px", background: tone.bg, color: tone.text, fontSize: 11, fontWeight: 900 }}>{tone.label}</span>
      </div>
      <div>
        <span style={{ display: "inline-flex", alignItems: "center", height: 22, borderRadius: 999, padding: "0 9px", background: "#F8FAFC", color: C.soft, border: `1px solid ${C.line}`, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>{card.pageCount || 0} 页</span>
      </div>
      <div style={{ color: C.soft, fontSize: 13, fontWeight: 750, whiteSpace: "nowrap" }}>{recentEdit}</div>
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 999, background: C.indigoSoft, color: C.indigo, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 900, flexShrink: 0 }}>{ownerInitial}</span>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.soft, fontSize: 13, fontWeight: 800 }}>{ownerLabel}</span>
      </div>
    </button>
  );
}

function RequirementDetail({ card, onBack, onOpenCanvas, onCreate, currentUser = null, onLogout = null }) {
  const [stage, setStage] = useState(lifecycleStageForCard(card));
  useEffect(() => { setStage(lifecycleStageForCard(card)); }, [card?.id]);
  const product = getProductMeta(card?.product);
  const statusTone = realRequirementStatusTone(card);
  const tone = statusStyles[statusTone] || statusStyles.writing;
  const activeIndex = lifecycleStageIndex[stage] ?? lifecycleStageIndex.canvas;
  const artifacts = requirementArtifacts(card);
  const stageMeta = lifecycleStages.find((item) => item.key === stage) || lifecycleStages[2];
  const stagePanel = {
    discussion: {
      title: "想法讨论",
      lead: "把零散想法先沉到一个需求空间里,Agent 后续可以从聊天、知识库和历史需求里整理出问题定义。",
      items: ["收集原始诉求与相关截图", "标记影响产品和用户场景", "沉淀待确认问题,避免直接跳进方案"],
      action: "继续补充讨论",
    },
    analysis: {
      title: "需求分析",
      lead: card?.description || "聚合业务背景、目标和约束,输出可被设计单消费的分析文档。",
      items: [card?.dataGoals || "补齐数据目标与衡量口径", card?.expGoals || "补齐体验目标与核心路径", "关联历史需求、竞品参考和知识库片段"],
      action: "生成分析草稿",
    },
    prd: {
      title: "PRD 文档",
      lead: "Canvas 里的页面说明、体验目标、流程和原型图会成为 PRD 的结构化来源。",
      items: ["同步页面明细和状态说明", "补齐接口、埋点、异常与验收标准", "按研发视角输出可评审版本"],
      action: "生成 PRD 草稿",
    },
    design: {
      title: "设计协同",
      lead: "设计阶段承接 Canvas 的页面关系,后续可以接入 Figma 或内部设计系统形成高保真产物。",
      items: ["从 Canvas 页面顺序生成设计任务", "同步视觉稿链接和走查问题", "回写改动到需求详情"],
      action: "关联设计任务",
    },
    dev: {
      title: "开发推进",
      lead: "开发阶段关注范围、拆单、接口和风险,让需求文档不只停留在交付链接。",
      items: ["拆分前后端任务与负责人", "跟踪阻塞点和变更记录", "同步开发完成状态"],
      action: "创建开发任务",
    },
    test: {
      title: "测试验收",
      lead: "测试阶段把验收标准、用例和问题回流到同一条需求链路里。",
      items: ["生成主流程和异常用例", "记录缺陷与回归结果", "维护上线前风险清单"],
      action: "生成测试清单",
    },
    launch: {
      title: "上线复盘",
      lead: "上线后回收数据、结论和复盘,成为下一次 Agent 分析可引用的历史需求数据。",
      items: ["记录版本与上线时间", "回看关键指标和用户反馈", "沉淀可复用知识片段"],
      action: "创建复盘记录",
    },
  };
  const currentPanel = stagePanel[stage];
  return (
    <div style={{ height: "100vh", minHeight: "100vh", position: "relative", background: C.paper, backgroundImage: `radial-gradient(${C.grid} 1px, transparent 1px)`, backgroundSize: "24px 24px", color: C.ink, fontFamily: sans, overflow: "hidden" }}>
      <style>{`
        *{box-sizing:border-box}
        .manager-nav:hover{background:rgba(239,246,255,.68)!important;color:${C.indigo}!important}
        .manager-primary-btn:hover{background:#2563EB!important;transform:translateY(-1px)}
        .requirement-stage{transition:background .16s,border-color .16s,color .16s,transform .16s}
        .requirement-stage:hover{background:rgba(239,246,255,.78)!important;border-color:rgba(59,130,246,.28)!important;color:${C.indigo}!important;transform:translateY(-1px)}
        .requirement-card-action:hover,.requirement-ghost-btn:hover{transform:translateY(-1px);box-shadow:0 12px 26px -18px rgba(37,99,235,.5)}
        .manager-scroll::-webkit-scrollbar{display:none}
        .manager-scroll{-ms-overflow-style:none;scrollbar-width:none}
        @media(max-width:1080px){.manager-sidebar{display:none!important}.manager-main{padding:20px!important}.requirement-header{gap:14px;align-items:flex-start!important;flex-direction:column!important}.requirement-grid{grid-template-columns:1fr!important}.requirement-context{display:none!important}}
        @media(max-width:760px){.requirement-stage-rail{grid-template-columns:1fr 1fr!important}.requirement-hero{align-items:flex-start!important;flex-direction:column!important}.requirement-top-actions{width:100%;justify-content:space-between!important}}
      `}</style>
      <ManagerSidebar active="设计单" currentUser={currentUser} onLogout={onLogout} />
      <main className="manager-main" style={{ height: "100vh", minHeight: "100vh", overflow: "hidden", padding: "30px 28px 28px 224px", display: "flex", flexDirection: "column" }}>
        <header className="requirement-header" style={{ flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <button type="button" onClick={onBack} className="requirement-ghost-btn" style={{ height: 30, border: `1px solid ${C.line}`, borderRadius: 999, background: C.glass, color: C.soft, padding: "0 10px", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 12, fontWeight: 800, cursor: "pointer", marginBottom: 12, transition: "transform .16s,box-shadow .16s" }}>
              <ManagerIcon name="back" size={14} />
              返回需求管理
            </button>
            <div className="requirement-hero" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.12, fontWeight: 900, letterSpacing: 0, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card?.title || "未命名需求"}</h1>
              <span style={{ display: "inline-flex", alignItems: "center", height: 24, borderRadius: 999, padding: "0 9px", background: `${product.color}12`, color: product.color, fontSize: 12, fontWeight: 900, flexShrink: 0 }}>{product.name}</span>
              <span style={{ display: "inline-flex", alignItems: "center", height: 24, borderRadius: 999, padding: "0 9px", background: tone.bg, color: tone.text, fontSize: 12, fontWeight: 900, flexShrink: 0 }}>{tone.label}</span>
            </div>
            <p style={{ margin: "8px 0 0", color: C.soft, fontSize: 14, lineHeight: 1.55, maxWidth: 760 }}>{card?.description || "从这里串起需求讨论、分析、Canvas 设计单、PRD、开发、测试和上线。"}</p>
          </div>
          <div className="requirement-top-actions" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <button type="button" className="manager-primary-btn" onClick={onCreate} style={{ height: 38, border: "none", borderRadius: 10, padding: "0 16px", background: C.indigo, color: "#fff", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: sans, fontSize: 13, fontWeight: 850, cursor: "pointer", boxShadow: "0 8px 18px rgba(37,99,235,.18)", transition: "background .16s,transform .16s" }}>
              <ManagerIcon name="plus" size={16} />
              新建需求
            </button>
          </div>
        </header>

        <section className="manager-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="requirement-stage-rail" style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(8,minmax(0,1fr))", gap: 8 }}>
            {lifecycleStages.map((item, index) => {
              const active = item.key === stage;
              const done = index < activeIndex || (item.key === "canvas" && artifacts.some((a) => a.key === "canvas" && a.done));
              return (
                <button key={item.key} type="button" className="requirement-stage" data-active={active ? "true" : "false"} onClick={() => setStage(item.key)}
                  style={{ border: `1px solid ${active ? "rgba(59,130,246,.42)" : C.line}`, borderRadius: 14, background: active ? C.indigoSoft : C.glass, minHeight: 74, padding: "12px 10px", color: active ? C.indigo : C.soft, fontFamily: sans, cursor: "pointer", boxShadow: active ? "0 12px 28px -20px rgba(37,99,235,.65)" : "none", textAlign: "left" }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <ManagerIcon name={item.icon} size={17} />
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: active ? C.indigo : done ? "#22C55E" : C.line, flexShrink: 0 }} />
                  </span>
                  <span style={{ display: "block", marginTop: 8, fontSize: 12.5, lineHeight: 1.2, fontWeight: 900, color: active ? C.indigo : C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
                  <span style={{ display: "block", marginTop: 4, color: C.faint, fontSize: 10.5, lineHeight: 1.25, fontWeight: 700 }}>{done ? "已有产物" : "待推进"}</span>
                </button>
              );
            })}
          </div>

          <div className="requirement-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 14, alignItems: "stretch" }}>
            <div style={{ minWidth: 0, background: C.glass, border: `1px solid ${C.line}`, borderRadius: 20, boxShadow: C.shadow, overflow: "hidden", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
              <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.line}`, background: "rgba(255,255,255,.55)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.indigo, fontSize: 12, fontWeight: 900 }}>
                    <ManagerIcon name={stageMeta.icon} size={16} />
                    当前阶段
                  </div>
                  <h2 style={{ margin: "7px 0 0", fontSize: 22, lineHeight: 1.2, fontWeight: 900, color: C.ink }}>{stage === "canvas" ? "Canvas 设计单" : currentPanel.title}</h2>
                </div>
                {stage === "canvas" && (
                  <button type="button" className="requirement-card-action" onClick={() => onOpenCanvas?.(card)} style={{ height: 38, border: "none", borderRadius: 10, padding: "0 16px", background: C.indigo, color: "#fff", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: sans, fontSize: 13, fontWeight: 850, cursor: "pointer", transition: "transform .16s,box-shadow .16s", boxShadow: "0 8px 18px rgba(37,99,235,.18)", flexShrink: 0 }}>
                    <ManagerIcon name="canvas" size={16} />
                    打开 Canvas 设计单
                  </button>
                )}
              </div>
              {stage === "canvas" ? (
                <div style={{ padding: 22 }}>
                  <p style={{ margin: 0, color: C.soft, fontSize: 14, lineHeight: 1.7, maxWidth: 760 }}>这一阶段直接承接我们已经做好的画布能力:页面节点、跳转关系、文档视图和 MD 视图都仍在原来的 Canvas 工作台内编辑。这里先作为流程里的产物入口和状态摘要。</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginTop: 18 }}>
                    {[
                      ["画布原型", `${card?.pageCount || 0} 个页面节点`, "canvas"],
                      ["文档说明", "页面说明 / 体验目标", "document"],
                      ["MD 交付", "结构化需求链接", "code"],
                    ].map(([title, value, icon]) => (
                      <div key={title} style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: "rgba(248,250,252,.72)", padding: 14, minHeight: 102 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: C.indigoSoft, color: C.indigo, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ManagerIcon name={icon} size={17} /></div>
                        <div style={{ marginTop: 10, fontSize: 13, fontWeight: 900, color: C.ink }}>{title}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: C.soft, fontWeight: 750 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ padding: 22 }}>
                  <p style={{ margin: 0, color: C.soft, fontSize: 14, lineHeight: 1.7, maxWidth: 780 }}>{currentPanel.lead}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginTop: 18 }}>
                    {currentPanel.items.map((item, index) => (
                      <div key={item} style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: "rgba(248,250,252,.72)", padding: 14, minHeight: 112 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 999, background: index === 0 ? C.indigoSoft : "#F1F5F9", color: index === 0 ? C.indigo : C.soft, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900 }}>{index + 1}</div>
                        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5, color: C.ink, fontWeight: 850 }}>{item}</div>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="requirement-ghost-btn" style={{ marginTop: 18, height: 36, borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, color: C.soft, padding: "0 14px", fontFamily: sans, fontSize: 12.5, fontWeight: 850, cursor: "pointer", transition: "transform .16s,box-shadow .16s" }}>{currentPanel.action}</button>
                </div>
              )}
            </div>

            <aside className="requirement-context" style={{ background: C.glass, border: `1px solid ${C.line}`, borderRadius: 20, boxShadow: C.shadow, overflow: "hidden", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
              <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.line}`, background: "rgba(255,255,255,.55)" }}>
                <div style={{ color: C.faint, fontSize: 10, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase" }}>Agent Context</div>
                <h3 style={{ margin: "6px 0 0", fontSize: 18, lineHeight: 1.25, fontWeight: 900 }}>需求上下文</h3>
              </div>
              <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.ink, marginBottom: 8 }}>当前判断</div>
                  <div style={{ color: C.soft, fontSize: 12.5, lineHeight: 1.65 }}>这是一个以 {product.name} 为归属产品的需求,当前最明确的结构化产物是 {lifecycleStageLabel(lifecycleStageForCard(card))}。</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.ink, marginBottom: 8 }}>知识引用</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {["历史需求", "产品知识库", "用户反馈", "指标口径"].map((item) => (
                      <span key={item} style={{ height: 24, display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#F8FAFC", border: `1px solid ${C.line}`, padding: "0 8px", color: C.soft, fontSize: 11, fontWeight: 800 }}>{item}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.ink, marginBottom: 8 }}>待确认问题</div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: C.soft, fontSize: 12.5, lineHeight: 1.7, fontWeight: 750 }}>
                    <li>成功标准是否已有可追踪指标?</li>
                    <li>是否存在需要提前同步研发的边界?</li>
                    <li>是否需要从历史需求复用页面结构?</li>
                  </ul>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ============ 主应用 ============ */
export default function PRDCanvas({ initialWorkspace = "manager", standaloneCanvas = false, apiClient = null, currentUser = null, onLogout = null } = {}) {
  const [doc, setDoc] = useState(null);
  const [workspace, setWorkspace] = useState(standaloneCanvas ? "workbench" : initialWorkspace); // manager | requirement | workbench
  const [activeRequirement, setActiveRequirement] = useState(null);
  const [activeDesign, setActiveDesign] = useState(null);
  const [serverDesigns, setServerDesigns] = useState([]);
  const [comments, setComments] = useState([]);
  const [managerScope, setManagerScope] = useState("mine");
  const [managerLoading, setManagerLoading] = useState(false);
  const [mode, setMode] = useState("canvas"); // canvas | doc | export
  const [setup, setSetup] = useState(false);
  const [sel, setSel] = useState(null); // 选中节点 id
  const [detail, setDetail] = useState(null); // 打开详情的节点 id
  const [docFocusTarget, setDocFocusTarget] = useState(null); // 从画布跳转到文档中的目标节点
  const [toast, setToast] = useState(null);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const histRef = useRef([]); // 撤销栈:历史 doc 快照
  const clipRef = useRef(null); // 复制的节点(画布内复制)
  const docRef = useRef(doc); docRef.current = doc;
  const selRef = useRef(sel); selRef.current = sel;
  const modeRef = useRef(mode); modeRef.current = mode;
  const detailRef = useRef(detail); detailRef.current = detail;
  const apiMode = !!apiClient && !!currentUser;
  const activeDesignRef = useRef(activeDesign); activeDesignRef.current = activeDesign;

  const showToast = useCallback((message) => {
    setToast({ id: Date.now(), message });
  }, []);

  const refreshServerDesigns = useCallback(async (scope = "mine") => {
    if (!apiClient) return;
    setManagerLoading(true);
    try {
      const result = await apiClient.listDesigns(scope);
      setServerDesigns(result.designs || []);
    } catch (error) {
      showToast?.(error.message || "设计单列表加载失败");
    } finally {
      setManagerLoading(false);
    }
  }, [apiClient, showToast]);

  const loadDesignComments = useCallback(async (designId) => {
    if (!apiMode || !apiClient || !designId) {
      setComments([]);
      return [];
    }
    try {
      const result = await apiClient.listComments(designId);
      const list = Array.isArray(result?.comments) ? result.comments : [];
      setComments(list);
      return list;
    } catch (error) {
      showToast(error.message || "评论加载失败");
      setComments([]);
      return [];
    }
  }, [apiMode, apiClient, showToast]);

  useEffect(() => {
    (async () => {
      if (apiMode) {
        apiClient.setCurrentDesignId(null);
        setDoc(normalizeDoc(blankDoc()));
        setComments([]);
        refreshServerDesigns("mine");
        return;
      }
      const d = normalizeDoc((await load()) || blankDoc());
      setDoc(d);
      setComments([]);
    })();
  }, [apiMode, apiClient, refreshServerDesigns]);
  useEffect(() => {
    if (standaloneCanvas && doc && !doc.meta?.setupDone) setSetup(true);
  }, [standaloneCanvas, doc]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // 普通更新:记录历史(用于撤销)
  const update = useCallback((next) => {
    const prev = docRef.current;
    if (prev) { histRef.current.push(prev); if (histRef.current.length > 60) histRef.current.shift(); }
    const touched = touchDoc(next);
    setDoc(touched); save(touched);
  }, []);
  // 不记历史的更新(用于撤销自身)
  const setDocSilent = useCallback((next) => { const touched = touchDoc(next); setDoc(touched); save(touched); }, []);

  const undo = useCallback(() => {
    if (!histRef.current.length) return;
    const prev = histRef.current.pop();
    setDocSilent(prev);
  }, [setDocSilent]);

  const openDocNode = useCallback((id) => {
    if (!id) return;
    setDetail(null);
    setDocFocusTarget({ id, nonce: Date.now() });
    setMode("doc");
    setWorkspace("workbench");
  }, []);

  const openWorkbench = useCallback((nextMode = "canvas") => {
    setMode(nextMode);
    setWorkspace("workbench");
    window.setTimeout(() => {
      if (!docRef.current?.meta?.setupDone) setSetup(true);
    }, 0);
  }, []);

  const handleSubmitSuccess = useCallback(() => {
    setActiveRequirement(null);
    if (apiMode) {
      window.setTimeout(() => refreshServerDesigns(managerScope), 120);
    }
    if (!standaloneCanvas) setWorkspace("manager");
    showToast("设计单已提交成功");
  }, [apiMode, refreshServerDesigns, managerScope, showToast, standaloneCanvas]);

  const startSubmittedEdit = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    const submittedAt = current.meta?.submittedAt || "";
    update({
      ...current,
      meta: {
        ...current.meta,
        requirementStatus: "writing",
        submittedAt: "",
        previousSubmittedAt: submittedAt || current.meta?.previousSubmittedAt || "",
        submissionChecklist: {},
      },
    });
    setEditConfirmOpen(false);
    showToast("已进入二次编辑，Checklist 已重置");
  }, [showToast, update]);

  const replaceCurrentDoc = useCallback((nextDoc, { openSetup = false } = {}) => {
    const normalized = normalizeDoc(nextDoc);
    histRef.current = [];
    setDocSilent(normalized);
    setSel(null);
	    setDetail(null);
	    setActiveRequirement(null);
	    setDocFocusTarget(null);
	    setComments([]);
	    setMode("canvas");
    setWorkspace("workbench");
    setSetup(openSetup);
  }, [setDocSilent]);

  const confirmReplaceCurrentDoc = useCallback((message) => {
    const current = docRef.current;
    if (!docHasContent(current)) return true;
    return window.confirm(message || "这会替换当前本地打开的需求画布,继续吗?");
  }, []);

  const createBlankRequirement = useCallback(async () => {
    if (apiMode) {
      const next = normalizeDoc(blankDoc());
      next.meta = {
        ...next.meta,
        createdBy: currentUser?.displayName || next.meta.createdBy,
        ownerId: currentUser?.id || "",
        setupDone: false,
      };
      try {
        const result = await apiClient.createDesign(next);
        apiClient.setCurrentDesignId(result.design.id);
        histRef.current = [];
	        setDoc(normalizeDoc(result.doc));
	        setActiveDesign(result.design);
	        setComments([]);
	        setActiveRequirement(null);
        setDocFocusTarget(null);
        setSel(null);
        setDetail(null);
        setMode("canvas");
        setWorkspace("workbench");
        setSetup(true);
        setManagerScope("mine");
        refreshServerDesigns("mine");
        return;
      } catch (error) {
        showToast(error.message || "新建设计单失败");
        return;
      }
    }
    if (!confirmReplaceCurrentDoc("新建设计单会替换当前本地打开的画布。确认继续吗?")) return;
    replaceCurrentDoc(blankDoc(), { openSetup: true });
  }, [apiMode, apiClient, currentUser, refreshServerDesigns, showToast, confirmReplaceCurrentDoc, replaceCurrentDoc]);

  const createRequirementFromSeed = useCallback((seed) => {
    if (!seed) return;
    if (!confirmReplaceCurrentDoc(`使用「${seed.title}」创建画布会替换当前本地打开的需求。确认继续吗?`)) return;
    replaceCurrentDoc(seedRequirementDoc(seed), { openSetup: false });
  }, [confirmReplaceCurrentDoc, replaceCurrentDoc]);

  const openRequirementDetail = useCallback((card) => {
    setActiveRequirement(card || currentRequirementCard(docRef.current));
    setWorkspace("requirement");
  }, []);

  const changeManagerScope = useCallback((nextScope) => {
    setManagerScope(nextScope);
    refreshServerDesigns(nextScope);
  }, [refreshServerDesigns]);

  const returnToManager = useCallback(() => {
    if (apiMode) refreshServerDesigns(managerScope);
    setWorkspace("manager");
  }, [apiMode, refreshServerDesigns, managerScope]);

  const openRequirementCanvas = useCallback(async (card) => {
    if (apiMode && card?.kind === "server") {
      try {
        const result = await apiClient.getDesign(card.id);
        apiClient.setCurrentDesignId(card.id);
        histRef.current = [];
	        setDoc(normalizeDoc(result.doc));
	        setActiveDesign(result.design);
	        void loadDesignComments(result.design.id);
	        setActiveRequirement(null);
        setDocFocusTarget(null);
        setSel(null);
        setDetail(null);
        setMode("canvas");
        setWorkspace("workbench");
        setSetup(false);
      } catch (error) {
        showToast(error.message || "设计单加载失败");
      }
      return;
    }
    if (!card || card.kind === "current") {
      openWorkbench("canvas");
      return;
    }
    createRequirementFromSeed(card);
	  }, [apiMode, apiClient, createRequirementFromSeed, loadDesignComments, openWorkbench, showToast]);

  const deleteRequirement = useCallback(async (card) => {
    if (!apiMode || !apiClient || !card?.id) return;
    if (!card.canEdit) {
      showToast("只有创建者可以删除这个设计单");
      return;
    }
    const ok = window.confirm(`确认删除「${card.title || "未命名设计单"}」吗？删除后这份设计单和相关上传资源将不可恢复。`);
    if (!ok) return;
    try {
      await apiClient.deleteDesign(card.id);
      if (activeDesignRef.current?.id === card.id) {
        apiClient.setCurrentDesignId(null);
        setActiveDesign(null);
        setActiveRequirement(null);
        setComments([]);
        setDoc(normalizeDoc(blankDoc()));
      }
      await refreshServerDesigns(managerScope);
      showToast("设计单已删除");
    } catch (error) {
      showToast(error.message || "删除设计单失败");
    }
  }, [apiMode, apiClient, refreshServerDesigns, managerScope, showToast]);

  const addDocComment = useCallback(async ({ anchor, content }) => {
    const text = String(content || "").trim();
    if (!text) {
      showToast("评论内容不能为空");
      return null;
    }
    const designId = activeDesignRef.current?.id || apiClient?.getCurrentDesignId?.();
    if (apiMode && apiClient && designId) {
      try {
        const result = await apiClient.createComment(designId, { anchor, content: text });
        const comment = result?.comment;
        if (comment) setComments((prev) => [...prev, comment]);
        showToast("评论已添加");
        return comment || null;
      } catch (error) {
        showToast(error.message || "评论添加失败");
        return null;
      }
    }
    const comment = {
      id: uid(),
      designId: "local",
      authorId: currentUser?.id || "local",
      authorName: currentUser?.displayName || LOCAL_USER_NAME,
      anchor,
      content: text,
      createdAt: nowISO(),
    };
    setComments((prev) => [...prev, comment]);
    showToast("评论已添加");
    return comment;
  }, [apiMode, apiClient, currentUser, showToast]);

  // 键盘快捷键(顶层只管撤销;节点删除/复制由画布处理以支持多选)
  useEffect(() => {
    function onKey(e) {
      if (modeRef.current !== "canvas") return;
      const t = e.target;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === "z" || e.key === "Z")) { if (typing) return; e.preventDefault(); undo(); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  if (!doc) return <div style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", color: C.soft, fontFamily: sans }}>载入中…</div>;
  const canEditCurrent = !apiMode || !!activeDesign?.canEdit;
  const readOnly = !canEditCurrent || isSubmittedDoc(doc);
  const managerCards = apiMode ? serverDesigns.map(designSummaryToCard) : null;

  if (workspace === "manager") {
    return (
      <>
        <RequirementManager
          doc={doc}
          onOpenCanvas={openRequirementCanvas}
          onCreate={createBlankRequirement}
          onDelete={deleteRequirement}
          serverCards={managerCards}
          serverMode={apiMode}
          scope={managerScope}
          onScopeChange={changeManagerScope}
          currentUser={currentUser}
          onLogout={onLogout}
          loading={managerLoading}
        />
        <AppToast toast={toast} />
      </>
    );
  }

  if (workspace === "requirement") {
    const detailCard = activeRequirement?.kind === "current" ? currentRequirementCard(doc) : activeRequirement || currentRequirementCard(doc);
    return (
      <>
        <RequirementDetail card={detailCard} onBack={returnToManager} onOpenCanvas={openRequirementCanvas} onCreate={createBlankRequirement} currentUser={currentUser} onLogout={onLogout} />
        <AppToast toast={toast} />
      </>
    );
  }

  return (
    <div style={{ minHeight: "100vh", height: "100vh", background: C.paper, fontFamily: sans, color: C.ink, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`*{box-sizing:border-box} textarea::placeholder,input::placeholder{color:${C.faint}} .scl::-webkit-scrollbar{width:6px;height:6px}.scl::-webkit-scrollbar-track{background:transparent}.scl::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:999px}.scl::-webkit-scrollbar-thumb:hover{background:#94A3B8}
        .doc-tool-btn:hover{background:${C.indigoSoft}!important;border-color:rgba(59,130,246,.34)!important;color:${C.indigo}!important;box-shadow:0 10px 18px -14px rgba(37,99,235,.6)!important;transform:translateY(-1px)!important}
        .doc-tool-btn:active{background:rgba(59,130,246,.16)!important;border-color:rgba(59,130,246,.5)!important;color:${C.indigo}!important;box-shadow:inset 0 2px 8px rgba(37,99,235,.14)!important;transform:scale(.94)!important}
        .doc-table-resizer[data-hot="1"] .doc-table-resizer-line,.doc-table-resizer[data-active="1"] .doc-table-resizer-line{background:${C.indigo}!important;width:3px!important;box-shadow:0 0 0 4px rgba(59,130,246,.12)!important}
        .doc-table-resizer[data-hot="1"] .doc-table-resizer-arrows,.doc-table-resizer[data-active="1"] .doc-table-resizer-arrows{opacity:1!important;transform:translate(-50%,-50%) scale(1)!important}
        .rte[data-empty="1"]:before{content:attr(data-ph);color:${C.faint};pointer-events:none}
        .rte{outline:none;min-width:0;overflow-wrap:anywhere;word-break:break-word}.rte ul,.rte ol{margin:4px 0;padding-left:24px;list-style-position:outside}
        .rte ul{list-style-type:disc}.rte ol{list-style-type:decimal}.rte li{margin:2px 0;display:list-item}
        .rte mark{background:#FCE9A6;color:inherit;border-radius:2px;padding:0 1px}
        .rte h1{font-size:30px;line-height:1.2;margin:18px 0 10px;font-weight:800;color:${C.ink};letter-spacing:0}
        .rte h2{font-size:23px;line-height:1.3;margin:16px 0 8px;font-weight:750;color:#1E293B;letter-spacing:0}
        .rte h3{font-size:18px;line-height:1.35;margin:14px 0 6px;font-weight:700;color:#334155;letter-spacing:0}
        .rte a{color:${C.indigo};text-decoration:underline;text-underline-offset:3px}
        .rte img{max-width:100%;min-width:${RTE_IMAGE_MIN_W}px;height:auto;display:block;border-radius:16px;border:1px solid ${C.line};margin:12px 0;background:${C.lineSoft};box-shadow:0 8px 24px rgba(15,23,42,.08);cursor:pointer}
        .rte [data-rte-image-row="1"]{display:flex;flex-wrap:wrap;align-items:flex-start;gap:12px 10px;margin:12px 0;clear:both;user-select:none}
        .rte [data-rte-image-row="1"] img{flex:0 0 auto;margin:0}
        .rte [data-rte-text-line="1"]{min-height:1.8em}
        .doc-hide-scrollbar::-webkit-scrollbar{display:none}.doc-hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
        @media(max-width:1180px){.doc-toc-panel{display:none}.doc-editor-workbench{padding-right:20px!important}.doc-article{padding-left:36px!important;padding-right:36px!important}}
        @media(max-width:860px){.doc-toolbar-panel{display:none}.doc-editor-workbench{padding:16px!important}.doc-article{padding:36px 22px!important}}
        .rte strong,.rte b{font-weight:700}
        @keyframes flowDash{to{stroke-dashoffset:-12}}
        @keyframes nodeDetailSlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

      <header style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", gap: 16, padding: "14px 18px 10px", background: C.canvas, zIndex: 30, flexShrink: 0 }}>
        <div style={{ justifySelf: "start", width: "fit-content", maxWidth: "100%", display: "flex", alignItems: "center", gap: 8, minWidth: 0, background: C.glass, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 10px", boxShadow: C.shadow, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
          {!standaloneCanvas && (
	            <button type="button" title="返回需求管理" aria-label="返回需求管理" onClick={returnToManager} style={{ width: 26, height: 26, borderRadius: 999, border: "none", background: C.indigoSoft, color: C.indigo, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <ManagerIcon name="back" size={15} />
            </button>
          )}
          <CanvasLogoMark size={22} color={C.indigo} />
          <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 14, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{doc.meta.name || "需求画布"}</span>
          <span style={{ color: C.line }}> / </span>
          <button type="button" disabled={readOnly} title={readOnly ? "已完成设计单处于阅读状态" : "需求信息"} onClick={() => { if (!readOnly) setSetup(true); }}
            style={{ border: "none", background: "transparent", color: readOnly ? C.faint : C.soft, fontSize: 12.5, fontWeight: 600, cursor: readOnly ? "default" : "pointer", padding: "4px 7px", borderRadius: 8 }}>需求信息</button>
        </div>
        <div style={{ justifySelf: "center", display: "flex", alignItems: "center", gap: 6, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 8px", background: C.glass, boxShadow: C.shadow, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
          {[["canvas", "画布视图"], ["doc", "文档视图"], ["export", "导出视图"]].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} style={{ border: "none", height: 30, padding: "0 15px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", fontFamily: sans, fontWeight: 700, background: mode === k ? C.indigoSoft : "transparent", color: mode === k ? C.indigo : C.soft, boxShadow: "none", transition: "background .18s, color .18s" }}>{l}</button>
          ))}
        </div>
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <SubmitBtn doc={doc} update={update} onSubmitted={handleSubmitSuccess} onRequestEdit={() => setEditConfirmOpen(true)} canEdit={canEditCurrent} />
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {mode === "canvas" && <Canvas doc={doc} update={update} updateSilent={setDocSilent} pushHistory={() => { const p = docRef.current; if (p) { histRef.current.push(p); if (histRef.current.length > 60) histRef.current.shift(); } }} sel={sel} setSel={setSel} openDetail={setDetail} openDocNode={openDocNode} getClip={() => clipRef.current} setClip={(v) => { clipRef.current = v; }} readOnly={readOnly} />}
        {mode === "doc" && <DocView doc={doc} update={update} onOpenCanvas={() => setMode("canvas")} focusNodeTarget={docFocusTarget} onFocusNodeHandled={() => setDocFocusTarget(null)} readOnly={readOnly} comments={comments} onAddComment={addDocComment} currentUser={currentUser} />}
        {mode === "export" && <ExportViewPane doc={doc} apiClient={apiClient} activeDesign={activeDesign} onToast={showToast} />}
      </div>

      {!readOnly && setup && <SetupModal doc={doc} onSave={(meta) => { update({ ...doc, meta: { ...doc.meta, ...meta, setupDone: true } }); setSetup(false); }} onSkip={() => { update({ ...doc, meta: { ...doc.meta, setupDone: true } }); setSetup(false); }} />}
      {!readOnly && detail && <NodeDetail node={doc.nodes.find((n) => n.id === detail)} onClose={() => setDetail(null)} onSave={(patch) => update({ ...doc, nodes: doc.nodes.map((n) => (n.id === detail ? { ...n, ...patch } : n)) })} />}
      {editConfirmOpen && <EditSubmittedConfirmModal onCancel={() => setEditConfirmOpen(false)} onConfirm={startSubmittedEdit} />}
      <AppToast toast={toast} />
    </div>
  );
}

export function DesignCanvasOnly() {
  return <PRDCanvas initialWorkspace="workbench" standaloneCanvas />;
}

/* ============ 画布 ============ */
function Canvas({ doc, update, updateSilent, pushHistory, sel, setSel, openDetail, openDocNode, getClip, setClip, readOnly = false }) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [pan, setPan] = useState(null);
  const [drag, setDrag] = useState(null); // {ids:[], off:{id:{dx,dy}}, moved, canDropToGroup}
  const [dropGroupId, setDropGroupId] = useState(null); // 拖拽未成组节点时,当前可落入的目标组
  const [linking, setLinking] = useState(null); // {node, dir:'out'|'in', x, y}
  const [dragOver, setDragOver] = useState(false); // 外部文件拖入高亮
  const [imageDropNodeId, setImageDropNodeId] = useState(null); // 外部图片拖到节点上时高亮该节点
  const [selEdge, setSelEdge] = useState(null); // 选中的连线 id
  const [hoverEdge, setHoverEdge] = useState(null); // 悬停的连线 id
  const [spaceDown, setSpaceDown] = useState(false); // 空格抓手(用于光标)
  const [selIds, setSelIds] = useState([]); // 多选节点 id
  const [marquee, setMarquee] = useState(null); // 框选 {x0,y0,x1,y1}(世界坐标)
  const [ctxMenu, setCtxMenu] = useState(null); // 右键菜单 {x,y}(客户端坐标)
  const [groupColorMenu, setGroupColorMenu] = useState(null); // 正在展开色板的分组 id
  const [pasteImageChoice, setPasteImageChoice] = useState(null); // 粘贴图片且单选节点时,让用户决定替换或新建
  const spaceRef = useRef(false);
  const wrapRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 }); // 最近的客户端坐标,用于粘贴落点
  const selIdsRef = useRef(selIds); selIdsRef.current = selIds;
  const pasteImageChoiceRef = useRef(null);

  // 单选时同步顶层 sel(兼容);多选时置空
  useEffect(() => { setSel(selIds.length === 1 ? selIds[0] : null); }, [selIds, setSel]);
  const selectOnly = (id) => { setSelIds(id ? [id] : []); setSelEdge(null); };
  const toggleSel = (id) => setSelIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const groupOf = (nid) => doc.groups.find((g) => g.nodeIds.includes(nid));
  const idsAllUngrouped = (ids, groups = doc.groups) => ids.length > 0 && ids.every((id) => !groups.some((g) => g.nodeIds.includes(id)));

  // 空格 = 抓手平移:按住时任意位置拖拽都平移画布
  useEffect(() => {
    function kd(e) {
      if (e.code === "Space" || e.key === " ") {
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        if (!spaceRef.current) { spaceRef.current = true; setSpaceDown(true); }
      }
    }
    function ku(e) { if (e.code === "Space" || e.key === " ") { spaceRef.current = false; setSpaceDown(false); } }
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []);

  const toWorld = (cx, cy) => { const r = wrapRef.current.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }; };
  function measureRatio(dataUrl) { return new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalHeight / im.naturalWidth); im.onerror = () => res(null); im.src = dataUrl; }); }
  function startPan(e) { setPan({ sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }); }

  function onWheel(e) {
    e.preventDefault();
    const r = wrapRef.current.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const k2 = Math.min(2, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    const x2 = mx - ((mx - view.x) * k2) / view.k;
    const y2 = my - ((my - view.y) * k2) / view.k;
    setView({ x: x2, y: y2, k: k2 });
  }
  const isBg = (e) => e.target === wrapRef.current || (e.target.dataset && e.target.dataset.bg);
  function bgDown(e) {
    setCtxMenu(null);
    setGroupColorMenu(null);
    if (e.button !== 0) return;
    if (spaceRef.current) { startPan(e); return; }
    if (isBg(e)) {
      if (e.shiftKey) { const w = toWorld(e.clientX, e.clientY); setMarquee({ x0: w.x, y0: w.y, x1: w.x, y1: w.y }); return; }
      startPan(e); setSelIds([]); setSelEdge(null);
    }
  }
  function move(e) {
    mouseRef.current = { x: e.clientX, y: e.clientY };
    if (pan) setView((v) => ({ ...v, x: pan.vx + (e.clientX - pan.sx), y: pan.vy + (e.clientY - pan.sy) }));
    if (marquee) { const w = toWorld(e.clientX, e.clientY); setMarquee((m) => ({ ...m, x1: w.x, y1: w.y })); }
    if (drag) {
      if (!drag.moved) { pushHistory(); drag.moved = true; }
      const w = toWorld(e.clientX, e.clientY);
      const targetGroupId = drag.canDropToGroup ? findDropGroup(w, drag.ids) : null;
      setDropGroupId((prev) => (prev === targetGroupId ? prev : targetGroupId));
      updateSilent({ ...doc, nodes: doc.nodes.map((n) => { const o = drag.off[n.id]; return o ? { ...n, x: w.x - o.dx, y: w.y - o.dy } : n; }) });
    }
    if (linking) {
      const w = toWorld(e.clientX, e.clientY);
      const hit = doc.nodes.find((n) => n.id !== linking.node && w.x >= n.x && w.x <= n.x + NODE_W && w.y >= n.y && w.y <= n.y + nodeH(n));
      setLinking({ ...linking, x: w.x, y: w.y, target: hit ? hit.id : null });
    }
  }
  function up(e) {
    if (marquee) {
      const x0 = Math.min(marquee.x0, marquee.x1), x1 = Math.max(marquee.x0, marquee.x1);
      const y0 = Math.min(marquee.y0, marquee.y1), y1 = Math.max(marquee.y0, marquee.y1);
      const hit = doc.nodes.filter((n) => n.x + NODE_W > x0 && n.x < x1 && n.y + nodeH(n) > y0 && n.y < y1).map((n) => n.id);
      setSelIds((prev) => Array.from(new Set([...(e.shiftKey ? prev : []), ...hit])));
      setMarquee(null);
    }
    if (linking) {
      const w = toWorld(e.clientX, e.clientY);
      const target = doc.nodes.find((n) => n.id !== linking.node && w.x >= n.x && w.x <= n.x + NODE_W && w.y >= n.y && w.y <= n.y + nodeH(n));
      const src = doc.nodes.find((n) => n.id === linking.node);
      const addEdge = (from, to) => { if (from !== to && !doc.edges.some((ed) => ed.from === from && ed.to === to)) return [...doc.edges, { id: uid(), from, to, label: "" }]; return doc.edges; };
      if (target) {
        const edges = linking.dir === "out" ? addEdge(linking.node, target.id) : addEdge(target.id, linking.node);
        update({ ...doc, edges });
      } else {
        let nx;
        if (linking.dir === "out") nx = src ? Math.max(w.x, src.x + LINK_DX) : w.x;
        else nx = src ? Math.min(w.x - NODE_W, src.x - LINK_DX) : w.x - NODE_W;
        const ny = src ? (w.y > src.y - 200 && w.y < src.y + 200 ? src.y : w.y - 35) : w.y - 35;
        const node = { id: uid(), x: nx, y: ny, name: "", note: "", expGoal: "", proto: null, competitors: [] };
        const edges = linking.dir === "out"
          ? [...doc.edges, { id: uid(), from: linking.node, to: node.id, label: "" }]
          : [...doc.edges, { id: uid(), from: node.id, to: linking.node, label: "" }];
        update({ ...doc, nodes: [...doc.nodes, node], edges });
        selectOnly(node.id);
      }
      setLinking(null);
    }
    if (drag && drag.moved && drag.canDropToGroup) {
      const w = toWorld(e.clientX, e.clientY);
      const targetGroupId = findDropGroup(w, drag.ids);
      if (targetGroupId) {
        const d0 = docRef.current;
        const ids = drag.ids.filter((id) => d0.nodes.some((n) => n.id === id));
        if (idsAllUngrouped(ids, d0.groups)) {
          updateSilent({
            ...d0,
            groups: d0.groups.map((g) => (
              g.id === targetGroupId ? { ...g, nodeIds: Array.from(new Set([...g.nodeIds, ...ids])) } : g
            )),
          });
        }
      }
    }
    setPan(null); setDrag(null); setDropGroupId(null);
  }
  function dblBg(e) {
    if (spaceRef.current) return;
    if (readOnly) return;
    if (isBg(e)) {
      const w = toWorld(e.clientX, e.clientY);
      const id = uid();
      update({ ...doc, nodes: [...doc.nodes, { id, x: w.x - NODE_W / 2, y: w.y - 35, name: "", note: "", expGoal: "", proto: null, competitors: [] }] });
      selectOnly(id);
    }
  }
  function nodeDown(e, n) {
    e.stopPropagation();
    setCtxMenu(null);
    setGroupColorMenu(null);
    if (e.button !== 0) return; // 右键不拖动
    if (spaceRef.current) { startPan(e); return; }
    if (e.shiftKey) { toggleSel(n.id); return; }
    // 若点中的是当前多选之一,则整体拖动;否则单选该节点
    let ids = selIdsRef.current.includes(n.id) && selIdsRef.current.length > 1 ? selIdsRef.current : [n.id];
    if (!(selIdsRef.current.includes(n.id) && selIdsRef.current.length > 1)) selectOnly(n.id);
    const w = toWorld(e.clientX, e.clientY);
    const off = {}; ids.forEach((id) => { const nd = doc.nodes.find((x) => x.id === id); if (nd) off[id] = { dx: w.x - nd.x, dy: w.y - nd.y }; });
    setDrag({ ids, off, moved: false, canDropToGroup: !readOnly && idsAllUngrouped(ids) });
  }
  function groupDown(e, g) {
    e.stopPropagation();
    setCtxMenu(null);
    setGroupColorMenu(null);
    if (e.button !== 0) return;
    if (spaceRef.current) { startPan(e); return; }
    const ids = g.nodeIds.filter((id) => doc.nodes.some((n) => n.id === id));
    if (!ids.length) return;
    setSelIds(ids);
    setSelEdge(null);
    const w = toWorld(e.clientX, e.clientY);
    const off = {};
    ids.forEach((id) => {
      const nd = doc.nodes.find((x) => x.id === id);
      if (nd) off[id] = { dx: w.x - nd.x, dy: w.y - nd.y };
    });
    setDrag({ ids, off, moved: false, canDropToGroup: false });
  }
  function onNodeContext(e, n) {
    e.preventDefault(); e.stopPropagation();
    if (readOnly) return;
    if (!selIdsRef.current.includes(n.id)) selectOnly(n.id);
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }
  function startLink(e, n, dir) { e.stopPropagation(); if (spaceRef.current) { startPan(e); return; } if (readOnly) return; const sx = dir === "out" ? n.x + NODE_W : n.x; setLinking({ node: n.id, dir, x: sx, y: anchorY(n) }); }
  // 多选批量操作
  function goToDocSelected() {
    const id = selIdsRef.current[0];
    if (!id) return;
    setCtxMenu(null);
    openDocNode?.(id);
  }
  function changeHtmlPrototypeRatioSelected() {
    if (readOnly) return;
    const id = selIdsRef.current[0];
    const current = docRef.current || doc;
    const node = current.nodes.find((n) => n.id === id);
    if (!node || !isHtmlProto(node)) { setCtxMenu(null); return; }
    setCtxMenu(null);
    const input = window.prompt("输入 HTML 原型展示比例（宽:高），例如 390:844", formatHtmlProtoRatio(node.protoRatio));
    if (input == null) return;
    const nextRatio = parseHtmlProtoRatioInput(input);
    if (!nextRatio) {
      window.alert("请输入有效比例，例如 390:844 或 2.164");
      return;
    }
    update({ ...current, nodes: current.nodes.map((n) => (n.id === node.id ? { ...n, protoRatio: nextRatio } : n)) });
  }
  function deleteSelected() {
    if (readOnly) return;
    const ids = new Set(selIdsRef.current); if (!ids.size) return;
    update({ ...doc, nodes: doc.nodes.filter((n) => !ids.has(n.id)), edges: doc.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to)), groups: doc.groups.map((g) => ({ ...g, nodeIds: g.nodeIds.filter((x) => !ids.has(x)) })).filter((g) => g.nodeIds.length) });
    setSelIds([]); setCtxMenu(null);
  }
  function batchCopy() {
    if (readOnly) return;
    const ids = selIdsRef.current; if (!ids.length) return;
    const map = {}; const clones = ids.map((id) => { const n = doc.nodes.find((x) => x.id === id); const nid = uid(); map[id] = nid; return { ...n, id: nid, x: n.x + 40, y: n.y + 40, competitors: n.competitors.map((c) => ({ ...c, id: uid() })) }; });
    // 复制选区内部的连线
    const innerEdges = doc.edges.filter((e) => map[e.from] && map[e.to]).map((e) => ({ id: uid(), from: map[e.from], to: map[e.to], label: e.label }));
    update({ ...doc, nodes: [...doc.nodes, ...clones], edges: [...doc.edges, ...innerEdges] });
    setSelIds(clones.map((c) => c.id)); setCtxMenu(null);
  }
  function groupSelected() {
    if (readOnly) return;
    const ids = selIdsRef.current.filter((id) => !doc.groups.some((g) => g.nodeIds.includes(id))); // 不重复入组
    if (ids.length < 1) { setCtxMenu(null); return; }
    const colorIdx = doc.groups.length % GROUP_COLORS.length;
    const g = { id: uid(), name: "新分组", nodeIds: ids, colorIdx };
    update({ ...doc, groups: [...doc.groups, g] });
    setCtxMenu(null);
  }
  function ungroup(gid) { if (readOnly) return; update({ ...doc, groups: doc.groups.filter((g) => g.id !== gid) }); }
  function removeFromGroup() {
    if (readOnly) return;
    const ids = new Set(selIdsRef.current); if (!ids.size) { setCtxMenu(null); return; }
    update({ ...doc, groups: doc.groups.map((g) => ({ ...g, nodeIds: g.nodeIds.filter((x) => !ids.has(x)) })).filter((g) => g.nodeIds.length) });
    setCtxMenu(null);
  }
  function renameGroup(gid, name) { if (readOnly) return; update({ ...doc, groups: doc.groups.map((g) => (g.id === gid ? { ...g, name } : g)) }); }
  function setGroupColor(gid, colorIdx) {
    if (readOnly) return;
    update({ ...doc, groups: doc.groups.map((g) => (g.id === gid ? { ...g, colorIdx } : g)) });
  }
  function shareSelected() {
    setCtxMenu(null);
    const ids = selIdsRef.current.length ? selIdsRef.current : doc.nodes.map((n) => n.id);
    const idset = new Set(ids);
    const nodes = doc.nodes.filter((n) => idset.has(n.id));
    if (!nodes.length) return;
    const edges = doc.edges.filter((e) => idset.has(e.from) && idset.has(e.to));
    const pos = computeLayout(nodes, edges);
    const ih = (n) => (n.proto ? NODE_MEDIA_W * (n.protoRatio || 0.55) : 70);
    const nh = (n) => ih(n) + nodeTitleH(n) + nodeDescH(n);
    const P = (n) => pos[n.id] || { x: n.x, y: n.y };
    const routeNodes = nodes.map((n) => ({ ...n, x: P(n).x, y: P(n).y }));
    const routes = buildEdgeRoutes(edges, routeNodes, ih);
    const pad = 50;
    const minX = Math.min(...nodes.map((n) => P(n).x)) - pad, minY = Math.min(...nodes.map((n) => P(n).y)) - pad;
    const maxX = Math.max(...nodes.map((n) => P(n).x + NODE_W)) + pad, maxY = Math.max(...nodes.map((n) => P(n).y + nh(n))) + pad + 120 + routes.maxBackLane * EDGE_BACK_LANE_GAP;
    const W = maxX - minX, H = maxY - minY;
    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const idx = {}; nodes.forEach((n, i) => (idx[n.id] = i + 1));
    let edgeSvg = "";
    edges.forEach((e) => {
      const g = edgeGeometry(e, routes);
      if (!g) return;
      const { path: d, lx, ly, back } = g;
      edgeSvg += `<path d="${d}" fill="none" stroke="${C.indigo}" stroke-width="1.8" marker-end="url(#sa)" opacity="${back ? 0.5 : 0.8}" ${back ? 'stroke-dasharray="6 4"' : ""}/>`;
      if (e.label) edgeSvg += `<rect x="${lx - 44}" y="${ly - 11}" width="88" height="22" rx="6" fill="#fff" stroke="${C.line}"/><text x="${lx}" y="${ly + 4}" font-size="11" fill="${C.soft}" text-anchor="middle" font-family="sans-serif">${esc(e.label).slice(0, 14)}</text>`;
    });
    let nodeSvg = "";
    nodes.forEach((n) => {
      const p = P(n), h = nh(n), imh = ih(n);
      const mediaX = p.x + NODE_INSET, mediaY = p.y + nodeTitleH(n), mediaW = NODE_MEDIA_W;
      const clipId = `proto-${n.id}`;
      const titleLines = nodeTitleLines(n);
      const descLines = nodeDescLines(n);
      const tspans = (lines, x, y, lh) => lines.map((line, i) => `<tspan x="${x}" y="${y + i * lh}">${esc(line)}</tspan>`).join("");
      const mediaRadius = n.proto ? NODE_MEDIA_RADIUS : NODE_EMPTY_MEDIA_RADIUS;
      const mediaPath = smoothRoundRectPath(mediaW, imh, mediaRadius, mediaX, mediaY);
      nodeSvg += `<g><rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${h}" rx="12" fill="#fff" stroke="${C.line}" stroke-width="1.5"/>`;
      nodeSvg += `<text font-size="12.5" font-weight="700" fill="#1E293B" font-family="sans-serif">${tspans(titleLines, p.x + NODE_INSET, p.y + NODE_TITLE_PAD_TOP + 13, NODE_TITLE_LINE_H)}</text>`;
      nodeSvg += `<clipPath id="${clipId}"><path d="${mediaPath}"/></clipPath>`;
      nodeSvg += `<path d="${mediaPath}" fill="#F8FAFC" stroke="${n.proto ? "none" : C.line}" stroke-width="${n.proto ? 0 : 1}"/>`;
      if (n.proto && !isHtmlProto(n)) nodeSvg += `<image href="${n.proto}" x="${mediaX}" y="${mediaY}" width="${mediaW}" height="${imh}" preserveAspectRatio="none" clip-path="url(#${clipId})"/>`;
      if (n.proto && isHtmlProto(n)) {
        nodeSvg += `<rect x="${mediaX + 12}" y="${mediaY + 12}" width="${mediaW - 24}" height="${Math.max(40, imh - 24)}" rx="10" fill="#FFFFFF" stroke="${C.indigo}" stroke-width="1.5" opacity=".92"/>`;
        nodeSvg += `<text x="${mediaX + mediaW / 2}" y="${mediaY + imh / 2 - 5}" font-size="13" font-weight="700" fill="${C.indigo}" text-anchor="middle" font-family="sans-serif">HTML 原型</text>`;
        nodeSvg += `<text x="${mediaX + mediaW / 2}" y="${mediaY + imh / 2 + 15}" font-size="10.5" fill="${C.soft}" text-anchor="middle" font-family="sans-serif">可交互页面文件</text>`;
      }
      if (descLines.length) nodeSvg += `<text font-size="10.5" fill="${C.soft}" font-family="sans-serif">${tspans(descLines, p.x + NODE_INSET, mediaY + imh + NODE_DESC_PAD_TOP + NODE_DESC_LINE_H, NODE_DESC_LINE_H)}</text>`;
      nodeSvg += `</g>`;
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${minX} ${minY} ${W} ${H}"><defs><marker id="sa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" fill="none" stroke="${C.indigo}" stroke-width="1.6"/></marker></defs><rect x="${minX}" y="${minY}" width="${W}" height="${H}" fill="${C.paper}"/>${edgeSvg}${nodeSvg}</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = W * 2; c.height = H * 2;
      const ctx = c.getContext("2d"); ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `flow-${Date.now()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert("导出失败,请重试"); };
    img.src = url;
  }
  function delEdge(id) { if (readOnly) return; update({ ...doc, edges: doc.edges.filter((e) => e.id !== id) }); }
  function setEdgeLabel(id, label) { if (readOnly) return; update({ ...doc, edges: doc.edges.map((e) => (e.id === id ? { ...e, label } : e)) }); }

  const selectedCount = selIds.length;
  const singleSelected = selectedCount === 1 ? doc.nodes.find((n) => n.id === selIds[0]) : null;
  const selectedInGroupCount = selIds.filter((id) => groupOf(id)).length;
  const selectedOutGroupCount = selectedCount - selectedInGroupCount;
  const canGroupSelected = selectedOutGroupCount > 0;
  const canRemoveFromGroup = selectedInGroupCount > 0;
  const groupActionLabel = selectedOutGroupCount === selectedCount
    ? (selectedCount > 1 ? `成组(${selectedCount})` : "成组")
    : `成组未分组(${selectedOutGroupCount})`;
  const removeGroupActionLabel = selectedInGroupCount === selectedCount
    ? "移出组"
    : `移出组内项(${selectedInGroupCount})`;

  const mediaTop = (n) => nodeTitleH(n);
  const imgH = (n) => (n.proto ? NODE_MEDIA_W * (n.protoRatio || 0.55) : 70);
  const nodeH = (n) => imgH(n) + nodeTitleH(n) + nodeDescH(n);
  const anchorY = (n) => n.y + mediaTop(n) + imgH(n) / 2; // 锚点对齐原型图区域中线
  const edgeRoutes = buildEdgeRoutes(doc.edges, doc.nodes, imgH);
  function syncProtoRatio(n, img) {
    if (readOnly) return;
    const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : null;
    if (!Number.isFinite(ratio) || Math.abs(ratio - (n.protoRatio || 0)) < 0.001) return;
    const current = docRef.current || doc;
    update({ ...current, nodes: current.nodes.map((x) => (x.id === n.id ? { ...x, protoRatio: ratio } : x)) });
  }
  // 分组包围盒:随成员节点位置实时计算,故拖动成员时底色块自动适配
  function groupBox(g) {
    const ns = g.nodeIds.map((id) => doc.nodes.find((n) => n.id === id)).filter(Boolean);
    if (!ns.length) return null;
    const padX = 22, padTop = 40, padBottom = 26;
    const x0 = Math.min(...ns.map((n) => n.x)) - padX;
    const y0 = Math.min(...ns.map((n) => n.y)) - padTop;
    const x1 = Math.max(...ns.map((n) => n.x + NODE_W)) + padX;
    const y1 = Math.max(...ns.map((n) => n.y + nodeH(n))) + padBottom;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function findDropGroup(w, ids) {
    if (!idsAllUngrouped(ids)) return null;
    const hit = doc.groups.slice().reverse().find((g) => {
      const b = groupBox(g);
      return b && w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h;
    });
    return hit ? hit.id : null;
  }
  function resolvePasteImageChoice(action) {
    const choice = pasteImageChoiceRef.current;
    pasteImageChoiceRef.current = null;
    setPasteImageChoice(null);
    if (!choice) return;
    if (action === "replace") void choice.replace();
    if (action === "create") void choice.create();
  }
  // 连线几何:正向左→右;回边按避让轨道绕到目标左锚点。
  function edgeGeom(e) { return edgeGeometry(e, edgeRoutes); }
  // 计算分层有向布局的目标坐标
  // 通用分层布局:items=[{id,w,h}],edges=[{from,to}];返回 {id:{x,y}}
  function layeredLayout(items, edges, gapX = 200, gapY = 70) {
    if (!items.length) return {};
    const byId = Object.fromEntries(items.map((it) => [it.id, it]));
    const outAdj = {}, inDeg = {}, preds = {};
    items.forEach((it) => { outAdj[it.id] = []; inDeg[it.id] = 0; preds[it.id] = []; });
    edges.forEach((e) => { if (byId[e.from] && byId[e.to] && e.from !== e.to) { outAdj[e.from].push(e.to); preds[e.to].push(e.from); inDeg[e.to]++; } });
    const connected = items.filter((it) => outAdj[it.id].length || preds[it.id].length);
    const isolated = items.filter((it) => !outAdj[it.id].length && !preds[it.id].length);
    const st = {}; const backSet = new Set();
    function dfs(id) { st[id] = 1; outAdj[id].forEach((to) => { if (st[to] === 1) backSet.add(id + ">" + to); else if (!st[to]) dfs(to); }); st[id] = 2; }
    const seedRoots = connected.filter((it) => inDeg[it.id] === 0).map((it) => it.id);
    (seedRoots.length ? seedRoots : connected.map((it) => it.id)).forEach((id) => { if (!st[id]) dfs(id); });
    const fpreds = {}; connected.forEach((it) => { fpreds[it.id] = []; });
    edges.forEach((e) => { if (byId[e.from] && byId[e.to] && e.from !== e.to && !backSet.has(e.from + ">" + e.to)) fpreds[e.to].push(e.from); });
    const layer = {};
    const fRoots = connected.filter((it) => fpreds[it.id].length === 0).map((it) => it.id);
    (fRoots.length ? fRoots : [connected[0] && connected[0].id]).forEach((s) => { if (s) layer[s] = 0; });
    let changed = true, guard = 0;
    while (changed && guard++ < items.length + 5) {
      changed = false;
      connected.forEach((it) => { const id = it.id; const known = fpreds[id].filter((p) => layer[p] !== undefined); if (known.length) { const want = Math.max(...known.map((p) => layer[p])) + 1; if (layer[id] === undefined || want > layer[id]) { layer[id] = want; changed = true; } } });
      connected.forEach((it) => { if (layer[it.id] === undefined && fpreds[it.id].length) { layer[it.id] = 0; changed = true; } });
    }
    connected.forEach((it) => { if (layer[it.id] === undefined) layer[it.id] = 0; });
    const cols = {}; connected.forEach((it) => { (cols[layer[it.id]] = cols[layer[it.id]] || []).push(it.id); });
    const colKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);
    const orderIndex = {}; colKeys.forEach((l) => cols[l].forEach((id, i) => { orderIndex[id] = i; }));
    for (let pass = 0; pass < 4; pass++) {
      colKeys.forEach((l) => { if (l === colKeys[0]) return; cols[l].sort((a, b) => { const av = preds[a].length ? preds[a].reduce((s, p) => s + (orderIndex[p] ?? 0), 0) / preds[a].length : orderIndex[a] ?? 0; const bv = preds[b].length ? preds[b].reduce((s, p) => s + (orderIndex[p] ?? 0), 0) / preds[b].length : orderIndex[b] ?? 0; return av - bv; }); cols[l].forEach((id, i) => { orderIndex[id] = i; }); });
    }
    const pos = {}; const startX = 80, startY = 80;
    const colW = colKeys.map((l) => Math.max(...cols[l].map((id) => byId[id].w)));
    let x = startX;
    colKeys.forEach((l, ci) => { let y = startY; cols[l].forEach((id) => { pos[id] = { x, y }; y += byId[id].h + gapY; }); x += colW[ci] + gapX; });
    const colHeights = colKeys.map((l) => { const ids = cols[l]; if (!ids.length) return 0; const last = ids[ids.length - 1]; return pos[last].y + byId[last].h - startY; });
    const maxH = Math.max(0, ...colHeights);
    colKeys.forEach((l, ci) => { const off = (maxH - colHeights[ci]) / 2; cols[l].forEach((id) => { pos[id].y += off; }); });
    if (isolated.length) {
      const cc = Math.max(1, Math.min(isolated.length, Math.max(colKeys.length, 4)));
      const baseY = maxH > 0 ? startY + maxH + 160 : startY;
      let rowTop = baseY;
      for (let row = 0; row * cc < isolated.length; row++) {
        const slice = isolated.slice(row * cc, (row + 1) * cc);
        let cx = startX;
        slice.forEach((it) => { pos[it.id] = { x: cx, y: rowTop }; cx += it.w + gapX; });
        rowTop += Math.max(...slice.map((it) => it.h)) + gapY;
      }
    }
    return pos;
  }
  function computeLayout(nodes, edges) {
    return layeredLayout(nodes.map((n) => ({ id: n.id, w: NODE_W, h: nodeH(n) })), edges, 200, 70);
  }
  // 组感知布局:组内单独排版 + 组/单节点/组间统一排版
  function layoutWithGroups(d) {
    const nodeById = Object.fromEntries(d.nodes.map((n) => [n.id, n]));
    const groups = d.groups.filter((g) => g.nodeIds.some((id) => nodeById[id]));
    if (!groups.length) return computeLayout(d.nodes, d.edges);
    const PAD = 22, TOP = 40, PADB = 26;
    const grouped = new Set(); groups.forEach((g) => g.nodeIds.forEach((id) => { if (nodeById[id]) grouped.add(id); }));
    const groupInfo = {};
    groups.forEach((g) => {
      const sub = g.nodeIds.map((id) => nodeById[id]).filter(Boolean);
      const subEdges = d.edges.filter((e) => g.nodeIds.includes(e.from) && g.nodeIds.includes(e.to));
      const lp = computeLayout(sub, subEdges);
      const minX = Math.min(...sub.map((n) => lp[n.id].x)), minY = Math.min(...sub.map((n) => lp[n.id].y));
      const maxX = Math.max(...sub.map((n) => lp[n.id].x + NODE_W)), maxY = Math.max(...sub.map((n) => lp[n.id].y + nodeH(n)));
      const norm = {}; sub.forEach((n) => { norm[n.id] = { x: lp[n.id].x - minX, y: lp[n.id].y - minY }; });
      groupInfo[g.id] = { norm, w: (maxX - minX) + PAD * 2, h: (maxY - minY) + TOP + PADB };
    });
    const blockOf = (nid) => { const g = groups.find((gg) => gg.nodeIds.includes(nid)); return g ? "g:" + g.id : nid; };
    const items = [];
    groups.forEach((g) => items.push({ id: "g:" + g.id, w: groupInfo[g.id].w, h: groupInfo[g.id].h }));
    d.nodes.forEach((n) => { if (!grouped.has(n.id)) items.push({ id: n.id, w: NODE_W, h: nodeH(n) }); });
    const seen = new Set(); const topEdges = [];
    d.edges.forEach((e) => { if (!nodeById[e.from] || !nodeById[e.to]) return; const a = blockOf(e.from), b = blockOf(e.to); if (a !== b) { const k = a + ">" + b; if (!seen.has(k)) { seen.add(k); topEdges.push({ from: a, to: b }); } } });
    const topPos = layeredLayout(items, topEdges, 240, 100);
    const pos = {};
    d.nodes.forEach((n) => { if (!grouped.has(n.id) && topPos[n.id]) pos[n.id] = topPos[n.id]; });
    groups.forEach((g) => { const bp = topPos["g:" + g.id]; if (!bp) return; const gi = groupInfo[g.id]; g.nodeIds.forEach((id) => { if (!nodeById[id]) return; const np = gi.norm[id]; pos[id] = { x: bp.x + PAD + np.x, y: bp.y + TOP + np.y }; }); });
    return pos;
  }

  function tidy() {
    if (readOnly) return;
    const d = docRef.current;
    if (!d.nodes.length) return;
    pushHistory();
    const target = layoutWithGroups(d);
    const from = Object.fromEntries(d.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const t0 = performance.now(), dur = 420;
    function frame(t) {
      const k = Math.min(1, (t - t0) / dur);
      const ease = 1 - Math.pow(1 - k, 3);
      const nodes = docRef.current.nodes.map((n) => {
        const tg = target[n.id]; if (!tg) return n;
        return { ...n, x: from[n.id].x + (tg.x - from[n.id].x) * ease, y: from[n.id].y + (tg.y - from[n.id].y) * ease };
      });
      updateSilent({ ...docRef.current, nodes });
      if (k < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function fitView(pos) {
    const ids = Object.keys(pos); if (!ids.length) return;
    const byId = Object.fromEntries(docRef.current.nodes.map((n) => [n.id, n]));
    const minX = Math.min(...ids.map((id) => pos[id].x)) - 60;
    const minY = Math.min(...ids.map((id) => pos[id].y)) - 60;
    const maxX = Math.max(...ids.map((id) => pos[id].x + NODE_W)) + 60;
    const maxY = Math.max(...ids.map((id) => pos[id].y + nodeH(byId[id]))) + 60;
    const r = wrapRef.current.getBoundingClientRect();
    const k = Math.min(1.1, Math.max(0.3, Math.min(r.width / (maxX - minX), r.height / (maxY - minY))));
    setView({ k, x: (r.width - (maxX - minX) * k) / 2 - minX * k, y: (r.height - (maxY - minY) * k) / 2 - minY * k });
  }

  // 粘贴图片直接建节点
  const docRef = useRef(doc); docRef.current = doc;
  const viewRef = useRef(view); viewRef.current = view;
  const selEdgeRef = useRef(selEdge); selEdgeRef.current = selEdge;
  // 删除键:连线优先,其次删选中节点(多选);⌘C/⌘V 复制粘贴选中
  useEffect(() => {
    function onKey(e) {
      if (readOnly) return;
      const t = e.target;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const eid = selEdgeRef.current;
        if (eid) { e.preventDefault(); const d = docRef.current; update({ ...d, edges: d.edges.filter((ed) => ed.id !== eid) }); setSelEdge(null); return; }
        const ids = selIdsRef.current;
        if (ids.length) { e.preventDefault(); const s = new Set(ids); const d = docRef.current; update({ ...d, nodes: d.nodes.filter((n) => !s.has(n.id)), edges: d.edges.filter((ed) => !s.has(ed.from) && !s.has(ed.to)), groups: d.groups.map((g) => ({ ...g, nodeIds: g.nodeIds.filter((x) => !s.has(x)) })).filter((g) => g.nodeIds.length) }); setSelIds([]); }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "c" || e.key === "C")) {
        const ids = selIdsRef.current; const d = docRef.current;
        const nodes = ids.map((id) => d.nodes.find((x) => x.id === id)).filter(Boolean);
        if (nodes.length) setClip(nodes); // 复制为节点数组
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, update]);
  useEffect(() => {
    if (readOnly) return undefined;
    // 读取一组图片文件,在指定客户端坐标(或画布中心)批量建节点
    async function createNodesFromPayloads(payloads, clientX, clientY) {
      const protos = (payloads || []).filter((item) => item?.proto);
      if (!protos.length) return;
      const r = wrapRef.current ? wrapRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
      const hasPt = typeof clientX === "number" && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
      const cx = hasPt ? clientX : r.left + r.width / 2;
      const cy = hasPt ? clientY : r.top + r.height / 2;
      const v = viewRef.current;
      const wx0 = (cx - r.left - v.x) / v.k, wy0 = (cy - r.top - v.y) / v.k;
      const renderH = (ratio) => NODE_MEDIA_W * (ratio || 0.55) + nodeTitleH({}) + nodeDescH({});
      const newNodes = [];
      let rowTop = wy0 - 35;
      for (let row = 0; row * PASTE_PER_ROW < protos.length; row++) {
        const slice = protos.slice(row * PASTE_PER_ROW, (row + 1) * PASTE_PER_ROW);
        slice.forEach((im, col) => {
          const name = im.protoKind === "html" && im.protoName ? im.protoName.replace(/\.(html?|xhtml)$/i, "") : "";
          newNodes.push({ id: uid(), x: wx0 - NODE_W / 2 + col * (NODE_W + GAP_X), y: rowTop, name, note: "", expGoal: "", proto: im.proto, protoKind: im.protoKind || "image", protoRatio: im.protoRatio, protoName: im.protoName || "", competitors: [] });
        });
        const rowH = Math.max(...slice.map((im) => renderH(im.protoRatio)));
        rowTop += rowH + GAP_Y;
      }
      const d0 = docRef.current;
      update({ ...d0, nodes: [...d0.nodes, ...newNodes] });
      setSelIds(newNodes.map((n) => n.id));
    }
    async function createNodesFromFiles(files, clientX, clientY) {
      const payloads = [];
      for (const f of Array.from(files || []).filter(isProtoFile)) {
        const payload = await fileToProtoPayload(f);
        if (payload) payloads.push(payload);
      }
      await createNodesFromPayloads(payloads, clientX, clientY);
    }
    function protoFiles(files) {
      return Array.from(files || []).filter(isProtoFile);
    }
    function hitNodeAtClient(clientX, clientY) {
      const el = wrapRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
      const v = viewRef.current;
      const w = { x: (clientX - r.left - v.x) / v.k, y: (clientY - r.top - v.y) / v.k };
      return docRef.current.nodes.slice().reverse().find((n) => (
        w.x >= n.x && w.x <= n.x + NODE_W && w.y >= n.y && w.y <= n.y + nodeH(n)
      )) || null;
    }
    async function replaceNodeProtoFromFile(file, nodeId) {
      if (!file || !nodeId) return false;
      const payload = await fileToProtoPayload(file);
      if (!payload) return false;
      const d0 = docRef.current;
      if (!d0.nodes.some((n) => n.id === nodeId)) return false;
      update({
        ...d0,
        nodes: d0.nodes.map((n) => (n.id === nodeId ? { ...n, ...payload } : n)),
      });
      setSelIds([nodeId]);
      return true;
    }

    async function onPaste(e) {
      const items = e.clipboardData && e.clipboardData.items;
      const imgItems = items ? Array.from(items).filter((it) => it.type && it.type.startsWith("image/")) : [];
      // 无图片但有已复制节点 → 粘贴节点副本(支持多个)
      if (!imgItems.length) {
        const clip = getClip && getClip();
        const arr = Array.isArray(clip) ? clip : (clip ? [clip] : []);
        if (arr.length) {
          e.preventDefault();
          const r = wrapRef.current ? wrapRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
          const m = mouseRef.current;
          const inside = m.x >= r.left && m.x <= r.right && m.y >= r.top && m.y <= r.bottom;
          const v = viewRef.current;
          const base = { x: Math.min(...arr.map((n) => n.x)), y: Math.min(...arr.map((n) => n.y)) };
          let ox, oy;
          if (inside) { ox = (m.x - r.left - v.x) / v.k - NODE_W / 2 - base.x; oy = (m.y - r.top - v.y) / v.k - 35 - base.y; }
          else { ox = NODE_W + GAP_X; oy = 40; }
          const map = {};
          const clones = arr.map((n) => { const nid = uid(); map[n.id] = nid; return { ...n, id: nid, x: n.x + ox, y: n.y + oy, competitors: (n.competitors || []).map((c) => ({ ...c, id: uid() })) }; });
          const d0 = docRef.current;
          update({ ...d0, nodes: [...d0.nodes, ...clones] });
          setSelIds(clones.map((c) => c.id));
        }
        return;
      }
      const htmlText = e.clipboardData?.getData("text/html") || e.clipboardData?.getData("text/plain") || "";
      if (looksLikeStandaloneHtml(htmlText)) {
        e.preventDefault();
        await createNodesFromPayloads([await htmlTextToProtoPayload(htmlText)], mouseRef.current.x, mouseRef.current.y);
        return;
      }
      e.preventDefault();
      const files = imgItems.map((it) => it.getAsFile()).filter(Boolean);
      const selectedIds = selIdsRef.current;
      const d0 = docRef.current;
      const selectedNode = selectedIds.length === 1 ? d0.nodes.find((n) => n.id === selectedIds[0]) : null;
      if (selectedNode && files.length) {
        const pastePoint = { ...mouseRef.current };
        pasteImageChoiceRef.current = {
          replace: async () => replaceNodeProtoFromFile(files[0], selectedNode.id),
          create: async () => createNodesFromFiles(files, pastePoint.x, pastePoint.y),
        };
        setCtxMenu(null);
        setGroupColorMenu(null);
        setPasteImageChoice({
          nodeId: selectedNode.id,
          nodeName: selectedNode.name || "未命名页面",
          hasProto: !!selectedNode.proto,
          count: files.length,
        });
        return;
      }
      await createNodesFromFiles(files, mouseRef.current.x, mouseRef.current.y);
    }

    function onDragOver(e) {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        const hit = hitNodeAtClient(e.clientX, e.clientY);
        setImageDropNodeId((prev) => (prev === (hit?.id || null) ? prev : (hit?.id || null)));
        setDragOver(!hit);
      }
    }
    function onDragLeave(e) {
      // 仅当离开画布外层时取消高亮
      if (e.target === wrapRef.current || !wrapRef.current?.contains(e.relatedTarget)) {
        setDragOver(false);
        setImageDropNodeId(null);
      }
    }
    async function onDrop(e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        setDragOver(false);
        const files = protoFiles(e.dataTransfer.files);
        const target = hitNodeAtClient(e.clientX, e.clientY);
        setImageDropNodeId(null);
        if (target && files.length) await replaceNodeProtoFromFile(files[0], target.id);
        else await createNodesFromFiles(e.dataTransfer.files, e.clientX, e.clientY);
      } else { setDragOver(false); setImageDropNodeId(null); }
    }

    const el = wrapRef.current;
    window.addEventListener("paste", onPaste);
    if (el) { el.addEventListener("dragover", onDragOver); el.addEventListener("dragleave", onDragLeave); el.addEventListener("drop", onDrop); }
    return () => {
      window.removeEventListener("paste", onPaste);
      if (el) { el.removeEventListener("dragover", onDragOver); el.removeEventListener("dragleave", onDragLeave); el.removeEventListener("drop", onDrop); }
    };
  }, [readOnly, update, setSel, getClip]);

  return (
    <div ref={wrapRef} onWheel={onWheel} onMouseDown={bgDown} onMouseMove={move} onMouseUp={up} onMouseLeave={up} onDoubleClick={dblBg}
      style={{ position: "absolute", inset: 0, overflow: "hidden", cursor: pan ? "grabbing" : (spaceDown ? "grab" : "default"), background: C.canvas,
        backgroundImage: "radial-gradient(rgba(203,213,225,.5) 1px, transparent 1px)", backgroundSize: `${24 * view.k}px ${24 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}>

      {doc.nodes.length === 0 && (
        <div data-bg="1" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", color: C.faint, textAlign: "center" }}>
          <div style={{ background: C.glass, border: `1px solid ${C.line}`, borderRadius: 18, padding: "18px 22px", boxShadow: C.shadow, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}><div style={{ fontFamily: sans, fontWeight: 700, color: C.ink, fontSize: 16, marginBottom: 6 }}>{readOnly ? "暂无页面" : "双击画布,或粘贴 / 拖入图片,创建第一个页面"}</div><div style={{ fontSize: 12.5 }}>{readOnly ? "已完成设计单处于阅读状态" : "节点左右圆点拖出连线建立跳转 · 滚轮缩放 · 拖空白平移"}</div></div>
        </div>
      )}

      {dragOver && (
        <div style={{ position: "absolute", inset: 10, border: `2.5px dashed ${C.indigo}`, borderRadius: 24, background: "rgba(59,130,246,.07)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 5 }}>
          <span style={{ background: C.indigo, color: "#fff", borderRadius: 999, padding: "9px 20px", fontSize: 14, fontWeight: 700, boxShadow: "0 8px 24px rgba(59,130,246,.22)" }}>松开,把图片创建为页面</span>
        </div>
      )}

      <div data-bg="1" style={{ position: "absolute", transformOrigin: "0 0", transform: `translate(${view.x}px,${view.y}px) scale(${view.k})`, inset: 0 }}>
        {/* 分组底色块(最底层) */}
        {doc.groups.map((g) => {
          const b = groupBox(g); if (!b) return null;
          const col = groupColor(g.colorIdx);
          const activeDrop = dropGroupId === g.id;
          return (
            <div key={g.id} data-group-id={g.id} data-node-ids={g.nodeIds.join(",")} onMouseDown={(e) => groupDown(e, g)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
              style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, background: activeDrop ? col.activeBg : col.bg, border: `${activeDrop ? 2.5 : 2}px dashed ${activeDrop ? col.text : col.border}`, borderRadius: 24, pointerEvents: "auto", cursor: pan ? "grabbing" : "grab", boxShadow: activeDrop ? `0 0 0 5px ${col.ring}, 0 14px 34px ${col.shadow}` : `0 12px 34px ${col.shadow}, inset 0 1px 0 rgba(255,255,255,.42)`, backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", transition: "background .12s, border-color .12s, box-shadow .12s" }}>
              <div onMouseDown={(e) => e.stopPropagation()}
                style={{ position: "absolute", top: -13, left: 22, width: 184, height: 26, display: "flex", alignItems: "center", gap: 6, border: `1px solid ${col.border}`, background: "rgba(255,255,255,.86)", color: col.text, borderRadius: 999, padding: "3px 9px", boxSizing: "border-box", boxShadow: "0 1px 3px rgba(15,23,42,.06)", pointerEvents: "all", zIndex: groupColorMenu === g.id ? 20 : 3 }}>
                {!readOnly && (
                  <button aria-label="分组颜色" title="分组颜色" onClick={(e) => { e.stopPropagation(); setGroupColorMenu((id) => (id === g.id ? null : g.id)); }}
                    style={{ width: 15, height: 15, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flex: "0 0 15px" }}>
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: col.swatch, boxShadow: `0 0 0 2px rgba(255,255,255,.86), 0 0 0 3px ${col.border}` }} />
                  </button>
                )}
                {readOnly ? (
                  <span style={{ flex: 1, minWidth: 0, color: col.text, fontWeight: 800, fontFamily: sans, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name || "新分组"}</span>
                ) : (
                  <input value={g.name} onChange={(e) => renameGroup(g.id, e.target.value)} placeholder="分组名"
                    style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", color: col.text, fontWeight: 800, fontFamily: sans, fontSize: 12, outline: "none", padding: 0 }} />
                )}
              </div>
              {!readOnly && (
                <button onMouseDown={(e) => e.stopPropagation()} onClick={() => ungroup(g.id)}
                  style={{ position: "absolute", top: 10, right: 14, border: "none", background: "rgba(255,255,255,.68)", color: col.text, opacity: 0.75, fontSize: 11.5, cursor: "pointer", pointerEvents: "all", fontFamily: sans, borderRadius: 999, padding: "3px 9px" }}>解组</button>
              )}
            </div>
          );
        })}
        {/* 连线层 */}
        <svg style={{ position: "absolute", overflow: "visible", pointerEvents: "none", left: 0, top: 0 }}>
          {doc.edges.map((e) => {
            const f = doc.nodes.find((n) => n.id === e.from), t = doc.nodes.find((n) => n.id === e.to);
            if (!f || !t) return null;
            const g = edgeGeom(e);
            if (!g) return null;
            const lx = g.lx, ly = g.ly;
            const isSel = selEdge === e.id, isHover = hoverEdge === e.id;
            const fromSelectedNode = selIds.includes(e.from);
            const hot = isSel || isHover || fromSelectedNode;
            return (
              <g key={e.id} data-edge-id={e.id} data-edge-from={e.from} data-edge-to={e.to} data-edge-hot={hot ? "1" : "0"}>
                <path data-edge-line="1" d={g.path} fill="none" stroke={hot ? C.indigo : "#94A3B8"} strokeWidth={hot ? 2.8 : 2} opacity={hot ? 1 : (g.back ? 0.55 : 0.75)} strokeDasharray="8 4" style={{ animation: hot ? "flowDash .8s linear infinite" : "none" }} />
                {/* 透明加宽热区:悬停高亮 + 点击选中 */}
                <path d={g.path} fill="none" stroke="transparent" strokeWidth="16"
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onMouseEnter={() => setHoverEdge(e.id)} onMouseLeave={() => setHoverEdge((h) => (h === e.id ? null : h))}
                  onMouseDown={(ev) => { ev.stopPropagation(); if (spaceRef.current) startPan(ev); }}
                  onClick={(ev) => { if (spaceRef.current) return; ev.stopPropagation(); setSelEdge(e.id); setSelIds([]); }} />
                {/* 已填跳转条件:常驻显示文字标签,点击可编辑 */}
                {!isSel && e.label && (
                  <foreignObject x={lx - 60} y={ly - 12} width="120" height="24" style={{ pointerEvents: "all", overflow: "visible" }}>
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div onMouseDown={(ev) => { ev.stopPropagation(); if (spaceRef.current) startPan(ev); }}
                        onClick={(ev) => { if (spaceRef.current) return; ev.stopPropagation(); setSelEdge(e.id); setSelIds([]); }}
                        style={{ display: "inline-block", maxWidth: 120, padding: "3px 9px", borderRadius: 999, background: C.glass, border: `1px solid ${hot ? C.indigo : C.line}`, color: hot ? C.indigo : C.soft, fontSize: 10.5, fontWeight: 700, fontFamily: sans, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxShadow: "0 2px 8px rgba(15,23,42,.08)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
                        {e.label}
                      </div>
                    </div>
                  </foreignObject>
                )}
                {/* 选中:展开跳转条件输入框 + 删除 */}
                {isSel && !readOnly && (
                  <g style={{ pointerEvents: "all" }}>
                    <foreignObject x={lx - 56} y={ly - 13} width="112" height="26">
                      <input autoFocus value={e.label} onChange={(ev) => setEdgeLabel(e.id, ev.target.value)} placeholder="跳转条件"
                        onMouseDown={(ev) => ev.stopPropagation()}
                        style={{ width: "100%", textAlign: "center", fontSize: 10.5, border: `1px solid ${C.indigo}`, borderRadius: 999, background: C.surface, color: C.ink, fontFamily: sans, outline: "none", padding: "3px 8px", boxShadow: "0 2px 8px rgba(37,99,235,.12)" }} />
                    </foreignObject>
                    <circle cx={lx + 64} cy={ly} r="9" fill={C.surface} stroke={C.indigo} strokeWidth="1" style={{ cursor: "pointer" }} onClick={(ev) => { ev.stopPropagation(); delEdge(e.id); setSelEdge(null); }} />
                    <text x={lx + 64} y={ly + 3.5} textAnchor="middle" fontSize="11" fill={C.indigo} style={{ cursor: "pointer", userSelect: "none", pointerEvents: "none" }}>×</text>
                  </g>
                )}
              </g>
            );
          })}
          {linking && (() => {
            const f = doc.nodes.find((n) => n.id === linking.node);
            if (!f) return null;
            const a = { x: linking.dir === "out" ? f.x + NODE_W : f.x, y: anchorY(f) };
            return <path d={`M${a.x},${a.y} L${linking.x},${linking.y}`} fill="none" stroke={C.indigo} strokeWidth="2" strokeDasharray="6 4" />;
          })()}
        </svg>

        {/* 节点层 */}
        {doc.nodes.map((n, i) => {
          const active = selIds.includes(n.id);
          const linkTo = linking && linking.target === n.id && n.id !== linking.node; // 连线即将落到此节点
          const imageDropTarget = imageDropNodeId === n.id;
          const titleLines = nodeTitleLines(n);
          const descLines = nodeDescLines(n);
          const mediaH = imgH(n);
          const mediaClipId = `node-proto-clip-${n.id}`;
          const protoHtml = isHtmlProto(n);
          return (
            <div key={n.id} data-node-id={n.id} data-image-drop-target={imageDropTarget ? "1" : "0"} draggable={false} onDragStart={(e) => e.preventDefault()} onMouseDown={(e) => nodeDown(e, n)} onContextMenu={(e) => onNodeContext(e, n)} onDoubleClick={(e) => { e.stopPropagation(); if (!readOnly) openDetail(n.id); }}
              style={{ position: "absolute", left: n.x, top: n.y, width: NODE_W, height: nodeH(n), background: C.surface, borderRadius: 14,
                border: `1px solid ${imageDropTarget || linkTo || active ? C.indigo : C.line}`,
                boxShadow: imageDropTarget ? `0 0 0 4px rgba(59,130,246,.28), 0 18px 38px rgba(37,99,235,.2)` : (linkTo ? `0 0 0 3px ${C.copperSoft}, 0 12px 34px rgba(37,99,235,.2)` : (active ? `0 0 0 3px ${C.indigo}, 0 8px 32px -4px rgba(59,130,246,.18)` : C.shadow)),
                cursor: pan ? "grabbing" : "grab", userSelect: "none", transition: "box-shadow .12s, border-color .12s, transform .12s", transform: imageDropTarget ? "translateY(-2px)" : "none" }}>
              {imageDropTarget && (
                <div data-image-drop-node-tip="1" style={{ position: "absolute", inset: 8, borderRadius: 12, border: `1.5px dashed ${C.indigo}`, background: "rgba(239,246,255,.8)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 4, backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}>
                  <span style={{ padding: "6px 10px", borderRadius: 999, background: C.indigo, color: "#fff", fontFamily: sans, fontSize: 11.5, fontWeight: 850, boxShadow: "0 8px 18px rgba(37,99,235,.22)" }}>{n.proto ? "松开替换原型" : "松开添加原型"}</span>
                </div>
              )}
              <div style={{ height: nodeTitleH(n), padding: `${NODE_TITLE_PAD_TOP}px 10px ${NODE_TITLE_PAD_BOTTOM}px`, boxSizing: "border-box" }}>
                <div style={{ fontSize: 12.5, lineHeight: `${NODE_TITLE_LINE_H}px`, fontWeight: 700, color: "#1E293B", overflow: "hidden" }}>
                  {titleLines.map((line, j) => <span key={j} style={{ display: "block", height: NODE_TITLE_LINE_H, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>)}
                </div>
              </div>
              <div data-proto-media={n.proto ? "uploaded-smooth" : "empty"}
                onDoubleClick={(e) => { if (!readOnly || !n.proto) return; e.preventDefault(); e.stopPropagation(); openDocNode?.(n.id); }}
                title={readOnly && n.proto ? "双击查看文档详情" : undefined}
                style={{ height: mediaH, margin: `0 ${NODE_INSET}px`, borderRadius: n.proto ? 0 : NODE_EMPTY_MEDIA_RADIUS, border: n.proto ? "none" : `1px solid ${C.line}`, boxShadow: "none", background: n.proto ? "transparent" : "#F8FAFC", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: readOnly && n.proto ? "pointer" : "default" }}>
                {n.proto ? (
                  <>
                    {protoHtml ? (
                      <>
                        <HtmlPrototypeFrame src={n.proto} title={`${n.name || "未命名页面"} HTML 原型`} ratio={n.protoRatio} />
                      </>
                    ) : (
                      <>
                        <svg width="100%" height="100%" viewBox={`0 0 ${NODE_MEDIA_W} ${mediaH}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: "100%", pointerEvents: "none" }}>
                          <defs>
                            <clipPath id={mediaClipId} clipPathUnits="userSpaceOnUse">
                              <path d={smoothRoundRectPath(NODE_MEDIA_W, mediaH, NODE_MEDIA_RADIUS)} />
                            </clipPath>
                          </defs>
                          <image href={n.proto} x="0" y="0" width={NODE_MEDIA_W} height={mediaH} preserveAspectRatio="none" clipPath={`url(#${mediaClipId})`} />
                        </svg>
                        <img src={n.proto} alt="" draggable={false} onLoad={(e) => syncProtoRatio(n, e.currentTarget)} style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none", WebkitUserDrag: "none" }} />
                      </>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.faint }}>上传图片 / HTML 原型</span>
                )}
              </div>
              {descLines.length > 0 && (
                <div style={{ height: nodeDescH(n), boxSizing: "border-box", padding: `${NODE_DESC_PAD_TOP}px 10px ${NODE_DESC_PAD_BOTTOM}px` }}>
                  <div style={{ fontSize: 10.5, color: C.soft, lineHeight: `${NODE_DESC_LINE_H}px`, overflow: "hidden" }}>
                    {descLines.map((line, j) => <span key={j} style={{ display: "block", height: NODE_DESC_LINE_H, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>)}
                  </div>
                </div>
              )}
              {/* 连线锚点:左=输入 右=输出 */}
              {!readOnly && (
                <>
                  <div onMouseDown={(e) => startLink(e, n, "in")} title="输入:拖出可从左侧连入/新建上游页面"
                    style={{ position: "absolute", left: -7, top: anchorY(n) - n.y - 7, width: 14, height: 14, borderRadius: "50%", background: "#CBD5E1", border: "2px solid #fff", boxShadow: "0 1px 3px rgba(15,23,42,.16)", cursor: spaceDown ? (pan ? "grabbing" : "grab") : "crosshair" }} />
                  <div onMouseDown={(e) => startLink(e, n, "out")} title="输出:拖出连接到下游页面/新建页面"
                    style={{ position: "absolute", right: -7, top: anchorY(n) - n.y - 7, width: 14, height: 14, borderRadius: "50%", background: C.indigo, border: "2px solid #fff", boxShadow: "0 1px 3px rgba(15,23,42,.16)", cursor: spaceDown ? (pan ? "grabbing" : "grab") : "crosshair" }} />
                </>
              )}
            </div>
          );
        })}
        {(() => {
          if (readOnly) return null;
          const g = doc.groups.find((x) => x.id === groupColorMenu);
          const b = g && groupBox(g);
          if (!g || !b) return null;
          return (
            <div data-group-color-menu={g.id} onMouseDown={(e) => e.stopPropagation()}
              style={{ position: "absolute", left: b.x + 22, top: b.y + 18, display: "grid", gridTemplateColumns: "repeat(5, 20px)", gap: 7, padding: 9, borderRadius: 14, border: `1px solid ${C.line}`, background: "rgba(255,255,255,.96)", boxShadow: "0 18px 46px rgba(15,23,42,.16)", pointerEvents: "all", zIndex: 100, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
              {GROUP_COLORS.map((c, idx) => {
                const active = groupColorIndex(g.colorIdx) === idx;
                return (
                  <button key={c.swatch} aria-label={`分组颜色 ${idx + 1}`} title={`分组颜色 ${idx + 1}`} onClick={(e) => { e.stopPropagation(); setGroupColor(g.id, idx); setGroupColorMenu(null); }}
                    style={{ width: 20, height: 20, borderRadius: "50%", border: active ? `2px solid ${C.ink}` : "1px solid rgba(15,23,42,.16)", background: c.swatch, cursor: "pointer", boxShadow: active ? `0 0 0 3px ${c.ring}` : "inset 0 0 0 1px rgba(255,255,255,.3)", padding: 0 }} />
                );
              })}
            </div>
          );
        })()}
        {/* 框选矩形 */}
        {marquee && (
          <div style={{ position: "absolute", left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0), border: `1px dashed ${C.indigo}`, background: "rgba(59,130,246,.08)", pointerEvents: "none", borderRadius: 8 }} />
        )}
      </div>

      {/* 控件 */}
      <div style={{ position: "absolute", left: "50%", bottom: 18, transform: "translateX(-50%)", display: "flex", gap: 6, alignItems: "center", background: C.glass, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 8px", boxShadow: C.shadow, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <button onClick={() => setView((v) => ({ ...v, k: Math.max(0.3, v.k - 0.15) }))} style={zBtn}>−</button>
        <span style={{ fontSize: 11.5, color: C.soft, fontFamily: mono, width: 38, textAlign: "center" }}>{Math.round(view.k * 100)}%</span>
        <button onClick={() => setView((v) => ({ ...v, k: Math.min(2, v.k + 0.15) }))} style={zBtn}>＋</button>
        <button onClick={() => setView({ x: 0, y: 0, k: 1 })} style={{ ...zBtn, width: "auto", padding: "0 8px", fontSize: 11 }}>归位</button>
        {!readOnly && <button onClick={tidy} title="按跳转关系自动分层排布" style={{ ...zBtn, width: "auto", padding: "0 9px", fontSize: 11, color: C.indigo }}>一键整理</button>}
      </div>

      {/* 多选提示 */}
      {!readOnly && selIds.length > 1 && (
        <div style={{ position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)", background: C.ink, color: "#fff", borderRadius: 999, padding: "7px 15px", fontSize: 12.5, fontWeight: 700, boxShadow: "0 8px 24px rgba(15,23,42,.18)" }}>
          已选 {selIds.length} 个 · 右键打开菜单
        </div>
      )}

      {/* 粘贴原型到已选节点:替换或新建 */}
      {pasteImageChoice && (
        <div data-paste-image-choice="1" style={{ position: "fixed", inset: 0, zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,.24)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          onMouseDown={(e) => e.stopPropagation()}>
          <div style={{ width: 360, maxWidth: "calc(100vw - 32px)", background: C.glass, border: `1px solid ${C.line}`, borderRadius: 18, padding: 18, boxShadow: "0 24px 70px rgba(15,23,42,.18)", fontFamily: sans }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 850, color: C.ink, marginBottom: 5 }}>粘贴原型到节点</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.soft }}>
                  当前选中「{pasteImageChoice.nodeName}」。{pasteImageChoice.count > 1 ? "替换会使用第一个文件，新建会保留全部可用原型。" : "请选择替换当前原型或新建节点。"}
                </div>
              </div>
              <button type="button" aria-label="取消粘贴图片" onClick={() => resolvePasteImageChoice("cancel")}
                style={{ border: "none", background: "transparent", color: C.faint, cursor: "pointer", fontSize: 20, lineHeight: 1, width: 26, height: 26, borderRadius: 999 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
              <button type="button" data-paste-image-replace="1" onClick={() => resolvePasteImageChoice("replace")}
                style={{ border: "none", borderRadius: 12, padding: "11px 12px", background: C.indigo, color: "#fff", fontFamily: sans, fontSize: 13, fontWeight: 850, cursor: "pointer", boxShadow: "0 8px 20px rgba(37,99,235,.2)" }}>
                {pasteImageChoice.hasProto ? "替换原型" : "填充原型"}
              </button>
              <button type="button" data-paste-image-create="1" onClick={() => resolvePasteImageChoice("create")}
                style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 12px", background: C.surface, color: C.soft, fontFamily: sans, fontSize: 13, fontWeight: 850, cursor: "pointer" }}>
                新建节点
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {!readOnly && ctxMenu && (
        <>
          <div onMouseDown={() => setCtxMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 88 }} />
          <div onMouseDown={(e) => e.stopPropagation()} style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 90, background: C.glass, border: `1px solid ${C.line}`, borderRadius: 14, padding: 6, minWidth: 154, boxShadow: C.shadow, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
            {singleSelected && <CtxItem onClick={goToDocSelected}>去文档编辑</CtxItem>}
            {singleSelected && isHtmlProto(singleSelected) && <CtxItem onClick={changeHtmlPrototypeRatioSelected}>修改原型比例</CtxItem>}
            <CtxItem onClick={batchCopy}>{selectedCount > 1 ? "批量复制" : "复制"}</CtxItem>
            {canGroupSelected && <CtxItem onClick={groupSelected}>{groupActionLabel}</CtxItem>}
            {canRemoveFromGroup && <CtxItem onClick={removeFromGroup}>{removeGroupActionLabel}</CtxItem>}
            <CtxItem onClick={() => { shareSelected(); }}>分享为流程图</CtxItem>
            <div style={{ height: 1, background: C.lineSoft, margin: "4px 0" }} />
            <CtxItem danger onClick={deleteSelected}>{selectedCount > 1 ? `删除(${selectedCount})` : "删除"}</CtxItem>
          </div>
        </>
      )}
    </div>
  );
}
function CtxItem({ children, onClick, danger }) {
  return <div onClick={onClick} style={{ padding: "8px 12px", fontSize: 13, borderRadius: 6, cursor: "pointer", color: danger ? C.copper : C.ink, fontFamily: sans }}
    onMouseEnter={(e) => (e.currentTarget.style.background = danger ? C.copperSoft : C.indigoSoft)}
    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>{children}</div>;
}
const zBtn = { border: "none", background: "transparent", color: C.soft, cursor: "pointer", fontSize: 15, width: 30, height: 30, borderRadius: 999, fontWeight: 700 };

function HtmlPrototypeFrame({ src, title = "HTML 原型", interactive = false, ratio = HTML_PROTO_DEFAULT_RATIO, style }) {
  const wrapRef = useRef(null);
  const [wrapWidth, setWrapWidth] = useState(HTML_PROTO_VIEWPORT_W);
  const srcDoc = useMemo(() => htmlFromDataUrl(src), [src]);
  const frameRatio = htmlProtoRatio(ratio);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => {
      const next = el.getBoundingClientRect().width || HTML_PROTO_VIEWPORT_W;
      setWrapWidth((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect?.();
      window.removeEventListener("resize", update);
    };
  }, []);

  const safeWidth = Math.max(1, wrapWidth || HTML_PROTO_VIEWPORT_W);
  const scale = safeWidth / HTML_PROTO_VIEWPORT_W;
  const viewportH = Math.round(HTML_PROTO_VIEWPORT_W * frameRatio);
  return (
    <div
      ref={wrapRef}
      data-html-prototype-ratio-frame="1"
      style={{ ...style, width: "100%", height: safeWidth * frameRatio, position: "relative", overflow: "hidden", background: "#fff" }}
    >
      <iframe
        title={title}
        src={srcDoc ? undefined : src}
        srcDoc={srcDoc || undefined}
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
        scrolling="no"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: HTML_PROTO_VIEWPORT_W,
          height: viewportH,
          border: "none",
          display: "block",
          background: "#fff",
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          pointerEvents: interactive ? "auto" : "none",
        }}
      />
    </div>
  );
}
/* ============ 节点详情抽屉 ============ */
function NodeDetail({ node, onClose, onSave }) {
  const [n, setN] = useState(node);
  useEffect(() => { setN(node); }, [node]);
  if (!n) return null;
  const set = (patch) => { const nn = { ...n, ...patch }; setN(nn); onSave(patch); };
  async function pickProto(f) {
    const payload = await fileToProtoPayload(f);
    if (payload) set(payload);
  }
  async function addComp(f) { set({ competitors: [...n.competitors, { id: uid(), caption: "", img: await imageFileToManagedSrc(f, "competitor") }] }); }
  const setComp = (cid, patch) => set({ competitors: n.competitors.map((c) => (c.id === cid ? { ...c, ...patch } : c)) });
  const delComp = (cid) => set({ competitors: n.competitors.filter((c) => c.id !== cid) });

  return (
    <div data-node-detail-overlay="1" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.24)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div data-node-detail-panel="1" className="scl" onClick={(e) => e.stopPropagation()} style={{ width: 400, maxWidth: "92vw", height: "calc(100% - 20px)", margin: "10px 10px 10px 0", background: C.glass, border: `1px solid ${C.line}`, borderRadius: "22px 0 0 22px", overflowY: "auto", padding: 22, boxShadow: "-8px 0 32px rgba(15,23,42,.08)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", animation: "nodeDetailSlideIn .3s ease-in-out both", willChange: "transform" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 800 }}>页面详情</span>
          <button onClick={onClose} style={{ border: "none", background: "rgba(255,255,255,.72)", fontSize: 18, color: C.faint, cursor: "pointer", width: 30, height: 30, borderRadius: 10 }}>×</button>
        </div>

        <FieldLabel>页面名称</FieldLabel>
        <input value={n.name} onChange={(e) => set({ name: e.target.value })} placeholder="例:物流详情页" style={{ ...fieldStyle, marginBottom: 14 }} />

        <FieldLabel>原型图</FieldLabel>
        {n.proto ? (
          <div style={{ position: "relative", marginBottom: 14, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.line}`, background: C.surface }}>
            {isHtmlProto(n) ? (
              <div style={{ position: "relative", background: "#fff" }}>
                <HtmlPrototypeFrame src={n.proto} title={`${n.name || "未命名页面"} HTML 原型`} ratio={n.protoRatio} />
              </div>
            ) : (
              <img src={n.proto} alt="" style={{ width: "100%", display: "block", maxHeight: 300, objectFit: "contain", background: C.lineSoft }} />
            )}
            <button onClick={() => set({ proto: null, protoKind: "", protoRatio: null, protoName: "" })} style={{ position: "absolute", top: 8, right: 8, background: "rgba(15,23,42,.72)", color: "#fff", border: "none", borderRadius: 999, padding: "4px 11px", fontSize: 11, cursor: "pointer" }}>移除</button>
          </div>
        ) : (
          <label style={{ display: "block", border: `2px dashed ${C.line}`, borderRadius: 14, padding: 22, textAlign: "center", cursor: "pointer", color: C.faint, background: "rgba(248,250,252,.72)", fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
            ↑ 上传页面原型（图片 / HTML）<input type="file" accept={PROTO_FILE_ACCEPT} style={{ display: "none" }} onChange={(e) => e.target.files[0] && pickProto(e.target.files[0])} />
          </label>
        )}

        <FieldLabel>页面说明</FieldLabel>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "4px 6px", marginBottom: 14 }}>
          <RichEditor value={n.note} onChange={(v) => set({ note: v })} placeholder="关键模块、交互说明、注意事项…" />
        </div>

        <FieldLabel copper>该页面体验目标</FieldLabel>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "4px 6px", marginBottom: 14 }}>
          <RichEditor value={n.expGoal} onChange={(v) => set({ expGoal: v })} placeholder="这一页要达到的具体体验效果" />
        </div>
        <FieldLabel>竞品参考</FieldLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {n.competitors.map((c) => (
            <div key={c.id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.surface }}>
              <img src={c.img} alt="" style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} />
              <div style={{ padding: 6 }}>
                <input value={c.caption} onChange={(e) => setComp(c.id, { caption: e.target.value })} placeholder="看中它哪点" style={{ width: "100%", border: "none", fontSize: 11, outline: "none", fontFamily: sans, color: C.soft }} />
                <button onClick={() => delComp(c.id)} style={{ border: "none", background: "transparent", color: C.faint, fontSize: 11, cursor: "pointer", float: "right" }}>删除</button>
              </div>
            </div>
          ))}
          <label style={{ border: `2px dashed ${C.line}`, borderRadius: 12, minHeight: 90, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.faint, background: "rgba(248,250,252,.72)", fontSize: 11.5, fontWeight: 600 }}>
            ＋ 竞品截图<input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files[0] && addComp(e.target.files[0])} />
          </label>
        </div>
      </div>
    </div>
  );
}
function FieldLabel({ children, copper }) { return <div style={{ fontSize: 11.5, fontWeight: 800, marginBottom: 6, color: copper ? C.indigo : C.soft, textTransform: "uppercase", letterSpacing: ".06em" }}>{children}</div>; }

/* ============ 起始信息弹窗 ============ */
function SetupModal({ doc, onSave, onSkip }) {
  const [m, setM] = useState({ name: doc.meta.name, product: getProductMeta(doc.meta.product).name, background: doc.meta.background, dataGoals: doc.meta.dataGoals, expGoals: doc.meta.expGoals, analysisUrl: doc.meta.analysisUrl });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.32)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="scl" style={{ background: C.glass, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, width: "100%", maxWidth: 540, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 22px 70px rgba(15,23,42,.18)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
        <h3 style={{ fontFamily: sans, fontSize: 19, fontWeight: 800, marginBottom: 4 }}>需求信息</h3>
        <p style={{ fontSize: 12.5, color: C.soft, marginBottom: 18 }}>先填基本信息,再开始画流程图。也可以跳过,之后随时从顶栏「需求信息」补充。</p>
        <Row label="需求名称"><input value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder="例:订单详情页改版" style={fieldStyle} /></Row>
        <Row label="所属产品">
          <span className="setup-product-select" style={{ position: "relative", display: "block" }}>
            <select value={m.product} onChange={(e) => setM({ ...m, product: e.target.value })} style={{ ...fieldStyle, paddingRight: 46, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", cursor: "pointer" }}>
              {productCatalog.map((product) => <option key={product.name} value={product.name}>{product.name}</option>)}
            </select>
            <span style={{ position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: C.soft, pointerEvents: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <ManagerIcon name="chevron" size={16} />
            </span>
          </span>
        </Row>
        <Row label="需求背景"><div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "4px 6px" }}><RichEditor value={m.background} onChange={(v) => setM({ ...m, background: v })} placeholder="业务背景、用户场景…" /></div></Row>
        <Row label="数据目标"><div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "4px 6px" }}><RichEditor value={m.dataGoals} onChange={(v) => setM({ ...m, dataGoals: v })} placeholder="例:客服进线率 -15%" /></div></Row>
        <Row label="整体体验目标"><div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "4px 6px" }}><RichEditor value={m.expGoals} onChange={(v) => setM({ ...m, expGoals: v })} placeholder="例:10 秒内自助定位物流状态" /></div></Row>
        <Row label="需求分析文档链接"><input value={m.analysisUrl} onChange={(e) => setM({ ...m, analysisUrl: e.target.value })} placeholder="https://… (可选)" style={fieldStyle} /></Row>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <Btn kind="ghost" onClick={onSkip}>跳过,先画图</Btn>
          <Btn onClick={() => onSave(m)}>保存</Btn>
        </div>
      </div>
    </div>
  );
}
function Row({ label, children }) { return <div style={{ marginBottom: 14 }}><div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{label}</div>{children}</div>; }

/* ============ 文档视图 ============ */
function flowOrderItems(items, edges) {
  if (!items.length) return [];
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  const idx = Object.fromEntries(items.map((it, i) => [it.id, i]));
  const out = {}, inDeg = {}, connected = new Set();
  items.forEach((it) => { out[it.id] = []; inDeg[it.id] = 0; });
  edges.forEach((e) => {
    if (!byId[e.from] || !byId[e.to] || e.from === e.to) return;
    out[e.from].push(e.to);
    inDeg[e.to]++;
    connected.add(e.from); connected.add(e.to);
  });
  const byCanvas = (a, b) => {
    const aa = byId[a], bb = byId[b];
    return (aa.x - bb.x) || (aa.y - bb.y) || (idx[a] - idx[b]);
  };
  const byBranch = (a, b) => {
    const aa = byId[a], bb = byId[b];
    return (aa.y - bb.y) || (aa.x - bb.x) || (idx[a] - idx[b]);
  };
  const visited = new Set(), order = [];
  const visit = (id) => {
    if (visited.has(id)) return;
    visited.add(id); order.push(id);
    out[id].slice().sort(byBranch).forEach(visit);
  };
  const connectedIds = items.map((it) => it.id).filter((id) => connected.has(id));
  let roots = connectedIds.filter((id) => inDeg[id] === 0).sort(byCanvas);
  if (!roots.length) roots = connectedIds.slice().sort(byCanvas);
  roots.forEach(visit);
  connectedIds.filter((id) => !visited.has(id)).sort(byCanvas).forEach(visit);
  items.map((it) => it.id).filter((id) => !connected.has(id)).sort(byCanvas).forEach(visit);
  return order;
}

function normalizeDocOrder(order, nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  const out = [];
  (Array.isArray(order) ? order : []).forEach((id) => { if (ids.has(id) && !out.includes(id)) out.push(id); });
  nodes.forEach((n) => { if (!out.includes(n.id)) out.push(n.id); });
  return out;
}

function docFlowBlocks(doc) {
  const nodeById = Object.fromEntries(doc.nodes.map((n) => [n.id, n]));
  const groups = (doc.groups || []).map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => nodeById[id]) })).filter((g) => g.nodeIds.length);
  const grouped = new Set(); groups.forEach((g) => g.nodeIds.forEach((id) => grouped.add(id)));
  const blocks = [];
  const blockByNode = {};
  groups.forEach((g) => {
    const ns = g.nodeIds.map((id) => nodeById[id]).filter(Boolean);
    const minX = Math.min(...ns.map((n) => n.x)), minY = Math.min(...ns.map((n) => n.y));
    blocks.push({ id: "g:" + g.id, kind: "group", group: g, x: minX, y: minY });
    ns.forEach((n) => { blockByNode[n.id] = "g:" + g.id; });
  });
  doc.nodes.forEach((n) => {
    if (grouped.has(n.id)) return;
    blocks.push({ id: n.id, kind: "node", node: n, x: n.x, y: n.y });
    blockByNode[n.id] = n.id;
  });
  const seen = new Set(), blockEdges = [];
  doc.edges.forEach((e) => {
    const from = blockByNode[e.from], to = blockByNode[e.to];
    if (!from || !to || from === to) return;
    const key = from + ">" + to;
    if (!seen.has(key)) { seen.add(key); blockEdges.push({ from, to }); }
  });
  const blockMap = Object.fromEntries(blocks.map((b) => [b.id, b]));
  const blockOrder = flowOrderItems(blocks, blockEdges);
  const groupNodeOrder = {};
  groups.forEach((g) => {
    const items = g.nodeIds.map((id) => nodeById[id]).filter(Boolean).map((n) => ({ id: n.id, x: n.x, y: n.y }));
    const internalEdges = doc.edges.filter((e) => g.nodeIds.includes(e.from) && g.nodeIds.includes(e.to));
    groupNodeOrder[g.id] = flowOrderItems(items, internalEdges);
  });
  return { blockOrder, blockMap, groupNodeOrder, nodeById };
}

function buildDocPresentation(doc, sortMode, groupView) {
  const nodeById = Object.fromEntries(doc.nodes.map((n) => [n.id, n]));
  const groupByNode = {};
  (doc.groups || []).forEach((g) => g.nodeIds.forEach((id) => { if (nodeById[id]) groupByNode[id] = g; }));
  const manualOrder = normalizeDocOrder(doc.meta.docOrder, doc.nodes);
  const flow = docFlowBlocks(doc);
  const makeGroupNodes = (g, sourceIds) => sourceIds.filter((id) => g.nodeIds.includes(id) && nodeById[id]).map((id) => nodeById[id]);
  const makeUngroupedSection = (nodes, i) => ({ id: "u:" + i, kind: "ungrouped", title: "未分组页面", nodes });
  if (sortMode === "manual") {
    const flatManual = [];
    const sections = [];
    const emittedGroups = new Set();
    let pendingUngrouped = [];
    const flushUngrouped = () => {
      if (!pendingUngrouped.length) return;
      sections.push(makeUngroupedSection(pendingUngrouped, sections.length));
      pendingUngrouped = [];
    };
    manualOrder.forEach((id) => {
      const n = nodeById[id]; if (!n) return;
      const g = groupByNode[id];
      if (groupView && g) {
        flushUngrouped();
        if (emittedGroups.has(g.id)) return;
        emittedGroups.add(g.id);
        const nodes = makeGroupNodes(g, manualOrder);
        flatManual.push(...nodes.map((x) => x.id));
        sections.push({ id: "g:" + g.id, kind: "group", title: g.name || "新分组", colorIdx: g.colorIdx, nodes });
      } else if (groupView) {
        pendingUngrouped.push(n);
        flatManual.push(n.id);
      } else {
        flatManual.push(n.id);
      }
    });
    flushUngrouped();
    if (!groupView) sections.push({ id: "flat", kind: "flat", title: "", nodes: flatManual.map((id) => nodeById[id]).filter(Boolean) });
    return { sections, flatIds: groupView ? sections.flatMap((s) => s.nodes.map((n) => n.id)) : flatManual };
  }
  const sections = [];
  const flatIds = [];
  let pendingUngrouped = [];
  const flushUngrouped = () => {
    if (!pendingUngrouped.length) return;
    sections.push(makeUngroupedSection(pendingUngrouped, sections.length));
    pendingUngrouped.forEach((n) => flatIds.push(n.id));
    pendingUngrouped = [];
  };
  flow.blockOrder.forEach((bid) => {
    const b = flow.blockMap[bid]; if (!b) return;
    if (b.kind === "group") {
      const ids = flow.groupNodeOrder[b.group.id] || b.group.nodeIds;
      const nodes = ids.map((id) => nodeById[id]).filter(Boolean);
      if (groupView) {
        flushUngrouped();
        sections.push({ id: "g:" + b.group.id, kind: "group", title: b.group.name || "新分组", colorIdx: b.group.colorIdx, nodes });
      }
      nodes.forEach((n) => flatIds.push(n.id));
    } else if (b.node) {
      if (groupView) pendingUngrouped.push(b.node);
      else flatIds.push(b.node.id);
    }
  });
  flushUngrouped();
  if (!groupView) sections.push({ id: "flat", kind: "flat", title: "", nodes: flatIds.map((id) => nodeById[id]).filter(Boolean) });
  return { sections, flatIds };
}

const DOC_TABLE_MAX_EXTRA_COLS = 4;
const DOC_TABLE_MAX_ROW_CELLS = DOC_TABLE_MAX_EXTRA_COLS + 1;
const DOC_TABLE_VALUE_MIN_PCT = 9;
const DOC_TABLE_IMAGE_COL_MIN_PX = 220;
const DOC_TABLE_IMAGE_COL_MIN_PCT = 18;
const DOC_TABLE_BASE_ROWS = [
  { key: "note", label: "页面说明", placeholder: "点击填写:关键模块、交互说明…" },
  { key: "expGoal", label: "体验目标", placeholder: "点击填写这一页的体验目标" },
];
function docTableExtraCols(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(DOC_TABLE_MAX_EXTRA_COLS, Math.floor(n)));
}
function docTableEnsureCells(cells, minCount = 0, maxCount = DOC_TABLE_MAX_ROW_CELLS) {
  const safeMin = Math.max(0, Math.floor(Number(minCount) || 0));
  const safeMax = Math.max(safeMin, Math.floor(Number(maxCount) || safeMin));
  const out = Array.isArray(cells) ? cells.slice(0, safeMax) : [];
  while (out.length < safeMin) out.push("");
  return out;
}
function docTableRows(rows, minCells = 1) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row?.id || uid(),
    label: row?.label || "自定义项",
    cells: docTableEnsureCells(row?.cells, minCells, DOC_TABLE_MAX_ROW_CELLS),
  }));
}
function docTableBaseExtraCells(baseCells) {
  const src = baseCells && typeof baseCells === "object" ? baseCells : {};
  return {
    note: docTableEnsureCells(src.note, 0, DOC_TABLE_MAX_EXTRA_COLS),
    expGoal: docTableEnsureCells(src.expGoal, 0, DOC_TABLE_MAX_EXTRA_COLS),
  };
}
function docTableValueColCount(valueCols) {
  return Math.max(1, Math.min(DOC_TABLE_MAX_ROW_CELLS, Math.floor(Number(valueCols) || 1)));
}
function docTableKeyPct(valueCols) {
  const count = docTableValueColCount(valueCols);
  return count >= 4 ? 12 : count >= 3 ? 13 : 15;
}
function htmlHasImage(value) {
  return /<img\b/i.test(String(value || ""));
}
function docTableImageValueCols(node, baseCells, customRows) {
  const cols = new Set();
  DOC_TABLE_BASE_ROWS.forEach((row) => {
    if (htmlHasImage(node?.[row.key])) cols.add(0);
    (baseCells[row.key] || []).forEach((cell, index) => {
      if (htmlHasImage(cell)) cols.add(index + 1);
    });
  });
  customRows.forEach((row) => {
    row.cells.forEach((cell, index) => {
      if (htmlHasImage(cell)) cols.add(index);
    });
  });
  return cols;
}
function docTableMinValueWeights(valueCols, imageCols = new Set(), tableWidth = 0) {
  const count = docTableValueColCount(valueCols);
  const imagePct = tableWidth > 0
    ? (DOC_TABLE_IMAGE_COL_MIN_PX / Math.max(1, tableWidth)) * 100
    : DOC_TABLE_IMAGE_COL_MIN_PCT;
  return Array.from({ length: count }, (_, i) => (
    imageCols.has(i) ? Math.max(DOC_TABLE_VALUE_MIN_PCT, imagePct) : DOC_TABLE_VALUE_MIN_PCT
  ));
}
function docTableMinColWeights(valueCols, minValueWeights = []) {
  const count = Math.max(1, Math.min(DOC_TABLE_MAX_ROW_CELLS, Math.floor(Number(valueCols) || 1)));
  const key = docTableKeyPct(count);
  return [key, ...Array.from({ length: count }, (_, i) => Math.max(DOC_TABLE_VALUE_MIN_PCT, Number(minValueWeights[i]) || 0))];
}
function docTableDefaultColWeights(valueCols) {
  const count = docTableValueColCount(valueCols);
  const key = docTableKeyPct(count);
  const value = (100 - key) / count;
  return [key, ...Array(count).fill(value)];
}
function docTableFitValueWeights(values, minValueWeights, budget) {
  const count = minValueWeights.length;
  const fallback = Array(count).fill(budget / Math.max(1, count));
  const source = Array.isArray(values) ? values : fallback;
  const raw = Array.from({ length: count }, (_, i) => {
    const n = Number(source[i]);
    return Number.isFinite(n) && n > 0 ? n : fallback[i];
  });
  const minSum = minValueWeights.reduce((a, b) => a + b, 0);
  if (minSum >= budget) {
    const scale = budget / Math.max(1, minSum);
    return minValueWeights.map((v) => v * scale);
  }
  const rawSum = raw.reduce((a, b) => a + b, 0) || 1;
  const normalized = raw.map((v) => (v / rawSum) * budget);
  const extras = normalized.map((v, i) => Math.max(0, v - minValueWeights[i]));
  const extraSum = extras.reduce((a, b) => a + b, 0);
  const available = budget - minSum;
  return minValueWeights.map((min, i) => min + (extraSum > 0 ? (extras[i] / extraSum) * available : available / count));
}
function docTableFitColWeights(values, valueCols, minValueWeights = []) {
  const fallback = docTableDefaultColWeights(valueCols);
  const count = docTableValueColCount(valueCols);
  const key = docTableKeyPct(count);
  const budget = 100 - key;
  const valueMins = Array.from({ length: count }, (_, i) => Math.max(DOC_TABLE_VALUE_MIN_PCT, Number(minValueWeights[i]) || 0));
  const sourceValues = Array.isArray(values) && values.length > 1 ? values.slice(1, count + 1) : fallback.slice(1);
  const fittedValues = docTableFitValueWeights(sourceValues, valueMins, budget);
  const fitted = [key, ...fittedValues];
  return fitted.map((v) => Number(v.toFixed(4)));
}
function docTableColWeights(weights, valueCols, minValueWeights = []) {
  return docTableFitColWeights(weights, valueCols, minValueWeights);
}
function docTableResizeColWeights(weights, boundaryIndex, deltaPct, minValueWeights = []) {
  if (boundaryIndex <= 0) return weights;
  const valueCols = Math.max(1, weights.length - 1);
  const mins = docTableMinColWeights(valueCols, minValueWeights);
  const left = Math.max(0, Math.min(weights.length - 2, boundaryIndex));
  const right = left + 1;
  const pair = weights[left] + weights[right];
  const minLeft = mins[left];
  const minRight = mins[right];
  if (pair <= minLeft + minRight) return weights;
  const nextLeft = Math.min(pair - minRight, Math.max(minLeft, weights[left] + deltaPct));
  const next = weights.slice();
  next[left] = nextLeft;
  next[right] = pair - nextLeft;
  return docTableFitColWeights(next, valueCols, minValueWeights);
}
function docTableCellKey(cell) {
  if (!cell) return "";
  return `${cell.nodeId || ""}|${cell.rowKind || ""}|${cell.rowId || ""}|${Number(cell.colIndex)}`;
}
function sameDocTableCell(a, b) {
  return !!a && !!b && docTableCellKey(a) === docTableCellKey(b);
}
function docTableCanDeleteCell(cell) {
  const col = Number(cell?.colIndex);
  return !!cell?.nodeId && (cell.rowKind === "note" || cell.rowKind === "expGoal" || cell.rowKind === "custom") && Number.isFinite(col) && col > 0;
}
function docTableCanMergeTarget(source, target) {
  const col = Number(target?.colIndex);
  return !!source && !!target
    && source.nodeId === target.nodeId
    && source.rowKind === target.rowKind
    && source.rowId === target.rowId
    && (target.rowKind === "note" || target.rowKind === "expGoal" || target.rowKind === "custom")
    && Number.isFinite(col)
    && col >= 0
    && !sameDocTableCell(source, target);
}
function docTableCellHasContent(value) {
  return !!htmlToText(value).trim() || /<img\b/i.test(String(value || ""));
}
function docTableCellValue(node, cell) {
  if (!node || !cell) return "";
  const col = Number(cell.colIndex);
  if (!Number.isFinite(col) || col < 0) return "";
  if (cell.rowKind === "note" || cell.rowKind === "expGoal") {
    if (col === 0) return node[cell.rowKind] || "";
    const baseCells = docTableBaseExtraCells(node.docTableBaseCells);
    return baseCells[cell.rowKind]?.[col - 1] || "";
  }
  if (cell.rowKind === "custom") {
    const row = docTableRows(node.docTableRows, 1).find((item) => item.id === cell.rowId);
    return row?.cells?.[col] || "";
  }
  return "";
}
function docTableMergeHtmlValues(targetValue, sourceValue) {
  const target = String(targetValue || "").trim();
  const source = String(sourceValue || "").trim();
  if (!target) return source;
  if (!source) return target;
  return `${target}<br>${source}`;
}

function DocView({ doc, update, onOpenCanvas, focusNodeTarget, onFocusNodeHandled, readOnly = false, comments = [], onAddComment = null, currentUser = null }) {
  const setMeta = (k, v) => { if (!readOnly) update({ ...doc, meta: { ...doc.meta, [k]: v } }); };
  const setNode = (id, patch) => { if (!readOnly) update({ ...doc, nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }); };
  const setEdge = (id, patch) => { if (!readOnly) update({ ...doc, edges: doc.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }); };
  const setComp = (nid, cid, patch) => { if (!readOnly) update({ ...doc, nodes: doc.nodes.map((n) => (n.id === nid ? { ...n, competitors: n.competitors.map((c) => (c.id === cid ? { ...c, ...patch } : c)) } : n)) }); };
  const [sortOpen, setSortOpen] = useState(false);
  const sortMode = doc.meta.docSortMode === "manual" ? "manual" : "flow";
  const groupView = doc.meta.docGroupView !== false;
  const showPageTransitions = doc.meta.docShowPageTransitions !== false;
  const presentation = useMemo(() => buildDocPresentation(doc, sortMode, groupView), [doc, sortMode, groupView]);
  const orderedNodes = presentation.flatIds.map((id) => doc.nodes.find((n) => n.id === id)).filter(Boolean);
  const orderIndex = Object.fromEntries(orderedNodes.map((n, i) => [n.id, i]));
  const saveSortOrder = (ids, nextGroupView = groupView, orderDirty = false) => {
    if (readOnly) return;
    if (sortMode !== "manual" && !orderDirty) {
      update({ ...doc, meta: { ...doc.meta, docGroupView: nextGroupView } });
      return;
    }
    update({ ...doc, meta: { ...doc.meta, docSortMode: "manual", docOrder: normalizeDocOrder(ids, doc.nodes), docGroupView: nextGroupView } });
  };
  const restoreDefaultSort = (nextGroupView = groupView) => {
    if (readOnly) return;
    update({ ...doc, meta: { ...doc.meta, docSortMode: "flow", docOrder: [], docGroupView: nextGroupView } });
  };
  const docScrollRef = useRef(null);
  const docArticleRef = useRef(null);
  const toolbarImageRef = useRef(null);
  const savedRangeRef = useRef(null);
  const [commentPrompt, setCommentPrompt] = useState(null);
  const [commentDraft, setCommentDraft] = useState(null);
  const [hoverCommentId, setHoverCommentId] = useState(null);
  const [commentPositions, setCommentPositions] = useState({});
  const [commentLayerHeight, setCommentLayerHeight] = useState(0);
  const canComment = readOnly && typeof onAddComment === "function";
  const [activeTable, setActiveTable] = useState(null);
  const activeTableRef = useRef(null);
  activeTableRef.current = activeTable;
  const [pendingCellDelete, setPendingCellDelete] = useState(null);
  const [mergeCellMode, setMergeCellMode] = useState(null);
  const [mergeHoverCell, setMergeHoverCell] = useState(null);
  const [tocActive, setTocActive] = useState("doc-bg");
  const pageTocItems = orderedNodes.map((n, idx) => ({
    id: `doc-page-${safeDomId(n.id)}`,
    label: n.name || `未命名页面 ${idx + 1}`,
  }));
  const tocItems = [
    { id: "doc-bg", label: "一、需求背景" },
    { id: "doc-goals", label: "二、目标" },
    { id: "doc-flow", label: "三、总流程" },
    { id: "doc-pages", label: `四、页面明细 · ${doc.nodes.length}`, children: pageTocItems },
  ];
  const tocIds = [];
  const collectTocIds = (items) => items.forEach((item) => {
    tocIds.push(item.id);
    if (item.children?.length) collectTocIds(item.children);
  });
  collectTocIds(tocItems);
  const tocIdKey = tocIds.join("|");
  useEffect(() => {
    const scroller = docScrollRef.current;
    if (!scroller || !tocIds.length) return undefined;
    let frame = 0;
    const updateActiveFromScroll = () => {
      frame = 0;
      const scrollerRect = scroller.getBoundingClientRect();
      const activationY = Math.min(140, scrollerRect.height * 0.28);
      let active = tocIds[0];
      for (const id of tocIds) {
        const el = document.getElementById(id);
        if (!el || !scroller.contains(el)) continue;
        const top = el.getBoundingClientRect().top - scrollerRect.top;
        if (top <= activationY) active = id;
        else break;
      }
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
        const lastVisible = tocIds.slice().reverse().find((id) => {
          const el = document.getElementById(id);
          return el && scroller.contains(el);
        });
        if (lastVisible) active = lastVisible;
      }
      setTocActive((prev) => (prev === active ? prev : active));
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveFromScroll);
    };
    updateActiveFromScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [tocIdKey]);
  useEffect(() => {
    if (!focusNodeTarget?.id) return undefined;
    const pageId = `doc-page-${safeDomId(focusNodeTarget.id)}`;
    const timer = window.setTimeout(() => {
      jumpToDocSection(pageId);
      window.setTimeout(() => focusDocPageEditor(pageId), 220);
      onFocusNodeHandled?.();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [focusNodeTarget?.id, focusNodeTarget?.nonce]);
  useEffect(() => {
    const clearWhenLeavingTables = (e) => {
      const target = e.target;
      if (target?.closest?.("[data-doc-cell-delete-modal='1']") || target?.closest?.("[data-doc-merge-hint='1']")) return;
      if (target?.closest?.("[data-doc-page-table='1']") || target?.closest?.("[data-doc-toolbar='1']") || target?.closest?.("[data-doc-table-resizer='1']")) return;
      setActiveTable(null);
    };
    document.addEventListener("focusin", clearWhenLeavingTables);
    document.addEventListener("mousedown", clearWhenLeavingTables);
    return () => {
      document.removeEventListener("focusin", clearWhenLeavingTables);
      document.removeEventListener("mousedown", clearWhenLeavingTables);
    };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setPendingCellDelete(null);
      setMergeCellMode(null);
      setMergeHoverCell(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
	  function getActiveEditor() {
	    const active = document.activeElement;
	    if (active?.closest) {
	      const editor = active.closest("[data-rich-editor='1']");
	      if (editor) return editor;
	    }
	    const sel = window.getSelection();
	    if (sel && sel.rangeCount) {
	      const node = sel.getRangeAt(0).commonAncestorContainer;
	      const el = node.nodeType === 1 ? node : node.parentElement;
	      const editor = el?.closest?.("[data-rich-editor='1']");
	      if (editor) return editor;
	    }
	    return savedRangeRef.current?.editor?.isConnected ? savedRangeRef.current.editor : null;
	  }
	  function fallbackRichEditor() {
	    return docScrollRef.current?.querySelector?.("[data-rich-editor='1'][contenteditable='true']") || document.querySelector("[data-rich-editor='1'][contenteditable='true']");
	  }
	  function editorContainsRange(editor, range) {
	    try { return !!editor && !!range && editor.contains(range.commonAncestorContainer); } catch { return false; }
	  }
	  function rememberSelection() {
	    const editor = getActiveEditor();
	    const sel = window.getSelection();
	    if (editor && sel && sel.rangeCount && editorContainsRange(editor, sel.getRangeAt(0))) savedRangeRef.current = { editor, range: sel.getRangeAt(0).cloneRange() };
	    return editor;
	  }
	  function restoreSelection(allowFallback = false) {
	    const saved = savedRangeRef.current;
	    if (saved?.editor?.isConnected && editorContainsRange(saved.editor, saved.range)) {
	      saved.editor.focus();
	      const sel = window.getSelection();
	      if (!sel) return saved.editor;
	      sel.removeAllRanges();
	      sel.addRange(saved.range);
	      return saved.editor;
	    }
	    const editor = getActiveEditor() || (allowFallback ? fallbackRichEditor() : null);
	    if (!editor) return null;
	    editor.focus();
	    const sel = window.getSelection();
	    if (!sel) return editor;
	    if (!sel.rangeCount || !editorContainsRange(editor, sel.getRangeAt(0))) {
	      const range = document.createRange();
	      range.selectNodeContents(editor);
	      range.collapse(false);
	      sel.removeAllRanges();
	      sel.addRange(range);
	      savedRangeRef.current = { editor, range: range.cloneRange() };
	    }
	    return editor;
	  }
	  function syncEditor(editor) {
	    if (!editor) return;
	    try {
	      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "formatSetBlockTextDirection" }));
	    } catch {
	      editor.dispatchEvent(new Event("input", { bubbles: true }));
	    }
	    rememberSelection();
	  }
	  function insertHtmlIntoEditor(editor, html, caretLineId) {
	    if (readOnly || !editor) return;
	    const safeId = caretLineId ? String(caretLineId).replace(/\\/g, "\\\\").replace(/"/g, '\\"') : "";
	    const findCaretLine = () => safeId ? editor.querySelector(`[data-rte-caret-line="${safeId}"]`) : null;
	    const sel = window.getSelection();
	    if (!sel) return;
	    let range = savedRangeRef.current?.editor === editor && editorContainsRange(editor, savedRangeRef.current.range)
	      ? savedRangeRef.current.range.cloneRange()
	      : null;
	    if (!range && sel?.rangeCount && editorContainsRange(editor, sel.getRangeAt(0))) range = sel.getRangeAt(0).cloneRange();
	    if (!range) {
	      range = document.createRange();
	      range.selectNodeContents(editor);
	      range.collapse(false);
	    }
	    editor.focus();
	    sel.removeAllRanges();
	    sel.addRange(range);
	    try { document.execCommand("insertHTML", false, html); } catch {}
	    if (caretLineId && !findCaretLine()) {
	      const activeRange = sel.rangeCount && editorContainsRange(editor, sel.getRangeAt(0)) ? sel.getRangeAt(0) : range;
	      const template = document.createElement("template");
	      template.innerHTML = html;
	      const frag = template.content;
	      const last = frag.lastChild;
	      activeRange.deleteContents();
	      activeRange.insertNode(frag);
	      if (last) {
	        const next = document.createRange();
	        next.setStartAfter(last);
	        next.collapse(true);
	        sel.removeAllRanges();
	        sel.addRange(next);
	      }
	    }
	    const line = findCaretLine();
	    if (line) {
	      line.removeAttribute("data-rte-caret-line");
	      placeCaretInsideEditableLine(editor, line);
	    }
	    syncEditor(editor);
	  }
	  function runDocCommand(type, value) {
	    if (readOnly) return;
	    const editor = restoreSelection();
    if (!editor) return;
    try {
      if (type === "link") {
        const selectedText = window.getSelection?.()?.toString?.().trim();
        const url = window.prompt("输入链接地址", "https://");
        if (!url) return;
        document.execCommand("createLink", false, url);
        if (selectedText) markEditableLinksInSelection(editor, url);
      } else if (type === "highlight") {
        if (!document.execCommand("hiliteColor", false, "#FCE9A6")) document.execCommand("backColor", false, "#FCE9A6");
      } else {
        document.execCommand(type, false, value);
      }
    } catch {}
    syncEditor(editor);
  }
	  async function insertToolbarImage(file) {
	    if (readOnly) return;
	    if (!file) return;
	    const editor = restoreSelection(true);
	    if (!editor) return;
	    const data = await imageFileToManagedSrc(file, "doc-image");
	    const lineId = uid();
	    const html = `<div data-rte-image-row="1" contenteditable="false"><img src="${data}" alt="${escapeHtmlAttrValue(file.name || "")}"></div><div data-rte-text-line="1" data-rte-caret-line="${lineId}"><br></div>`;
	    insertHtmlIntoEditor(editor, html, lineId);
	  }
  function runTableCommand(command, options = {}) {
    if (readOnly) return;
    const target = options.target || activeTableRef.current;
    if (!target?.nodeId) return;
    if (command === "remove-col" && !options.force) {
      const node = doc.nodes.find((item) => item.id === target.nodeId);
      const value = docTableCellValue(node, target);
      if (docTableCanDeleteCell(target) && docTableCellHasContent(value)) {
        setPendingCellDelete({ target: { ...target }, content: value });
        return;
      }
    }
    let changed = false;
    let nextActive = target;
    const nodes = doc.nodes.map((n) => {
      if (n.id !== target.nodeId) return n;
      const baseCells = docTableBaseExtraCells(n.docTableBaseCells);
      const rows = docTableRows(n.docTableRows, 1);
      const rowIndex = rows.findIndex((row) => row.id === target.rowId);
      const getTargetCellCount = () => {
        if (target.rowKind === "note" || target.rowKind === "expGoal") return 1 + (baseCells[target.rowKind]?.length || 0);
        if (target.rowKind === "custom" && rowIndex >= 0) return Math.max(1, rows[rowIndex].cells.length);
        return 1;
      };

      if (command === "add-row") {
        const newRow = { id: uid(), label: "自定义项", cells: docTableEnsureCells([], getTargetCellCount()) };
        const nextRows = rows.slice();
        if (target.rowKind === "custom" && rowIndex >= 0) nextRows.splice(rowIndex + 1, 0, newRow);
        else nextRows.push(newRow);
        changed = true;
        nextActive = { nodeId: target.nodeId, rowKind: "custom", rowId: newRow.id, colIndex: 0, selection: "cell" };
        return { ...n, docTableRows: nextRows, docTableBaseCells: baseCells };
      }

      if (command === "remove-row") {
        if (target.rowKind !== "custom" || rowIndex < 0) return n;
        const nextRows = rows.filter((row) => row.id !== target.rowId);
        const nextRow = nextRows[Math.min(rowIndex, nextRows.length - 1)];
        changed = true;
        nextActive = nextRow
          ? { nodeId: target.nodeId, rowKind: "custom", rowId: nextRow.id, colIndex: 0, selection: "cell" }
          : { nodeId: target.nodeId, rowKind: "note", rowId: "note", colIndex: 0, selection: "cell" };
        return { ...n, docTableRows: nextRows, docTableBaseCells: baseCells };
      }

      if (command === "add-col") {
        const currentCells = getTargetCellCount();
        if (currentCells >= DOC_TABLE_MAX_ROW_CELLS) return n;
        const selectedCol = Math.max(0, Number(target.colIndex) || 0);
        const insertCol = Math.max(1, Math.min(selectedCol + 1, currentCells));
        const insertAt = (arr, index) => [...arr.slice(0, index), "", ...arr.slice(index)];
        let nextBaseCells = baseCells;
        let nextRows = rows;
        if (target.rowKind === "note" || target.rowKind === "expGoal") {
          nextBaseCells = { ...baseCells, [target.rowKind]: insertAt(baseCells[target.rowKind] || [], insertCol - 1) };
        } else if (target.rowKind === "custom" && rowIndex >= 0) {
          nextRows = rows.map((row, i) => (i === rowIndex ? { ...row, cells: insertAt(row.cells, insertCol) } : row));
        } else {
          nextBaseCells = { ...baseCells, note: insertAt(baseCells.note || [], insertCol - 1) };
        }
        changed = true;
        nextActive = { nodeId: target.nodeId, rowKind: target.rowKind || "note", rowId: target.rowId || "note", colIndex: insertCol, selection: "cell" };
        return { ...n, docTableBaseCells: nextBaseCells, docTableRows: nextRows };
      }

      if (command === "remove-col") {
        const removeCol = Number(target.colIndex);
        if (!Number.isFinite(removeCol) || removeCol <= 0) return n;
        let nextBaseCells = baseCells;
        let nextRows = rows;
        let remainingCells = 1;
        if (target.rowKind === "note" || target.rowKind === "expGoal") {
          const extras = baseCells[target.rowKind] || [];
          if (removeCol > extras.length) return n;
          nextBaseCells = { ...baseCells, [target.rowKind]: extras.filter((_, i) => i !== removeCol - 1) };
          remainingCells = 1 + nextBaseCells[target.rowKind].length;
        } else if (target.rowKind === "custom" && rowIndex >= 0) {
          if (removeCol >= rows[rowIndex].cells.length) return n;
          nextRows = rows.map((row, i) => (i === rowIndex ? { ...row, cells: row.cells.filter((_, idx) => idx !== removeCol) } : row));
          remainingCells = nextRows[rowIndex].cells.length;
        } else {
          return n;
        }
        changed = true;
        nextActive = remainingCells > 1
          ? { ...target, colIndex: Math.min(removeCol, remainingCells - 1), selection: "cell" }
          : { nodeId: target.nodeId, rowKind: target.rowKind, rowId: target.rowId, colIndex: 0, selection: "cell" };
        return { ...n, docTableBaseCells: nextBaseCells, docTableRows: nextRows };
      }

      return n;
    });
    if (!changed) return;
    update({ ...doc, nodes });
    setActiveTable(nextActive);
  }
  function startPendingCellMerge() {
    if (readOnly) return;
    if (!pendingCellDelete?.target) return;
    const source = { ...pendingCellDelete.target };
    setPendingCellDelete(null);
    setMergeHoverCell(null);
    setMergeCellMode({ source });
    setActiveTable(source);
  }
  function forceDeletePendingCell() {
    if (readOnly) return;
    const target = pendingCellDelete?.target;
    setPendingCellDelete(null);
    if (target) runTableCommand("remove-col", { target, force: true });
  }
  function cancelCellMerge() {
    setMergeCellMode(null);
    setMergeHoverCell(null);
  }
  function mergeSelectedCellInto(target) {
    if (readOnly) return;
    const source = mergeCellMode?.source;
    if (!docTableCanMergeTarget(source, target)) return;
    let nextActive = target;
    const nodes = doc.nodes.map((n) => {
      if (n.id !== source.nodeId) return n;
      const sourceCol = Number(source.colIndex);
      const targetCol = Number(target.colIndex);
      const sourceValue = docTableCellValue(n, source);
      if (!docTableCellHasContent(sourceValue) || !docTableCanDeleteCell(source)) return n;

      if (source.rowKind === "note" || source.rowKind === "expGoal") {
        const baseCells = docTableBaseExtraCells(n.docTableBaseCells);
        const extras = (baseCells[source.rowKind] || []).slice();
        if (sourceCol - 1 < 0 || sourceCol - 1 >= extras.length) return n;
        let nextNodeValue = n[source.rowKind] || "";
        if (targetCol === 0) nextNodeValue = docTableMergeHtmlValues(nextNodeValue, sourceValue);
        else if (targetCol - 1 >= 0 && targetCol - 1 < extras.length) extras[targetCol - 1] = docTableMergeHtmlValues(extras[targetCol - 1], sourceValue);
        else return n;
        const nextExtras = extras.filter((_, index) => index !== sourceCol - 1);
        const nextTargetCol = targetCol > sourceCol ? targetCol - 1 : targetCol;
        nextActive = { ...target, colIndex: nextTargetCol, selection: "cell" };
        return { ...n, [source.rowKind]: nextNodeValue, docTableBaseCells: { ...baseCells, [source.rowKind]: nextExtras } };
      }

      if (source.rowKind === "custom") {
        const rows = docTableRows(n.docTableRows, 1);
        const rowIndex = rows.findIndex((row) => row.id === source.rowId);
        if (rowIndex < 0) return n;
        const row = rows[rowIndex];
        if (sourceCol < 0 || sourceCol >= row.cells.length || targetCol < 0 || targetCol >= row.cells.length) return n;
        const nextCells = row.cells.slice();
        nextCells[targetCol] = docTableMergeHtmlValues(nextCells[targetCol], sourceValue);
        const filteredCells = nextCells.filter((_, index) => index !== sourceCol);
        const nextTargetCol = targetCol > sourceCol ? targetCol - 1 : targetCol;
        nextActive = { ...target, colIndex: nextTargetCol, selection: "cell" };
        return { ...n, docTableRows: rows.map((item, index) => (index === rowIndex ? { ...item, cells: filteredCells } : item)) };
      }

      return n;
    });
    update({ ...doc, nodes });
    setMergeCellMode(null);
    setMergeHoverCell(null);
    setActiveTable(nextActive);
  }
  function jumpToDocSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    setTocActive(id);
    const scroller = docScrollRef.current || document.querySelector("[data-doc-scroll='1']");
    if (scroller && scroller.contains(el)) {
      const scrollerRect = scroller.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const nextTop = scroller.scrollTop + elRect.top - scrollerRect.top - 24;
      const top = Math.max(0, nextTop);
      scroller.scrollTop = top;
      try { scroller.scrollTo({ top, behavior: "smooth" }); } catch {}
      window.setTimeout(() => { if (Math.abs(scroller.scrollTop - top) > 8) scroller.scrollTop = top; }, 80);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function focusDocPageEditor(pageId) {
    if (readOnly) return;
    const page = document.getElementById(pageId);
    if (!page) return;
    const editor = page.querySelector("[data-rich-editor='1']");
    const target = editor || page.querySelector("input,textarea,[contenteditable='true']");
    if (!target) return;
    try { target.focus({ preventScroll: true }); } catch { target.focus(); }
    if (target.isContentEditable) {
      const sel = window.getSelection?.();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function getCommentTarget(anchor) {
    const scroller = docScrollRef.current;
    if (!scroller || !anchor) return null;
    let target = null;
    if (anchor.type === "prototype" && anchor.nodeId) {
      const page = document.getElementById(`doc-page-${safeDomId(anchor.nodeId)}`);
      target = page?.querySelector?.("[data-doc-proto-frame='1']") || null;
    }
    if (!target && anchor.sectionId) target = document.getElementById(anchor.sectionId);
    if (!target && anchor.nodeId) target = document.getElementById(`doc-page-${safeDomId(anchor.nodeId)}`);
    return target && scroller.contains(target) ? target : null;
  }
  function recomputeCommentPositions() {
    const scroller = docScrollRef.current;
    if (!scroller) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const next = {};
    comments.forEach((comment) => {
      const anchor = comment?.anchor || {};
      const target = getCommentTarget(anchor);
      if (!target) return;
      if (anchor.type === "prototype" && anchor.assetSrc) {
        const node = doc.nodes.find((item) => item.id === anchor.nodeId);
        if (!node?.proto || String(node.proto) !== String(anchor.assetSrc)) return;
      }
      if (anchor.type !== "prototype" && anchor.quote) {
        const targetText = (target.textContent || "").replace(/\s+/g, " ").trim();
        const quoteText = String(anchor.quote || "").replace(/\s+/g, " ").trim();
        if (quoteText && !targetText.includes(quoteText)) return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const baseLeft = scroller.scrollLeft + rect.left - scrollerRect.left + rect.width * (Number(anchor.xPct ?? 50) / 100);
      const baseTop = scroller.scrollTop + rect.top - scrollerRect.top + rect.height * (Number(anchor.yPct ?? 50) / 100);
      const textOffset = anchor.type === "prototype" ? { x: 0, y: 0 } : { x: 12, y: -8 };
      next[comment.id] = {
        left: baseLeft + textOffset.x,
        top: baseTop + textOffset.y,
      };
    });
    setCommentPositions((prev) => {
      const prevKeys = Object.keys(prev || {});
      const nextKeys = Object.keys(next);
      const same = prevKeys.length === nextKeys.length && nextKeys.every((id) => (
        prev?.[id]
        && Math.abs(Number(prev[id].left) - Number(next[id].left)) < 0.5
        && Math.abs(Number(prev[id].top) - Number(next[id].top)) < 0.5
      ));
      return same ? prev : next;
    });
    const nextLayerHeight = Math.max(scroller.scrollHeight, scroller.clientHeight);
    setCommentLayerHeight((prev) => (Math.abs(Number(prev || 0) - nextLayerHeight) < 1 ? prev : nextLayerHeight));
  }
  useEffect(() => {
    if (!comments.length) {
      setCommentPositions({});
      return undefined;
    }
    const schedule = () => window.requestAnimationFrame(recomputeCommentPositions);
    const frame = schedule();
    const t1 = window.setTimeout(recomputeCommentPositions, 160);
    const t2 = window.setTimeout(recomputeCommentPositions, 700);
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", schedule);
    };
  }, [comments, doc.nodes, showPageTransitions, groupView]);
  useEffect(() => {
    if (!comments.length) return undefined;
    const article = docArticleRef.current;
    const scroller = docScrollRef.current;
    if (!article || !scroller) return undefined;
    let frame = 0;
    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        recomputeCommentPositions();
      });
    };
    schedule();
    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(article);
      resizeObserver.observe(scroller);
    }
    let mutationObserver = null;
    if (typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(schedule);
      mutationObserver.observe(article, { childList: true, subtree: true, attributes: true, characterData: true });
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect?.();
      mutationObserver?.disconnect?.();
    };
  }, [comments.length, doc.meta, doc.nodes, showPageTransitions, groupView]);
  useEffect(() => {
    if (canComment) return;
    setCommentPrompt(null);
    setCommentDraft(null);
  }, [canComment]);
  function buildTextCommentDraftFromSelection() {
    if (!canComment) return null;
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const quote = sel.toString().replace(/\s+/g, " ").trim();
    if (!quote) return null;
    const range = sel.getRangeAt(0);
    const article = docArticleRef.current;
    if (!article || !article.contains(range.commonAncestorContainer)) return null;
    const rect = range.getBoundingClientRect();
    if (rect.width < 1 && rect.height < 1) return null;
    const node = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const section = node?.closest?.("[data-doc-page-id],#doc-bg,#doc-goals,#doc-flow,#doc-pages") || article.querySelector("#doc-bg") || article;
    const sectionRect = section.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const promptY = rect.top - 12;
    const markerX = Math.min(sectionRect.right - 10, Math.max(sectionRect.left + 10, rect.right + 8));
    const markerY = Math.min(sectionRect.bottom - 8, Math.max(sectionRect.top + 8, rect.top + Math.min(8, rect.height / 2)));
    const nodeId = section.getAttribute?.("data-doc-page-id") || "";
    return {
      x: centerX,
      y: promptY,
      anchor: {
        type: "text",
        nodeId,
        sectionId: section.id || (nodeId ? `doc-page-${safeDomId(nodeId)}` : "doc-bg"),
        xPct: sectionRect.width ? Math.max(0, Math.min(100, ((markerX - sectionRect.left) / sectionRect.width) * 100)) : 50,
        yPct: sectionRect.height ? Math.max(0, Math.min(100, ((markerY - sectionRect.top) / sectionRect.height) * 100)) : 50,
        quote: quote.slice(0, 240),
        label: "文字评论",
      },
    };
  }
  function handleDocMouseUp(e) {
    if (!canComment) return;
    if (e.target?.closest?.("[data-doc-comment-ui='1']")) return;
    if (e.target?.closest?.("#doc-comments")) return;
    window.setTimeout(() => {
      const draft = buildTextCommentDraftFromSelection();
      setCommentPrompt(draft);
    }, 0);
  }
  function openCommentComposer(anchor, x, y) {
    if (!canComment) return;
    setCommentPrompt(null);
    setCommentDraft({
      anchor,
      x: Math.max(18, Math.min(window.innerWidth - 340, x)),
      y: Math.max(18, Math.min(window.innerHeight - 210, y)),
      content: "",
    });
  }
  async function submitCommentDraft(content) {
    if (!commentDraft?.anchor) return;
    const comment = await onAddComment?.({ anchor: commentDraft.anchor, content });
    if (comment?.id) window.setTimeout(recomputeCommentPositions, 80);
    setCommentDraft(null);
    setCommentPrompt(null);
    window.getSelection?.()?.removeAllRanges?.();
  }
  function focusComment(comment) {
    if (!comment?.id) return;
    const pos = commentPositions[comment.id];
    if (!pos) return;
    const scroller = docScrollRef.current;
    if (!scroller) return;
    const top = Math.max(0, pos.top - Math.min(180, scroller.clientHeight * 0.28));
    try { scroller.scrollTo({ top, behavior: "smooth" }); } catch { scroller.scrollTop = top; }
  }

  return (
    <div className="doc-editor-workbench" style={{ position: "absolute", inset: 0, overflow: "hidden", background: C.paper, backgroundImage: `radial-gradient(${C.grid} 1px, transparent 1px)`, backgroundSize: "20px 20px", padding: 20, display: "flex", gap: 20 }}>
      {!readOnly && <DocFormatToolbar onCommand={runDocCommand} onBeforeCommand={rememberSelection} onImage={() => { rememberSelection(); toolbarImageRef.current?.click(); }} tableActive={!!activeTable} onTableCommand={runTableCommand} />}
      {!readOnly && <input ref={toolbarImageRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { insertToolbarImage(e.target.files?.[0]); e.target.value = ""; }} />}
      {!readOnly && mergeCellMode && (
        <div data-doc-merge-hint="1"
          style={{ position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 20, display: "flex", alignItems: "center", gap: 12, padding: "10px 12px 10px 14px", borderRadius: 999, background: "rgba(15,23,42,.92)", color: "#fff", boxShadow: "0 16px 38px rgba(15,23,42,.22)", fontFamily: sans, fontSize: 13, fontWeight: 750, lineHeight: 1, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: C.indigo, boxShadow: "0 0 0 4px rgba(59,130,246,.2)", flexShrink: 0 }} />
          <span style={{ whiteSpace: "nowrap" }}>选择合并目标：悬浮并点击同一行可编辑单元格完成合并</span>
          <span style={{ color: "rgba(255,255,255,.58)", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>Esc 取消</span>
          <button type="button" onClick={cancelCellMerge}
            style={{ border: "none", borderRadius: 999, background: "rgba(255,255,255,.14)", color: "#fff", height: 28, padding: "0 10px", fontFamily: sans, fontSize: 12, fontWeight: 850, cursor: "pointer" }}>取消</button>
        </div>
      )}

      <main style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", position: "relative", zIndex: 2 }}>
        <div ref={docScrollRef} className="scl doc-hide-scrollbar" data-doc-scroll="1" onMouseUpCapture={handleDocMouseUp} style={{ flex: 1, minHeight: 0, width: "100%", background: C.surface, border: "1px solid rgba(226,232,240,.86)", borderRadius: 24, overflowY: "auto", boxShadow: "0 10px 40px -10px rgba(59,130,246,.08), 0 0 20px -5px rgba(0,0,0,.03)", position: "relative" }}>
          <article ref={docArticleRef} className="doc-article" style={{ maxWidth: 1240, margin: "0 auto", padding: "72px 54px 40px" }}>
            <DocEdit value={doc.meta.name} onChange={(v) => setMeta("name", v)} placeholder="未命名需求" readOnly={readOnly}
              style={{ fontFamily: sans, fontSize: 42, fontWeight: 800, lineHeight: 1.15, color: C.ink, letterSpacing: 0, marginBottom: 8, padding: 0 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.faint, fontSize: 12.5, fontFamily: mono, marginBottom: 30, flexWrap: "wrap" }}>
              <span>{doc.meta.createdBy || LOCAL_USER_NAME} 创建于 {formatDocTime(doc.meta.createdAt || doc.meta.date)}</span>
              <span>·</span>
              <span>最近修改于 {formatDocTime(doc.meta.updatedAt || doc.meta.date)}</span>
              {doc.meta.analysisUrl && <><span>·</span><span>分析文档已附</span></>}
            </div>
            <div style={{ width: 64, height: 4, background: C.indigoSoft, borderRadius: 999, marginBottom: 42 }} />

            <DocSection id="doc-bg" title="一、需求背景">
              <RichEditor value={doc.meta.background} onChange={(v) => setMeta("background", v)} placeholder="点击填写需求背景：业务场景、为什么做这个需求…" style={docP} readOnly={readOnly} />
            </DocSection>

            <DocSection id="doc-goals" title="二、目标">
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,.03)" }}>
                <table style={tbl}><tbody>
                  <tr><td style={tdKey}>数据目标</td><td style={tdVal}><RichEditor value={doc.meta.dataGoals} onChange={(v) => setMeta("dataGoals", v)} placeholder="点击填写，如 客服进线率 -15%" readOnly={readOnly} /></td></tr>
                  <tr><td style={{ ...tdKey, borderBottom: "none" }}>体验目标</td><td style={{ ...tdVal, borderBottom: "none" }}><RichEditor value={doc.meta.expGoals} onChange={(v) => setMeta("expGoals", v)} placeholder="点击填写，如 10 秒内自助定位物流状态" readOnly={readOnly} /></td></tr>
                </tbody></table>
              </div>
            </DocSection>

            <DocSection id="doc-flow" title="三、总流程">
              {doc.nodes.length === 0 ? <Empty /> : <FlowThumb doc={doc} onOpenCanvas={onOpenCanvas} />}
            </DocSection>

            <DocSection id="doc-pages" title={`四、页面明细 · ${doc.nodes.length}`} action={!readOnly && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DocDisplayOptions showPageTransitions={showPageTransitions} onShowPageTransitionsChange={(next) => setMeta("docShowPageTransitions", next)} />
                <Btn small kind="ghost" onClick={() => setSortOpen(true)}>排序</Btn>
              </div>
            )}>
              {doc.nodes.length === 0 ? <Empty /> : presentation.sections.map((section, index) => (
                <div key={section.id} id={`doc-section-${safeDomId(section.id || index)}`} style={{ marginBottom: groupView && section.kind !== "flat" ? 28 : 0, scrollMarginTop: 24 }}>
                  {groupView && section.kind !== "flat" && (
                    <DocGroupHeader section={section} />
                  )}
	                  {section.nodes.map((n) => (
	                    <PageDocBlock key={n.id} node={n} doc={doc}
	                      isLast={(orderIndex[n.id] ?? 0) >= orderedNodes.length - 1}
	                      setNode={setNode}
	                      setEdge={setEdge}
	                      setComp={setComp}
	                      activeTable={activeTable}
	                      onTableFocus={setActiveTable}
		                      mergeCellMode={mergeCellMode}
		                      mergeHoverCell={mergeHoverCell}
		                      onMergeHover={setMergeHoverCell}
				                      onMergeTarget={mergeSelectedCellInto}
				                      showPageTransitions={showPageTransitions}
				                      readOnly={readOnly}
				                      onCreateComment={canComment ? openCommentComposer : null} />
		                  ))}
	                </div>
	              ))}
	            </DocSection>
	            <DocCommentsSummary comments={comments} commentPositions={commentPositions} onSelect={focusComment} />
	          </article>
	          <DocCommentLayer comments={comments} positions={commentPositions} layerHeight={commentLayerHeight} hoverId={hoverCommentId} onHover={setHoverCommentId} />
	        </div>
	      </main>
	      <DocToc items={tocItems} activeId={tocActive} onSelect={jumpToDocSection} doc={doc} />
	      {commentPrompt && <DocSelectionCommentPrompt prompt={commentPrompt} onCreate={() => openCommentComposer(commentPrompt.anchor, commentPrompt.x, commentPrompt.y)} onClose={() => setCommentPrompt(null)} />}
	      {commentDraft && <DocCommentComposer draft={commentDraft} currentUser={currentUser} onSubmit={submitCommentDraft} onClose={() => setCommentDraft(null)} />}
      {!readOnly && sortOpen && <DocSortModal doc={doc} sortMode={sortMode} groupView={groupView} onClose={() => setSortOpen(false)} onSave={(ids, nextGroupView, orderDirty) => { saveSortOrder(ids, nextGroupView, orderDirty); setSortOpen(false); }} onRestore={(nextGroupView) => { restoreDefaultSort(nextGroupView); setSortOpen(false); }} />}
      {!readOnly && pendingCellDelete && createPortal((
        <div data-doc-cell-delete-modal="1" style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(15,23,42,.18)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: 360, maxWidth: "calc(100vw - 32px)", borderRadius: 18, border: `1px solid ${C.line}`, background: C.glass, boxShadow: "0 22px 70px rgba(15,23,42,.18)", padding: 18, fontFamily: sans, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
            <div style={{ fontSize: 17, fontWeight: 850, color: C.ink, marginBottom: 7 }}>删除有内容的单元格</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.7, color: C.soft, marginBottom: 16 }}>这个单元格已经有内容，选择横向合并可以先把内容并入同一行的其它单元格。</div>
            <div style={{ display: "grid", gap: 9 }}>
              <button type="button" onClick={startPendingCellMerge}
                style={{ border: "none", borderRadius: 12, padding: "11px 12px", background: C.indigo, color: "#fff", fontFamily: sans, fontSize: 13, fontWeight: 850, cursor: "pointer", boxShadow: "0 8px 20px rgba(37,99,235,.2)" }}>横向合并</button>
              <button type="button" onClick={forceDeletePendingCell}
                style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 12px", background: C.surface, color: C.copper, fontFamily: sans, fontSize: 13, fontWeight: 850, cursor: "pointer" }}>彻底删除</button>
              <button type="button" onClick={() => setPendingCellDelete(null)}
                style={{ border: "none", borderRadius: 12, padding: "9px 12px", background: "transparent", color: C.faint, fontFamily: sans, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>取消</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

function commentInitial(name) {
  return String(name || "同事").trim().slice(0, 1).toUpperCase() || "U";
}

function commentAnchorLabel(comment) {
  const anchor = comment?.anchor || {};
  if (anchor.type === "prototype") return anchor.label || "原型图位置";
  if (anchor.quote) return `“${anchor.quote}”`;
  return anchor.label || "文档文字";
}

function DocSelectionCommentPrompt({ prompt, onCreate, onClose }) {
  if (!prompt) return null;
  return createPortal((
    <div data-doc-comment-ui="1" style={{ position: "fixed", left: prompt.x, top: prompt.y, transform: "translate(-50%,-100%)", zIndex: 9800, display: "flex", alignItems: "center", gap: 6, padding: 5, borderRadius: 999, background: "rgba(15,23,42,.94)", boxShadow: "0 14px 34px rgba(15,23,42,.24)", fontFamily: sans }}>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onCreate}
        style={{ border: "none", height: 30, borderRadius: 999, padding: "0 12px", background: "#fff", color: C.ink, fontSize: 12.5, fontWeight: 850, cursor: "pointer" }}>评论</button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClose}
        style={{ border: "none", width: 26, height: 26, borderRadius: 999, background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>×</button>
    </div>
  ), document.body);
}

function DocCommentComposer({ draft, currentUser, onSubmit, onClose }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus?.(), 0);
  }, []);
  if (!draft) return null;
  const anchor = draft.anchor || {};
  const label = anchor.type === "prototype" ? (anchor.label || "原型图位置") : (anchor.quote ? `“${anchor.quote}”` : "文档文字");
  return createPortal((
    <form data-doc-comment-ui="1" onSubmit={(e) => { e.preventDefault(); onSubmit(value); }}
      style={{ position: "fixed", left: draft.x, top: draft.y, zIndex: 9900, width: 320, maxWidth: "calc(100vw - 32px)", borderRadius: 16, border: `1px solid ${C.line}`, background: "rgba(255,255,255,.98)", boxShadow: "0 22px 70px rgba(15,23,42,.2)", padding: 12, fontFamily: sans }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 999, background: C.indigoSoft, color: C.indigo, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, flexShrink: 0 }}>{commentInitial(currentUser?.displayName || LOCAL_USER_NAME)}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 850, color: C.ink }}>{currentUser?.displayName || LOCAL_USER_NAME}</div>
          <div style={{ fontSize: 11, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 236 }}>{label}</div>
        </div>
      </div>
      <textarea ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} placeholder="写下你的问题或建议..." rows={4}
        style={{ width: "100%", resize: "none", border: `1px solid ${C.line}`, borderRadius: 12, padding: "9px 10px", outline: "none", fontFamily: sans, fontSize: 13, lineHeight: 1.55, color: C.ink, background: "#F8FAFC" }} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button type="button" onClick={onClose} style={{ height: 32, borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, color: C.soft, padding: "0 12px", fontFamily: sans, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>取消</button>
        <button type="submit" disabled={!value.trim()} style={{ height: 32, borderRadius: 10, border: "none", background: value.trim() ? C.indigo : C.line, color: value.trim() ? "#fff" : C.faint, padding: "0 12px", fontFamily: sans, fontSize: 12.5, fontWeight: 850, cursor: value.trim() ? "pointer" : "not-allowed" }}>提交评论</button>
      </div>
    </form>
  ), document.body);
}

function DocCommentLayer({ comments, positions, layerHeight, hoverId, onHover }) {
  const visible = comments.filter((comment) => positions[comment.id]);
  if (!visible.length) return null;
  return (
    <div data-doc-comment-layer="1" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: 0, overflow: "visible", pointerEvents: "none", zIndex: 8 }}>
      {visible.map((comment) => {
        const pos = positions[comment.id];
        const open = hoverId === comment.id;
        const isTextAnchor = comment?.anchor?.type !== "prototype";
        return (
          <button key={comment.id} type="button" data-doc-comment-dot="1"
            onMouseEnter={() => onHover?.(comment.id)}
            onMouseLeave={() => onHover?.(null)}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            aria-label={`评论: ${comment.content || ""}`}
            style={{ position: "absolute", left: pos.left, top: pos.top, width: 10, height: 10, transform: isTextAnchor ? "translate(0,-50%)" : "translate(-50%,-50%)", borderRadius: 999, border: "2px solid #fff", background: "#EF4444", boxShadow: open ? "0 0 0 6px rgba(239,68,68,.16), 0 8px 20px rgba(239,68,68,.24)" : "0 2px 8px rgba(239,68,68,.2)", cursor: "pointer", pointerEvents: "auto", padding: 0 }}>
            {open && (
              <span style={{ position: "absolute", left: 15, top: -10, width: 260, maxWidth: "calc(100vw - 80px)", borderRadius: 14, padding: 12, background: "rgba(15,23,42,.96)", color: "#fff", boxShadow: "0 18px 46px rgba(15,23,42,.25)", textAlign: "left", fontFamily: sans, pointerEvents: "none" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 999, background: C.indigo, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, flexShrink: 0 }}>{commentInitial(comment.authorName)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{comment.authorName || "同事"}</span>
                    <span style={{ display: "block", fontSize: 10.5, color: "rgba(255,255,255,.55)", whiteSpace: "nowrap" }}>{formatDocTime(comment.createdAt)}</span>
                  </span>
                </span>
                <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,255,255,.92)" }}>{comment.content}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DocCommentsSummary({ comments, commentPositions, onSelect }) {
  return (
    <section id="doc-comments" style={{ marginTop: 64, paddingTop: 28, borderTop: `1px solid ${C.lineSoft}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontFamily: sans, fontSize: 24, lineHeight: 1.25, fontWeight: 850, color: C.ink }}>全部评论 · {comments.length}</h2>
        <span style={{ color: C.faint, fontSize: 12, fontFamily: sans }}>原内容被删除或替换后，评论会保留为历史记录</span>
      </div>
      {!comments.length ? (
        <div style={{ minHeight: 74, border: `1px dashed ${C.line}`, borderRadius: 16, background: "#F8FAFC", color: C.faint, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, fontSize: 13, fontWeight: 750 }}>暂无评论</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {comments.map((comment) => {
            const alive = !!commentPositions[comment.id];
            return (
              <button key={comment.id} type="button" disabled={!alive} onClick={() => alive && onSelect?.(comment)}
                style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 14, background: C.surface, padding: 12, display: "grid", gridTemplateColumns: "32px minmax(0,1fr) auto", gap: 10, alignItems: "start", textAlign: "left", fontFamily: sans, cursor: alive ? "pointer" : "default", opacity: alive ? 1 : .76 }}>
                <span style={{ width: 32, height: 32, borderRadius: 999, background: alive ? C.indigoSoft : "#F1F5F9", color: alive ? C.indigo : C.faint, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900 }}>{commentInitial(comment.authorName)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 850, color: C.ink, whiteSpace: "nowrap" }}>{comment.authorName || "同事"}</span>
                    <span style={{ color: C.faint, fontSize: 11.5, whiteSpace: "nowrap" }}>{formatDocTime(comment.createdAt)}</span>
                    {!alive && <span style={{ height: 20, borderRadius: 999, padding: "0 8px", background: "#FEF2F2", color: "#DC2626", fontSize: 10.5, fontWeight: 850, display: "inline-flex", alignItems: "center" }}>原位置已变更</span>}
                  </span>
                  <span style={{ display: "block", color: C.soft, fontSize: 11.5, lineHeight: 1.4, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{commentAnchorLabel(comment)}</span>
                  <span style={{ display: "block", color: C.ink, fontSize: 13, lineHeight: 1.6 }}>{comment.content}</span>
                </span>
                <span style={{ color: alive ? C.indigo : C.faint, fontSize: 12, fontWeight: 850, whiteSpace: "nowrap", paddingTop: 3 }}>{alive ? "定位" : "历史"}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DocGroupHeader({ section }) {
  const col = section.kind === "group" ? groupColor(section.colorIdx) : { bg: C.lineSoft, border: C.line, text: C.soft };
  return (
    <div style={{ margin: "18px 0 12px", padding: "8px 12px", border: `1px solid ${col.border}`, borderRadius: 12, background: col.bg, color: col.text, fontFamily: sans, fontWeight: 800, fontSize: 13.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span>{section.title}</span>
      <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, opacity: 0.7 }}>{section.nodes.length}页</span>
    </div>
  );
}

function DocFormatToolbar({ onCommand, onBeforeCommand, onImage, tableActive, onTableCommand }) {
  const groups = [
    [
      { label: <b>B</b>, title: "加粗", command: "bold" },
      { label: <span style={{ background: "#FCE9A6", color: "#222", borderRadius: 2, padding: "0 3px" }}>A</span>, title: "高亮", command: "highlight" },
    ],
    [
      { label: "•≡", title: "无序列表", command: "insertUnorderedList" },
      { label: "1.≡", title: "有序列表", command: "insertOrderedList" },
      { label: <LinkIcon />, title: "链接", command: "link" },
      { label: <ImageIcon />, title: "插入图片", action: onImage },
    ],
  ];
  const tableTools = [
    { label: <TableRowAddIcon />, title: "下方插入行", command: "add-row" },
    { label: <TableRowRemoveIcon />, title: "删除新增行", command: "remove-row" },
    { label: <TableColAddIcon />, title: "右侧插入列", command: "add-col" },
    { label: <TableColRemoveIcon />, title: "删除新增列", command: "remove-col" },
  ];
  return (
    <aside className="doc-toolbar-panel" data-doc-toolbar="1" style={{ width: 58, paddingTop: 0, flexShrink: 0, position: "relative", zIndex: 4 }}>
      <div style={{ position: "sticky", top: 0, display: "grid", gap: 12, justifyItems: "center" }}>
        {groups.map((group, i) => (
          <div key={i} style={{ display: "grid", gap: 6, padding: 6, border: "1px solid rgba(226,232,240,.82)", borderRadius: 18, background: "rgba(255,255,255,.74)", boxShadow: "0 10px 28px -18px rgba(15,23,42,.32)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" }}>
            {group.map((tool) => (
              <DocToolButton key={tool.title} title={tool.title} active={tool.strong} onBeforeCommand={onBeforeCommand}
                onClick={() => tool.action ? tool.action() : onCommand(tool.command, tool.value)}>
                {tool.label}
              </DocToolButton>
            ))}
          </div>
        ))}
        {tableActive && (
          <div data-doc-table-tools="1" style={{ display: "grid", gap: 6, padding: 6, border: "1px solid rgba(191,219,254,.9)", borderRadius: 18, background: "rgba(239,246,255,.86)", boxShadow: "0 12px 30px -18px rgba(37,99,235,.45)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" }}>
            {tableTools.map((tool) => (
              <DocToolButton key={tool.title} title={tool.title} onBeforeCommand={onBeforeCommand}
                onClick={() => onTableCommand?.(tool.command)}>
                {tool.label}
              </DocToolButton>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function DocToolButton({ children, title, active, onClick, onBeforeCommand }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const hot = active || hover || pressed;
  const bg = pressed ? "rgba(59,130,246,.16)" : (hot ? C.indigoSoft : "rgba(255,255,255,.9)");
  const border = pressed ? "rgba(59,130,246,.5)" : (hot ? "rgba(59,130,246,.34)" : "rgba(226,232,240,.7)");
  const shadow = pressed ? "inset 0 2px 8px rgba(37,99,235,.14)" : (hover ? "0 10px 18px -14px rgba(37,99,235,.6)" : (active ? "0 6px 14px -10px rgba(59,130,246,.45)" : "none"));
  return (
    <button type="button" title={title} aria-label={title} className="doc-tool-btn" data-doc-tool={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={(e) => { setPressed(true); e.preventDefault(); onBeforeCommand?.(); }}
      onMouseUp={() => setPressed(false)}
      onBlur={() => { setHover(false); setPressed(false); }}
      onClick={onClick}
      style={{ width: 38, height: 38, borderRadius: 12, border: `1px solid ${border}`, background: bg, color: hot ? C.indigo : C.soft, fontFamily: sans, fontSize: 13, fontWeight: 850, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: shadow, transform: pressed ? "scale(.94)" : (hover ? "translateY(-1px)" : "none"), transition: "background .14s ease, border-color .14s ease, color .14s ease, box-shadow .14s ease, transform .1s ease" }}>
      {children}
    </button>
  );
}
function LinkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13.8 14 10" />
      <path d="M13 6.8 14.2 5.6a3.8 3.8 0 0 1 5.4 5.4l-1.8 1.8a3.8 3.8 0 0 1-5.4 0" />
      <path d="M11 17.2 9.8 18.4a3.8 3.8 0 0 1-5.4-5.4l1.8-1.8a3.8 3.8 0 0 1 5.4 0" />
    </svg>
  );
}
function ImageIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <circle cx="8.5" cy="9.5" r="1.4" />
      <path d="m5.8 17 4.5-4.7 3.2 3.2 1.9-2 2.8 3.5" />
    </svg>
  );
}
function TableRowAddIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h11" />
      <path d="M4 12h11" />
      <path d="M4 17h11" />
      <path d="M18.5 9v6" />
      <path d="M15.5 12h6" />
    </svg>
  );
}
function TableRowRemoveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h11" />
      <path d="M4 12h11" />
      <path d="M4 17h11" />
      <path d="M15.5 12h6" />
    </svg>
  );
}
function TableColAddIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4v11" />
      <path d="M12 4v11" />
      <path d="M17 4v11" />
      <path d="M18.5 16v6" />
      <path d="M15.5 19h6" />
    </svg>
  );
}
function TableColRemoveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4v11" />
      <path d="M12 4v11" />
      <path d="M17 4v11" />
      <path d="M15.5 19h6" />
    </svg>
  );
}

function DocToc({ items, activeId, onSelect, doc }) {
  const wordCount = htmlToText([doc.meta.background, doc.meta.dataGoals, doc.meta.expGoals, ...doc.nodes.flatMap((n) => [n.note, n.expGoal])].join(" ")).split(/\s+/).filter(Boolean).length;
  return (
    <aside className="doc-toc-panel doc-hide-scrollbar" data-doc-toc="1" style={{ width: 292, height: "100%", overflowY: "auto", flexShrink: 0, position: "relative", zIndex: 3, paddingTop: 0 }}>
      <div style={{ position: "sticky", top: 0, border: "1px solid rgba(226,232,240,.78)", borderRadius: 22, background: "rgba(255,255,255,.76)", boxShadow: "0 18px 50px -28px rgba(15,23,42,.32)", backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)", overflow: "hidden" }}>
        <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid rgba(226,232,240,.74)" }}>
          <div style={{ fontSize: 11.5, color: C.faint, fontFamily: mono, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>On this page</div>
          <div style={{ fontFamily: sans, fontSize: 17, fontWeight: 850, color: C.ink }}>目录</div>
        </div>
        <nav style={{ padding: "12px 10px 14px", display: "grid", gap: 4 }}>
          {items.map((item) => (
            <DocTocItem key={item.id} item={item} activeId={activeId} onSelect={onSelect} />
          ))}
        </nav>
        <div style={{ borderTop: "1px solid rgba(226,232,240,.72)", padding: "14px 18px 16px", display: "grid", gap: 9 }}>
          <DocTocStat label="Pages" value={String(doc.nodes.length)} />
          <DocTocStat label="Words" value={String(wordCount)} />
          <DocTocStat label="Last edited" value={formatDocTime(doc.meta.updatedAt || doc.meta.date)} />
        </div>
      </div>
    </aside>
  );
}

function DocTocItem({ item, activeId, onSelect }) {
  const active = activeId === item.id;
  return (
    <div>
      <button type="button" data-toc-target={item.id} onClick={() => onSelect(item.id)}
        style={{ width: "100%", minHeight: 34, border: "none", borderRadius: 11, padding: "7px 10px", background: active ? C.indigoSoft : "transparent", color: active ? C.indigo : C.soft, fontFamily: sans, fontSize: 13, fontWeight: active ? 850 : 700, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: active ? C.indigo : "#CBD5E1", flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
      </button>
      {item.children?.length > 0 && (
        <div style={{ margin: "3px 0 6px 12px", paddingLeft: 10, borderLeft: `1px solid ${C.line}` }}>
          {item.children.map((child) => (
            <button key={child.id} type="button" data-toc-target={child.id} onClick={() => onSelect(child.id)}
              style={{ width: "100%", minHeight: 28, border: "none", borderRadius: 8, padding: "5px 8px", background: activeId === child.id ? "rgba(59,130,246,.08)" : "transparent", color: activeId === child.id ? C.indigo : C.faint, fontFamily: sans, fontSize: 12, fontWeight: activeId === child.id ? 800 : 650, cursor: "pointer", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {child.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DocTocStat({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontFamily: sans, fontSize: 12.5 }}>
      <span style={{ color: C.faint }}>{label}</span>
      <span style={{ color: C.soft, fontWeight: 750, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function ImagePreviewOverlay({ preview, setPreview }) {
  const previewDragRef = useRef(null);
  if (!preview || typeof document === "undefined") return null;
  const previewKind = preview.kind || protoKindFromSrc(preview.src);
  const isHtml = previewKind === "html";
  const previewHtmlRatio = htmlProtoRatio(preview.ratio);
  const previewHtmlFitWidthVh = Math.round((86 / previewHtmlRatio) * 1000) / 1000;
  const clampPreviewScale = (v) => Math.min(RTE_PREVIEW_MAX_SCALE, Math.max(RTE_PREVIEW_MIN_SCALE, v));
  const onPreviewWheel = (e) => {
    if (isHtml) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const pointerX = e.clientX - rect.left - rect.width / 2;
    const pointerY = e.clientY - rect.top - rect.height / 2;
    setPreview((p) => {
      if (!p) return p;
      const nextScale = clampPreviewScale(p.scale * (e.deltaY < 0 ? 1.12 : 0.88));
      const ratio = nextScale / p.scale;
      return {
        ...p,
        scale: nextScale,
        x: p.x - (pointerX - p.x) * (ratio - 1),
        y: p.y - (pointerY - p.y) * (ratio - 1),
      };
    });
  };
  const startPreviewPan = (e) => {
    if (isHtml) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    previewDragRef.current = { sx: e.clientX, sy: e.clientY, x: preview?.x || 0, y: preview?.y || 0 };
    const onMove = (ev) => {
      const drag = previewDragRef.current;
      if (!drag) return;
      setPreview((p) => p ? { ...p, x: drag.x + ev.clientX - drag.sx, y: drag.y + ev.clientY - drag.sy } : p);
    };
    const onUp = () => {
      previewDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  return createPortal((
    <div data-rte-image-preview="1" data-doc-image-preview="1" onWheel={onPreviewWheel}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,.87)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "grab" }}>
      <button type="button" data-rte-image-preview-close="1" title="关闭预览" onClick={() => setPreview(null)}
        style={{ position: "fixed", right: 24, top: 22, width: 38, height: 38, borderRadius: 999, border: "1px solid rgba(255,255,255,.22)", background: "rgba(15,23,42,.72)", color: "#fff", fontSize: 24, lineHeight: "34px", cursor: "pointer", zIndex: 10002, boxShadow: "0 10px 30px rgba(0,0,0,.28)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>×</button>
      {isHtml ? (
        <div data-html-prototype-preview="1" style={{ width: `min(${HTML_PROTO_VIEWPORT_W}px, 88vw, ${previewHtmlFitWidthVh}vh)`, borderRadius: 18, overflow: "hidden", background: "#fff", boxShadow: "0 26px 80px rgba(0,0,0,.48)", zIndex: 10001, position: "relative" }}>
          <HtmlPrototypeFrame src={preview.src} title={preview.alt || "HTML 原型预览"} interactive ratio={previewHtmlRatio} />
        </div>
      ) : (
        <img data-rte-image-preview-img="1" src={preview.src} alt={preview.alt} draggable={false} onMouseDown={startPreviewPan} onDoubleClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "88vw", maxHeight: "86vh", width: "auto", height: "auto", objectFit: "contain", userSelect: "none", borderRadius: 18, boxShadow: "0 26px 80px rgba(0,0,0,.48)", transform: `translate(${preview.x}px, ${preview.y}px) scale(${preview.scale})`, transition: previewDragRef.current ? "none" : "transform .08s ease-out", cursor: "grab", zIndex: 10001 }} />
      )}
    </div>
  ), document.body);
}

function PageDocBlock({ node: n, doc, isLast, setNode, setEdge, setComp, activeTable, onTableFocus, mergeCellMode, mergeHoverCell, onMergeHover, onMergeTarget, showPageTransitions, readOnly = false, onCreateComment = null }) {
  const transitionEdges = doc.edges.filter((e) => e.from === n.id && htmlToText(e.label).trim());
  const visibleTransitionEdges = showPageTransitions ? transitionEdges : [];
  const protoFrameRef = useRef(null);
  const protoInputRef = useRef(null);
  const tableWrapRef = useRef(null);
  const tableRef = useRef(null);
  const tableResizeRef = useRef(null);
  const [protoToolsOpen, setProtoToolsOpen] = useState(false);
  const [hoveredBoundary, setHoveredBoundary] = useState(null);
  const [resizingBoundary, setResizingBoundary] = useState(null);
  const [draftColWeights, setDraftColWeights] = useState(null);
  const [tableWidth, setTableWidth] = useState(0);
  const [docImagePreview, setDocImagePreview] = useState(null);
  const baseCells = docTableBaseExtraCells(n.docTableBaseCells);
  const customRows = docTableRows(n.docTableRows, 1);
  const totalRows = DOC_TABLE_BASE_ROWS.length + customRows.length + (visibleTransitionEdges.length > 0 ? 1 : 0);
  const rowCellCounts = [
    ...DOC_TABLE_BASE_ROWS.map((row) => 1 + (baseCells[row.key]?.length || 0)),
    ...customRows.map((row) => Math.max(1, row.cells.length)),
    visibleTransitionEdges.length > 0 ? 1 : 0,
  ];
  const maxValueCols = Math.max(1, ...rowCellCounts);
  const imageValueCols = docTableImageValueCols(n, baseCells, customRows);
  const minValueWeights = docTableMinValueWeights(maxValueCols, imageValueCols, tableWidth);
  const storedColWeights = docTableColWeights(n.docTableColWeights, maxValueCols, minValueWeights);
  const effectiveColWeights = draftColWeights?.length === storedColWeights.length ? draftColWeights : storedColWeights;
  let boundaryLeft = 0;
  const colBoundaries = effectiveColWeights.slice(0, -1).map((weight) => {
    boundaryLeft += weight;
    return boundaryLeft;
  });
  let rowNo = 0;
  const activateTableCell = (e) => {
    if (readOnly) return;
    const cell = e.target?.closest?.("[data-doc-table-cell]");
    if (!cell) return;
    const colIndex = Number(cell.getAttribute("data-col-index") || 0);
    onTableFocus?.({
      nodeId: n.id,
      rowKind: cell.getAttribute("data-row-kind") || "note",
      rowId: cell.getAttribute("data-row-id") || cell.getAttribute("data-row-kind") || "note",
      colIndex: Number.isFinite(colIndex) ? colIndex : 0,
      selection: "cell",
    });
  };
  const tableActive = activeTable?.nodeId === n.id ? activeTable : null;
  const isSelectedCell = (rowKind, rowId, colIndex) => tableActive?.selection === "cell"
    && tableActive.rowKind === rowKind
    && tableActive.rowId === rowId
    && Number(tableActive.colIndex) === Number(colIndex);
  const cellTarget = (rowKind, rowId, colIndex) => ({ nodeId: n.id, rowKind, rowId, colIndex: Number(colIndex), selection: "cell" });
  const isMergeSourceCell = (rowKind, rowId, colIndex) => sameDocTableCell(mergeCellMode?.source, cellTarget(rowKind, rowId, colIndex));
  const isMergeCandidate = (rowKind, rowId, colIndex) => docTableCanMergeTarget(mergeCellMode?.source, cellTarget(rowKind, rowId, colIndex));
  const isMergeHoverCell = (rowKind, rowId, colIndex) => sameDocTableCell(mergeHoverCell, cellTarget(rowKind, rowId, colIndex));
  const cellSpan = (colIndex, rowCells) => colIndex === rowCells - 1 ? Math.max(1, maxValueCols - rowCells + 1) : 1;
  const selectionStyle = (rowKind, rowId, colIndex) => {
    if (isMergeSourceCell(rowKind, rowId, colIndex)) {
      return { background: "rgba(251,191,36,.12)", boxShadow: "inset 0 0 0 2px rgba(245,158,11,.38)" };
    }
    if (isMergeHoverCell(rowKind, rowId, colIndex)) {
      return { background: "rgba(59,130,246,.13)", boxShadow: "inset 0 0 0 2px rgba(59,130,246,.58)", cursor: "pointer" };
    }
    if (isMergeCandidate(rowKind, rowId, colIndex)) {
      return { background: "rgba(59,130,246,.045)", boxShadow: "inset 0 0 0 1px rgba(59,130,246,.22)", cursor: "pointer" };
    }
    const cell = isSelectedCell(rowKind, rowId, colIndex);
    if (!cell) return {};
    return { background: "rgba(59,130,246,.055)", boxShadow: "inset 0 0 0 1px rgba(59,130,246,.24)" };
  };
  const mergeCellEvents = (rowKind, rowId, colIndex) => {
    if (readOnly) return {};
    const target = cellTarget(rowKind, rowId, colIndex);
    if (!docTableCanMergeTarget(mergeCellMode?.source, target)) return {};
    return {
      onMouseEnter: () => onMergeHover?.(target),
      onMouseLeave: () => { if (sameDocTableCell(mergeHoverCell, target)) onMergeHover?.(null); },
      onMouseDown: (e) => {
        e.preventDefault();
        e.stopPropagation();
        onMergeTarget?.(target);
      },
    };
  };
  const keyStyle = (last, extra = {}) => ({ ...tdKey, width: "auto", minWidth: 0, borderBottom: last ? "none" : tdKey.borderBottom, ...extra });
  const valueStyle = (last, extra = {}) => ({ ...tdVal, borderBottom: last ? "none" : tdVal.borderBottom, minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word", ...extra });
  const nextRowIndex = () => {
    rowNo += 1;
    return rowNo === totalRows;
  };
  const boundarySegmentFromPointer = (e, boundaryIndex) => {
    if (boundaryIndex <= 0) return null;
    const wrap = tableWrapRef.current;
    const table = tableRef.current;
    const wrapRect = wrap?.getBoundingClientRect();
    const tableRect = table?.getBoundingClientRect();
    if (!wrap || !table || !wrapRect || !tableRect) return null;
    const rows = Array.from(table.querySelectorAll("tbody > tr"));
    const y = e?.clientY ?? wrapRect.top;
    let row = rows.find((item) => {
      const rect = item.getBoundingClientRect();
      return y >= rect.top && y <= rect.bottom;
    });
    if (!row) return null;
    const boundaryPct = Number(colBoundaries[boundaryIndex]);
    if (!Number.isFinite(boundaryPct)) return null;
    const boundaryX = tableRect.left + (tableRect.width * boundaryPct) / 100;
    const rowRect = row.getBoundingClientRect();
    const cells = Array.from(row.children).filter((cell) => cell.matches?.("td,th"));
    const edgeTolerance = 3.5;
    const hasVisibleEdge = cells.some((cell) => {
      const cellRect = cell.getBoundingClientRect();
      const leftIsInternal = cellRect.left > rowRect.left + 1 && cellRect.left < rowRect.right - 1;
      const rightIsInternal = cellRect.right > rowRect.left + 1 && cellRect.right < rowRect.right - 1;
      return (leftIsInternal && Math.abs(cellRect.left - boundaryX) <= edgeTolerance)
        || (rightIsInternal && Math.abs(cellRect.right - boundaryX) <= edgeTolerance);
    });
    if (!hasVisibleEdge) return null;
    return {
      index: boundaryIndex,
      top: Math.max(0, rowRect.top - wrapRect.top),
      height: Math.max(1, rowRect.height),
    };
  };
  const updateHoveredBoundary = (e, boundaryIndex) => {
    if (readOnly) return;
    setHoveredBoundary(boundarySegmentFromPointer(e, boundaryIndex));
  };
  const setBaseExtraCell = (key, index, value) => {
    if (readOnly) return;
    const next = { ...baseCells, [key]: baseCells[key].map((cell, i) => (i === index ? value : cell)) };
    setNode(n.id, { docTableBaseCells: next });
  };
  const setCustomRow = (rowId, patch) => {
    if (readOnly) return;
    setNode(n.id, {
      docTableBaseCells: baseCells,
      docTableRows: customRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    });
  };
  const setCustomCell = (rowId, colIndex, value) => {
    if (readOnly) return;
    setNode(n.id, {
      docTableBaseCells: baseCells,
      docTableRows: customRows.map((row) => (
        row.id === rowId ? { ...row, cells: row.cells.map((cell, i) => (i === colIndex ? value : cell)) } : row
      )),
    });
  };
  useEffect(() => {
    if (!protoToolsOpen) return undefined;
    const close = (e) => {
      if (protoFrameRef.current?.contains(e.target)) return;
      setProtoToolsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [protoToolsOpen]);
  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el) return undefined;
    const update = () => setTableWidth(Math.round(el.getBoundingClientRect().width || 0));
    update();
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect?.();
      window.removeEventListener("resize", update);
    };
  }, []);
  async function replaceDocProto(file) {
    if (readOnly) return;
    if (!file) return;
    const payload = await fileToProtoPayload(file);
    if (!payload) return;
    setNode(n.id, payload);
    setProtoToolsOpen(false);
  }
  function openDocImagePreview(src, alt = "", kind = "image", ratio = null) {
    if (!src) return;
    setProtoToolsOpen(false);
    setDocImagePreview({ src, alt, kind, ratio, scale: 1, x: 0, y: 0 });
  }
  function openPrototypeComment(e) {
    if (!onCreateComment) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = rect.width ? ((e.clientX - rect.left) / rect.width) * 100 : 50;
    const yPct = rect.height ? ((e.clientY - rect.top) / rect.height) * 100 : 50;
    onCreateComment({
      type: "prototype",
      nodeId: n.id,
      sectionId: `doc-page-${safeDomId(n.id)}`,
      xPct: Math.max(0, Math.min(100, xPct)),
      yPct: Math.max(0, Math.min(100, yPct)),
      quote: n.name || "未命名页面",
      label: `${n.name || "未命名页面"}原型图`,
      assetSrc: String(n.proto || "").slice(0, 1024),
    }, e.clientX, e.clientY);
  }
  function startTableColumnResize(e, boundaryIndex) {
    if (readOnly) return;
    if (e.button !== 0) return;
    const segment = boundarySegmentFromPointer(e, boundaryIndex);
    if (!segment) {
      setHoveredBoundary(null);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = tableRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const startWeights = effectiveColWeights.slice();
    const drag = {
      boundaryIndex,
      startX: e.clientX,
      width: rect.width,
      startWeights,
      latest: startWeights,
      minValueWeights,
      move: null,
      up: null,
      bodyCursor: document.body.style.cursor,
      bodySelect: document.body.style.userSelect,
    };
    const onMove = (ev) => {
      const current = tableResizeRef.current;
      if (!current) return;
      const deltaPct = ((ev.clientX - current.startX) / Math.max(1, current.width)) * 100;
      const next = docTableResizeColWeights(current.startWeights, current.boundaryIndex, deltaPct, current.minValueWeights);
      current.latest = next;
      setDraftColWeights(next);
    };
    const onUp = () => {
      const current = tableResizeRef.current;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = current?.bodyCursor || "";
      document.body.style.userSelect = current?.bodySelect || "";
      tableResizeRef.current = null;
      setResizingBoundary(null);
      setHoveredBoundary(null);
      setDraftColWeights(null);
      if (current?.latest) setNode(n.id, { docTableColWeights: current.latest });
    };
    drag.move = onMove;
    drag.up = onUp;
    tableResizeRef.current = drag;
    setDraftColWeights(startWeights);
    setResizingBoundary(boundaryIndex);
    setHoveredBoundary(segment);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  useEffect(() => () => {
    const current = tableResizeRef.current;
    if (!current) return;
    if (current.move) document.removeEventListener("mousemove", current.move);
    if (current.up) document.removeEventListener("mouseup", current.up);
    document.body.style.cursor = current.bodyCursor || "";
    document.body.style.userSelect = current.bodySelect || "";
  }, []);
  return (
    <div id={`doc-page-${safeDomId(n.id)}`} data-doc-page-id={n.id} style={{ marginBottom: 24, paddingBottom: 20, borderBottom: !isLast ? `1px solid ${C.lineSoft}` : "none", scrollMarginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <DocEdit value={n.name} onChange={(v) => setNode(n.id, { name: v })} placeholder="未命名页面" readOnly={readOnly} style={{ fontFamily: sans, fontWeight: 800, fontSize: 16, color: C.ink }} />
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {n.proto && (
	          <div ref={protoFrameRef} data-doc-proto-frame="1" onClick={(e) => { e.stopPropagation(); if (readOnly) openDocImagePreview(n.proto, `${n.name || "未命名页面"}原型`, protoKindFromSrc(n.proto, n.protoKind), n.protoRatio); else setProtoToolsOpen(true); }}
	            onContextMenu={openPrototypeComment}
	            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); openDocImagePreview(n.proto, `${n.name || "未命名页面"}原型`, protoKindFromSrc(n.proto, n.protoKind), n.protoRatio); }}
            title={readOnly ? "单击全屏查看原型" : "点击替换，双击全屏查看原型"}
            style={{ width: 180, flex: "0 0 180px", borderRadius: 8, border: `1px solid ${C.line}`, overflow: "hidden", background: C.lineSoft, lineHeight: 0, position: "relative", cursor: "zoom-in" }}>
            {isHtmlProto(n) ? (
              <div style={{ position: "relative", background: "#fff" }}>
                <HtmlPrototypeFrame src={n.proto} title={`${n.name || "未命名页面"} HTML 原型`} ratio={n.protoRatio} />
              </div>
            ) : (
              <img src={n.proto} alt="" draggable={false} style={{ width: "100%", display: "block", objectFit: "contain", background: C.lineSoft }} />
            )}
            {!readOnly && protoToolsOpen && (
              <div data-doc-proto-tools="1" style={{ position: "absolute", left: 8, top: 8, zIndex: 3, display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", borderRadius: 10, background: "rgba(15,23,42,.86)", color: "#fff", boxShadow: "0 10px 26px rgba(15,23,42,.24)", lineHeight: 1 }}>
                <button type="button" data-doc-proto-replace="1" onClick={(e) => { e.preventDefault(); e.stopPropagation(); protoInputRef.current?.click(); }}
                  style={{ border: "none", borderRadius: 8, background: C.indigo, color: "#fff", padding: "5px 9px", fontFamily: sans, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>替换原型</button>
              </div>
            )}
            {!readOnly && <input ref={protoInputRef} type="file" accept={PROTO_FILE_ACCEPT} style={{ display: "none" }}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void replaceDocProto(file); e.target.value = ""; }} />}
          </div>
        )}
	        <div style={{ flex: 1, minWidth: 200 }}>
	          <div ref={tableWrapRef} className="doc-page-table-wrap" style={{ overflow: "hidden", borderRadius: 12, position: "relative", width: "100%" }}>
			            <table ref={tableRef} data-doc-page-table="1" data-node-id={n.id} onFocusCapture={readOnly ? undefined : activateTableCell} onMouseDownCapture={readOnly ? undefined : activateTableCell}
		              style={{ ...tbl, width: "100%", minWidth: 0, tableLayout: "fixed" }}>
		              <colgroup>
		                {effectiveColWeights.map((weight, index) => (
		                  <col key={index} style={{ width: `${weight}%` }} />
		                ))}
		              </colgroup>
		              <tbody>
		                {DOC_TABLE_BASE_ROWS.map((row) => {
		                  const last = nextRowIndex();
		                  const extras = baseCells[row.key] || [];
		                  const rowCells = 1 + extras.length;
		                  return (
		                    <tr key={row.key}>
		                      <td data-doc-table-cell="1" data-row-kind={row.key} data-row-id={row.key} data-col-index="-1" style={keyStyle(last, selectionStyle(row.key, row.key, -1))}>
		                        <span>{row.label}</span>
		                      </td>
		                      <td data-doc-table-cell="1" data-row-kind={row.key} data-row-id={row.key} data-col-index="0" colSpan={cellSpan(0, rowCells)} {...mergeCellEvents(row.key, row.key, 0)} style={valueStyle(last, selectionStyle(row.key, row.key, 0))}>
			                        <RichEditor value={n[row.key]} onChange={(v) => setNode(n.id, { [row.key]: v })} placeholder={row.placeholder} readOnly={readOnly} />
		                      </td>
		                      {extras.map((cell, col) => {
		                        const colIndex = col + 1;
		                        return (
		                        <td key={col} data-doc-table-cell="1" data-row-kind={row.key} data-row-id={row.key} data-col-index={colIndex} colSpan={cellSpan(colIndex, rowCells)} {...mergeCellEvents(row.key, row.key, colIndex)} style={valueStyle(last, selectionStyle(row.key, row.key, colIndex))}>
			                          <RichEditor value={cell} onChange={(v) => setBaseExtraCell(row.key, col, v)} placeholder="点击填写补充内容" readOnly={readOnly} />
		                        </td>
		                        );
		                      })}
		                    </tr>
		                  );
		                })}
	                {customRows.map((row) => {
	                  const last = nextRowIndex();
		                  return (
		                    <tr key={row.id} data-doc-custom-row="1">
		                      <td data-doc-table-cell="1" data-row-kind="custom" data-row-id={row.id} data-col-index="-1" style={keyStyle(last, selectionStyle("custom", row.id, -1))}>
			                        <DocEdit value={row.label} onChange={(v) => setCustomRow(row.id, { label: v })} placeholder="自定义项" readOnly={readOnly} style={{ fontWeight: 800, color: C.soft, minWidth: 0 }} />
		                      </td>
		                      {row.cells.map((cell, col) => (
		                        <td key={col} data-doc-table-cell="1" data-row-kind="custom" data-row-id={row.id} data-col-index={col} colSpan={cellSpan(col, row.cells.length)} {...mergeCellEvents("custom", row.id, col)} style={valueStyle(last, selectionStyle("custom", row.id, col))}>
			                          <RichEditor value={cell} onChange={(v) => setCustomCell(row.id, col, v)} placeholder="点击填写内容" readOnly={readOnly} />
		                        </td>
		                      ))}
	                    </tr>
	                  );
	                })}
		                {visibleTransitionEdges.length > 0 && (() => {
	                  const last = nextRowIndex();
	                  return (
	                    <tr>
	                      <td data-doc-table-cell="1" data-row-kind="transitions" data-row-id="transitions" data-col-index="-1" style={keyStyle(last)}>页面跳转</td>
		                      <td data-doc-table-cell="1" data-row-kind="transitions" data-row-id="transitions" data-col-index="0" colSpan={maxValueCols} style={valueStyle(last)}>
		                        {visibleTransitionEdges.map((e) => {
	                          const t = doc.nodes.find((x) => x.id === e.to);
	                          return (
	                            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 3, lineHeight: 1.8 }}>
	                              <span style={{ color: C.soft }}>通过</span>
		                              <span style={{ display: "inline-block", minWidth: 70 }}><DocEdit value={e.label} onChange={(v) => setEdge(e.id, { label: v })} placeholder="(任意操作)" readOnly={readOnly} style={{ color: C.copper, display: "inline-block" }} /></span>
	                              <span style={{ color: C.soft }}>可跳转至</span>
	                              <span style={{ fontWeight: 600, color: C.indigo }}>{t ? t.name || "未命名页面" : "?"}</span>
	                            </div>
	                          );
	                        })}
	                      </td>
	                    </tr>
	                  );
	                })()}
		              </tbody>
		            </table>
			            {!readOnly && colBoundaries.map((left, lineIndex) => {
		              if (lineIndex === 0) return null;
		              const hotSegment = hoveredBoundary?.index === lineIndex ? hoveredBoundary : null;
		              const hot = !!hotSegment || resizingBoundary === lineIndex;
		              const lineTop = hotSegment ? hotSegment.top : 0;
		              const lineHeight = hotSegment ? hotSegment.height : 0;
		              const arrowTop = hotSegment ? hotSegment.top + hotSegment.height / 2 : "50%";
		              return (
		                <button key={lineIndex} type="button" className="doc-table-resizer" data-doc-table-resizer="1" data-hot={hot ? "1" : "0"} data-active={resizingBoundary === lineIndex ? "1" : "0"} aria-label="拖拽调整列宽" title={hot ? "拖拽调整列宽" : ""}
		                  onMouseEnter={(e) => updateHoveredBoundary(e, lineIndex)}
		                  onMouseMove={(e) => updateHoveredBoundary(e, lineIndex)}
		                  onMouseLeave={() => { if (resizingBoundary !== lineIndex) setHoveredBoundary(null); }}
		                  onMouseDown={(e) => startTableColumnResize(e, lineIndex)}
		                  style={{ position: "absolute", top: 0, bottom: 0, left: `${left}%`, width: 18, transform: "translateX(-9px)", border: "none", padding: 0, background: "transparent", cursor: hot ? "col-resize" : "default", zIndex: 7 }}>
		                  <span className="doc-table-resizer-line" data-doc-table-resizer-line="1" style={{ position: "absolute", left: "50%", top: lineTop, height: hot ? lineHeight : 0, width: hot ? 3 : 1, transform: "translateX(-50%)", borderRadius: 999, background: hot ? C.indigo : "rgba(59,130,246,0)", boxShadow: hot ? "0 0 0 4px rgba(59,130,246,.12)" : "none", transition: "background .12s ease, box-shadow .12s ease, width .12s ease, top .08s ease, height .08s ease", pointerEvents: "none" }} />
		                  <span className="doc-table-resizer-arrows" style={{ position: "absolute", left: "50%", top: arrowTop, transform: hot ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(.92)", opacity: hot ? 1 : 0, height: 22, minWidth: 34, borderRadius: 999, background: "rgba(15,23,42,.88)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3, fontFamily: sans, fontSize: 12, fontWeight: 850, lineHeight: 1, boxShadow: "0 10px 26px rgba(15,23,42,.22)", pointerEvents: "none", transition: "opacity .12s ease, transform .12s ease, top .08s ease" }}>
		                    <span style={{ transform: "translateY(-.5px)" }}>←</span><span style={{ transform: "translateY(-.5px)" }}>→</span>
		                  </span>
		                </button>
		              );
		            })}
	          </div>
	          {n.competitors.length > 0 && (
	            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11.5, color: C.soft, marginBottom: 6 }}>竞品参考</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
	                {n.competitors.map((c) => <div key={c.id} style={{ width: 96 }}><img src={c.img} alt="" draggable={false} title="单击全屏查看竞品参考图" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openDocImagePreview(c.img, c.caption || "竞品参考"); }} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); openDocImagePreview(c.img, c.caption || "竞品参考"); }} style={{ width: 96, height: 60, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.line}`, cursor: "zoom-in" }} /><DocEdit value={c.caption} onChange={(v) => setComp(n.id, c.id, { caption: v })} placeholder="看中它哪点" readOnly={readOnly} style={{ fontSize: 10, color: C.soft, marginTop: 3 }} /></div>)}
              </div>
            </div>
          )}
        </div>
      </div>
      <ImagePreviewOverlay preview={docImagePreview} setPreview={setDocImagePreview} />
    </div>
  );
}

function buildSortDraft(doc, presentation, groupView) {
  if (!groupView) return [{ id: "flat", title: "页面顺序", colorIdx: 0, items: presentation.flatIds.slice() }];
  return presentation.sections.map((section, i) => ({
    id: section.id,
    title: section.title || "页面顺序",
    colorIdx: section.colorIdx ?? i,
    items: section.nodes.map((n) => n.id),
  })).filter((section) => section.items.length);
}

function DocSortModal({ doc, sortMode, groupView, onClose, onSave, onRestore }) {
  const [localGroupView, setLocalGroupView] = useState(groupView);
  const draftPresentation = useMemo(() => buildDocPresentation(doc, sortMode, localGroupView), [doc, sortMode, localGroupView]);
  const nodeById = useMemo(() => Object.fromEntries(doc.nodes.map((n) => [n.id, n])), [doc.nodes]);
  const [sections, setSections] = useState(() => buildSortDraft(doc, draftPresentation, localGroupView));
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [orderDirty, setOrderDirty] = useState(false);

  useEffect(() => {
    setSections(buildSortDraft(doc, draftPresentation, localGroupView));
    setDragging(null);
    setOver(null);
    setOrderDirty(false);
  }, [doc, draftPresentation, localGroupView]);

  useEffect(() => {
    if (!dragging) return undefined;
    const stop = () => { setDragging(null); setOver(null); };
    const move = (e) => {
      const row = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-sort-row-id]");
      const section = row?.closest?.("[data-sort-section]");
      const sectionId = section?.getAttribute("data-sort-section");
      if (!row || sectionId !== dragging.sectionId) return;
      const itemId = row.getAttribute("data-sort-row-id");
      const index = Array.from(section.querySelectorAll("[data-sort-row-id]")).indexOf(row);
      if (index < 0) return;
      setOver({ sectionId, index });
      if (itemId && itemId !== dragging.itemId) reorder(sectionId, dragging.itemId, index);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
  }, [dragging]);

  function reorder(sectionId, itemId, toIndex) {
    setOrderDirty(true);
    setSections((prev) => prev.map((section) => {
      if (section.id !== sectionId) return section;
      const items = section.items.slice();
      const fromIndex = items.indexOf(itemId);
      if (fromIndex < 0 || fromIndex === toIndex) return section;
      const [item] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, item);
      return { ...section, items };
    }));
  }
  function startDrag(e, sectionId, itemId, index) {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging({ sectionId, itemId });
    setOver({ sectionId, index });
  }
  function enterRow(sectionId, itemId, index) {
    if (!dragging || dragging.sectionId !== sectionId) return;
    setOver({ sectionId, index });
    if (dragging.itemId !== itemId) reorder(sectionId, dragging.itemId, index);
  }

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.32)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: "min(560px, 94vw)", maxHeight: "84vh", background: C.glass, border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: "0 22px 70px rgba(15,23,42,.18)", display: "flex", flexDirection: "column", overflow: "hidden", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 800 }}>排序</div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 3 }}>{sortMode === "manual" ? "当前为手动顺序" : "当前为默认流程顺序"}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "rgba(255,255,255,.72)", color: C.faint, cursor: "pointer", fontSize: 20, lineHeight: 1, width: 30, height: 30, borderRadius: 10 }}>×</button>
        </div>
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.soft, cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={localGroupView} onChange={(e) => setLocalGroupView(e.target.checked)} />
            按组展示
          </label>
          {sortMode === "manual" && <Btn small kind="ghost" onClick={() => onRestore(localGroupView)}>恢复默认排序</Btn>}
        </div>
        <div className="scl" style={{ padding: "14px 20px", overflowY: "auto" }}>
          {sections.map((section) => {
            const col = localGroupView && section.id.startsWith("g:") ? groupColor(section.colorIdx) : { bg: C.lineSoft, border: C.line, text: C.soft };
            return (
              <div key={section.id} data-sort-section={section.id} style={{ marginBottom: 16 }}>
                {localGroupView && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", border: `1px solid ${col.border}`, borderRadius: 12, background: col.bg, color: col.text, fontFamily: sans, fontWeight: 800, fontSize: 13 }}>
                    <span>{section.title}</span>
                    <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, opacity: 0.72 }}>{section.items.length}页</span>
                  </div>
                )}
                <div style={{ marginTop: localGroupView ? 8 : 0, display: "grid", gap: 6 }}>
                  {section.items.map((id, index) => {
                    const n = nodeById[id];
                    const isOver = over && over.sectionId === section.id && over.index === index;
                    const isDragging = dragging && dragging.sectionId === section.id && dragging.itemId === id;
                    return (
                      <div key={id} data-sort-row-id={id}
                        onMouseDown={(e) => startDrag(e, section.id, id, index)}
                        onMouseEnter={() => enterRow(section.id, id, index)}
                        onMouseUp={() => { setDragging(null); setOver(null); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", border: `1px solid ${isOver ? C.indigo : C.line}`, borderRadius: 12, background: isOver ? C.indigoSoft : C.surface, cursor: isDragging ? "grabbing" : "grab", userSelect: "none", opacity: isDragging ? 0.76 : 1, boxShadow: isOver ? "0 6px 18px rgba(59,130,246,.12)" : "0 1px 2px rgba(15,23,42,.03)" }}>
                        <span style={{ color: C.faint, fontFamily: mono, fontSize: 13 }}>≡</span>
                        <span style={{ fontFamily: sans, fontSize: 13.5, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n ? n.name || "未命名页面" : id}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 20px 16px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn kind="ghost" onClick={onClose}>取消</Btn>
          <Btn onClick={() => onSave(sections.flatMap((section) => section.items), localGroupView, orderDirty)}>保存</Btn>
        </div>
      </div>
    </div>
  );
}

// 文档内联可编辑字段:看起来像文档文本,聚焦时显出输入框
function DocEdit({ value, onChange, placeholder, style, area, readOnly = false }) {
  const base = { width: "100%", border: "none", outline: "none", background: "transparent", fontFamily: sans, fontSize: 14, lineHeight: 1.8, color: C.ink, padding: "2px 4px", borderRadius: 5, resize: "none", display: "block", ...style };
  const [focus, setFocus] = useState(false);
  const taRef = useRef(null);
  const fstyle = focus ? { background: C.paper, boxShadow: `inset 0 0 0 1px ${C.line}` } : {};
  const autosize = (el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } };
  useEffect(() => { autosize(taRef.current); }, [value, area]);
  if (readOnly) {
    const text = String(value || "").trim();
    return (
      <div data-doc-readonly-field="1" style={{ ...base, color: text ? base.color : C.faint, whiteSpace: "pre-wrap", minHeight: area ? 24 : undefined, cursor: "default" }}>
        {text || placeholder || ""}
      </div>
    );
  }
  if (area) {
    return <textarea ref={taRef} value={value || ""} onChange={(e) => { onChange(e.target.value); autosize(e.target); }} placeholder={placeholder}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={{ ...base, overflow: "hidden", minHeight: 24, ...fstyle }} />;
  }
  return <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={{ ...base, ...fstyle }} />;
}
const docP = { fontSize: 14.5, lineHeight: 1.9, color: C.ink, whiteSpace: "pre-wrap" };

// 富文本编辑器:选中文字弹浮窗,支持加粗/高亮/有序无序列表(存 HTML)
function RichEditor({ value, onChange, placeholder, style, readOnly = false }) {
  const wrapRef = useRef(null);
  const ref = useRef(null);
  const selectedImgRef = useRef(null);
  const previewDragRef = useRef(null);
  const textRangeRef = useRef(null);
  const activeLinkRef = useRef(null);
  const linkPopoverPointerRef = useRef(false);
  const linkEditingRef = useRef(false);
  const linkEditInputRef = useRef(null);
  const replaceImageInputRef = useRef(null);
  const [tb, setTb] = useState(null); // 浮窗位置 {x,y}
  const [imgBox, setImgBox] = useState(null);
  const [imgGuide, setImgGuide] = useState(null);
  const [imgGhost, setImgGhost] = useState(null);
  const [preview, setPreview] = useState(null);
  const [linkBubble, setLinkBubble] = useState(null);
  const linkBubbleRef = useRef(null);
  const [empty, setEmpty] = useState(!value);
  linkBubbleRef.current = linkBubble;
  linkEditingRef.current = !!linkBubble?.editing;

  // 外部值变化且未聚焦时,同步到 DOM(避免打字时光标跳动)
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (document.activeElement !== el && el.innerHTML !== (value || "")) el.innerHTML = value || "";
    normalizeImageRows();
    setEmpty(!el.textContent.trim() && !el.querySelector("li,img"));
  }, [value]);
  useEffect(() => { const el = ref.current; if (el && !el.innerHTML) { el.innerHTML = value || ""; normalizeImageRows(); } }, []);
  useEffect(() => {
    const onMouseDown = (e) => {
      if (e.target?.closest?.('[data-rte-link-popover="1"]')) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        clearSelectedImage();
        activeLinkRef.current = null;
        linkEditingRef.current = false;
        setLinkBubble(null);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);
  useEffect(() => {
    if (!linkBubble) return undefined;
    const update = () => window.requestAnimationFrame(refreshLinkBubble);
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
  }, [linkBubble]);
  useEffect(() => {
    if (!linkBubble?.editing) return;
    window.requestAnimationFrame(() => {
      linkEditInputRef.current?.focus();
      linkEditInputRef.current?.select();
    });
  }, [linkBubble?.editing]);
  useEffect(() => {
    if (!preview) return;
    const onKey = (e) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);
  useEffect(() => {
    if (!readOnly) return;
    textRangeRef.current = null;
    clearSelectedImage();
    setTb(null);
  }, [readOnly]);

  function emit() {
    if (readOnly) return;
    const el = ref.current; if (!el) return;
    normalizeImageRows();
    setEmpty(!el.textContent.trim() && !el.querySelector("li,img"));
    onChange(el.innerHTML);
  }
  function makeImageRow() {
    const row = document.createElement("div");
    row.setAttribute("data-rte-image-row", "1");
    row.setAttribute("contenteditable", "false");
    return row;
  }
  function makeTextLine() {
    const line = document.createElement("div");
    line.setAttribute("data-rte-text-line", "1");
    line.appendChild(document.createElement("br"));
    return line;
  }
  function isTextLine(node) {
    return node?.nodeType === 1 && node.getAttribute("data-rte-text-line") === "1";
  }
  function ensureTextLineAfterImageRow(row) {
    if (!row?.parentNode) return null;
    let next = row.nextSibling;
    while (isIgnorableImageGap(next)) {
      const remove = next;
      next = next.nextSibling;
      remove.remove();
    }
    if (isTextLine(next)) return next;
    const line = makeTextLine();
    row.parentNode.insertBefore(line, next || null);
    return line;
  }
  function isImageFile(file) {
    return file && file.type && file.type.startsWith("image/");
  }
  function imageFilesFromClipboard(data) {
    const seen = new Set();
    const files = [];
    const add = (file) => {
      if (!isImageFile(file)) return;
      const key = `${file.name || ""}|${file.size || 0}|${file.type || ""}|${file.lastModified || 0}`;
      if (seen.has(key)) return;
      seen.add(key);
      files.push(file);
    };
    Array.from(data?.files || []).forEach(add);
    Array.from(data?.items || []).forEach((item) => {
      if (item.kind === "file" && item.type?.startsWith("image/")) add(item.getAsFile());
    });
    return files;
  }
  function htmlHasFileImagePlaceholder(html) {
    return /<img\b/i.test(html || "") && /(?:src|alt)=["'][^"']*\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^"']*)?["']/i.test(html);
  }
  function escapeHtmlChunk(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeHtmlAttr(text) {
    return escapeHtmlChunk(text).replace(/'/g, "&#39;");
  }
  function pastedUrlRegex() {
    return /((?:https?:\/\/|www\.)[A-Za-z0-9._~:\/?#\[\]@!$&()*+,;=%-]+)/gi;
  }
  function normalizePastedUrl(raw) {
    const text = String(raw || "");
    const tail = (text.match(/[.,;:!?，。；：！？、)\]}）】》]+$/) || [""])[0];
    const label = tail ? text.slice(0, -tail.length) : text;
    if (!label) return null;
    const href = /^www\./i.test(label) ? `https://${label}` : label;
    const url = safeLinkUrl(href);
    return url ? { label, href: url, tail } : null;
  }
  function textHasWebLink(text) {
    const re = pastedUrlRegex();
    let match;
    while ((match = re.exec(text || ""))) {
      if (normalizePastedUrl(match[0])) return true;
    }
    return false;
  }
  function autolinkPastedText(text) {
    const source = String(text || "");
    const re = pastedUrlRegex();
    let out = "";
    let last = 0;
    const appendText = (chunk) => {
      out += escapeHtmlChunk(chunk).replace(/\r\n|\r|\n/g, "<br>");
    };
    source.replace(re, (match, _url, offset) => {
      appendText(source.slice(last, offset));
      const parsed = normalizePastedUrl(match);
      if (parsed) {
        out += `<a href="${escapeHtmlAttr(parsed.href)}">${escapeHtmlChunk(parsed.label)}</a>${escapeHtmlChunk(parsed.tail)}`;
      } else {
        appendText(match);
      }
      last = offset + match.length;
      return match;
    });
    appendText(source.slice(last));
    return out;
  }
  function isBadPastedImagePlaceholder(img) {
    const src = (img.getAttribute("src") || "").trim();
    const alt = (img.getAttribute("alt") || "").trim();
    const isDurableSrc = /^data:image\//i.test(src) || /^https?:\/\//i.test(src) || /^blob:/i.test(src) || /^\/api\/files\//i.test(src);
    const looksLikeFileName = /\.(?:png|jpe?g|gif|webp|bmp|svg)$/i.test(src) || /\.(?:png|jpe?g|gif|webp|bmp|svg)$/i.test(alt);
    return !src || /^file:/i.test(src) || (looksLikeFileName && !isDurableSrc);
  }
  function isImageRow(node) {
    return node?.nodeType === 1 && node.getAttribute("data-rte-image-row") === "1";
  }
  function isIgnorableImageGap(node) {
    return (node?.nodeType === 3 && !node.textContent.trim()) || (node?.nodeType === 1 && node.tagName === "BR");
  }
  function normalizeImageRows() {
    const editor = ref.current; if (!editor) return;
    Array.from(editor.querySelectorAll("img")).forEach((img) => {
      if (isBadPastedImagePlaceholder(img)) img.remove();
    });
    Array.from(editor.querySelectorAll('[data-rte-image-row="1"]')).forEach((row) => {
      if (!row.querySelector("img")) row.remove();
    });
    Array.from(editor.querySelectorAll("img")).forEach((img) => {
      if (img.closest('[data-rte-image-row="1"]')) return;
      const row = makeImageRow();
      img.parentNode.insertBefore(row, img);
      row.appendChild(img);
      let next = row.nextSibling;
      while (next) {
        if (isIgnorableImageGap(next)) {
          const remove = next;
          next = next.nextSibling;
          remove.remove();
          continue;
        }
        if (next.nodeType === 1 && next.tagName === "IMG") {
          const move = next;
          next = next.nextSibling;
          row.appendChild(move);
          continue;
        }
        if (isImageRow(next)) {
          const merge = next;
          next = next.nextSibling;
          Array.from(merge.querySelectorAll("img")).forEach((x) => row.appendChild(x));
          merge.remove();
          continue;
        }
        break;
      }
    });
    Array.from(editor.querySelectorAll('[data-rte-image-row="1"]')).forEach((row) => {
      row.setAttribute("contenteditable", "false");
      const stray = [];
      Array.from(row.childNodes).forEach((child) => {
        if (child.nodeType === 1 && child.tagName === "IMG") return;
        if (child.nodeType === 3 && !child.textContent.trim()) { child.remove(); return; }
        stray.push(child);
      });
      if (stray.length) {
        const line = ensureTextLineAfterImageRow(row);
        if (line) {
          if (line.childNodes.length === 1 && line.firstChild?.nodeName === "BR") line.textContent = "";
          stray.forEach((child) => line.appendChild(child));
        }
      }
      let next = row.nextSibling;
      while (isIgnorableImageGap(next)) {
        const remove = next;
        next = next.nextSibling;
        remove.remove();
      }
      if (isImageRow(next)) {
        Array.from(next.querySelectorAll("img")).forEach((img) => row.appendChild(img));
        next.remove();
      }
      if (!row.nextSibling) ensureTextLineAfterImageRow(row);
    });
  }
  function clearSelectedImage() {
    selectedImgRef.current = null;
    setImgBox(null);
    setImgGuide(null);
    setImgGhost(null);
  }
  function deleteSelectedImage() {
    if (readOnly) return;
    const img = selectedImgRef.current;
    const editor = ref.current;
    if (!img || !editor || !editor.contains(img)) { clearSelectedImage(); return; }
    const row = img.closest('[data-rte-image-row="1"]');
    img.remove();
    if (row && !row.querySelector("img")) row.remove();
    clearSelectedImage();
    emit();
    editor.focus();
  }
  async function replaceSelectedImage(file) {
    if (readOnly) return;
    const img = selectedImgRef.current;
    const editor = ref.current;
    if (!file || !img || !editor || !editor.contains(img)) { clearSelectedImage(); return; }
    const currentRect = img.getBoundingClientRect();
    const maxW = Math.max(RTE_IMAGE_MIN_W, editor.clientWidth);
    const minW = Math.min(RTE_IMAGE_MIN_W, maxW);
    const keepW = Math.round(Math.min(maxW, Math.max(minW, currentRect.width || RTE_IMAGE_MIN_W)));
    const data = await imageFileToManagedSrc(file, "doc-image");
    img.onload = () => {
      img.onload = null;
      positionImageTools(img);
    };
    img.src = data;
    img.alt = file.name || img.alt || "";
    img.style.width = `${keepW}px`;
    img.style.height = "auto";
    img.removeAttribute("width");
    img.removeAttribute("height");
    emit();
    editor.focus();
    window.requestAnimationFrame(() => positionImageTools(img));
  }
  function rectToWrap(rect) {
    const wrap = wrapRef.current;
    if (!wrap || !rect) return null;
    const wr = wrap.getBoundingClientRect();
    return { left: rect.left - wr.left, top: rect.top - wr.top, width: rect.width, height: rect.height };
  }
  function editorImages(except) {
    return Array.from(ref.current?.querySelectorAll("img") || []).filter((img) => img !== except);
  }
  function positionImageTools(img = selectedImgRef.current) {
    const wrap = wrapRef.current;
    if (!wrap || !img || !ref.current?.contains(img)) { clearSelectedImage(); return; }
    const wr = wrap.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    setImgBox({ left: ir.left - wr.left, top: ir.top - wr.top, width: ir.width, height: ir.height });
  }
  function selectImage(img) {
    selectedImgRef.current = img;
    ref.current?.focus();
    setTb(null);
    setLinkBubble(null);
    positionImageTools(img);
  }
  function closestLinkFromNode(node) {
    const editor = ref.current;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const link = el?.closest?.("a[href]");
    return link && editor?.contains(link) ? link : null;
  }
  function safeLinkUrl(href) {
    const raw = (href || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw, window.location.href);
      return /^(https?:|mailto:|tel:)$/i.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }
  function linkRect(link, range) {
    const rangeRect = range?.getBoundingClientRect?.();
    if (rangeRect && (rangeRect.width || rangeRect.height)) return rangeRect;
    const rect = Array.from(link.getClientRects?.() || []).find((r) => r.width || r.height);
    return rect || link.getBoundingClientRect();
  }
  function isTransparentBg(value) {
    const v = String(value || "").trim().toLowerCase();
    return !v || v === "transparent" || v === "rgba(0, 0, 0, 0)" || v === "rgba(0,0,0,0)";
  }
  function isHighlightBg(value) {
    const v = String(value || "").trim().toLowerCase();
    if (isTransparentBg(v)) return false;
    if (v === "#fff" || v === "#ffffff" || v === "white" || v === "rgb(255, 255, 255)" || v === "rgba(255, 255, 255, 1)") return false;
    return true;
  }
  function elementHasHighlight(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === "MARK") return true;
    const inlineBg = el.style?.backgroundColor || el.style?.background;
    if (isHighlightBg(inlineBg)) return true;
    const bg = window.getComputedStyle?.(el).backgroundColor;
    return isHighlightBg(bg);
  }
  function selectedTextNodes(range, editor) {
    const nodes = [];
    const visit = (node) => {
      if (!node) return;
      if (node.nodeType === 3) {
        if (node.textContent.trim()) {
          try { if (range.intersectsNode(node)) nodes.push(node); } catch {}
        }
        return;
      }
      Array.from(node.childNodes || []).forEach(visit);
    };
    visit(range.commonAncestorContainer);
    return nodes.filter((node) => editor.contains(node));
  }
  function textNodeHasHighlight(node, editor) {
    let el = node?.parentElement;
    while (el && el !== editor) {
      if (elementHasHighlight(el)) return true;
      el = el.parentElement;
    }
    return false;
  }
  function textNodeHasBold(node, editor) {
    let el = node?.parentElement;
    while (el && el !== editor) {
      if (el.tagName === "B" || el.tagName === "STRONG") return true;
      const weight = window.getComputedStyle?.(el).fontWeight;
      if (weight === "bold" || Number(weight) >= 600) return true;
      el = el.parentElement;
    }
    return false;
  }
  function selectionFormat(range) {
    const editor = ref.current;
    if (!editor || !range) return { bold: false, highlight: false };
    const nodes = selectedTextNodes(range, editor);
    let bold = false;
    try { bold = document.queryCommandState("bold"); } catch {}
    if (!bold && nodes.length) bold = nodes.every((node) => textNodeHasBold(node, editor));
    let highlight = false;
    try { highlight = isHighlightBg(document.queryCommandValue("hiliteColor") || document.queryCommandValue("backColor")); } catch {}
    if (!highlight && nodes.length) highlight = nodes.every((node) => textNodeHasHighlight(node, editor));
    return { bold, highlight };
  }
  function showLinkBubbleForLink(link, range = null) {
    const href = link?.getAttribute("href") || "";
    const url = safeLinkUrl(href);
    if (!link || !url) { linkEditingRef.current = false; activeLinkRef.current = null; setLinkBubble(null); return; }
    linkEditingRef.current = false;
    let linkId = link.getAttribute(RTE_LINK_ID_ATTR);
    if (!linkId) {
      linkId = uid();
      link.setAttribute(RTE_LINK_ID_ATTR, linkId);
    }
    activeLinkRef.current = link;
    const rect = linkRect(link, range);
    const x = Math.max(156, Math.min(window.innerWidth - 156, rect.left + rect.width / 2));
    const top = rect.top - 50;
    const y = top >= 12 ? top : rect.bottom + 8;
    setLinkBubble({ x, y, url, linkId, label: link.textContent?.trim() || url, canEdit: !readOnly && isEditableRichLink(link) });
  }
  function refreshLinkBubble(sel = window.getSelection()) {
    if (linkEditingRef.current || linkBubbleRef.current?.editing) return;
    const editor = ref.current;
    if (!editor || !sel || sel.rangeCount === 0 || !sel.isCollapsed) { setLinkBubble(null); return; }
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) { setLinkBubble(null); return; }
    const link = closestLinkFromNode(sel.anchorNode);
    showLinkBubbleForLink(link, range);
  }
  function refreshTB() {
    if (readOnly) {
      setTb(null);
      refreshLinkBubble();
      return;
    }
    if (linkEditingRef.current || linkBubbleRef.current?.editing) { setTb(null); return; }
    if (selectedImgRef.current) { setTb(null); setLinkBubble(null); positionImageTools(); return; }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !ref.current) { setTb(null); setLinkBubble(null); return; }
    const range = sel.getRangeAt(0);
    if (!ref.current.contains(range.commonAncestorContainer)) { setTb(null); setLinkBubble(null); return; }
    if (sel.isCollapsed) { setTb(null); refreshLinkBubble(sel); return; }
    setLinkBubble(null);
    const r = range.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { setTb(null); return; }
    textRangeRef.current = range.cloneRange();
    setTb({ x: r.left + r.width / 2, y: r.top, ...selectionFormat(range) });
  }
  function restoreTextRange() {
    const editor = ref.current;
    const range = textRangeRef.current;
    if (!editor) return false;
    editor.focus();
    if (!range || !editor.contains(range.commonAncestorContainer)) return false;
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }
  function exec(cmd, val) {
    if (readOnly) return;
    restoreTextRange();
    try { document.execCommand(cmd, false, val); } catch {}
    emit(); refreshTB();
  }
  function clearHighlightFromSelection(range) {
    const editor = ref.current;
    if (!editor || !range) return false;
    const targets = new Set();
    selectedTextNodes(range, editor).forEach((node) => {
      let el = node.parentElement;
      while (el && el !== editor) {
        if (elementHasHighlight(el)) targets.add(el);
        el = el.parentElement;
      }
    });
    if (!targets.size) return false;
    Array.from(targets).sort((a, b) => {
      if (a.contains(b)) return 1;
      if (b.contains(a)) return -1;
      return 0;
    }).forEach((el) => {
      if (!editor.contains(el)) return;
      if (el.tagName === "MARK") {
        const parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
        return;
      }
      el.style.background = "";
      el.style.backgroundColor = "";
      if (!el.getAttribute("style")) el.removeAttribute("style");
    });
    return true;
  }
  function highlight() {
    if (readOnly) return;
    // 切换高亮:用 hiliteColor,失败回退 backColor
    restoreTextRange();
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : textRangeRef.current;
    if (range && selectionFormat(range).highlight) {
      if (!clearHighlightFromSelection(range)) {
        try { if (!document.execCommand("hiliteColor", false, "transparent")) document.execCommand("backColor", false, "transparent"); }
        catch { document.execCommand("backColor", false, "transparent"); }
      }
    } else {
      try { if (!document.execCommand("hiliteColor", false, "#FCE9A6")) document.execCommand("backColor", false, "#FCE9A6"); }
      catch { document.execCommand("backColor", false, "#FCE9A6"); }
    }
    emit(); refreshTB();
  }
  function createLink() {
    if (readOnly) return;
    const url = window.prompt("输入链接地址", "https://");
    if (!url) return;
    restoreTextRange();
    const selectedText = window.getSelection?.()?.toString?.().trim();
    try { document.execCommand("createLink", false, url); } catch {}
    if (selectedText) markEditableLinksInSelection(ref.current, url);
    emit(); refreshTB();
  }
  function openActiveLink() {
    if (!linkBubble?.url) return;
    window.open(linkBubble.url, "_blank", "noopener,noreferrer");
  }
  function getActiveLink() {
    const editor = ref.current;
    let link = activeLinkRef.current;
    if ((!link || !editor?.contains(link)) && linkBubble?.linkId) {
      const safeId = String(linkBubble.linkId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      link = editor?.querySelector?.(`[${RTE_LINK_ID_ATTR}="${safeId}"]`) || null;
    }
    if (!editor || !link || !editor.contains(link)) {
      activeLinkRef.current = null;
      return null;
    }
    activeLinkRef.current = link;
    return link;
  }
  function editActiveLink() {
    if (readOnly) return;
    const link = getActiveLink();
    if (!link) { linkEditingRef.current = false; setLinkBubble(null); return; }
    if (!linkBubble?.canEdit && !isEditableRichLink(link)) return;
    linkEditingRef.current = true;
    setLinkBubble((bubble) => bubble ? { ...bubble, editing: true, draft: link.getAttribute("href") || bubble.url || "https://" } : bubble);
  }
  function setLinkDraft(value) {
    setLinkBubble((bubble) => bubble ? { ...bubble, draft: value } : bubble);
  }
  function commitLinkEdit() {
    if (readOnly) return;
    const editor = ref.current;
    const link = getActiveLink();
    const next = linkBubble?.draft?.trim();
    if (!editor || !link || !editor.contains(link)) { linkEditingRef.current = false; activeLinkRef.current = null; setLinkBubble(null); return; }
    if (!next) { linkEditInputRef.current?.focus(); return; }
    link.setAttribute("href", next);
    link.setAttribute(RTE_EDITABLE_LINK_ATTR, "1");
    link.setAttribute("data-rte-link-kind", "hyperlink");
    emit();
    linkEditingRef.current = false;
    editor.focus();
    showLinkBubbleForLink(link);
  }
  function cancelLinkEdit() {
    linkEditingRef.current = false;
    const link = getActiveLink();
    if (link && ref.current?.contains(link)) showLinkBubbleForLink(link);
    else setLinkBubble(null);
  }
  function onLinkEditKeyDown(e) {
    if (e.key === "Enter") { e.preventDefault(); commitLinkEdit(); }
    if (e.key === "Escape") { e.preventDefault(); cancelLinkEdit(); }
  }
  function noteLinkPopoverPointer() {
    linkPopoverPointerRef.current = true;
    window.setTimeout(() => { linkPopoverPointerRef.current = false; }, 240);
  }
  function runLinkPopoverAction(e, action) {
    e.preventDefault();
    e.stopPropagation();
    noteLinkPopoverPointer();
    action();
  }
  async function readAsyncClipboardImages() {
    if (!navigator.clipboard?.read) return [];
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        const type = item.types?.find((t) => t.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(new File([blob], "pasted-image", { type }));
      }
      return files;
    } catch {
      return [];
    }
  }
  function syncEditorValue() {
    const editor = ref.current; if (!editor) return;
    setEmpty(!editor.textContent.trim() && !editor.querySelector("li,img"));
    onChange(editor.innerHTML);
  }
  function insertHtmlAtSavedRange(html, range, options = {}) {
    if (readOnly) return;
    const editor = ref.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (sel && range && editor.contains(range.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    try {
      document.execCommand("insertHTML", false, html);
    } catch {
      const activeRange = sel && sel.rangeCount ? sel.getRangeAt(0) : range;
      if (activeRange) {
        const template = document.createElement("template");
        template.innerHTML = html;
        const frag = template.content;
        const last = frag.lastChild;
        activeRange.deleteContents();
        activeRange.insertNode(frag);
        if (last && sel) {
          const next = document.createRange();
          next.setStartAfter(last);
          next.collapse(true);
          sel.removeAllRanges();
          sel.addRange(next);
        }
      }
    }
    normalizeImageRows();
    if (options.caretLineId) {
      const safeId = String(options.caretLineId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const line = editor.querySelector(`[data-rte-caret-line="${safeId}"]`);
      if (line) {
        line.removeAttribute("data-rte-caret-line");
        placeCaretInsideEditableLine(editor, line);
      }
    }
    syncEditorValue();
    refreshTB();
  }
  async function insertImageFiles(files, range) {
    if (readOnly) return;
    if (!files.length) return;
    const imgs = [];
    for (const file of files) {
      const data = await imageFileToManagedSrc(file, "doc-image");
      imgs.push(`<img src="${data}" alt="${escapeHtmlAttrValue(file.name || "")}">`);
    }
    const lineId = uid();
    insertHtmlAtSavedRange(`<div data-rte-image-row="1" contenteditable="false">${imgs.join("")}</div><div data-rte-text-line="1" data-rte-caret-line="${lineId}"><br></div>`, range, { caretLineId: lineId });
  }
  async function onEditorPaste(e) {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    let files = imageFilesFromClipboard(e.clipboardData);
    const html = e.clipboardData?.getData("text/html") || "";
    const text = e.clipboardData?.getData("text/plain") || "";
    const hasImagePlaceholder = htmlHasFileImagePlaceholder(html);
    const hasWebLink = textHasWebLink(text);
    if (!files.length && !hasImagePlaceholder && !hasWebLink) return;
    e.preventDefault();
    e.stopPropagation();
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    if (files.length || hasImagePlaceholder) {
      if (!files.length) files = await readAsyncClipboardImages();
      if (files.length) {
        await insertImageFiles(files, range);
        return;
      }
    }
    if (hasWebLink) insertHtmlAtSavedRange(autolinkPastedText(text), range);
  }
  function openImagePreview(img) {
    if (!img) return;
    clearSelectedImage();
    setTb(null);
    setPreview({ src: img.currentSrc || img.src, alt: img.alt || "", scale: 1, x: 0, y: 0 });
  }
  function onEditorMouseDown(e) {
    if (readOnly) {
      clearSelectedImage();
      setTb(null);
      return;
    }
    if (e.target?.tagName === "IMG") {
      e.preventDefault();
      selectImage(e.target);
      startImageDrag(e, e.target);
      } else {
        clearSelectedImage();
        activeLinkRef.current = null;
        linkEditingRef.current = false;
        setLinkBubble(null);
      }
	  }
  function onEditorClick(e) {
    if (!readOnly) return;
    if (e.target?.tagName === "IMG") {
      e.preventDefault();
      e.stopPropagation();
      openImagePreview(e.target);
      return;
    }
    const link = closestLinkFromNode(e.target);
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      showLinkBubbleForLink(link);
      return;
    }
    activeLinkRef.current = null;
    linkEditingRef.current = false;
    setLinkBubble(null);
  }
  function onEditorMouseUp(e) {
    if (readOnly) return;
    const pointerLink = closestLinkFromNode(e.target);
    window.requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (pointerLink && sel?.isCollapsed) {
        setTb(null);
        showLinkBubbleForLink(pointerLink, sel.rangeCount ? sel.getRangeAt(0) : null);
        return;
      }
      refreshTB();
    });
  }
  function onEditorDoubleClick(e) {
    if (e.target?.tagName !== "IMG") return;
    e.preventDefault();
    e.stopPropagation();
    openImagePreview(e.target);
  }
  function onEditorKeyDown(e) {
    if (readOnly) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selectedImgRef.current) {
      e.preventDefault();
      e.stopPropagation();
      deleteSelectedImage();
    }
  }
  function clampPreviewScale(v) {
    return Math.min(RTE_PREVIEW_MAX_SCALE, Math.max(RTE_PREVIEW_MIN_SCALE, v));
  }
  function onPreviewWheel(e) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const pointerX = e.clientX - rect.left - rect.width / 2;
    const pointerY = e.clientY - rect.top - rect.height / 2;
    setPreview((p) => {
      if (!p) return p;
      const nextScale = clampPreviewScale(p.scale * (e.deltaY < 0 ? 1.12 : 0.88));
      const ratio = nextScale / p.scale;
      return {
        ...p,
        scale: nextScale,
        x: p.x - (pointerX - p.x) * (ratio - 1),
        y: p.y - (pointerY - p.y) * (ratio - 1),
      };
    });
  }
  function startPreviewPan(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    previewDragRef.current = { sx: e.clientX, sy: e.clientY, x: preview?.x || 0, y: preview?.y || 0 };
    const onMove = (ev) => {
      const drag = previewDragRef.current;
      if (!drag) return;
      setPreview((p) => p ? { ...p, x: drag.x + ev.clientX - drag.sx, y: drag.y + ev.clientY - drag.sy } : p);
    };
    const onUp = () => {
      previewDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  function findImageDrop(clientX, clientY, img) {
    let best = null;
    editorImages(img).forEach((target) => {
      const r = target.getBoundingClientRect();
      const inRange = clientX >= r.left - 44 && clientX <= r.right + 44 && clientY >= r.top - 28 && clientY <= r.bottom + 28;
      if (!inRange) return;
      const side = clientX < r.left + r.width / 2 ? "left" : "right";
      const edge = side === "left" ? r.left : r.right;
      const score = Math.abs(clientX - edge) + Math.abs(clientY - (r.top + r.height / 2)) * 0.25;
      if (!best || score < best.score) best = { target, side, edge, rect: r, score };
    });
    return best;
  }
  function startImageDrag(e, img) {
    if (readOnly) return;
    const startX = e.clientX, startY = e.clientY;
    const startRect = img.getBoundingClientRect();
    const startWrap = wrapRef.current?.getBoundingClientRect();
    const offsetX = startX - startRect.left;
    const offsetY = startY - startRect.top;
    let dragging = false;
    let drop = null;
    const onMove = (ev) => {
      const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!dragging && moved < 5) return;
      dragging = true;
      img.style.opacity = "0.58";
      img.style.cursor = "grabbing";
      setTb(null);
      if (startWrap) {
        setImgGhost({ src: img.currentSrc || img.src, left: ev.clientX - startWrap.left - offsetX, top: ev.clientY - startWrap.top - offsetY, width: startRect.width, height: startRect.height });
      }
      drop = findImageDrop(ev.clientX, ev.clientY, img);
      if (drop) {
        const box = rectToWrap(drop.rect);
        setImgGuide({ type: "insert", left: drop.edge - wrapRef.current.getBoundingClientRect().left, top: box.top, height: box.height, target: box });
      } else {
        setImgGuide(null);
      }
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      img.style.opacity = "";
      img.style.cursor = "";
      setImgGhost(null);
      if (dragging && drop?.target && ref.current?.contains(drop.target)) {
        if (drop.side === "left") drop.target.parentNode.insertBefore(img, drop.target);
        else drop.target.parentNode.insertBefore(img, drop.target.nextSibling);
        emit();
      }
      setImgGuide(null);
      window.requestAnimationFrame(() => positionImageTools(img));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  function findSizeSnap(width, aspect, img, minW, maxW) {
    const proposedH = width / aspect;
    let best = null;
    editorImages(img).forEach((target) => {
      const r = target.getBoundingClientRect();
      const widthDiff = Math.abs(width - r.width);
      if (widthDiff <= RTE_IMAGE_SNAP) best = !best || widthDiff < best.diff ? { kind: "width", width: r.width, target, diff: widthDiff } : best;
      const heightDiff = Math.abs(proposedH - r.height);
      const snappedByHeight = Math.min(maxW, Math.max(minW, r.height * aspect));
      if (heightDiff <= RTE_IMAGE_SNAP) best = !best || heightDiff < best.diff ? { kind: "height", width: snappedByHeight, target, diff: heightDiff } : best;
    });
    return best;
  }
  function showSizeGuide(kind, img, target) {
    const current = rectToWrap(img.getBoundingClientRect());
    const match = rectToWrap(target.getBoundingClientRect());
    if (!current || !match) { setImgGuide(null); return; }
    setImgGuide({ type: "size", kind, current, match });
  }
  function startImageResize(e) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const img = selectedImgRef.current;
    const editor = ref.current;
    if (!img || !editor) return;
    const startX = e.clientX;
    const startRect = img.getBoundingClientRect();
    const startW = startRect.width;
    const aspect = startRect.width / Math.max(1, startRect.height);
    const maxW = Math.max(RTE_IMAGE_MIN_W, editor.clientWidth);
    const minW = Math.min(RTE_IMAGE_MIN_W, maxW);
    const onMove = (ev) => {
      let nextW = Math.round(Math.min(maxW, Math.max(minW, startW + ev.clientX - startX)));
      const snap = findSizeSnap(nextW, aspect, img, minW, maxW);
      if (snap) nextW = Math.round(snap.width);
      img.style.width = `${nextW}px`;
      img.style.height = "auto";
      img.removeAttribute("width");
      img.removeAttribute("height");
      positionImageTools(img);
      if (snap) showSizeGuide(snap.kind, img, snap.target);
      else setImgGuide(null);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      emit();
      setImgGuide(null);
      positionImageTools(img);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  function openReplaceImagePicker(e) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    replaceImageInputRef.current?.click();
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {!readOnly && <input ref={replaceImageInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const file = e.target.files?.[0]; if (file) void replaceSelectedImage(file); e.target.value = ""; }} />}
      <div ref={ref} className="rte" contentEditable={!readOnly} suppressContentEditableWarning
        data-rich-editor="1" data-ph={placeholder} data-empty={empty ? "1" : "0"}
        data-readonly={readOnly ? "1" : "0"}
        onInput={readOnly ? undefined : emit}
        onPaste={readOnly ? onEditorPaste : onEditorPaste}
        onMouseDown={onEditorMouseDown}
        onClick={onEditorClick}
        onDoubleClick={onEditorDoubleClick}
        onKeyDown={readOnly ? undefined : onEditorKeyDown}
        onMouseUp={readOnly ? undefined : onEditorMouseUp}
        onKeyUp={readOnly ? undefined : refreshTB}
        onFocus={readOnly ? undefined : refreshTB}
        onBlur={() => setTimeout(() => {
          if (linkBubbleRef.current?.editing || linkPopoverPointerRef.current || document.activeElement?.closest?.('[data-rte-link-popover="1"]')) return;
          setTb(null);
          linkEditingRef.current = false;
          setLinkBubble(null);
        }, 160)}
        style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.8, color: C.ink, padding: "3px 5px", borderRadius: 6, minHeight: 26, cursor: readOnly ? "default" : "text", ...style }} />
      {!readOnly && imgGhost && (
        <img data-rte-image-drag-ghost="1" src={imgGhost.src} alt="" draggable={false}
          style={{ position: "absolute", left: imgGhost.left, top: imgGhost.top, width: imgGhost.width, height: imgGhost.height, objectFit: "contain", borderRadius: 16, border: `1px solid ${C.indigo}`, opacity: 0.78, pointerEvents: "none", zIndex: 14, boxShadow: "0 14px 30px rgba(15,23,42,.18)" }} />
      )}
      {!readOnly && imgGuide?.type === "insert" && (
        <>
          <div data-rte-image-drop-guide="1" style={{ position: "absolute", left: imgGuide.left - 2, top: imgGuide.top, width: 4, height: imgGuide.height, borderRadius: 999, background: C.indigo, boxShadow: "0 0 0 4px rgba(59,130,246,.16)", pointerEvents: "none", zIndex: 13 }} />
          <div style={{ position: "absolute", left: imgGuide.target.left, top: imgGuide.target.top, width: imgGuide.target.width, height: imgGuide.target.height, border: `2px solid rgba(59,130,246,.42)`, borderRadius: 16, pointerEvents: "none", zIndex: 12 }} />
        </>
      )}
      {!readOnly && imgGuide?.type === "size" && (
        <>
          {[imgGuide.current, imgGuide.match].map((box, i) => imgGuide.kind === "width" ? (
            <div key={i} data-rte-image-size-guide="1" style={{ position: "absolute", left: box.left, top: box.top - 9, width: box.width, height: 3, borderRadius: 999, background: C.indigo, boxShadow: "0 0 0 4px rgba(59,130,246,.14)", pointerEvents: "none", zIndex: 13 }} />
          ) : (
            <div key={i} data-rte-image-size-guide="1" style={{ position: "absolute", left: box.left + box.width + 7, top: box.top, width: 3, height: box.height, borderRadius: 999, background: C.indigo, boxShadow: "0 0 0 4px rgba(59,130,246,.14)", pointerEvents: "none", zIndex: 13 }} />
          ))}
        </>
      )}
      {!readOnly && imgBox && (
        <div data-rte-image-resizer="1" style={{ position: "absolute", left: imgBox.left, top: imgBox.top, width: imgBox.width, height: imgBox.height, pointerEvents: "none", border: `2px solid ${C.indigo}`, borderRadius: 16, boxShadow: "0 0 0 3px rgba(59,130,246,.12)", zIndex: 12 }}>
          <div data-rte-image-tools="1" style={{ position: "absolute", left: 8, top: 8, display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", borderRadius: 10, background: "rgba(15,23,42,.86)", color: "#fff", pointerEvents: "auto", boxShadow: "0 10px 26px rgba(15,23,42,.24)" }}>
            <button type="button" data-rte-image-replace="1" title="替换图片" onMouseDown={openReplaceImagePicker}
              style={{ border: "none", borderRadius: 8, background: C.indigo, color: "#fff", padding: "5px 9px", fontFamily: sans, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>替换图片</button>
          </div>
          <button type="button" data-rte-image-resize-handle="1" title="拖拽调整图片大小" onMouseDown={startImageResize}
            style={{ position: "absolute", right: -9, bottom: -9, width: 18, height: 18, borderRadius: 999, border: `2px solid ${C.surface}`, background: C.indigo, cursor: "nwse-resize", pointerEvents: "auto", boxShadow: "0 4px 10px rgba(37,99,235,.24)" }} />
        </div>
      )}
      {!readOnly && tb && (
        <div style={{ position: "fixed", left: tb.x, top: tb.y - 44, transform: "translateX(-50%)", zIndex: 80, display: "flex", gap: 2, background: C.ink, borderRadius: 9, padding: 4, boxShadow: "0 4px 16px rgba(0,0,0,.25)" }}
          onMouseDown={(e) => e.preventDefault()}>
          <RTBtn onClick={() => exec("bold")} title={tb.bold ? "取消加粗" : "加粗"} active={tb.bold}>
            <CancelFormatIcon active={tb.bold}><b>B</b></CancelFormatIcon>
          </RTBtn>
          <RTBtn onClick={highlight} title={tb.highlight ? "取消高亮" : "高亮"} active={tb.highlight}>
            <CancelFormatIcon active={tb.highlight}><span style={{ background: "#FCE9A6", color: "#222", borderRadius: 2, padding: "0 3px" }}>A</span></CancelFormatIcon>
          </RTBtn>
          <RTBtn onClick={() => exec("insertUnorderedList")} title="无序列表">•≡</RTBtn>
          <RTBtn onClick={() => exec("insertOrderedList")} title="有序列表">1.≡</RTBtn>
          <RTBtn onClick={createLink} title="链接"><LinkIcon /></RTBtn>
        </div>
      )}
      {linkBubble && typeof document !== "undefined" && createPortal((
        <div data-rte-link-popover="1" style={{ position: "fixed", left: linkBubble.x, top: linkBubble.y, transform: "translateX(-50%)", zIndex: 1000, width: linkBubble.editing ? 360 : (linkBubble.canEdit ? 316 : 258), maxWidth: "calc(100vw - 28px)", display: "flex", alignItems: "center", gap: 8, background: C.ink, color: "#fff", borderRadius: 11, padding: "7px 8px", boxShadow: "0 12px 34px rgba(15,23,42,.26)" }}
          onMouseDown={(e) => { noteLinkPopoverPointer(); if (e.target?.tagName !== "INPUT") e.preventDefault(); }}>
          <span style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#BFDBFE", flexShrink: 0 }}><LinkIcon /></span>
          {linkBubble.editing ? (
            <>
              <input ref={linkEditInputRef} data-rte-link-input="1" value={linkBubble.draft || ""} onChange={(e) => setLinkDraft(e.target.value)} onKeyDown={onLinkEditKeyDown}
                style={{ minWidth: 0, flex: 1, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)", color: "#fff", outline: "none", padding: "0 8px", fontFamily: sans, fontSize: 12 }} />
              <button type="button" data-rte-link-save="1" onMouseDown={(e) => runLinkPopoverAction(e, commitLinkEdit)}
                style={{ border: "none", borderRadius: 8, background: C.indigo, color: "#fff", padding: "5px 9px", fontFamily: sans, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>保存</button>
              <button type="button" data-rte-link-cancel="1" onMouseDown={(e) => runLinkPopoverAction(e, cancelLinkEdit)}
                style={{ border: "none", borderRadius: 8, background: "rgba(255,255,255,.12)", color: "#fff", padding: "5px 9px", fontFamily: sans, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>取消</button>
            </>
          ) : (
            <>
              <span title={linkBubble.url} style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: sans, fontSize: 12, color: "rgba(255,255,255,.82)" }}>{linkBubble.url}</span>
              {linkBubble.canEdit && (
                <button type="button" data-rte-link-edit="1" onMouseDown={(e) => runLinkPopoverAction(e, editActiveLink)}
                  style={{ border: "none", borderRadius: 8, background: "rgba(255,255,255,.12)", color: "#fff", padding: "5px 9px", fontFamily: sans, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>编辑</button>
              )}
              <button type="button" data-rte-link-open="1" onMouseDown={(e) => runLinkPopoverAction(e, openActiveLink)}
                style={{ border: "none", borderRadius: 8, background: C.indigo, color: "#fff", padding: "5px 9px", fontFamily: sans, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>打开</button>
            </>
          )}
        </div>
      ), document.body)}
      {preview && typeof document !== "undefined" && createPortal((
        <div data-rte-image-preview="1" onWheel={onPreviewWheel}
          style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,.87)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "grab" }}>
          <button type="button" data-rte-image-preview-close="1" title="关闭预览" onClick={() => setPreview(null)}
            style={{ position: "fixed", right: 24, top: 22, width: 38, height: 38, borderRadius: 999, border: "1px solid rgba(255,255,255,.22)", background: "rgba(15,23,42,.72)", color: "#fff", fontSize: 24, lineHeight: "34px", cursor: "pointer", zIndex: 10002, boxShadow: "0 10px 30px rgba(0,0,0,.28)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>×</button>
          <img data-rte-image-preview-img="1" src={preview.src} alt={preview.alt} draggable={false} onMouseDown={startPreviewPan} onDoubleClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "88vw", maxHeight: "86vh", width: "auto", height: "auto", objectFit: "contain", userSelect: "none", borderRadius: 18, boxShadow: "0 26px 80px rgba(0,0,0,.48)", transform: `translate(${preview.x}px, ${preview.y}px) scale(${preview.scale})`, transition: previewDragRef.current ? "none" : "transform .08s ease-out", cursor: "grab", zIndex: 10001 }} />
        </div>
      ), document.body)}
    </div>
  );
}
function CancelFormatIcon({ children, active }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 16, minHeight: 18 }}>
      {children}
      {active && <span style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 2, borderRadius: 999, background: "#F87171", transform: "rotate(-35deg)", boxShadow: "0 0 0 1px rgba(15,23,42,.25)" }} />}
    </span>
  );
}
function RTBtn({ children, onClick, title, active }) {
  const bg = active ? "rgba(255,255,255,.18)" : "transparent";
  return <button title={title} aria-label={title} data-active={active ? "1" : "0"} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
    style={{ border: "none", background: bg, color: "#fff", fontSize: 13, cursor: "pointer", padding: "4px 9px", borderRadius: 6, fontFamily: sans, lineHeight: 1 }}
    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.15)")}
    onMouseLeave={(e) => (e.currentTarget.style.background = bg)}>{children}</button>;
}

const tbl = { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5, overflow: "hidden", borderRadius: 12, border: `1px solid ${C.line}` };
const tdKey = { padding: "9px 12px", borderBottom: `1px solid ${C.line}`, background: C.lineSoft, fontWeight: 800, width: 110, verticalAlign: "middle", color: C.soft };
const tdVal = { padding: "9px 12px", borderBottom: `1px solid ${C.line}`, borderLeft: `1px solid ${C.line}`, lineHeight: 1.7, whiteSpace: "pre-wrap", background: "rgba(255,255,255,.72)" };
const th = { padding: "8px 12px", border: `1px solid ${C.line}`, background: C.lineSoft, fontSize: 12, color: C.soft, textAlign: "left" };
function DocSection({ id, title, action, children }) {
  return (
    <section id={id} style={{ marginTop: 64, scrollMarginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontFamily: sans, fontSize: 21, fontWeight: 800, margin: 0 }}>{title}</h2>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
      {children}
    </section>
  );
}
function DocDisplayOptions({ showPageTransitions, onShowPageTransitionsChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <Btn small kind="ghost" onClick={() => setOpen((v) => !v)}>显示选项</Btn>
      {open && (
        <div data-doc-display-options="1" style={{ position: "absolute", right: 0, top: 36, zIndex: 30, width: 220, border: `1px solid ${C.line}`, borderRadius: 16, background: C.glass, boxShadow: "0 18px 48px rgba(15,23,42,.16)", padding: 10, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
          <div style={{ padding: "4px 6px 9px", fontFamily: sans, fontSize: 12, fontWeight: 900, color: C.ink }}>文档显示</div>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 8px", borderRadius: 12, background: "rgba(248,250,252,.72)", cursor: "pointer", userSelect: "none" }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: sans, fontSize: 13, fontWeight: 850, color: C.ink }}>页面跳转</span>
              <span style={{ display: "block", marginTop: 2, fontFamily: sans, fontSize: 11, lineHeight: 1.4, color: C.faint }}>控制文档表格展示,MD 始终保留</span>
            </span>
            <input type="checkbox" checked={showPageTransitions} onChange={(e) => onShowPageTransitionsChange?.(e.target.checked)} style={{ display: "none" }} />
            <span aria-hidden="true" style={{ width: 38, height: 22, borderRadius: 999, padding: 2, background: showPageTransitions ? C.indigo : "#CBD5E1", transition: "background .16s", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: showPageTransitions ? "flex-end" : "flex-start" }}>
              <span style={{ width: 18, height: 18, borderRadius: 999, background: "#fff", boxShadow: "0 1px 4px rgba(15,23,42,.18)" }} />
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
function Empty() { return <div style={{ fontSize: 12.5, color: C.faint, fontStyle: "italic" }}>待填写</div>; }

function FlowThumb({ doc, onOpenCanvas }) {
  const wrapRef = useRef(null);
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => {
      const next = el.getBoundingClientRect().width || 0;
      setWrapW((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect?.();
      window.removeEventListener("resize", update);
    };
  }, []);
  if (!doc.nodes.length) return null;
  const pad = 30;
  const ih = (n) => (n.proto ? NODE_W * (n.protoRatio || 0.55) : 70);
  const emptyH = () => 0;
  const nh = (n) => ih(n);
  const routes = buildEdgeRoutes(doc.edges, doc.nodes, ih, emptyH, emptyH);
  const hasBack = doc.edges.some((e) => { const f = doc.nodes.find((n) => n.id === e.from), t = doc.nodes.find((n) => n.id === e.to); return f && t && (t.x + NODE_W / 2) <= (f.x + NODE_W / 2) + 4; });
  const minX = Math.min(...doc.nodes.map((n) => n.x)) - pad, minY = Math.min(...doc.nodes.map((n) => n.y)) - pad;
  const maxX = Math.max(...doc.nodes.map((n) => n.x + NODE_W)) + pad, maxY = Math.max(...doc.nodes.map((n) => n.y + nh(n))) + pad + (hasBack ? 110 + routes.maxBackLane * EDGE_BACK_LANE_GAP : 0);
  const w = maxX - minX, h = maxY - minY;
  const availableW = Math.max(320, wrapW || 960);
  const maxPreviewH = 360;
  const scale = Math.min(2.2, Math.max(0.08, Math.min(availableW / Math.max(1, w), maxPreviewH / Math.max(1, h))));
  const scaledW = Math.max(1, w * scale);
  const scaledH = Math.max(1, h * scale);
  const viewportH = Math.max(180, Math.min(maxPreviewH, scaledH));
  const offsetX = Math.max(0, (availableW - scaledW) / 2);
  const offsetY = Math.max(0, (viewportH - scaledH) / 2);
  const sx = (value) => value * scale;
  return (
    <div ref={wrapRef} role="button" tabIndex={0} data-flow-thumb="1" aria-label="查看流程图"
      onClick={(e) => { if (!onOpenCanvas) return; e.preventDefault(); e.stopPropagation(); onOpenCanvas(); }}
      onKeyDown={(e) => { if (!onOpenCanvas) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpenCanvas(); } }}
      style={{ width: "100%", padding: 0, display: "block", textAlign: "left", border: `1px solid ${C.line}`, borderRadius: 14, background: C.canvas, overflow: "hidden", cursor: onOpenCanvas ? "pointer" : "default" }}>
      <div style={{ position: "relative", width: "100%", height: viewportH, minHeight: 180, maxHeight: maxPreviewH, overflow: "hidden" }}>
        <svg viewBox={`${minX} ${minY} ${w} ${h}`} preserveAspectRatio="xMinYMin meet" style={{ position: "absolute", left: offsetX, top: offsetY, width: scaledW, height: scaledH, display: "block", pointerEvents: "none" }}>
          <defs><marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" fill="none" stroke={C.indigo} strokeWidth="1.6" /></marker></defs>
          {doc.edges.map((e) => {
            const f = doc.nodes.find((n) => n.id === e.from), t = doc.nodes.find((n) => n.id === e.to);
            if (!f || !t) return null;
            const g = edgeGeometry(e, routes);
            if (!g) return null;
            return <path key={e.id} d={g.path} fill="none" stroke={C.indigo} strokeWidth="1.6" markerEnd="url(#ah2)" opacity={g.back ? "0.55" : "0.75"} strokeDasharray={g.back ? "6 4" : undefined} />;
          })}
          {doc.nodes.map((n) => {
            if (n.proto) return null;
            const mediaPath = smoothRoundRectPath(NODE_W, ih(n), 12, n.x, n.y);
            return <path key={n.id} d={mediaPath} fill="#F8FAFC" stroke={C.line} strokeWidth="1.5" />;
          })}
        </svg>
        {doc.nodes.map((n) => {
          if (!n.proto) return null;
          const html = isHtmlProto(n);
          return (
            <div key={n.id} data-flow-thumb-proto={html ? "html" : "image"}
              style={{ position: "absolute", left: offsetX + sx(n.x - minX), top: offsetY + sx(n.y - minY), width: sx(NODE_W), height: sx(ih(n)), borderRadius: Math.max(4, sx(12)), border: `1.5px solid ${C.line}`, overflow: "hidden", background: "#fff", boxShadow: "0 8px 22px rgba(15,23,42,.06)", pointerEvents: "none" }}>
              {html ? (
                <HtmlPrototypeFrame src={n.proto} title={`${n.name || "未命名页面"} HTML 原型`} ratio={n.protoRatio} />
              ) : (
                <img src={n.proto} alt="" draggable={false} style={{ width: "100%", height: "100%", display: "block", objectFit: "contain", background: C.lineSoft, WebkitUserDrag: "none" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ AI 视图 ============ */
function AIViewPane({ doc }) {
  const text = toAI(doc);
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }
  return (
    <div className="scl" style={{ position: "absolute", inset: 0, overflowY: "auto", background: C.paper, backgroundImage: `radial-gradient(${C.grid} 1px, transparent 1px)`, backgroundSize: "24px 24px", padding: "34px 26px 80px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", background: C.glass, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, boxShadow: C.shadow, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: C.indigo, letterSpacing: ".14em", fontWeight: 700 }}>MD 视图 · 需求记录格式</div>
          <Btn small onClick={copy}>{copied ? "已复制 ✓" : "复制全文"}</Btn>
        </div>
        <pre style={{ fontFamily: mono, fontSize: 12, lineHeight: 1.8, color: C.ink, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, background: "#F8FAFC", border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 }}>{text}</pre>
      </div>
    </div>
  );
}

function exportSlugClient(value, fallback = "item") {
  const raw = htmlToMarkdownText(value || "").toLowerCase();
  return raw
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80) || fallback;
}
function exportMd(value, fallback = "未填写") {
  const text = htmlToMarkdownText(value).trim();
  return text || fallback;
}
function exportAssetExt(src, fallback = ".png") {
  const raw = String(src || "");
  const dataMatch = raw.match(/^data:([^;,]+)/i);
  const mime = dataMatch?.[1] || "";
  if (mime.includes("html")) return ".html";
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  const pathExt = raw.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1];
  return pathExt ? `.${pathExt.toLowerCase()}` : fallback;
}
function exportMdCell(value) {
  return exportMd(value).replace(/\|/g, "\\|").replace(/\n+/g, " / ");
}
function collectExportAssets(doc) {
  const assets = [];
  const seen = new Map();
  const add = ({ src, path, role, label, kind }) => {
    if (!src) return null;
    if (seen.has(src)) return seen.get(src);
    const item = { src, path, role, label, kind };
    seen.set(src, item);
    assets.push(item);
    return item;
  };
  (doc.nodes || []).forEach((node, index) => {
    const slug = exportSlugClient(node.name, `page-${index + 1}`);
    if (node.proto) {
      const html = isHtmlProto(node);
      add({
        src: node.proto,
        path: html ? `assets/prototypes/${slug}.html` : `assets/images/prototypes/${slug}${exportAssetExt(node.proto)}`,
        role: html ? "html-prototype" : "image-prototype",
        kind: html ? "html" : "image",
        label: `${node.name || `页面 ${index + 1}`}原型`,
      });
    }
    (node.competitors || []).forEach((item, compIndex) => {
      if (!item.img) return;
      add({
        src: item.img,
        path: `assets/images/references/${slug}-reference-${compIndex + 1}${exportAssetExt(item.img)}`,
        role: "competitor-reference",
        kind: "image",
        label: item.caption || `${node.name || `页面 ${index + 1}`}竞品参考 ${compIndex + 1}`,
      });
    });
  });
  return assets;
}
function buildExportRequirementsMarkdown(doc) {
  const nodeById = Object.fromEntries((doc.nodes || []).map((node) => [node.id, node]));
  const assets = collectExportAssets(doc);
  const assetPath = (src) => assets.find((item) => item.src === src)?.path || "";
  const lines = [];
  lines.push(`# ${doc.meta.name || "未命名设计单"}`);
  lines.push("");
  lines.push(`创建人：${doc.meta.createdBy || LOCAL_USER_NAME}`);
  lines.push(`创建时间：${formatDocTime(doc.meta.createdAt || doc.meta.date)}`);
  lines.push(`最近修改：${formatDocTime(doc.meta.updatedAt || doc.meta.date)}`);
  lines.push(`所属产品：${doc.meta.product || "ShutEye"}`);
  lines.push(`设计单状态：${isSubmittedDoc(doc) ? "已完成" : "编写中"}`);
  lines.push(`页面数量：${doc.nodes.length}`);
  lines.push("");
  lines.push("## 一、需求背景");
  lines.push("");
  lines.push(exportMd(doc.meta.background));
  lines.push("");
  lines.push("## 二、目标");
  lines.push("");
  lines.push("### 数据目标");
  lines.push("");
  lines.push(exportMd(doc.meta.dataGoals));
  lines.push("");
  lines.push("### 体验目标");
  lines.push("");
  lines.push(exportMd(doc.meta.expGoals));
  lines.push("");
  lines.push("## 三、总流程");
  lines.push("");
  if (doc.edges.length) {
    doc.edges.forEach((edge) => {
      const from = nodeById[edge.from];
      const to = nodeById[edge.to];
      lines.push(`- ${from?.name || "未知页面"} → ${to?.name || "未知页面"}：${exportMd(edge.label, "未命名操作")}`);
    });
  } else {
    lines.push("未填写");
  }
  lines.push("");
  lines.push("## 四、页面明细");
  lines.push("");
  if (!doc.nodes.length) lines.push("未填写");
  doc.nodes.forEach((node, index) => {
    const baseCells = docTableBaseExtraCells(node.docTableBaseCells);
    const rows = docTableRows(node.docTableRows, 1);
    const outgoing = doc.edges.filter((edge) => edge.from === node.id);
    lines.push(`### ${index + 1}. ${node.name || "未命名页面"}`);
    lines.push("");
    lines.push(`节点 ID：\`${node.id}\``);
    lines.push(`原型文件：${assetPath(node.proto) ? `\`${assetPath(node.proto)}\`` : "未添加"}`);
    lines.push("");
    lines.push("#### 页面说明");
    lines.push("");
    lines.push(exportMd(node.note));
    baseCells.note.forEach((cell, cellIndex) => {
      lines.push("");
      lines.push(`补充说明 ${cellIndex + 1}：${exportMd(cell)}`);
    });
    lines.push("");
    lines.push("#### 体验目标");
    lines.push("");
    lines.push(exportMd(node.expGoal));
    baseCells.expGoal.forEach((cell, cellIndex) => {
      lines.push("");
      lines.push(`补充目标 ${cellIndex + 1}：${exportMd(cell)}`);
    });
    if (rows.length) {
      lines.push("");
      lines.push("#### 补充记录");
      lines.push("");
      rows.forEach((row) => {
        lines.push(`- ${exportMd(row.label, "自定义项")}`);
        row.cells.forEach((cell, cellIndex) => lines.push(`  - 内容 ${cellIndex + 1}：${exportMd(cell)}`));
      });
    }
    lines.push("");
    lines.push("#### 页面跳转");
    lines.push("");
    if (outgoing.length) {
      lines.push("| 触发方式 | 跳转目标 |");
      lines.push("|---|---|");
      outgoing.forEach((edge) => {
        const target = nodeById[edge.to];
        lines.push(`| ${exportMdCell(edge.label || "未命名操作")} | ${exportMdCell(target?.name || "未知页面")} |`);
      });
    } else {
      lines.push("未填写");
    }
    if (node.competitors?.length) {
      lines.push("");
      lines.push("#### 竞品参考");
      lines.push("");
      node.competitors.forEach((item, refIndex) => {
        const path = assetPath(item.img);
        lines.push(`- 参考 ${refIndex + 1}：${exportMd(item.caption)}${path ? `（${path}）` : ""}`);
      });
    }
    lines.push("");
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function buildExportPreviewFiles(doc) {
  const assets = collectExportAssets(doc);
  const nodeById = Object.fromEntries((doc.nodes || []).map((node) => [node.id, node]));
  const title = doc.meta.name || "未命名设计单";
  const product = doc.meta.product || "ShutEye";
  const now = nowISO();
  const assetPreview = assets.map((asset) => ({
    path: asset.path,
    kind: "asset",
    title: asset.label || asset.path,
    asset,
    content: `${asset.label || asset.path}\n\n类型：${asset.role}\n路径：${asset.path}`,
  }));
  const requirements = buildExportRequirementsMarkdown(doc);
  const manifest = {
    schema: "prd-canvas-export/1.0",
    projectId: "当前设计单",
    title,
    product,
    status: isSubmittedDoc(doc) ? "done" : "writing",
    exportedAt: now,
    pageCount: doc.nodes.length,
    nodeCount: doc.nodes.length,
    edgeCount: doc.edges.length,
    assetCount: assets.length,
    assets: assets.map((asset) => ({ path: asset.path, role: asset.role, label: asset.label })),
  };
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
- 页面明细：${doc.nodes.length ? doc.nodes.map((node, index) => `[${node.name || `页面 ${index + 1}`}](./pages/${exportSlugClient(node.name, `page-${index + 1}`)}.md)`).join("、") : "未填写"}
- 总流程：[flows/main_flow.md](./flows/main_flow.md)
- 竞品参考：[references/competitor_refs.md](./references/competitor_refs.md)
`;
  const flowMd = doc.edges.length
    ? ["# 总流程", "", "| 起点 | 触发方式 | 终点 |", "|---|---|---|", ...doc.edges.map((edge) => `| ${nodeById[edge.from]?.name || "未知页面"} | ${exportMdCell(edge.label || "未命名操作")} | ${nodeById[edge.to]?.name || "未知页面"} |`)].join("\n")
    : "# 总流程\n\n未填写";
  const pages = doc.nodes.map((node, index) => ({
    path: `okf/pages/${exportSlugClient(node.name, `page-${index + 1}`)}.md`,
    kind: "markdown",
    title: node.name || `页面 ${index + 1}`,
    content: `---
type: Product Requirement Page
id: ${node.id}
title: ${node.name || "未命名页面"}
product: ${product}
prototype: ${assets.find((item) => item.src === node.proto)?.path || ""}
tags: [page, prototype]
---

# ${node.name || "未命名页面"}

## 页面说明

${exportMd(node.note)}

## 体验目标

${exportMd(node.expGoal)}

## 页面跳转

${doc.edges.filter((edge) => edge.from === node.id).map((edge) => `- ${exportMd(edge.label, "未命名操作")} → ${nodeById[edge.to]?.name || "未知页面"}`).join("\n") || "未填写"}
`,
  }));
  const groupFiles = (doc.groups || []).map((group, index) => ({
    path: `okf/groups/${exportSlugClient(group.name, `group-${index + 1}`)}.md`,
    kind: "markdown",
    title: group.name || `分组 ${index + 1}`,
    content: `# ${group.name || `分组 ${index + 1}`}\n\n${(group.nodeIds || []).map((id) => `- ${nodeById[id]?.name || id}`).join("\n") || "未填写"}`,
  }));
  return [
    { path: "README.md", kind: "markdown", title: "README.md", content: readme },
    { path: "manifest.json", kind: "json", title: "manifest.json", content: JSON.stringify(manifest, null, 2) },
    { path: "requirements.md", kind: "markdown", title: "requirements.md", content: requirements },
    { path: "canvas.json", kind: "json", title: "canvas.json", content: JSON.stringify(doc, null, 2) },
    { path: "okf/index.md", kind: "markdown", title: "okf/index.md", content: okfIndex },
    { path: "okf/project.md", kind: "markdown", title: "okf/project.md", content: `# ${title}\n\n## 需求背景\n\n${exportMd(doc.meta.background)}\n\n## 数据目标\n\n${exportMd(doc.meta.dataGoals)}\n\n## 体验目标\n\n${exportMd(doc.meta.expGoals)}` },
    { path: "okf/flows/main_flow.md", kind: "markdown", title: "okf/flows/main_flow.md", content: flowMd },
    ...pages,
    ...groupFiles,
    { path: "okf/references/competitor_refs.md", kind: "markdown", title: "okf/references/competitor_refs.md", content: "# 竞品参考\n\n" + ((doc.nodes || []).flatMap((node, nodeIndex) => (node.competitors || []).map((item, refIndex) => `## ${node.name || `页面 ${nodeIndex + 1}`} · 参考 ${refIndex + 1}\n\n${exportMd(item.caption)}`)).join("\n\n") || "未填写") },
    { path: "assets/thumbnails/README.md", kind: "markdown", title: "assets/thumbnails/README.md", content: "# thumbnails\n\n缩略图目录保留给后续版本生成，不影响当前资源包使用。" },
    { path: "export-log.json", kind: "json", title: "export-log.json", content: JSON.stringify({ exportedAt: now, generator: "prd-canvas-exporter/1.0", warnings: [], assetCount: assets.length, missingAssetCount: 0 }, null, 2) },
    ...assetPreview,
  ].sort((a, b) => a.path.localeCompare(b.path));
}
function fileTreeFromExportFiles(files) {
  const root = { name: "", path: "", type: "dir", children: [] };
  files.forEach((file) => {
    const parts = file.path.split("/");
    let cursor = root;
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      let child = cursor.children.find((item) => item.name === part);
      if (!child) {
        child = { name: part, path, type: index === parts.length - 1 ? "file" : "dir", children: [] };
        cursor.children.push(child);
      }
      cursor = child;
    });
  });
  const sort = (node) => {
    node.children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    node.children.forEach(sort);
  };
  sort(root);
  return root.children;
}
function exportHeadings(file) {
  if (!file?.content || !["markdown", "json"].includes(file.kind)) return [];
  return String(file.content).split("\n").map((line, index) => {
    const md = line.match(/^(#{1,4})\s+(.+)/);
    if (md) return { id: `export-line-${index}`, label: md[2].replace(/`/g, ""), level: md[1].length };
    if (file.kind === "json" && /"[^"]+":/.test(line) && index < 80) {
      const label = line.match(/"([^"]+)":/)?.[1];
      return label ? { id: `export-line-${index}`, label, level: 2 } : null;
    }
    return null;
  }).filter(Boolean).slice(0, 36);
}
function ExportViewPane({ doc, apiClient, activeDesign, onToast }) {
  const files = useMemo(() => buildExportPreviewFiles(doc), [doc]);
  const tree = useMemo(() => fileTreeFromExportFiles(files), [files]);
  const [selectedPath, setSelectedPath] = useState("requirements.md");
  const [downloading, setDownloading] = useState(false);
  const selected = files.find((file) => file.path === selectedPath) || files[0];
  const headings = useMemo(() => exportHeadings(selected), [selected]);
  useEffect(() => {
    if (!files.some((file) => file.path === selectedPath)) setSelectedPath(files[0]?.path || "");
  }, [files, selectedPath]);
  async function downloadPackage() {
    const id = activeDesign?.id || apiClient?.getCurrentDesignId?.();
    if (!apiClient?.exportPackage || !id) {
      onToast?.("当前设计单需要保存到本地服务器后才能下载完整资源包");
      return;
    }
    setDownloading(true);
    try {
      const result = await apiClient.exportPackage(id, doc);
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName || `${exportSlugClient(doc.meta.name, "prd-canvas-export")}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
      onToast?.("导出包已开始下载");
    } catch (error) {
      onToast?.(error.message || "导出失败");
    } finally {
      setDownloading(false);
    }
  }
  const stats = [
    ["页面", doc.nodes.length],
    ["连线", doc.edges.length],
    ["资源", files.filter((file) => file.kind === "asset").length],
    ["文件", files.length],
  ];
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: C.paper, backgroundImage: `radial-gradient(${C.grid} 1px, transparent 1px)`, backgroundSize: "24px 24px", padding: 20, display: "grid", gridTemplateColumns: "280px minmax(0,1fr) 260px", gap: 18 }}>
      <aside style={{ minHeight: 0, background: C.glass, border: `1px solid ${C.line}`, borderRadius: 22, boxShadow: C.shadow, display: "flex", flexDirection: "column", overflow: "hidden", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <div style={{ padding: "18px 18px 14px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.ink }}>导出包结构</div>
          <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: C.soft }}>机器稳定生成，不包含评论内容。</div>
        </div>
        <div className="scl" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10 }}>
          <ExportTree nodes={tree} selectedPath={selected?.path} onSelect={setSelectedPath} />
        </div>
      </aside>
      <main style={{ minHeight: 0, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 24, boxShadow: "0 10px 40px -10px rgba(59,130,246,.08), 0 0 20px -5px rgba(0,0,0,.03)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ flexShrink: 0, padding: "16px 20px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, background: "rgba(248,250,252,.72)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.faint, fontFamily: mono, fontWeight: 800, letterSpacing: ".08em" }}>FILE PREVIEW</div>
            <div style={{ marginTop: 4, fontSize: 18, lineHeight: 1.25, fontWeight: 900, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected?.path || "未选择文件"}</div>
          </div>
          <button type="button" onClick={downloadPackage} disabled={downloading} style={{ height: 38, border: "none", borderRadius: 999, padding: "0 16px", background: downloading ? "#93C5FD" : C.indigo, color: "#fff", fontFamily: sans, fontSize: 13, fontWeight: 900, cursor: downloading ? "default" : "pointer", boxShadow: "0 10px 22px rgba(37,99,235,.2)", whiteSpace: "nowrap" }}>{downloading ? "正在打包..." : "下载项目包"}</button>
        </div>
        <div className="scl" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 24 }}>
          <ExportFilePreview file={selected} />
        </div>
      </main>
      <aside className="doc-toc-panel" style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: C.glass, border: `1px solid ${C.line}`, borderRadius: 20, boxShadow: C.shadow, padding: 16 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.faint, letterSpacing: ".14em", fontWeight: 900 }}>EXPORT INDEX</div>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {stats.map(([label, value]) => (
              <div key={label} style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 12, padding: "9px 10px", background: "rgba(248,250,252,.74)" }}>
                <div style={{ color: C.faint, fontSize: 11, fontWeight: 800 }}>{label}</div>
                <div style={{ marginTop: 3, color: C.ink, fontSize: 18, fontWeight: 900 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: C.glass, border: `1px solid ${C.line}`, borderRadius: 20, boxShadow: C.shadow, padding: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.faint, letterSpacing: ".14em", fontWeight: 900, marginBottom: 12 }}>ON THIS FILE</div>
          <div className="scl" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", alignContent: "start", gap: 4 }}>
            {headings.length ? headings.map((item) => (
              <button key={item.id} type="button" onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                style={{ border: "none", background: "transparent", borderRadius: 8, padding: `6px 7px 6px ${Math.min(22, 7 + (item.level - 1) * 10)}px`, color: C.soft, fontFamily: sans, fontSize: 12, fontWeight: 800, textAlign: "left", cursor: "pointer" }}>{item.label}</button>
            )) : <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.6 }}>当前文件没有可索引标题。</div>}
          </div>
        </div>
      </aside>
    </div>
  );
}
function ExportTree({ nodes, selectedPath, onSelect, depth = 0 }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {nodes.map((node) => (
        <div key={node.path}>
          <button type="button" disabled={node.type !== "file"} onClick={() => node.type === "file" && onSelect(node.path)}
            style={{ width: "100%", minHeight: 30, border: "none", borderRadius: 10, padding: `0 8px 0 ${8 + depth * 12}px`, background: selectedPath === node.path ? C.indigoSoft : "transparent", color: selectedPath === node.path ? C.indigo : node.type === "dir" ? C.ink : C.soft, fontFamily: sans, fontSize: 12.5, fontWeight: node.type === "dir" ? 900 : 760, display: "flex", alignItems: "center", gap: 7, textAlign: "left", cursor: node.type === "file" ? "pointer" : "default" }}>
            <span style={{ width: 18, height: 18, borderRadius: 6, background: node.type === "dir" ? "#E0F2FE" : "#F1F5F9", color: node.type === "dir" ? "#0284C7" : C.soft, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>{node.type === "dir" ? "⌁" : "·"}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
          </button>
          {node.children?.length ? <ExportTree nodes={node.children} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} /> : null}
        </div>
      ))}
    </div>
  );
}
function ExportFilePreview({ file }) {
  if (!file) return null;
  if (file.kind === "asset") {
    const asset = file.asset || {};
    const isHtml = asset.kind === "html";
    return (
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ marginBottom: 16, color: C.soft, fontSize: 13, lineHeight: 1.7 }}>
          <div><strong style={{ color: C.ink }}>资源说明：</strong>{asset.label || file.path}</div>
          <div><strong style={{ color: C.ink }}>导出路径：</strong><code>{file.path}</code></div>
        </div>
        {isHtml ? (
          <div style={{ width: 280, borderRadius: 18, overflow: "hidden", border: `1px solid ${C.line}`, background: "#fff", boxShadow: "0 16px 40px rgba(15,23,42,.1)" }}>
            <HtmlPrototypeFrame src={asset.src} title={asset.label || "HTML 原型预览"} ratio={HTML_PROTO_DEFAULT_RATIO} />
          </div>
        ) : (
          <img src={asset.src} alt={asset.label || ""} style={{ maxWidth: "100%", maxHeight: 560, borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: "0 16px 40px rgba(15,23,42,.1)", objectFit: "contain" }} />
        )}
      </div>
    );
  }
  const lines = String(file.content || "").split("\n");
  return (
    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: file.kind === "json" ? mono : sans, fontSize: file.kind === "json" ? 12 : 14, lineHeight: file.kind === "json" ? 1.75 : 1.85, color: C.ink }}>
      {lines.map((line, index) => {
        const heading = line.match(/^(#{1,4})\s+(.+)/);
        const id = heading || (file.kind === "json" && /"[^"]+":/.test(line) && index < 80) ? `export-line-${index}` : undefined;
        return <span key={index} id={id} style={heading ? { display: "block", marginTop: index ? 18 : 0, fontSize: Math.max(15, 24 - heading[1].length * 2), fontWeight: 900, fontFamily: sans } : undefined}>{line || " "}{index < lines.length - 1 ? "\n" : ""}</span>;
      })}
    </pre>
  );
}

/* ============ 提交 ============ */
function SubmitBtn({ doc, update, onSubmitted, onRequestEdit, canEdit = true }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const done = isSubmittedDoc(doc);
  const finalSubmitted = done || submitted;
  const completed = submissionChecklist.filter((item) => checked[item.id]).length;
  const allChecked = submissionChecklist.every((item) => checked[item.id]);
  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setChecked(doc?.meta?.submissionChecklist || {});
  }, [open]);
  function toggle(id) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function submit() {
    const ready = submissionChecklist.every((item) => checked[item.id]);
    if (!ready || finalSubmitted) return;
    update({
      ...doc,
      meta: {
        ...doc.meta,
        requirementStatus: "done",
        submittedAt: nowISO(),
        submissionChecklist: Object.fromEntries(submissionChecklist.map((item) => [item.id, true])),
      },
    });
    setSubmitted(true);
    setOpen(false);
    onSubmitted?.();
  }
  if (done) {
    return (
      <div data-submitted-actions="1" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {canEdit && <Btn kind="ghost" onClick={onRequestEdit}>编辑</Btn>}
        <Btn disabled>已完成</Btn>
      </div>
    );
  }
  if (!canEdit) return <Btn disabled>只读</Btn>;
  return (
    <>
      <Btn onClick={() => setOpen(true)}>提交</Btn>
      {open && (
        <div data-submit-checklist-modal="1" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.34)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.glass, border: `1px solid ${C.line}`, borderRadius: 20, padding: 24, width: "100%", maxWidth: 760, maxHeight: "calc(100vh - 56px)", overflowY: "auto", boxShadow: "0 22px 70px rgba(15,23,42,.18)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, marginBottom: 16 }}>
              <div>
                <h3 style={{ fontFamily: sans, fontSize: 20, lineHeight: 1.25, fontWeight: 900, margin: 0, color: C.ink }}>提交前 Checklist</h3>
                <p style={{ fontSize: 12.5, color: C.soft, margin: "7px 0 0", lineHeight: 1.7 }}>每一项都确认无遗漏后才能提交成功。提交成功后,当前设计单状态会更新为已完成。</p>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", height: 28, borderRadius: 999, padding: "0 10px", background: allChecked ? C.sedSoft : C.indigoSoft, color: allChecked ? "#047857" : C.indigo, fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" }}>{completed}/{submissionChecklist.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {submissionChecklist.map((item) => {
                const active = !!checked[item.id];
                return (
                  <label key={item.id} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 10, alignItems: "start", padding: "10px 12px", borderRadius: 12, border: `1px solid ${active ? "rgba(16,185,129,.38)" : C.line}`, background: active ? "rgba(236,253,245,.72)" : "rgba(248,250,252,.68)", cursor: "pointer", transition: "background .16s,border-color .16s" }}>
                    <input type="checkbox" checked={active} onChange={() => toggle(item.id)}
                      style={{ margin: "2px 0 0", width: 16, height: 16, accentColor: C.indigo, cursor: "pointer" }} />
                    <span style={{ minWidth: 0, fontFamily: sans, fontSize: 14, lineHeight: 1.55, color: active ? "#0F766E" : C.ink, fontWeight: active ? 760 : 700 }}>{item.text}</span>
                  </label>
                );
              })}
            </div>
            {finalSubmitted && (
              <div data-submit-success="1" style={{ marginTop: 14, borderRadius: 12, border: "1px solid rgba(16,185,129,.32)", background: C.sedSoft, color: "#047857", padding: "10px 12px", fontSize: 13, fontWeight: 850 }}>
                提交成功,设计单状态已更新为已完成。
              </div>
            )}
            {!allChecked && (
              <div style={{ marginTop: 14, color: C.faint, fontSize: 12.5, lineHeight: 1.6 }}>还需确认 {submissionChecklist.length - completed} 项后才能提交。</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Btn kind="ghost" onClick={() => setOpen(false)}>{finalSubmitted ? "返回画布" : "取消"}</Btn>
              <Btn disabled={!allChecked || finalSubmitted} onClick={submit}>{finalSubmitted ? "已提交" : "提交设计单"}</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
