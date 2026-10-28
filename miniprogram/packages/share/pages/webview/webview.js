const WECHAT_ARTICLE_RE = /^https:\/\/mp\.weixin\.qq\.com\/s(?:[/?#]|$)/i;

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
    if (!WECHAT_ARTICLE_RE.test(url)) {
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

