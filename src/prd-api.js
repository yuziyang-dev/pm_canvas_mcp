export function createPrdApi() {
  let currentDesignId = null;

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    let body = options.body;
    if (body && typeof body === "object" && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const response = await fetch(path, {
      ...options,
      body,
      headers,
      credentials: "include",
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      const message = data?.error || `请求失败 ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  return {
    setCurrentDesignId(id) {
      currentDesignId = id || null;
    },
    getCurrentDesignId() {
      return currentDesignId;
    },
    async me() {
      return request("/api/me");
    },
    async register(payload) {
      return request("/api/auth/register", { method: "POST", body: payload });
    },
    async login(payload) {
      return request("/api/auth/login", { method: "POST", body: payload });
    },
    async logout() {
      return request("/api/auth/logout", { method: "POST", body: {} });
    },
    async listDesigns(scope = "mine") {
      return request(`/api/designs?scope=${encodeURIComponent(scope)}`);
    },
    async createDesign(doc) {
      const result = await request("/api/designs", { method: "POST", body: { doc } });
      currentDesignId = result?.design?.id || currentDesignId;
      return result;
    },
    async getDesign(id) {
      const result = await request(`/api/designs/${encodeURIComponent(id)}`);
      currentDesignId = result?.design?.id || id;
      return result;
    },
    async saveDesign(doc, id = currentDesignId) {
      if (!id) return null;
      return request(`/api/designs/${encodeURIComponent(id)}`, { method: "PUT", body: { doc } });
    },
    async deleteDesign(id) {
      if (!id) return null;
      const result = await request(`/api/designs/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (currentDesignId === id) currentDesignId = null;
      return result;
    },
    async listComments(id = currentDesignId) {
      if (!id) return { comments: [] };
      return request(`/api/designs/${encodeURIComponent(id)}/comments`);
    },
    async createComment(id = currentDesignId, payload) {
      if (!id) return null;
      return request(`/api/designs/${encodeURIComponent(id)}/comments`, { method: "POST", body: payload });
    },
    async uploadFile(payload) {
      return request("/api/files", {
        method: "POST",
        body: { ...payload, designId: payload.designId || currentDesignId },
      });
    },
    async exportMarkdown(id, markdown) {
      return request(`/api/designs/${encodeURIComponent(id)}/export-md`, { method: "POST", body: { markdown } });
    },
    async exportPackage(id = currentDesignId, doc) {
      if (!id) throw new Error("缺少设计单 ID");
      const response = await fetch(`/api/designs/${encodeURIComponent(id)}/export-package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc }),
        credentials: "include",
      });
      if (!response.ok) {
        let message = `导出失败 ${response.status}`;
        try {
          const data = await response.json();
          message = data?.error || message;
        } catch {}
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const encoded = disposition.match(/filename=\"?([^\";]+)\"?/i)?.[1] || "";
      let fileName = "prd-canvas-export.zip";
      if (encoded) {
        try { fileName = decodeURIComponent(encoded); } catch { fileName = encoded; }
      }
      return { blob, fileName };
    },
  };
}

export function installStorageBridge(api) {
  window.prdApi = api;
  window.storage = {
    async get() {
      const id = api.getCurrentDesignId();
      if (!id) return null;
      const result = await api.getDesign(id);
      return { value: JSON.stringify(result.doc) };
    },
    async set(_key, value) {
      const id = api.getCurrentDesignId();
      if (!id) return;
      let doc = null;
      try { doc = JSON.parse(value); } catch { return; }
      await api.saveDesign(doc, id);
    },
  };
}

export function installLocalStorageBridge() {
  window.prdApi = null;
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(key);
      return value == null ? null : { value };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
    },
  };
}
