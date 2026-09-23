const config = require("../../config/index");

Page({
  data: {
    entries: [
      { key: "course", icon: "📚", name: "课程评测", desc: "电子系课程信息与同学评价", login: true },
      { key: "weekly", icon: "📰", name: "SAST Weekly", desc: "科协每周技术推送", login: false },
      { key: "docs", icon: "📘", name: "EESAST Docs", desc: "赛事规则与技术文档", login: false },
      { key: "llm", icon: "🤖", name: "大模型对话", desc: "多模型 AI 助手（配额内免费）", login: true },
      { key: "contest-intro", icon: "🏆", name: "赛事一览", desc: "科协承办赛事介绍", login: false },
      { key: "minecraft", icon: "⛏️", name: "Minecraft", desc: "科协 Minecraft 服务器", login: false }
    ]
  },

  goLogin() {
    wx.switchTab({ url: "/pages/user/user" });
  },

  onTap(e) {
    const key = e.currentTarget.dataset.key;
    const auth = require("../../utils/auth");
    const needLogin = e.currentTarget.dataset.login;
    if (needLogin && !auth.isLoggedIn()) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    switch (key) {
      case "course":
        wx.navigateTo({ url: "/packages/share/pages/course/course" });
        break;
      case "weekly":
        wx.navigateTo({ url: "/packages/share/pages/weekly/weekly" });
        break;
      case "llm":
        wx.navigateTo({ url: "/packages/chat/pages/chat/chat" });
        break;
      case "docs":
        this.copy(config.WEB_URL.replace("eesast.com", "docs.eesast.com"));
        break;
      case "contest-intro":
      case "minecraft":
        this.copy(config.WEB_URL);
        break;
      default:
        break;
    }
  },

  copy(url) {
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: "链接已复制，请在浏览器打开", icon: "none" })
    });
  }
});
