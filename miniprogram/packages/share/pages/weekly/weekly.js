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
          url: w.url,
          date: fmt.formatDate(w.date)
        }));
        this.setData({ weeklies, loading: false });
      })
      .catch(() => this.setData({ loading: false }));
  },

  copyUrl(e) {
    wx.setClipboardData({
      data: e.currentTarget.dataset.url,
      success: () => wx.showToast({ title: "链接已复制，可在浏览器中阅读", icon: "none" })
    });
  }
});
