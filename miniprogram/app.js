const auth = require("./utils/auth");
const store = require("./utils/store");

App({
  globalData: {
    userInfo: null
  },

  onLaunch() {
    // 建立登录态：无 token/过期时自动获取匿名 token（公开数据可读）
    auth.getUser();
    require("./utils/request")
      .ensureToken()
      .then(() => {
        this.globalData.userInfo = auth.getUser();
      })
      .catch(() => {
        // 离线/服务不可用：保持游客态，页面请求时重试
      });
  },

  onShow() {
    this.globalData.userInfo = auth.getUser();
  }
});
