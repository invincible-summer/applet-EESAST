const auth = require("../../utils/auth");

Page({
  data: {
    email: "",
    code: "",
    password: "",
    password2: "",
    countdown: 0,
    submitting: false
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  sendCode() {
    const email = (this.data.email || "").trim();
    if (!/^[\w.-]+@[\w.-]+\.\w+$/.test(email)) {
      wx.showToast({ title: "请输入注册邮箱", icon: "none" });
      return;
    }
    if (this.data.countdown > 0) return;
    auth
      .sendCode(email)
      .then((token) => {
        this.verifyToken = token;
        this.setData({ countdown: 60 });
        if (this._timer) clearInterval(this._timer);
        this._timer = setInterval(() => {
          const v = this.data.countdown - 1;
          if (v <= 0) {
            clearInterval(this._timer);
            this.setData({ countdown: 0 });
          } else this.setData({ countdown: v });
        }, 1000);
        wx.showToast({ title: "验证码已发送", icon: "none" });
      })
      .catch((e) => wx.showToast({ title: e.message || "发送失败", icon: "none" }));
  },

  submit() {
    const d = this.data;
    if (!this.verifyToken || (d.code || "").trim().length !== 6) {
      wx.showToast({ title: "请获取并输入 6 位验证码", icon: "none" });
      return;
    }
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
      .changePassword({
        password: d.password,
        verificationCode: d.code.trim(),
        verificationToken: this.verifyToken
      })
      .then(() => {
        wx.showToast({ title: "密码已重置", icon: "success" });
        setTimeout(() => wx.navigateBack(), 900);
      })
      .catch((e) => {
        wx.showToast({
          title: e.statusCode === 401 ? "验证码错误" : e.message || "重置失败",
          icon: "none"
        });
      })
      .then(() => this.setData({ submitting: false }));
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer);
  }
});
