const contestService = require("../../../../services/contest");

Page({
  data: {
    loading: true,
    contestId: "",
    mode: "arena", // arena（天梯榜）| rl（RL 榜）
    teams: []
  },

  onLoad(query) {
    this.setData({ contestId: query.contest });
    contestService
      .getContestInfo(query.contest)
      .then((info) => {
        const name = (info.contest_by_pk && info.contest_by_pk.name) || "";
        this.setData({ mode: name.startsWith("RL") ? "rl" : "arena" }, () => this.load());
      })
      .catch(() => this.setData({ loading: false }));
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    const contestId = this.data.contestId;
    const fetcher =
      this.data.mode === "rl"
        ? contestService.getRLScores(contestId).then((data) =>
            ((data && data.contest_team_RL_score) || []).map((r, idx) => ({
              rank: idx + 1,
              teamId: r.team_id,
              name: r.contest_team.team_name,
              leader: (r.contest_team.team_leader && r.contest_team.team_leader.realname) || "",
              members: (r.contest_team.contest_team_members || [])
                .map((m) => (m.user && m.user.realname) || "")
                .filter(Boolean)
                .join("、"),
              score: r.score
            }))
          )
        : contestService.getTeams(contestId).then((data) =>
            ((data && data.contest_team) || []).map((t, idx) => ({
              rank: idx + 1,
              teamId: t.team_id,
              name: t.team_name,
              leader: (t.team_leader && t.team_leader.realname) || "",
              members: (t.contest_team_members || [])
                .map((m) => (m.user && m.user.realname) || "")
                .filter(Boolean)
                .join("、"),
              score:
                (t.contest_team_rooms_aggregate &&
                  t.contest_team_rooms_aggregate.aggregate.sum &&
                  t.contest_team_rooms_aggregate.aggregate.sum.score) ||
                0,
              rooms:
                (t.contest_team_rooms_aggregate && t.contest_team_rooms_aggregate.aggregate.count) || 0
            }))
          );

    return fetcher
      .then((teams) => this.setData({ teams, loading: false }))
      .catch(() => this.setData({ loading: false }));
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode }, () => this.load());
  }
});
