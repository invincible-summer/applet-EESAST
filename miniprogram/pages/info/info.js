const portalService = require("../../services/portal");
const auth = require("../../utils/auth");
const fmt = require("../../utils/format");
const bus = require("../../utils/bus");

const TYPES = ["奖助学金", "推研信息", "就业信息", "实习信息", "赛事信息"];

Page({
  data: {
    // 访问控制：ok / need_login / forbidden
    access: "need_login",
    types: TYPES,
    activeType: "奖助学金",
    notices: [],
    loading: true
  },

  onLoad() {
    this.offLogin = bus.on("auth:login", () => this.checkAccess());
    this.offLogout = bus.on("auth:logout", () => this.checkAccess());
    this.checkAccess();
  },

  onUnload() {
    if (this.offLogin) this.offLogin();
    if (this.offLogout) this.offLogout();
  },

  onShow() {
    if (this.data.access === "ok") this.checkAccess();
  },

  checkAccess() {
    const user = auth.getUser();
    if (!user.isLoggedIn) {
      this.setData({ access: "need_login" });
      return;
    }
    if (!auth.isTsinghua()) {
      this.setData({ access: "forbidden" });
      return;
    }
    this.setData({ access: "ok" }, () => this.loadNotices());
  },

  goLogin() {
    wx.switchTab({ url: "/pages/user/user" });
  },

  onPullDownRefresh() {
    if (this.data.access === "ok") {
      this.loadNotices().then(() => wx.stopPullDownRefresh());
    } else {
      wx.stopPullDownRefresh();
    }
  },

  loadNotices() {
    this.setData({ loading: true });
    return portalService
      .getNotices([this.data.activeType])
      .then((data) => {
        const notices = (data && data.info_notice ? data.info_notice : []).map((n) => ({
          id: n.id,
          title: n.title,
          type: n.notice_type,
          updated: fmt.fromNow(n.updated_at)
        }));
        this.setData({ notices, loading: false });
      })
      .catch(() => this.setData({ loading: false }));
  },

  setType(e) {
    this.setData({ activeType: e.currentTarget.dataset.type }, () => this.loadNotices());
  },

  goNoticeDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/notice-detail/notice-detail?type=${encodeURIComponent(this.data.activeType)}&id=${id}`
    });
  },

  goMentor() {
    wx.navigateTo({ url: "/packages/info/pages/mentor/mentor" });
  },
  goHonor() {
    wx.navigateTo({ url: "/packages/info/pages/honor/honor" });
  },
  goMentorChat() {
    wx.navigateTo({ url: "/packages/info/pages/mentor-chat/mentor-chat" });
  }
});
