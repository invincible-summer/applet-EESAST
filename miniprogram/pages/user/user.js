const auth = require("../../utils/auth");
const store = require("../../utils/store");
const portalService = require("../../services/portal");
const cos = require("../../utils/cos");
const bus = require("../../utils/bus");
const config = require("../../config/index");
const fmt = require("../../utils/format");

Page({
  data: {
    // 视图：login / profile / edit / tsinghua / delete
    view: "login",
    loginForm: { user: "", password: "" },
    logging: false,

    user: null,
    roleText: "",
    profile: null,
    avatarUrl: "",

    editForm: {},
    departments: [],
    classOptions: [],
    classIndex: -1,
    deptIndex: -1,

    // 清华认证
    tsinghuaForm: { email: "", code: "" },
    tsinghuaCodeSent: false,
    tsinghuaCountdown: 0,

    // 注销
    deleteForm: { code: "" },
    deleteCodeSent: false,
    deleteCountdown: 0,

    llmToken: ""
  },

  onLoad() {
    this.offLogin = bus.on("auth:login", () => this.refresh());
    this.offLogout = bus.on("auth:logout", () => this.setData({ view: "login", profile: null }));
    this.offExpired = bus.on("auth:expired", () => this.setData({ view: "login" }));
  },

  onUnload() {
    [this.offLogin, this.offLogout, this.offExpired].forEach((off) => off && off());
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const user = auth.getUser();
    if (!user.isLoggedIn) {
      this.setData({ view: "login", user: null });
      return;
    }
    this.setData({
      user,
      roleText: config.ROLE_NAMES[user.role] || user.role,
      llmToken: user.isLoggedIn ? this.b64(user.uuid) : ""
    });
    if (this.data.view === "login") this.setData({ view: "profile" });
    this.loadProfile();
  },

  b64(str) {
    // 小程序无 btoa：手写 UTF-8 → base64
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    let i = 0;
    const bytes = [];
    for (let j = 0; j < str.length; j++) {
      let c = str.charCodeAt(j);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    while (i < bytes.length) {
      const b1 = bytes[i];
      const b2 = bytes[i + 1];
      const b3 = bytes[i + 2];
      out += chars[b1 >> 2];
      out += chars[((b1 & 3) << 4) | ((b2 || 0) >> 4)];
      out += b2 !== undefined ? chars[((b2 & 15) << 2) | ((b3 || 0) >> 6)] : "=";
      out += b3 !== undefined ? chars[b3 & 63] : "=";
      i += 3;
    }
    return out;
  },

  /* ---------- 登录 ---------- */
  onLoginInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`loginForm.${field}`]: e.detail.value });
  },

  doLogin() {
    const { user, password } = this.data.loginForm;
    if (!user || !password) {
      wx.showToast({ title: "请输入账号和密码", icon: "none" });
      return;
    }
    this.setData({ logging: true });
    auth
      .login(user.trim(), password)
      .then(() => {
        wx.showToast({ title: "登录成功", icon: "success" });
        this.setData({ view: "profile", loginForm: { user: "", password: "" } });
        this.refresh();
      })
      .catch((e) => {
        wx.showToast({ title: e.statusCode === 401 ? "账号或密码错误" : e.message, icon: "none" });
      })
      .then(() => this.setData({ logging: false }));
  },

  goRegister() {
    wx.navigateTo({ url: "/pages/register/register" });
  },
  goReset() {
    wx.navigateTo({ url: "/pages/reset/reset" });
  },

  /* ---------- 资料 ---------- */
  loadProfile() {
    const user = auth.getUser();
    if (!user.isLoggedIn) return;
    portalService.getProfile(user.uuid).then((data) => {
      const p = (data && data.users_by_pk) || null;
      this.setData({ profile: p });
      store.setProfileCache(p);
    });
    // 头像：avatar/{uuid}/ 下取首个图片
    cos
      .listObjects(`avatar/${user.uuid}/`, `avatar/${user.uuid}/`)
      .then((files) => {
        const img = (files || []).find((f) => /\.(jpe?g|png)$/i.test(f.Key));
        if (!img) {
          this.setData({ avatarUrl: "" });
          return;
        }
        return cos
          .getSignedUrl(`avatar/${user.uuid}/`, img.Key)
          .then((url) => this.setData({ avatarUrl: url }));
      })
      .catch(() => {});
  },

  enterEdit() {
    const p = this.data.profile || {};
    portalService.getDepartments().then((data) => {
      const departments = ((data && data.department) || []).map((d) => d.name);
      portalService.getClasses().then((cdata) => {
        const classOptions = ((cdata && cdata.classes) || []).map((c) => c.name);
        this.setData({
          view: "edit",
          departments,
          classOptions,
          deptIndex: departments.indexOf(p.department),
          classIndex: classOptions.indexOf(p.class),
          editForm: {
            username: p.username || "",
            realname: p.realname || "",
            student_no: p.student_no || "",
            department: p.department || "",
            class: p.class || ""
          }
        });
      });
    });
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`editForm.${field}`]: e.detail.value });
  },
  onDeptChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ deptIndex: idx, "editForm.department": this.data.departments[idx] || "" });
  },
  onClassChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ classIndex: idx, "editForm.class": this.data.classOptions[idx] || "" });
  },

  saveProfile() {
    const f = this.data.editForm;
    if (!f.username.trim()) {
      wx.showToast({ title: "用户名不能为空", icon: "none" });
      return;
    }
    // /user/update 仅支持 username/realname/department/className/student_no
    auth
      .updateUser({
        username: f.username.trim(),
        realname: f.realname.trim(),
        department: f.department,
        className: f.class,
        student_no: f.student_no.trim()
      })
      .then(() => {
        wx.showToast({ title: "保存成功", icon: "success" });
        this.setData({ view: "profile" });
        this.loadProfile();
      })
      .catch((e) => wx.showToast({ title: e.message || "保存失败", icon: "none" }));
  },

  /* ---------- 头像 ---------- */
  changeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sizeType: ["compressed"],
      success: (res) => {
        const temp = res.tempFiles[0].tempFilePath;
        const user = auth.getUser();
        const key = `avatar/${user.uuid}/avatar_${Date.now()}.png`;
        wx.showLoading({ title: "上传头像…" });
        cos
          .putObject(`avatar/${user.uuid}/`, key, temp)
          .then(() => cos.getSignedUrl(`avatar/${user.uuid}/`, key))
          .then((url) => {
            wx.hideLoading();
            this.setData({ avatarUrl: url });
            wx.showToast({ title: "头像已更新", icon: "success" });
          })
          .catch(() => {
            wx.hideLoading();
            wx.showToast({ title: "上传失败", icon: "none" });
          });
      }
    });
  },

  /* ---------- 清华认证 ---------- */
  enterTsinghua() {
    this.setData({ view: "tsinghua", tsinghuaForm: { email: "", code: "" }, tsinghuaCodeSent: false });
  },

  onTsinghuaInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`tsinghuaForm.${field}`]: e.detail.value });
  },

  sendTsinghuaCode() {
    const email = (this.data.tsinghuaForm.email || "").trim();
    if (!/^[\w.-]+@tsinghua\.edu\.cn$/.test(email)) {
      wx.showToast({ title: "请输入清华邮箱（@tsinghua.edu.cn）", icon: "none" });
      return;
    }
    // 直接向清华邮箱发码；认证时后端依据验证码 token 中的 email 回写 tsinghua_email
    auth
      .sendCode(email)
      .then((token) => {
        this.tsinghuaVerifyToken = token;
        this.setData({ tsinghuaCodeSent: true, tsinghuaCountdown: 60 });
        this.startCountdown("tsinghuaCountdown");
        wx.showToast({ title: "验证码已发送", icon: "none" });
      })
      .catch((e) => wx.showToast({ title: e.message || "发送失败", icon: "none" }));
  },

  submitTsinghua() {
    const { email, code } = this.data.tsinghuaForm;
    if (!this.tsinghuaVerifyToken || !code) {
      wx.showToast({ title: "请先获取并输入验证码", icon: "none" });
      return;
    }
    auth
      .editProfile({ verificationCode: code, verificationToken: this.tsinghuaVerifyToken, isTsinghua: true })
      .then(() => {
        wx.showToast({ title: "认证成功", icon: "success" });
        this.tsinghuaVerifyToken = "";
        this.refresh();
        this.setData({ view: "profile" });
      })
      .catch((e) => wx.showToast({ title: e.statusCode === 401 ? "验证码错误" : e.message, icon: "none" }));
  },

  /* ---------- 注销 ---------- */
  enterDelete() {
    const p = this.data.profile || {};
    this.setData({ view: "delete", deleteForm: { code: "" }, deleteCodeSent: false });
    this.deleteEmail = p.email;
  },

  onDeleteInput(e) {
    this.setData({ "deleteForm.code": e.detail.value });
  },

  sendDeleteCode() {
    if (!this.deleteEmail) {
      wx.showToast({ title: "资料缺少邮箱，请联系管理员", icon: "none" });
      return;
    }
    auth
      .sendCode(this.deleteEmail)
      .then((token) => {
        this.deleteVerifyToken = token;
        this.setData({ deleteCodeSent: true, deleteCountdown: 60 });
        this.startCountdown("deleteCountdown");
        wx.showToast({ title: "验证码已发送", icon: "none" });
      })
      .catch((e) => wx.showToast({ title: e.message || "发送失败", icon: "none" }));
  },

  confirmDelete() {
    const code = this.data.deleteForm.code;
    if (!this.deleteVerifyToken || !code) {
      wx.showToast({ title: "请先获取并输入验证码", icon: "none" });
      return;
    }
    wx.showModal({
      title: "确认注销账号",
      content: "注销后账号数据将被删除且不可恢复，确定继续吗？",
      confirmColor: "#ef4444",
      success: (res) => {
        if (!res.confirm) return;
        auth
          .deleteAccount(code, this.deleteVerifyToken)
          .then(() => {
            wx.showToast({ title: "账号已注销", icon: "none" });
            this.setData({ view: "login", profile: null });
          })
          .catch((e) => wx.showToast({ title: e.statusCode === 401 ? "验证码错误" : e.message, icon: "none" }));
      }
    });
  },

  /* ---------- 退出 ---------- */
  doLogout() {
    wx.showModal({
      title: "退出登录",
      content: "确定退出当前账号吗？",
      success: (res) => {
        if (!res.confirm) return;
        auth.logout().then(() => {
          this.setData({ view: "login", profile: null, avatarUrl: "" });
        });
      }
    });
  },

  copyLlmToken() {
    wx.setClipboardData({
      data: this.data.llmToken,
      success: () => wx.showToast({ title: "已复制", icon: "none" })
    });
  },

  startCountdown(field) {
    if (this["_timer_" + field]) clearInterval(this["_timer_" + field]);
    this["_timer_" + field] = setInterval(() => {
      const v = this.data[field] - 1;
      if (v <= 0) {
        clearInterval(this["_timer_" + field]);
        this.setData({ [field]: 0 });
      } else this.setData({ [field]: v });
    }, 1000);
  },

  backProfile() {
    this.setData({ view: "profile" });
  },

  formatTime(t) {
    return fmt.formatDate(t);
  }
});
