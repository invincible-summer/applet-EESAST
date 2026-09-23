const contestService = require("../../../../services/contest");
const { request } = require("../../../../utils/request");
const auth = require("../../../../utils/auth");

const CODE_CHARS = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";

function randomCode(len) {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

Page({
  data: {
    loading: true,
    contestId: "",
    teamSwitch: true,
    view: "", // join / manage
    // 创建队伍
    createForm: { name: "", intro: "" },
    // 邀请码加入
    inviteCode: "",
    inviteTeam: null,
    // 队伍管理
    team: null,
    members: [],
    isLeader: false,
    stats: { codes: 0, rooms: 0, score: 0 },
    memberLimit: 0,
    editForm: { name: "", intro: "" },
    editing: false
  },

  onLoad(query) {
    this.setData({ contestId: query.contest });
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const user = auth.getUser();
    if (!user.isLoggedIn) {
      wx.showToast({ title: "请先登录", icon: "none" });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.userUuid = user.uuid;
    const contestId = this.data.contestId;
    Promise.all([
      contestService.getContestInfo(contestId),
      contestService.getTeam(user.uuid, contestId),
      request({ url: "/team/member_limit", method: "POST", data: { contest_id: contestId }, silent: true })
    ])
      .then(([info, teamData, limitRes]) => {
        const c = info.contest_by_pk || {};
        this.contestName = c.name || "";
        const teams = (teamData && teamData.contest_team_member) || [];
        const joined = teams.length > 0 && teams[0].contest_team;
        this.setData({
          loading: false,
          teamSwitch: !!c.team_switch,
          view: joined ? "manage" : "join",
          memberLimit: (limitRes && limitRes.limit) || 0
        });
        if (joined) this.loadTeam(joined.team_id);
      })
      .catch(() => this.setData({ loading: false }));
  },

  loadTeam(teamId) {
    this.teamId = teamId;
    Promise.all([contestService.getTeamInfo(teamId), contestService.getTeamStat(teamId)])
      .then(([info, stat]) => {
        const t = info.contest_team_by_pk;
        const members = (t.contest_team_members || []).map((m) => ({
          uuid: m.user.uuid,
          realname: m.user.realname || "未命名",
          studentNo: m.user.student_no || "",
          class: m.user.class || ""
        }));
        const st = stat.contest_team_by_pk || {};
        this.setData({
          team: {
            teamId: t.team_id,
            name: t.team_name,
            intro: t.team_intro || "",
            invitedCode: t.invited_code,
            leaderUuid: t.team_leader ? t.team_leader.uuid : ""
          },
          members,
          isLeader: t.team_leader && t.team_leader.uuid === this.userUuid,
          stats: {
            codes: (st.contest_team_codes_aggregate && st.contest_team_codes_aggregate.aggregate.count) || 0,
            rooms:
              (st.contest_team_rooms_aggregate && st.contest_team_rooms_aggregate.aggregate.count) || 0,
            score:
              (st.contest_team_rooms_aggregate &&
                st.contest_team_rooms_aggregate.aggregate.sum &&
                st.contest_team_rooms_aggregate.aggregate.sum.score) ||
              0
          },
          editForm: { name: t.team_name, intro: t.team_intro || "" }
        });
      })
      .catch(() => wx.showToast({ title: "队伍信息加载失败", icon: "none" }));
  },

  /* ---------- 创建队伍 ---------- */
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const target = e.currentTarget.dataset.form || "createForm";
    this.setData({ [`${target}.${field}`]: e.detail.value });
  },

  createTeam() {
    const { name, intro } = this.data.createForm;
    if (!name.trim()) {
      wx.showToast({ title: "请输入队伍名称", icon: "none" });
      return;
    }
    if (!this.data.teamSwitch) {
      wx.showToast({ title: "组队功能未开放", icon: "none" });
      return;
    }
    const code = randomCode(8);
    contestService
      .addTeam({
        team_name: name.trim(),
        team_intro: intro.trim(),
        team_leader_uuid: this.userUuid,
        invited_code: code,
        contest_id: this.data.contestId
      })
      .then((data) => {
        wx.showToast({ title: "创建成功", icon: "success" });
        const teamId = data.insert_contest_team_one.team_id;
        this.setData({ view: "manage" });
        this.loadTeam(teamId);
      })
      .catch(() => wx.showToast({ title: "创建失败，邀请码冲突请重试", icon: "none" }));
  },

  /* ---------- 邀请码加入 ---------- */
  onCodeInput(e) {
    this.setData({ inviteCode: e.detail.value.trim() });
  },

  lookupTeam() {
    const code = this.data.inviteCode;
    if (!code || code.length !== 8) {
      wx.showToast({ title: "请输入 8 位邀请码", icon: "none" });
      return;
    }
    const { gql } = require("../../../../utils/graphql");
    gql(
      `query GetTeamInfoByInvitedCode($invited_code: String!, $contest_id: uuid!) {
        contest_team(
          where: { invited_code: { _eq: $invited_code }, contest_id: { _eq: $contest_id } }
        ) {
          team_id
          team_name
          team_intro
          contest_team_members_aggregate { aggregate { count } }
          team_leader { realname }
        }
      }`,
      { invited_code: code, contest_id: this.data.contestId },
      { silent: true }
    )
      .then((data) => {
        const list = (data && data.contest_team) || [];
        if (!list.length) {
          wx.showToast({ title: "邀请码无效", icon: "none" });
          this.setData({ inviteTeam: null });
          return;
        }
        const t = list[0];
        this.setData({
          inviteTeam: {
            teamId: t.team_id,
            name: t.team_name,
            intro: t.team_intro || "",
            leader: (t.team_leader && t.team_leader.realname) || "",
            count:
              (t.contest_team_members_aggregate && t.contest_team_members_aggregate.aggregate.count) || 0
          }
        });
      })
      .catch(() => wx.showToast({ title: "查询失败", icon: "none" }));
  },

  joinTeam() {
    const t = this.data.inviteTeam;
    if (!t) return;
    request({
      url: "/team/add_team_member",
      method: "POST",
      data: { team_id: t.teamId, user_uuid: this.userUuid },
      silent: true
    })
      .then(() => {
        wx.showToast({ title: "加入成功", icon: "success" });
        this.setData({ view: "manage", inviteTeam: null, inviteCode: "" });
        this.loadTeam(t.teamId);
      })
      .catch((e) => {
        wx.showToast({
          title: e.statusCode === 551 ? "队伍成员已满" : e.message || "加入失败",
          icon: "none"
        });
      });
  },

  /* ---------- 队伍管理 ---------- */
  copyCode() {
    wx.setClipboardData({
      data: this.data.team.invitedCode,
      success: () => wx.showToast({ title: "邀请码已复制", icon: "none" })
    });
  },

  toggleEdit() {
    this.setData({ editing: !this.data.editing });
  },

  saveTeam() {
    const f = this.data.editForm;
    if (!f.name.trim()) {
      wx.showToast({ title: "队名不能为空", icon: "none" });
      return;
    }
    contestService
      .updateTeam({ team_id: this.teamId, team_name: f.name.trim(), team_intro: f.intro.trim() })
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        this.setData({ editing: false });
        this.loadTeam(this.teamId);
      })
      .catch(() => wx.showToast({ title: "保存失败", icon: "none" }));
  },

  removeMember(e) {
    const uuid = e.currentTarget.dataset.uuid;
    const name = e.currentTarget.dataset.name;
    if (!this.data.isLeader) {
      wx.showToast({ title: "仅队长可移除成员", icon: "none" });
      return;
    }
    if (uuid === this.userUuid) {
      wx.showToast({ title: "不能移除自己，请使用退出队伍", icon: "none" });
      return;
    }
    wx.showModal({
      title: "移除成员",
      content: `确定将 ${name} 移出队伍吗？`,
      success: (res) => {
        if (!res.confirm) return;
        contestService
          .deleteTeamMember(uuid, this.teamId)
          .then(() => {
            wx.showToast({ title: "已移除", icon: "none" });
            this.loadTeam(this.teamId);
          })
          .catch(() => wx.showToast({ title: "移除失败", icon: "none" }));
      }
    });
  },

  quitTeam() {
    wx.showModal({
      title: "退出队伍",
      content: "确定退出当前队伍吗？",
      success: (res) => {
        if (!res.confirm) return;
        contestService
          .deleteTeamMember(this.userUuid, this.teamId)
          .then(() => {
            wx.showToast({ title: "已退出", icon: "none" });
            this.setData({ view: "join", team: null });
          })
          .catch(() => wx.showToast({ title: "退出失败", icon: "none" }));
      }
    });
  },

  dissolveTeam() {
    if (!this.data.isLeader) {
      wx.showToast({ title: "仅队长可解散队伍", icon: "none" });
      return;
    }
    wx.showModal({
      title: "解散队伍",
      content: "解散后队伍数据将被删除且不可恢复，确定解散吗？",
      confirmColor: "#ef4444",
      success: (res) => {
        if (!res.confirm) return;
        contestService
          .deleteTeam(this.teamId)
          .then(() => {
            wx.showToast({ title: "已解散", icon: "none" });
            this.setData({ view: "join", team: null });
          })
          .catch(() => wx.showToast({ title: "解散失败", icon: "none" }));
      }
    });
  },

  goCode() {
    wx.redirectTo({
      url: `/packages/contest/pages/code/code?contest=${this.data.contestId}`
    });
  }
});
