const { isAllowedWebViewUrl } = require("../../../../utils/external-link");

Page({
  data: {
    url: "",
    failed: false
  },

  onLoad(query) {
    let url = "";
    try {
      url = decodeURIComponent(query.url || "");
    } catch (e) {
      url = "";
    }
    if (!isAllowedWebViewUrl(url)) {
      this.setData({ failed: true });
      return;
    }
    this.setData({ url });
  },

  onError() {
    this.setData({ failed: true });
  },

  copyLink() {
    wx.setClipboardData({
      data: this.data.url,
      success: () => wx.showToast({ title: "链接已复制", icon: "none" })
    });
  }
});

