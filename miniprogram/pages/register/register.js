const auth = require("../../utils/auth");
const portalService = require("../../services/portal");
const bus = require("../../utils/bus");

const STEPS = ["选择身份", "验证邮箱", "补充信息", "设置密码"];

Page({
  data: {
    step: 0,
    steps: STEPS,
    role: "", // student / teacher / guest
    email: "",
    code: "",
    countdown: 0,
    name: "",
    studentID: "",
    depart: "",
    class_: "",
    departments: [],
    departIndex: -1,
    password: "",
    password2: "",
    submitting: false
  },

  onLoad() {
    portalService
      .getDepartments()
      .then((data) => {
        const departments = ((data && data.department) || []).map((d) => d.name);
        this.setData({ departments });
      })
      .catch(() => {});
  },

  /* ---------- 步骤 0：身份 ---------- */
  chooseRole(e) {
    this.setData({ role: e.currentTarget.dataset.role, step: 1 });
  },

  /* ---------- 步骤 1：邮箱验证 ---------- */
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  sendCode() {
    const email = (this.data.email || "").trim();
    if (this.data.role === "student" && !/^[\w.-]+@mails\.tsinghua\.edu\.cn$/.test(email)) {
      wx.showToast({ title: "学生注册请使用 @mails.tsinghua.edu.cn 邮箱", icon: "none" });
      return;
    }
    if (this.data.role === "teacher" && !/@(mails\.)?tsinghua\.edu\.cn$/.test(email)) {
      wx.showToast({ title: "教师注册请使用清华邮箱", icon: "none" });
      return;
    }
    if (this.data.role === "guest" && !/^[\w.-]+@[\w.-]+\.\w+$/.test(email)) {
      wx.showToast({ title: "邮箱格式不正确", icon: "none" });
      return;
    }
    if (this.data.countdown > 0) return;
    auth
      .sendCode(email)
      .then((token) => {
        this.verifyToken = token;
        this.startCountdown();
        wx.showToast({ title: "验证码已发送", icon: "none" });
      })
      .catch((e) => wx.showToast({ title: e.message || "发送失败", icon: "none" }));
  },

  startCountdown() {
    this.setData({ countdown: 60 });
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => {
      const v = this.data.countdown - 1;
      if (v <= 0) {
        clearInterval(this._timer);
        this.setData({ countdown: 0 });
      } else this.setData({ countdown: v });
    }, 1000);
  },

  nextFromCode() {
    const code = (this.data.code || "").trim();
    if (!this.verifyToken || code.length !== 6) {
      wx.showToast({ title: "请获取并输入 6 位验证码", icon: "none" });
      return;
    }
    auth
      .verifyCode(code, this.verifyToken)
      .then(() => this.setData({ step: 2 }))
      .catch(() => wx.showToast({ title: "验证码错误", icon: "none" }));
  },

  /* ---------- 步骤 2：信息 ---------- */
  onDepartChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ departIndex: idx, depart: this.data.departments[idx] || "" });
  },

  nextFromInfo() {
    const d = this.data;
    if (!d.name.trim()) {
      wx.showToast({ title: "请填写姓名", icon: "none" });
      return;
    }
    if (d.role !== "guest" && !d.depart) {
      wx.showToast({ title: "请选择院系", icon: "none" });
      return;
    }
    if (d.role === "student") {
      if (!/^\d{10}$/.test(d.studentID.trim())) {
        wx.showToast({ title: "学号应为 10 位数字", icon: "none" });
        return;
      }
      if (!/^[\u4e00-\u9fa5]+\d+$/.test(d.class_.trim())) {
        wx.showToast({ title: "班级格式如：无76", icon: "none" });
        return;
      }
    }
    this.setData({ step: 3 });
  },

  /* ---------- 步骤 3：密码 ---------- */
  submit() {
    const d = this.data;
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d!@#$%^&*]{8,}$/.test(d.password)) {
      wx.showToast({ title: "密码至少8位，含大小写字母和数字", icon: "none" });
      return;
    }
    if (d.password !== d.password2) {
      wx.showToast({ title: "两次密码不一致", icon: "none" });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    auth
      .register({
        role: d.role,
        name: d.name.trim(),
        password: d.password,
        verificationEmailCode: (d.code || "").trim(),
        verificationEmailToken: this.verifyToken,
        studentID: d.role === "student" ? d.studentID.trim() : undefined,
        depart: d.role === "guest" ? undefined : d.depart,
        class_: d.role === "student" ? d.class_.trim() : undefined
      })
      .then(() => {
        wx.showToast({ title: "注册成功", icon: "success" });
        bus.emit("auth:login", auth.getUser());
        setTimeout(() => wx.switchTab({ url: "/pages/user/user" }), 800);
      })
      .catch((e) => {
        const msg =
          e.statusCode === 409
            ? "该邮箱/学号已注册"
            : e.statusCode === 401
              ? "验证码错误，请返回重试"
              : e.message || "注册失败";
        wx.showToast({ title: msg, icon: "none" });
      })
      .then(() => this.setData({ submitting: false }));
  },

  prev() {
    if (this.data.step > 0) this.setData({ step: this.data.step - 1 });
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer);
  }
});
