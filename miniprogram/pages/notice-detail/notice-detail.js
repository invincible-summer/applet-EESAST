const portalService = require("../../services/portal");
const auth = require("../../utils/auth");
const cos = require("../../utils/cos");
const fmt = require("../../utils/format");

Page({
  data: {
    loading: true,
    notice: null,
    files: []
  },

  onLoad(query) {
    this.type = decodeURIComponent(query.type || "奖助学金");
    this.id = query.id;
    this.load();
  },

  load() {
    if (!auth.isTsinghua()) {
      wx.showToast({ title: "需要清华身份", icon: "none" });
      this.setData({ loading: false });
      return;
    }
    portalService
      .getNotices([this.type])
      .then((data) => {
        const list = (data && data.info_notice) || [];
        const notice = list.find((n) => n.id === this.id);
        if (!notice) throw new Error("公告不存在");
        let files = [];
        if (notice.files) {
          try {
            files = JSON.parse(notice.files).map((f) => ({
              name: f.split("/").pop(),
              key: f
            }));
          } catch (e) {
            files = [];
          }
        }
        this.setData({
          loading: false,
          notice: {
            title: notice.title,
            type: notice.notice_type,
            content: notice.content || "",
            updated: fmt.formatDateTime(notice.updated_at)
          },
          files
        });
        wx.setNavigationBarTitle({ title: notice.title || "公告详情" });
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: "公告加载失败", icon: "none" });
      });
  },

  downloadFile(e) {
    const key = e.currentTarget.dataset.key;
    // 门户公告附件统一存于 COS upload/ 前缀（登录用户只读）
    wx.showLoading({ title: "获取下载链接…" });
    cos
      .getSignedUrl("upload/", key)
      .then((url) => {
        wx.hideLoading();
        wx.setClipboardData({
          data: url,
          success: () => wx.showToast({ title: "下载链接已复制", icon: "none" })
        });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: "无法获取该附件", icon: "none" });
      });
  }
});
