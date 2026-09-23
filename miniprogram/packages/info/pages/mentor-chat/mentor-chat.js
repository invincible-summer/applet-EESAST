const portalService = require("../../../../services/portal");
const { request } = require("../../../../utils/request");
const auth = require("../../../../utils/auth");
const fmt = require("../../../../utils/format");
const { createPoller } = require("../../../../utils/poll");

const CURRENT_YEAR = new Date().getFullYear();

Page({
  data: {
    loading: true,
    access: "ok",
    view: "contacts", // contacts / chat
    contacts: [],
    activeChat: null, // {uuid, name}
    messages: [],
    input: "",
    sending: false,
    myUuid: ""
  },

  onLoad() {
    if (!auth.isTsinghua()) {
      this.setData({ access: "forbidden", loading: false });
      return;
    }
    const user = auth.getUser();
    this.setData({ myUuid: user.uuid });
    this.poller = createPoller(() => this.pollMessages(), 8000);
    this.loadContacts();
  },

  onShow() {
    // 聊天视图打开时恢复轮询
    if (this.poller && this.data.view === "chat") this.poller.start(false);
  },

  onHide() {
    if (this.poller) this.poller.stop();
  },

  onUnload() {
    if (this.poller) this.poller.destroy();
  },

  loadContacts() {
    portalService
      .getApprovedMentorApplications(auth.getUser().uuid, CURRENT_YEAR)
      .then((data) => {
        const list = ((data && data.mentor_application) || []).map((a) => {
          const peer = a.student && a.student.uuid === this.data.myUuid ? a.mentor : a.student;
          return {
            id: a.id,
            uuid: (peer && peer.uuid) || "",
            name: (peer && peer.realname) || "未知",
            role: a.student && a.student.uuid === this.data.myUuid ? "导师" : "学生"
          };
        });
        this.setData({ contacts: list, loading: false });
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: "配对信息加载失败", icon: "none" });
      });
  },

  openChat(e) {
    const uuid = e.currentTarget.dataset.uuid;
    const name = e.currentTarget.dataset.name;
    this.setData({ view: "chat", activeChat: { uuid, name }, messages: [] }, () => {
      this.poller.start(true);
    });
    wx.setNavigationBarTitle({ title: name });
  },

  backContacts() {
    this.poller.stop();
    this.setData({ view: "contacts", activeChat: null, messages: [] });
    wx.setNavigationBarTitle({ title: "导师交流" });
  },

  pollMessages() {
    if (!this.data.activeChat) return;
    portalService
      .getMentorMessages(this.data.myUuid, this.data.activeChat.uuid)
      .then((data) => {
        const messages = ((data && data.mentor_message) || []).map((m) => {
          let text = m.payload;
          try {
            text = JSON.parse(m.payload).text || m.payload;
          } catch (e) {
            /* 保留原文 */
          }
          return {
            id: m.id,
            from: m.from_uuid,
            mine: m.from_uuid === this.data.myUuid,
            text,
            time: fmt.formatDateTime(m.created_at)
          };
        });
        this.setData({ messages });
      })
      .catch(() => {});
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  send() {
    const text = (this.data.input || "").trim();
    if (!text || this.data.sending) return;
    this.setData({ sending: true });
    request({
      url: "/chat/send",
      method: "POST",
      data: {
        receiver_id: this.data.activeChat.uuid,
        content: JSON.stringify({ text })
      },
      silent: true
    })
      .then(() => {
        this.setData({ input: "" });
        this.pollMessages();
      })
      .catch(() => wx.showToast({ title: "发送失败", icon: "none" }))
      .then(() => this.setData({ sending: false }));
  }
});
