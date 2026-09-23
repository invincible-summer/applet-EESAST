const contestService = require("../../../../services/contest");
const { request } = require("../../../../utils/request");
const auth = require("../../../../utils/auth");
const fmt = require("../../../../utils/format");

Page({
  data: {
    loading: true,
    contestId: "",
    contest: null,
    statusText: "",
    teamCount: 0,
    memberCount: 0,
    memberLimit: 0,
    times: [],
    isAdmin: false,
    docsUrl: ""
  },

  onLoad(query) {
    const contestId = query.contest;
    this.setData({ contestId });
    this.load(contestId);
  },

  load(contestId) {
    const user = auth.getUser();
    Promise.all([
      contestService.getContestInfo(contestId),
      contestService.getContestTimes(contestId),
      contestService.getTotalTeamNum(contestId),
      contestService.getTotalMemberNum(contestId),
      request({ url: "/team/member_limit", method: "POST", data: { contest_id: contestId }, silent: true })
    ])
      .then(([info, times, teamNum, memberNum, limitRes]) => {
        const c = info && info.contest_by_pk;
        if (!c) throw new Error("赛事不存在");
        const status = fmt.contestStatus(c.start_date, c.end_date);
        const isAdmin =
          user.isLoggedIn &&
          ((c.contest_managers || []).some((m) => m.user_uuid === user.uuid) ||
            user.role === "counselor" ||
            user.role === "admin");
        this.setData({
          loading: false,
          contest: {
            fullname: c.fullname,
            name: c.name,
            description: c.description || "",
            start: fmt.formatDateTime(c.start_date),
            end: fmt.formatDateTime(c.end_date),
            status,
            teamSwitch: c.team_switch,
            codeSwitch: c.code_upload_switch,
            arenaSwitch: c.arena_switch
          },
          statusText: fmt.CONTEST_STATUS_TEXT[status],
          times: ((times && times.contest_time) || []).map((t) => ({
            id: t.id,
            event: t.event,
            time: fmt.formatDateTime(t.time)
          })),
          teamCount: teamNum.contest_team_aggregate.aggregate.count,
          memberCount: memberNum.contest_team_member_aggregate.aggregate.count,
          memberLimit: (limitRes && limitRes.limit) || 0,
          isAdmin,
          docsUrl: `https://docs.eesast.com/docs/contests/${c.name}`
        });
        wx.setNavigationBarTitle({ title: c.fullname || "赛事详情" });
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: "赛事加载失败", icon: "none" });
      });
  },

  copyDocs() {
    wx.setClipboardData({
      data: this.data.docsUrl,
      success: () => wx.showToast({ title: "文档链接已复制", icon: "none" })
    });
  },

  goNotice() {
    wx.navigateTo({ url: `/packages/contest/pages/notice/notice?contest=${this.data.contestId}` });
  },
  goTeam() {
    if (!this.requireLogin()) return;
    wx.navigateTo({ url: `/packages/contest/pages/team/team?contest=${this.data.contestId}` });
  },
  goCode() {
    if (!this.requireLogin()) return;
    wx.navigateTo({ url: `/packages/contest/pages/code/code?contest=${this.data.contestId}` });
  },
  goScore() {
    wx.navigateTo({ url: `/packages/contest/pages/score/score?contest=${this.data.contestId}` });
  },
  goArena() {
    if (!this.requireLogin()) return;
    wx.navigateTo({ url: `/packages/contest/pages/arena/arena?contest=${this.data.contestId}` });
  },

  requireLogin() {
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return false;
    }
    return true;
  }
});
