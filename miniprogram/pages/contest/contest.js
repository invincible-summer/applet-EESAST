const contestService = require("../../services/contest");
const fmt = require("../../utils/format");

// 状态 → 卡片右下角标签配色：进行中绿 / 未开始琥珀 / 已结束灰
const STATUS_TAG = {
  ongoing: "tag-success",
  not_started: "tag-warning",
  finished: "tag-gray"
};

Page({
  data: {
    loading: true,
    contests: [],
    filteredContests: [],
    filter: "all" // all | ongoing | not_started | finished
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    return contestService
      .getContests()
      .then((data) => {
        const contests = (data && data.contest ? data.contest : []).map((c) => {
          const status = fmt.contestStatus(c.start_date, c.end_date);
          return {
            id: c.id,
            name: c.fullname,
            description: c.description || "",
            start: fmt.formatDate(c.start_date),
            end: fmt.formatDate(c.end_date),
            status,
            statusText: fmt.CONTEST_STATUS_TEXT[status],
            statusTag: STATUS_TAG[status]
          };
        });
        this.setData({
          contests,
          filteredContests: this.applyFilter(contests, this.data.filter),
          loading: false
        });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData(Object.assign({ filter }, { filteredContests: this.applyFilter(this.data.contests, filter) }));
  },

  applyFilter(list, filter) {
    if (!filter || filter === "all") return list;
    return list.filter((c) => c.status === filter);
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/packages/contest/pages/intro/intro?contest=${id}` });
  }
});
