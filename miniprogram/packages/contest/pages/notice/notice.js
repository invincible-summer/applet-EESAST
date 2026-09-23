const contestService = require("../../../../services/contest");
const fmt = require("../../../../utils/format");

Page({
  data: {
    loading: true,
    contestId: "",
    notices: []
  },

  onLoad(query) {
    this.setData({ contestId: query.contest });
    this.load(query.contest);
  },

  onPullDownRefresh() {
    this.load(this.data.contestId).then(() => wx.stopPullDownRefresh());
  },

  load(contestId) {
    this.setData({ loading: true });
    return contestService
      .getContestNotices(contestId)
      .then((data) => {
        const notices = ((data && data.contest_notice) || []).map((n) => ({
          id: n.id,
          title: n.title,
          updated: fmt.fromNow(n.updated_at),
          summary: (n.content || "").slice(0, 60)
        }));
        this.setData({ notices, loading: false });
      })
      .catch(() => this.setData({ loading: false }));
  },

  goDetail(e) {
    wx.navigateTo({
      url: `/packages/contest/pages/notice-detail/notice-detail?contest=${this.data.contestId}&id=${e.currentTarget.dataset.id}`
    });
  }
});
