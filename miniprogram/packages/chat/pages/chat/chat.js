const config = require("../../../../config/index");
const portalService = require("../../../../services/portal");
const { request } = require("../../../../utils/request");
const auth = require("../../../../utils/auth");
const { sseRequest } = require("../../../../utils/sse");

const STORAGE_PREFIX = "llm_sessions_";

Page({
  data: {
    models: [],
    modelIndex: 0,
    deepThinking: false,
    sessions: [],
    activeSessionId: "",
    messages: [],
    input: "",
    streaming: false,
    quota: null,
    quotaPercent: 0,
    // 会话抽屉
    drawerOpen: false,
    thinkingExpanded: {}
  },

  onLoad() {
    const user = auth.getUser();
    if (!user.isLoggedIn) {
      wx.showToast({ title: "请先登录", icon: "none" });
      setTimeout(() => wx.switchTab({ url: "/pages/user/user" }), 800);
      return;
    }
    this.llmToken = this.b64(user.uuid);
    this.storageKey = STORAGE_PREFIX + user.uuid;
    this.loadModels();
    this.loadSessions();
    this.fetchStatus();
  },

  onUnload() {
    if (this.task) this.task.abort();
  },

  onHide() {
    this.saveSessions();
  },

  b64(str) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    const bytes = [];
    for (let j = 0; j < str.length; j++) {
      let c = str.charCodeAt(j);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    for (let i = 0; i < bytes.length; i += 3) {
      const b1 = bytes[i];
      const b2 = bytes[i + 1];
      const b3 = bytes[i + 2];
      out += chars[b1 >> 2];
      out += chars[((b1 & 3) << 4) | ((b2 || 0) >> 4)];
      out += b2 !== undefined ? chars[((b2 & 15) << 2) | ((b3 || 0) >> 6)] : "=";
      out += b3 !== undefined ? chars[b3 & 63] : "=";
    }
    return out;
  },

  loadModels() {
    portalService
      .getLLMList()
      .then((data) => {
        const models = ((data && data.llm_list) || []).map((m) => ({
          name: m.name,
          value: m.value,
          deep: m.deepthinkingmodel
        }));
        this.setData({ models, modelIndex: 0 });
      })
      .catch(() => {});
  },

  loadSessions() {
    try {
      const sessions = wx.getStorageSync(this.storageKey) || [];
      if (sessions.length) {
        this.setData({ sessions, activeSessionId: sessions[0].id, messages: sessions[0].messages });
        return;
      }
    } catch (e) {
      /* ignore */
    }
    this.newSession();
  },

  saveSessions() {
    try {
      wx.setStorageSync(this.storageKey, this.data.sessions);
    } catch (e) {
      /* ignore */
    }
  },

  currentSession() {
    return this.data.sessions.find((s) => s.id === this.data.activeSessionId);
  },

  newSession() {
    const session = {
      id: `s_${Date.now()}`,
      title: "新对话",
      messages: [],
      model: this.data.models.length ? this.data.models[this.data.modelIndex].value : "",
      createdAt: Date.now()
    };
    const sessions = [session].concat(this.data.sessions);
    this.setData({ sessions, activeSessionId: session.id, messages: [] });
    this.saveSessions();
  },

  switchSession(e) {
    if (this.data.streaming) return;
    const id = e.currentTarget.dataset.id;
    const session = this.data.sessions.find((s) => s.id === id);
    if (!session) return;
    const idx = this.data.models.findIndex((m) => m.value === session.model);
    this.setData({
      activeSessionId: id,
      messages: session.messages,
      modelIndex: idx >= 0 ? idx : 0,
      drawerOpen: false
    });
  },

  deleteSession(e) {
    const id = e.currentTarget.dataset.id;
    let sessions = this.data.sessions.filter((s) => s.id !== id);
    if (!sessions.length) {
      this.setData({ sessions: [] });
      this.newSession();
      return;
    }
    const active = this.data.activeSessionId === id ? sessions[0] : null;
    this.setData(
      active
        ? { sessions, activeSessionId: active.id, messages: active.messages }
        : { sessions }
    );
    this.saveSessions();
  },

  toggleDrawer() {
    this.setData({ drawerOpen: !this.data.drawerOpen });
  },

  onModelChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ modelIndex: idx });
    const session = this.currentSession();
    if (session) {
      const sessions = this.data.sessions.map((s) =>
        s.id === session.id ? { ...s, model: this.data.models[idx].value } : s
      );
      this.setData({ sessions });
      this.saveSessions();
    }
  },

  toggleDeep() {
    this.setData({ deepThinking: !this.data.deepThinking });
  },

  fetchStatus() {
    request({
      url: "/llm/status",
      method: "POST",
      data: {},
      header: { Authorization: `Bearer ${this.llmToken}` },
      silent: true
    })
      .then((res) => {
        const quota = (res && res.quota) || {};
        const used = quota.totalTokensUsed || 0;
        const limit = quota.tokenLimit || 0;
        this.setData({
          quota: { used, limit },
          quotaPercent: limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
        });
      })
      .catch(() => {});
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  toggleThinking(e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({ [`thinkingExpanded.${idx}`]: !this.data.thinkingExpanded[idx] });
  },

  send() {
    const text = (this.data.input || "").trim();
    if (!text || this.data.streaming) return;
    if (!this.data.models.length) {
      wx.showToast({ title: "模型加载中，请稍候", icon: "none" });
      return;
    }
    const userMsg = { role: "user", content: text };
    const messages = this.data.messages.concat([userMsg]);
    const assistantIdx = messages.length;
    messages.push({ role: "assistant", content: "", reasoning: "" });

    // 会话标题取首条消息
    const session = this.currentSession();
    const sessions = this.data.sessions.map((s) =>
      s === session
        ? {
            ...s,
            title: s.messages.length === 0 ? text.slice(0, 12) : s.title,
            model: this.data.models[this.data.modelIndex].value
          }
        : s
    );
    this.setData({ messages, sessions, input: "", streaming: true });

    // 深度思考模型切换（与 web 逻辑一致）
    const modelCfg = this.data.models[this.data.modelIndex];
    let modelToUse = modelCfg.value;
    if (this.data.deepThinking && modelCfg.deep && modelCfg.deep !== "enabled") {
      modelToUse = modelCfg.deep;
    }

    let content = "";
    let reasoning = "";
    this.task = sseRequest({
      url: `${config.API_BASE}/llm/chat`,
      data: { messages: messages.slice(0, -1), model: modelToUse },
      token: this.llmToken,
      onData: (parsed) => {
        if (parsed && typeof parsed === "object") {
          if (parsed.content) content += parsed.content;
          if (parsed.reasoning) reasoning += parsed.reasoning;
          this.setData({
            [`messages[${assistantIdx}].content`]: content,
            [`messages[${assistantIdx}].reasoning`]: reasoning
          });
        }
      },
      onDone: () => this.finishStream(assistantIdx, content, reasoning),
      onError: (e) => {
        const msg =
          e.statusCode === 401
            ? "登录状态失效，请重新进入"
            : e.statusCode === 402
              ? "Token 配额已用尽"
              : e.statusCode === 403
                ? "当前账号没有 LLM 使用权限"
                : e.statusCode === 429
                  ? "请求过于频繁，请稍候"
                  : e.message || "请求失败";
        if (!content) {
          content = `（${msg}）`;
        }
        this.finishStream(assistantIdx, content, reasoning);
      }
    });
  },

  finishStream(assistantIdx, content, reasoning) {
    const messages = this.data.messages.map((m, i) =>
      i === assistantIdx ? { role: "assistant", content, reasoning } : m
    );
    const sessions = this.data.sessions.map((s) =>
      s.id === this.data.activeSessionId ? { ...s, messages } : s
    );
    this.setData({ messages, sessions, streaming: false });
    this.task = null;
    this.saveSessions();
    this.fetchStatus();
  },

  stop() {
    if (this.task) this.task.abort();
  }
});
