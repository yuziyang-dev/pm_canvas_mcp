import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import PRDCanvas from "../prd-canvas (2).jsx";
import CanvasLogoMark from "./canvas-logo.jsx";
import { createPrdApi, installLocalStorageBridge, installStorageBridge } from "./prd-api.js";

const authFont = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function AuthScreen({ api, onAuthed }) {
  const [mode, setMode] = useState("register");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = mode === "register"
        ? { username, displayName: displayName || username, password }
        : { username, password };
      const result = mode === "register" ? await api.register(payload) : await api.login(payload);
      onAuthed(result.user);
    } catch (err) {
      setError(err.message || "处理失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F1F5F9", backgroundImage: "radial-gradient(rgba(59,130,246,.18) 1px, transparent 1px)", backgroundSize: "24px 24px", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: "#0F172A", fontFamily: authFont }}>
      <form onSubmit={submit} style={{ width: 420, maxWidth: "100%", borderRadius: 24, background: "rgba(255,255,255,.86)", border: "1px solid #DCE6F2", boxShadow: "0 24px 80px rgba(15,23,42,.12)", padding: 28, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <CanvasLogoMark size={34} color="#3B82F6" />
          <div>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.15, fontWeight: 950 }}>需求画布</h1>
            <p style={{ margin: "5px 0 0", color: "#64748B", fontSize: 13, lineHeight: 1.5 }}>创建账号后即可新建设计单，同事登录后可公开浏览。</p>
          </div>
        </div>

        <div style={{ height: 40, display: "flex", alignItems: "center", gap: 4, padding: 4, borderRadius: 999, background: "#F8FAFC", border: "1px solid #DCE6F2", marginBottom: 18 }}>
          {[["register", "创建账号"], ["login", "登录"]].map(([key, label]) => (
            <button key={key} type="button" onClick={() => { setMode(key); setError(""); }}
              style={{ flex: 1, height: 30, border: "none", borderRadius: 999, background: mode === key ? "#EAF2FF" : "transparent", color: mode === key ? "#3B82F6" : "#64748B", fontFamily: authFont, fontSize: 13, fontWeight: 850, cursor: "pointer" }}>{label}</button>
          ))}
        </div>

        <label style={{ display: "block", color: "#334155", fontSize: 12.5, fontWeight: 850, marginBottom: 7 }}>账号</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus placeholder="例如 yuziyang" style={inputStyle} />

        {mode === "register" && (
          <>
            <label style={labelStyle}>显示名称</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="别人看到的名字" style={inputStyle} />
          </>
        )}

        <label style={labelStyle}>密码</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="至少 6 位" style={inputStyle} />

        {error && <div style={{ marginTop: 12, borderRadius: 12, background: "#FEF2F2", color: "#B91C1C", padding: "10px 12px", fontSize: 12.5, fontWeight: 750 }}>{error}</div>}

        <button disabled={busy} type="submit" style={{ marginTop: 18, width: "100%", height: 42, border: "none", borderRadius: 999, background: busy ? "#94A3B8" : "#3B82F6", color: "#fff", fontFamily: authFont, fontSize: 14, fontWeight: 900, cursor: busy ? "not-allowed" : "pointer", boxShadow: "0 12px 28px rgba(59,130,246,.22)" }}>
          {busy ? "处理中..." : mode === "register" ? "创建并进入" : "登录"}
        </button>
      </form>
    </div>
  );
}

const labelStyle = { display: "block", color: "#334155", fontSize: 12.5, fontWeight: 850, margin: "14px 0 7px" };
const inputStyle = { width: "100%", height: 42, borderRadius: 12, border: "1px solid #DCE6F2", background: "#fff", color: "#0F172A", outline: "none", padding: "0 12px", fontFamily: authFont, fontSize: 14, fontWeight: 650 };

function AppShell() {
  const api = useMemo(() => createPrdApi(), []);
  const [checked, setChecked] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let alive = true;
    api.me()
      .then((result) => {
        if (!alive) return;
        installStorageBridge(api);
        setUser(result.user || null);
        setApiAvailable(true);
      })
      .catch(() => {
        if (!alive) return;
        installLocalStorageBridge();
        setApiAvailable(false);
      })
      .finally(() => {
        if (alive) setChecked(true);
      });
    return () => { alive = false; };
  }, [api]);

  if (!checked) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F1F5F9", color: "#64748B", fontFamily: authFont, fontWeight: 800 }}>载入中...</div>;
  }

  if (!apiAvailable) {
    return <PRDCanvas />;
  }

  if (!user) {
    return <AuthScreen api={api} onAuthed={setUser} />;
  }

  return <PRDCanvas apiClient={api} currentUser={user} onLogout={async () => { await api.logout(); setUser(null); }} />;
}

export function mountPrdApp(element) {
  document.documentElement.lang = "zh-CN";
  document.body.style.margin = "0";
  document.body.style.minWidth = "320px";

  createRoot(element).render(
    <React.StrictMode>
      <AppShell />
    </React.StrictMode>,
  );
}
