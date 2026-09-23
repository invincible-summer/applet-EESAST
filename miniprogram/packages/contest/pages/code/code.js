const contestService = require("../../../../services/contest");
const { request } = require("../../../../utils/request");
const auth = require("../../../../utils/auth");
const cos = require("../../../../utils/cos");
const fmt = require("../../../../utils/format");
const { createPoller } = require("../../../../utils/poll");

Page({
  data: {
    loading: true,
    contestId: "",
    contestName: "",
    contestType: "thuai", // thuai / soft / rl / none
    codeSwitch: true,
    teamId: "",
    // THUAI
    codes: [],
    players: [],
    roles: {},
    rolesAvailable: [],
    // SOFT / RL
    linkInput: "",
    finalInput: "",
    latestCode: null,
    latestFinal: null,
    deadline: null,
    rlSubmissions: [],
    ddlText: ""
  },

  onLoad(query) {
    this.setData({ contestId: query.contest });
    this.poller = createPoller(() => this.pollCompileStatus(), 5000);
    this.init(query.contest);
  },

  onShow() {
    if (this.poller) this.poller.start(false);
  },

  onHide() {
    if (this.poller) this.poller.stop();
  },

  onUnload() {
    if (this.poller) this.poller.destroy();
  },

  init(contestId) {
    const user = auth.getUser();
    if (!user.isLoggedIn) {
      wx.showToast({ title: "请先登录", icon: "none" });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.userUuid = user.uuid;
    contestService
      .getContestInfo(contestId)
      .then((info) => {
        const c = info.contest_by_pk;
        if (!c) throw new Error();
        const type = c.name.startsWith("SOFT")
          ? "soft"
          : c.name.startsWith("RL")
            ? "rl"
            : c.name.startsWith("HARD")
              ? "none"
              : "thuai";
        this.contestName = c.name;
        this.setData({
          loading: false,
          contestName: c.name,
          contestType: type,
          codeSwitch: !!c.code_upload_switch
        });
        if (type === "none") return;
        // 找到我的队伍
        contestService.getTeam(user.uuid, contestId).then((t) => {
          const joined = (t && t.contest_team_member && t.contest_team_member[0] && t.contest_team_member[0].contest_team) || null;
          if (!joined) {
            wx.showModal({
              title: "尚未组队",
              content: "提交代码前请先创建或加入队伍。",
              confirmText: "去组队",
              success: (res) => {
                if (res.confirm) {
                  wx.redirectTo({
                    url: `/packages/contest/pages/team/team?contest=${contestId}`
                  });
                } else {
                  wx.navigateBack();
                }
              }
            });
            return;
          }
          this.setData({ teamId: joined.team_id });
          if (type === "thuai") this.loadTHUAI(joined.team_id);
          if (type === "soft") this.loadSoft(joined.team_id, contestId);
          if (type === "rl") this.loadRL(joined.team_id, contestId);
        });
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: "加载失败", icon: "none" });
      });
  },

  /* ================= THUAI ================= */
  loadTHUAI(teamId) {
    this.refreshCodes(teamId);
    contestService.getContestPlayers(this.data.contestId).then((data) => {
      const players = ((data && data.contest_player) || []).map((p) => p.player_label);
      const rolesAvailable = [];
      ((data && data.contest_player) || []).forEach((p) => {
        const roles = (p.roles_available || "").split(/[,，、\s]+/).filter(Boolean);
        rolesAvailable.push({ player: p.player_label, roles });
      });
      contestService.getTeamPlayers(teamId).then((pd) => {
        const teamPlayers = (pd && pd.contest_team_player) || [];
        const roles = {};
        teamPlayers.forEach((tp) => {
          roles[tp.player] = tp.role || "";
        });
        this.setData({ players: teamPlayers.map((tp) => tp.player), rolesAvailable, roles });
      });
    });
  },

  refreshCodes(teamId) {
    contestService.getTeamCodes(teamId).then((data) => {
      const codes = ((data && data.contest_team_code) || []).map((c) => ({
        codeId: c.code_id,
        name: c.code_name,
        language: c.language,
        status: c.compile_status,
        statusText: fmt.COMPILE_STATUS_TEXT[c.compile_status] || c.compile_status,
        statusClass:
          c.compile_status === "Completed" || c.compile_status === "No Need"
            ? "tag-success"
            : c.compile_status === "Failed"
              ? "tag-danger"
              : "tag-warning"
      }));
      this.setData({ codes });
    });
  },

  pollCompileStatus() {
    if (this.data.contestType !== "thuai" || !this.data.teamId) return;
    // 存在编译中的代码时刷新
    const hasPending = this.data.codes.some(
      (c) => c.status === "Waiting" || c.status === "Compiling"
    );
    if (hasPending) this.refreshCodes(this.data.teamId);
  },

  uploadCode() {
    if (!this.data.codeSwitch) {
      wx.showToast({ title: "代码上传未开放", icon: "none" });
      return;
    }
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["cpp", "py"],
      success: (res) => {
        const file = res.tempFiles[0];
        const lang = file.name.split(".").pop();
        if (lang !== "cpp" && lang !== "py") {
          wx.showToast({ title: "仅支持 .cpp / .py 文件", icon: "none" });
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          wx.showToast({ title: "文件不能超过 10MB", icon: "none" });
          return;
        }
        wx.showLoading({ title: "上传中…" });
        contestService
          .addTeamCode({
            team_id: this.data.teamId,
            code_name: file.name,
            language: lang,
            compile_status: lang === "py" ? "No Need" : "Waiting"
          })
          .then((data) => {
            const codeId = data.insert_contest_team_code_one.code_id;
            const key = `${this.contestName}/code/${this.data.teamId}/${codeId}.${lang}`;
            return cos
              .putObject(`${this.contestName}/code/${this.data.teamId}/`, key, file.path)
              .then(() => {
                if (lang === "cpp") {
                  return request({
                    url: "/code/compile-start",
                    method: "POST",
                    data: { code_id: codeId },
                    silent: true
                  });
                }
              });
          })
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: "上传成功", icon: "success" });
            this.refreshCodes(this.data.teamId);
            this.poller.start(true);
          })
          .catch(() => {
            wx.hideLoading();
            wx.showToast({ title: "上传失败", icon: "none" });
          });
      }
    });
  },

  deleteCode(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: "删除代码",
      content: `确定删除「${name}」吗？`,
      confirmColor: "#ef4444",
      success: (res) => {
        if (!res.confirm) return;
        contestService
          .deleteTeamCode(id)
          .then(() => {
            wx.showToast({ title: "已删除", icon: "none" });
            this.refreshCodes(this.data.teamId);
          })
          .catch(() => wx.showToast({ title: "删除失败", icon: "none" }));
      }
    });
  },

  renameCode(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "重命名代码",
      editable: true,
      placeholderText: "新名称",
      success: (res) => {
        if (!res.confirm || !res.content || !res.content.trim()) return;
        contestService
          .updateTeamCodeName(id, res.content.trim())
          .then(() => {
            wx.showToast({ title: "已重命名", icon: "none" });
            this.refreshCodes(this.data.teamId);
          })
          .catch(() => wx.showToast({ title: "重命名失败", icon: "none" }));
      }
    });
  },

  downloadCode(e) {
    const { id, name, lang } = e.currentTarget.dataset;
    const key = `${this.contestName}/code/${this.data.teamId}/${id}.${lang}`;
    wx.showLoading({ title: "下载中…" });
    cos
      .downloadAndOpen(`${this.contestName}/code/${this.data.teamId}/`, key, name)
      .then(() => wx.hideLoading())
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: "下载失败", icon: "none" });
      });
  },

  onRoleChange(e) {
    const player = e.currentTarget.dataset.player;
    const roles = this.data.rolesAvailable.find((r) => r.player === player);
    if (!roles || !roles.roles.length) return;
    wx.showActionSheet({
      itemList: roles.roles.slice(0, 6),
      success: (res) => {
        const role = roles.roles[res.tapIndex];
        contestService
          .updateTeamPlayer({ team_id: this.data.teamId, player, role })
          .then(() => {
            this.setData({ [`roles.${player}`]: role });
            wx.showToast({ title: "已选择角色", icon: "none" });
          })
          .catch(() => wx.showToast({ title: "设置失败", icon: "none" }));
      }
    });
  },

  selectCodeForPlayer(e) {
    const player = e.currentTarget.dataset.player;
    const codes = this.data.codes.filter(
      (c) => c.status === "Completed" || c.status === "No Need"
    );
    if (!codes.length) {
      wx.showToast({ title: "暂无可选代码（需编译成功）", icon: "none" });
      return;
    }
    wx.showActionSheet({
      itemList: codes.slice(0, 6).map((c) => c.name),
      success: (res) => {
        const code = codes[res.tapIndex];
        contestService
          .updateTeamPlayer({ team_id: this.data.teamId, player, code_id: code.codeId })
          .then(() => wx.showToast({ title: `已为 ${player} 选定代码`, icon: "none" }))
          .catch(() => wx.showToast({ title: "选择失败", icon: "none" }));
      }
    });
  },

  /* ================= SOFT ================= */
  loadSoft(teamId, contestId) {
    request({
      url: "/competition/get_team_software_code_one",
      method: "POST",
      data: { team_id: teamId },
      silent: true
    }).then((res) => {
      this.setData({ latestCode: (res && res.data) || null });
    });
    request({
      url: "/competition/get_team_software_final_one",
      method: "POST",
      data: { team_id: teamId },
      silent: true
    }).then((res) => {
      this.setData({ latestFinal: (res && res.data) || null });
    });
    request({
      url: "/competition/get_software_contest_ddl",
      method: "POST",
      data: { contest_id: contestId },
      silent: true
    }).then((res) => {
      const ddl = res && res.data && res.data.deadline;
      this.setData({ ddlText: ddl ? `截止：${fmt.formatDateTime(ddl)}` : "未设置截止时间" });
    });
  },

  onLinkInput(e) {
    this.setData({ linkInput: e.detail.value });
  },
  onFinalInput(e) {
    this.setData({ finalInput: e.detail.value });
  },

  submitSoftCode() {
    const url = (this.data.linkInput || "").trim();
    if (!/^https?:\/\/.+/.test(url)) {
      wx.showToast({ title: "请输入有效的代码链接", icon: "none" });
      return;
    }
    if (!this.data.codeSwitch) {
      wx.showToast({ title: "代码提交未开放", icon: "none" });
      return;
    }
    const exists = this.data.latestCode;
    request({
      url: exists ? "/competition/update_team_software_code" : "/competition/add_team_software_code",
      method: "POST",
      data: exists
        ? { team_id: this.data.teamId, code_url: url }
        : { contest_id: this.data.contestId, team_id: this.data.teamId, code_url: url },
      silent: true
    })
      .then(() => {
        wx.showToast({ title: exists ? "代码已更新" : "代码已提交", icon: "success" });
        this.setData({ linkInput: "" });
        this.loadSoft(this.data.teamId, this.data.contestId);
      })
      .catch((e) => wx.showToast({ title: e.message || "提交失败", icon: "none" }));
  },

  submitFinalCode() {
    const url = (this.data.finalInput || "").trim();
    if (!/^https?:\/\/.+/.test(url)) {
      wx.showToast({ title: "请输入有效的终审代码链接", icon: "none" });
      return;
    }
    const exists = this.data.latestFinal;
    request({
      url: exists ? "/competition/update_team_software_final" : "/competition/add_team_software_final",
      method: "POST",
      data: exists
        ? { team_id: this.data.teamId, code_url: url }
        : { contest_id: this.data.contestId, team_id: this.data.teamId, code_url: url },
      silent: true
    })
      .then(() => {
        wx.showToast({ title: "终审代码已提交", icon: "success" });
        this.setData({ finalInput: "" });
        this.loadSoft(this.data.teamId, this.data.contestId);
      })
      .catch((e) => wx.showToast({ title: e.message || "提交失败", icon: "none" }));
  },

  /* ================= RL ================= */
  loadRL(teamId, contestId) {
    request({
      url: "/competition/get_team_RL_code_submissions",
      method: "POST",
      data: { team_id: teamId },
      silent: true
    }).then((res) => {
      const list = (res && res.data) || [];
      this.setData({
        rlSubmissions: list.map((item, idx) => ({
          idx: idx + 1,
          url: item.URL || item.code_url || item.url,
          time: fmt.formatDateTime(item.created_at || item.submitted_at)
        }))
      });
    });
    request({
      url: "/competition/get_software_contest_ddl",
      method: "POST",
      data: { contest_id: contestId },
      silent: true
    }).then((res) => {
      const ddl = res && res.data && res.data.deadline;
      this.setData({ ddlText: ddl ? `截止：${fmt.formatDateTime(ddl)}` : "未设置截止时间" });
    });
  },

  submitRLCode() {
    const url = (this.data.linkInput || "").trim();
    if (!/^https?:\/\/.+/.test(url)) {
      wx.showToast({ title: "请输入有效的代码/权重链接", icon: "none" });
      return;
    }
    if (!this.data.codeSwitch) {
      wx.showToast({ title: "代码提交未开放", icon: "none" });
      return;
    }
    request({
      url: "/competition/add_team_RL_code",
      method: "POST",
      data: { contest_id: this.data.contestId, team_id: this.data.teamId, code_url: url },
      silent: true
    })
      .then(() => {
        wx.showToast({ title: "提交成功", icon: "success" });
        this.setData({ linkInput: "" });
        this.loadRL(this.data.teamId, this.data.contestId);
      })
      .catch((e) => wx.showToast({ title: e.message || "提交失败", icon: "none" }));
  },

  copyUrl(e) {
    wx.setClipboardData({
      data: e.currentTarget.dataset.url,
      success: () => wx.showToast({ title: "链接已复制", icon: "none" })
    });
  }
});
