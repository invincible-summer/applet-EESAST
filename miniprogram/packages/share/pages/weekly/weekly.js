const portalService = require("../../../../services/portal");
const fmt = require("../../../../utils/format");

Page({
  data: {
    loading: true,
    weeklies: []
  },

  onLoad() {
    this.load();
  },

  // 每次进入/回到页面都重新拉取，保证与 web 侧同库数据同步
  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return portalService
      .getWeekly()
      .then((data) => {
        const weeklies = ((data && data.weekly) || []).map((w) => ({
          id: w.id,
          title: w.title,
          url: normalizeUrl(w.url),
          date: fmt.formatDate(w.date),
          canOpenInApp: isWechatArticle(w.url)
        }));
        this.setData({ weeklies, loading: false });
      })
      .catch(() => this.setData({ loading: false }));
  },

  openWeekly(e) {
    const url = e.currentTarget.dataset.url;
    if (isWechatArticle(url)) {
      wx.navigateTo({
        url: `/packages/share/pages/webview/webview?url=${encodeURIComponent(normalizeUrl(url))}`
      });
      return;
    }
    this.copyUrl(e);
  },

  copyUrl(e) {
    wx.setClipboardData({
      data: e.currentTarget.dataset.url,
      success: () => wx.showToast({ title: "链接已复制，可在浏览器中阅读", icon: "none" })
    });
  }
});

function isWechatArticle(url) {
  return /^https?:\/\/mp\.weixin\.qq\.com\/s(?:[/?#]|$)/i.test(String(url || ""));
}

function normalizeUrl(url) {
  const value = String(url || "").trim();
  return isWechatArticle(value) ? value.replace(/^http:\/\//i, "https://") : value;
}
