const portalService = require("../../../../services/portal");
const fmt = require("../../../../utils/format");

Page({
  data: {
    loading: true,
    weeklies: []
  },

  onLoad() {
    portalService
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
