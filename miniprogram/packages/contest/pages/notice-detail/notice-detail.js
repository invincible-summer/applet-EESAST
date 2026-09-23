const contestService = require("../../../../services/contest");
const cos = require("../../../../utils/cos");
const fmt = require("../../../../utils/format");

Page({
  data: {
    loading: true,
    notice: null,
    files: []
  },

  onLoad(query) {
    this.contestId = query.contest;
    this.id = query.id;
    this.load();
  },

  load() {
    // 先取赛事名（附件 STS 前缀 = "{赛事名}/notice/"）
    contestService
      .getContestInfo(this.contestId)
      .then((info) => {
        this.contestName = info.contest_by_pk ? info.contest_by_pk.name : "";
        return contestService.getContestNotices(this.contestId);
      })
      .then((data) => {
        const notice = ((data && data.contest_notice) || []).find((n) => n.id === this.id);
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
    const prefix = `${this.contestName}/notice/`;
    wx.showLoading({ title: "下载附件…" });
    cos
      .downloadAndOpen(prefix, key)
      .then(() => wx.hideLoading())
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: "附件下载失败", icon: "none" });
      });
  }
});
