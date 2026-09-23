const contestService = require("../../services/contest");
const fmt = require("../../utils/format");

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
        const contests = (data && data.contest ? data.contest : []).map((c) => ({
          id: c.id,
          name: c.fullname,
          description: c.description || "",
          start: fmt.formatDate(c.start_date),
          end: fmt.formatDate(c.end_date),
          status: fmt.contestStatus(c.start_date, c.end_date),
          statusText: fmt.CONTEST_STATUS_TEXT[fmt.contestStatus(c.start_date, c.end_date)]
        }));
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
