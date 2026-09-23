const { request } = require("../../../../utils/request");
const portalService = require("../../../../services/portal");
const auth = require("../../../../utils/auth");
const cos = require("../../../../utils/cos");
const fmt = require("../../../../utils/format");

const HONORS_NEED_TRANSCRIPT = ["学业优秀奖", "综合优秀奖", "学习进步奖"];
const HONORS_WITHOUT_MATERIAL_LINK = ["学业优秀奖", "综合优秀奖", "学习进步奖", "好读书奖"];
const GLOBAL_COMPETENCE_HONOR = "全球胜任力优秀奖";
const MAX_SIZE = 20 * 1024 * 1024;

Page({
  data: {
    loading: true,
    access: "ok",
    year: new Date().getFullYear(),
    types: [],
    timeText: "",
    phase: "closed", // open-a / open-b / closed
    applications: [],
    // 表单
    formVisible: false,
    editing: null,
    honorOptions: [],
    honorIndex: -1,
    form: { honor: "", statement: "", attachment_url: "", application_form_url: "", transcript_url: "" },
    needTranscript: false,
    needApplicationForm: false,
    needMaterialLink: true,
    submitting: false
  },

  onLoad() {
    const user = auth.getUser();
    if (!auth.isTsinghua() || user.role !== "student") {
      this.setData({ access: "forbidden", loading: false });
      return;
    }
    this.userUuid = user.uuid;
    this.load();
  },

  load() {
    Promise.all([
      request({ url: "/application/info/honor", silent: true }),
      portalService.getHonorApplications(this.userUuid, this.data.year)
    ])
      .then(([info, appsData]) => {
        const types = (info && info.types) || [];
        const time = (info && info.time) || {};
        const now = Date.now();
        let phase = "closed";
        if (time.start_A && time.end_A) {
          const s = new Date(time.start_A).getTime();
          const e = new Date(time.end_A).getTime();
          if (now >= s && now <= e) phase = "open-a";
        }
        if (phase === "closed" && time.start_B && time.end_B) {
          const s = new Date(time.start_B).getTime();
          const e = new Date(time.end_B).getTime();
          if (now >= s && now <= e) phase = "open-b";
        }
        const timeText =
          time.start_A && time.end_A
            ? `${fmt.formatDateTime(time.start_A)} 起 · 阶段一\n${fmt.formatDateTime(time.start_B) || "—"} 起 · 阶段二（补交）`
            : "本年度时间未公布";
        const applications = ((appsData && appsData.honor_application) || []).map((a) => ({
          id: a.id,
          honor: a.honor,
          statement: a.statement,
          attachmentUrl: a.attachment_url,
          applicationFormUrl: a.application_form_url,
          transcriptUrl: a.transcript_url,
          status: a.status,
          statusText: fmt.HONOR_STATUS_TEXT[a.status] || a.status,
          updated: fmt.formatDateTime(a.updated_at)
        }));
        this.setData({ loading: false, types, phase, timeText, applications });
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: "荣誉信息加载失败", icon: "none" });
      });
  },

  /* ---------- 新建/编辑 ---------- */
  openCreate() {
    if (this.data.phase === "closed") {
      wx.showToast({ title: "当前不在申请时间内", icon: "none" });
      return;
    }
    this.applyFormState({ honor: "", statement: "", attachment_url: "", application_form_url: "", transcript_url: "" }, null);
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id;
    const app = this.data.applications.find((a) => a.id === id);
    if (!app) return;
    if (app.status === "approved") {
      wx.showToast({ title: "已通过的申请无法修改", icon: "none" });
      return;
    }
    this.applyFormState(
      {
        honor: app.honor,
        statement: app.statement || "",
        attachment_url: app.attachment_url || "",
        application_form_url: app.applicationFormUrl || "",
        transcript_url: app.transcriptUrl || ""
      },
      app
    );
  },

  applyFormState(form, editing) {
    this.setData({
      formVisible: true,
      editing,
      form,
      honorOptions: this.data.types,
      honorIndex: this.data.types.indexOf(form.honor),
      needTranscript: HONORS_NEED_TRANSCRIPT.indexOf(form.honor) >= 0,
      needApplicationForm: form.honor === GLOBAL_COMPETENCE_HONOR,
      needMaterialLink: HONORS_WITHOUT_MATERIAL_LINK.indexOf(form.honor) < 0
    });
  },

  closeForm() {
    this.setData({ formVisible: false, editing: null });
  },

  onHonorChange(e) {
    const idx = Number(e.detail.value);
    const honor = this.data.honorOptions[idx];
    this.setData({
      honorIndex: idx,
      "form.honor": honor,
      needTranscript: HONORS_NEED_TRANSCRIPT.indexOf(honor) >= 0,
      needApplicationForm: honor === GLOBAL_COMPETENCE_HONOR,
      needMaterialLink: HONORS_WITHOUT_MATERIAL_LINK.indexOf(honor) < 0
    });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  uploadFile(e) {
    const kind = e.currentTarget.dataset.kind; // application_form / transcript
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      success: (res) => {
        const file = res.tempFiles[0];
        if (file.size > MAX_SIZE) {
          wx.showToast({ title: "文件不能超过 20MB", icon: "none" });
          return;
        }
        const prefix = `honor_application/${this.userUuid}/${this.data.year}/`;
        const key = `${prefix}${kind}/${file.name}`;
        wx.showLoading({ title: "上传中…" });
        cos
          .putObject(prefix, key, file.path)
          .then(() => {
            wx.hideLoading();
            this.setData({ [`form.${kind}_url`]: key });
            wx.showToast({ title: "上传成功", icon: "success" });
          })
          .catch(() => {
            wx.hideLoading();
            wx.showToast({ title: "上传失败", icon: "none" });
          });
      }
    });
  },

  submit() {
    const f = this.data.form;
    if (!f.honor) {
      wx.showToast({ title: "请选择荣誉类型", icon: "none" });
      return;
    }
    if (!f.statement.trim()) {
      wx.showToast({ title: "请填写申请陈述", icon: "none" });
      return;
    }
    if (this.data.needApplicationForm && !f.application_form_url) {
      wx.showToast({ title: "请先上传申请表", icon: "none" });
      return;
    }
    if (this.data.needTranscript && !f.transcript_url) {
      wx.showToast({ title: "请先上传成绩单", icon: "none" });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    const isEdit = !!this.data.editing;
    request({
      url: isEdit ? "/application/honor/update_one" : "/application/honor/insert_one",
      method: "POST",
      data: Object.assign(
        {
          honor: f.honor,
          statement: f.statement.trim(),
          attachment_url: f.attachment_url.trim(),
          application_form_url: f.application_form_url,
          transcript_url: f.transcript_url
        },
        isEdit ? { id: this.data.editing.id, student_uuid: this.userUuid } : { student_uuid: this.userUuid }
      ),
      silent: true
    })
      .then(() => {
        wx.showToast({ title: isEdit ? "申请已更新" : "申请已提交", icon: "success" });
        this.setData({ formVisible: false, editing: null });
        this.load();
      })
      .catch((e) => {
        wx.showToast({
          title: e.statusCode === 409 ? "本年度已申请过该荣誉" : e.message || "提交失败",
          icon: "none"
        });
      })
      .then(() => this.setData({ submitting: false }));
  },

  deleteApplication(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "删除申请",
      content: "确定删除该荣誉申请吗？不可恢复。",
      confirmColor: "#ef4444",
      success: (res) => {
        if (!res.confirm) return;
        request({
          url: "/application/honor/delete_one",
          method: "POST",
          data: { id, student_uuid: this.userUuid },
          silent: true
        })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "none" });
            this.load();
          })
          .catch(() => wx.showToast({ title: "删除失败", icon: "none" }));
      }
    });
  },

  fileName(url) {
    if (!url) return "";
    return url.split("/").pop().split("?")[0];
  }
});
