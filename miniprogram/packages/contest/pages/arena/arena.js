const contestService = require("../../../../services/contest");
const auth = require("../../../../utils/auth");
const cos = require("../../../../utils/cos");
const fmt = require("../../../../utils/format");
const { createPoller } = require("../../../../utils/poll");

Page({
  data: {
    loading: true,
    contestId: "",
    contestName: "",
    rooms: [],
    myTeamId: "",
    onlyMine: false,
    keyword: ""
  },

  onLoad(query) {
    this.setData({ contestId: query.contest });
    this.poller = createPoller(() => this.load(true), 10000);
    const user = auth.getUser();
    this.userUuid = user.uuid;
    this.setData({ myTeamId: "" });
    contestService
      .getContestInfo(query.contest)
      .then((info) => {
        this.contestName = (info.contest_by_pk && info.contest_by_pk.name) || "";
        if (user.isLoggedIn) {
          contestService.getTeam(user.uuid, query.contest).then((t) => {
            const joined =
              (t && t.contest_team_member && t.contest_team_member[0] && t.contest_team_member[0].contest_team) ||
              null;
            this.setData({ myTeamId: joined ? joined.team_id : "" });
          });
        }
        this.load();
      })
      .catch(() => this.setData({ loading: false }));
  },

  onShow() {
    if (this.poller) this.poller.start(true);
  },

  onHide() {
    if (this.poller) this.poller.stop();
  },

  onUnload() {
    if (this.poller) this.poller.destroy();
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  load(silent) {
    if (!silent) this.setData({ loading: true });
    return contestService
      .getArenaRooms(this.data.contestId)
      .then((data) => {
        const rooms = ((data && data.contest_room) || []).map((r) => {
          const teams = (r.contest_room_teams || []).map((t) => ({
            teamId: t.contest_team.team_id,
            name: t.contest_team.team_name,
            leader: (t.contest_team.team_leader && t.contest_team.team_leader.realname) || "",
            score: t.score,
            label: t.team_label
          }));
          return {
            roomId: r.room_id,
            status: r.status,
            statusText: fmt.ROOM_STATUS_TEXT[r.status] || r.status,
            statusClass:
              r.status === "Running" ? "tag-success" : r.status === "Finished" ? "tag-gray" : "tag-warning",
            time: fmt.fromNow(r.created_at),
            teams
          };
        });
        this.allRooms = rooms;
        this.applyFilter();
      })
      .catch(() => this.setData({ loading: false }));
  },

  applyFilter() {
    const kw = (this.data.keyword || "").trim().toLowerCase();
    let rooms = this.allRooms || [];
    if (this.data.onlyMine && this.data.myTeamId) {
      rooms = rooms.filter((r) => r.teams.some((t) => t.teamId === this.data.myTeamId));
    }
    if (kw) {
      rooms = rooms.filter(
        (r) => r.teams.some((t) => t.name.toLowerCase().indexOf(kw) >= 0) || r.roomId.indexOf(kw) >= 0
      );
    }
    this.setData({ rooms, loading: false });
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value }, () => this.applyFilter());
  },

  toggleMine() {
    this.setData({ onlyMine: !this.data.onlyMine }, () => this.applyFilter());
  },

  watchLive() {
    wx.setClipboardData({
      data: "https://eesast.com",
      success: () =>
        wx.showToast({ title: "直播为 WebGL 功能，链接已复制请在电脑端观看", icon: "none" })
    });
  },

  downloadPlayback(e) {
    const roomId = e.currentTarget.dataset.room;
    const prefix = `${this.contestName}/arena/`;
    wx.showLoading({ title: "获取回放…" });
    cos
      .getSignedUrl(prefix, `${this.contestName}/arena/${roomId}.thuaipb`)
      .then((url) => {
        wx.hideLoading();
        wx.setClipboardData({
          data: url,
          success: () => wx.showToast({ title: "回放下载链接已复制", icon: "none" })
        });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: "回放不存在或无法获取", icon: "none" });
      });
  }
});
