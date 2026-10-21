const homeData = require("../../data/home");

Page({
  data: {
    news: homeData.news,
    divisions: homeData.divisions,
    displayWall: homeData.displayWall,
    isLoggedIn: false
  },

  onShow() {
    const auth = require("../../utils/auth");
    this.setData({ isLoggedIn: auth.isLoggedIn() });
  },

  goContestList() {
    wx.switchTab({ url: "/pages/contest/contest" });
  },
  goContestDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/packages/contest/pages/intro/intro?contest=${id}`
    });
  },
  goNotices() {
    wx.switchTab({ url: "/pages/info/info" });
  },
  goCourse() {
    wx.navigateTo({ url: "/packages/share/pages/course/course" });
  },
  copyLink(e) {
    const url = e.currentTarget.dataset.url;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: "链接已复制", icon: "none" })
    });
  }
});
