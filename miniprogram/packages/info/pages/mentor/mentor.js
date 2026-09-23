const { request } = require("../../../../utils/request");
const auth = require("../../../../utils/auth");
const cos = require("../../../../utils/cos");
const fmt = require("../../../../utils/format");

const PERIOD_NAMES = {
  A: { name: "导师信息更新", desc: "导师更新个人信息" },
  B: { name: "了解导师", desc: "学生浏览导师信息" },
  C: { name: "自由申请", desc: "自由申请与匹配" },
  D: { name: "补选阶段", desc: "未匹配同学补选" },
  E: { name: "随机分配", desc: "系统随机分配" }
};

Page({
  data: {
    loading: true,
    access: "ok", // ok / forbidden
    tab: "apply", // apply 申请 / mentors 导师列表 / talk 谈话记录
    schedule: [],
    scheduleRaw: null,
    applications: [],
    mentors: [],
    isFreshman: false,
    // 申请弹层
    applying: false,
    applyMentor: null,
    applyStmt: "",
    applyIsMember: false,
    applyIsMemberChoice: true,
    curApplication: null,
    // 谈话记录
    talk: { currentSemester: null, records: [] },
    memberChat: { currentSemester: null, records: [] }
  },

  onLoad() {
    const user = auth.getUser();
    if (!auth.isTsinghua()) {
      this.setData({ access: "forbidden", loading: false });
      return;
    }
    this.userUuid = user.uuid;
    this.loadAll();
  },

  loadAll() {
    Promise.all([
      request({ url: "/application/info/mentor/schedule", silent: true }),
      request({ url: "/application/info/mentor/applications", silent: true }),
      request({ url: "/application/info/mentor/mentor_list", silent: true }),
      request({ url: "/application/info/mentor/my_talk_records", silent: true }),
      request({ url: "/application/info/mentor/my_member_chats", silent: true })
    ])
      .then(([schedule, applications, mentors, talk, memberChat]) => {
        const scheduleList = Object.keys(PERIOD_NAMES).map((k) => {
          const period = (schedule && schedule[k]) || {};
          return {
            key: k,
            name: PERIOD_NAMES[k].name,
            desc: PERIOD_NAMES[k].desc,
            beg: period.beg ? fmt.formatDateTime(period.beg) : "未设定",
            end: period.end ? fmt.formatDateTime(period.end) : "未设定"
          };
        });
        const apps = (Array.isArray(applications) ? applications : []).map((a) => ({
          id: a.id,
          mentorName: a.men ? a.men.name : "未知导师",
          mentorDept: a.men ? a.men.dept : "",
          stmt: a.stmt,
          status: a.status,
          statusText: fmt.MENTOR_STATUS_TEXT[a.status] || a.status,
          isMem: a.is_mem
        }));
        const mentorList = (Array.isArray(mentors) ? mentors : []).map((m) => ({
          uuid: m.uuid,
          name: m.name,
          dept: m.dept,
          mail: m.mail,
          intr: m.intr,
          bgnd: m.bgnd,
          flds: m.flds,
          achv: m.achv,
          avail: m.avail,
          isMem: m.is_mem,
          totApl: m.tot_apl,
          matApl: m.mat_apl,
          maxApl: m.max_apl
        }));
        this.setData({
          loading: false,
          access: "ok",
          schedule: scheduleList,
          applications: apps,
          mentors: mentorList,
          talk: {
            currentSemester: (talk && talk.current_semester) || null,
            records: ((talk && talk.records) || []).map((r) => ({
              id: r.id,
              semester: r.semester,
              updated: fmt.formatDateTime(r.updated_at),
              confirmed: r.mentor_talk_confirm
            }))
          },
          memberChat: {
            currentSemester: (memberChat && memberChat.current_semester) || null,
            records: ((memberChat && memberChat.records) || []).map((r) => ({
              id: r.id,
              semester: r.semester,
              updated: fmt.formatDateTime(r.updated_at),
              confirmed: r.member_chat_confirm
            }))
          }
        });
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: "信息加载失败", icon: "none" });
      });
  },

  setTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  /* ---------- 申请 ---------- */
  openApply(e) {
    const uuid = e.currentTarget.dataset.uuid;
    const mentor = this.data.mentors.find((m) => m.uuid === uuid);
    const cur = this.data.applications.find((a) => a.mentorName === mentor.name);
    this.setData({
      applying: true,
      applyMentor: mentor,
      applyStmt: cur ? cur.stmt : "",
      applyIsMemberChoice: !!mentor.isMem,
      applyIsMember: false,
      curApplication: cur || null
    });
  },

  closeApply() {
    this.setData({ applying: false, applyMentor: null });
  },

  onStmtInput(e) {
    this.setData({ applyStmt: e.detail.value });
  },

  onMemberToggle(e) {
    this.setData({ applyIsMember: e.detail.value });
  },

  submitApply() {
    const { applyMentor, applyStmt, curApplication } = this.data;
    if (!applyStmt.trim()) {
      wx.showToast({ title: "申请陈述不能为空", icon: "none" });
      return;
    }
    const isNew = !curApplication;
    request({
      url: "/application/info/mentor/application",
      method: isNew ? "PUT" : "POST",
      data: isNew
        ? {
            mentor_uuid: applyMentor.uuid,
            statement: applyStmt.trim(),
            is_member: this.data.applyIsMember
          }
        : { id: curApplication.id, statement: applyStmt.trim() },
      silent: true
    })
      .then(() => {
        wx.showToast({ title: isNew ? "申请已提交" : "申请已更新", icon: "success" });
        this.closeApply();
        this.loadAll();
      })
      .catch((e) => wx.showToast({ title: e.message || "提交失败", icon: "none" }));
  },

  deleteApply(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "撤销申请",
      content: "确定撤销该导师申请吗？",
      confirmColor: "#ef4444",
      success: (res) => {
        if (!res.confirm) return;
        request({
          url: "/application/info/mentor/delete",
          method: "POST",
          data: { id },
          silent: true
        })
          .then(() => {
            wx.showToast({ title: "已撤销", icon: "none" });
            this.loadAll();
          })
          .catch(() => wx.showToast({ title: "撤销失败", icon: "none" }));
      }
    });
  },

  /* ---------- 谈话记录 ---------- */
  uploadRecord(e) {
    const kind = e.currentTarget.dataset.kind; // talk / member
    const semester =
      kind === "talk" ? this.data.talk.currentSemester : this.data.memberChat.currentSemester;
    if (!semester) {
      wx.showToast({ title: "当前无有效学期", icon: "none" });
      return;
    }
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      success: (res) => {
        const file = res.tempFiles[0];
        const key = `chat_record/${this.userUuid}/${kind}/${semester}/${file.name}`;
        wx.showLoading({ title: "上传中…" });
        cos
          .putObject(`chat_record/${this.userUuid}/${kind}/${semester}/`, key, file.path)
          .then(() =>
            request({
              url: `/application/info/mentor/${kind === "talk" ? "talk_submit" : "member_chat_submit"}`,
              method: "POST",
              data: {},
              silent: true
            })
          )
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: "上传成功", icon: "success" });
            this.loadAll();
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: err.message || "上传失败", icon: "none" });
          });
      }
    });
  },

  downloadRecord(e) {
    const { kind, semester, id } = e.currentTarget.dataset;
    const prefix = `chat_record/${this.userUuid}/${kind}/${semester || ""}/`;
    wx.showLoading({ title: "查找文件…" });
    cos
      .listObjects(prefix, prefix)
      .then((files) => {
        wx.hideLoading();
        if (!files || !files.length) {
          wx.showToast({ title: "暂无文件", icon: "none" });
          return;
        }
        const latest = files.reduce((max, f) =>
          new Date(f.LastModified) > new Date(max.LastModified) ? f : max
        );
        return cos.downloadAndOpen(prefix, latest.Key);
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: "下载失败", icon: "none" });
      });
  },

  goChat() {
    wx.navigateTo({ url: "/packages/info/pages/mentor-chat/mentor-chat" });
  }
});
