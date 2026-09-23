/**
 * 认证与登录态管理
 * 对齐 api/src/routes/user.ts 的认证协议：
 * - POST /user/login {user, password} → {token}
 * - POST /user/send-code {email} → {token}（10min 验证码 JWT）
 * - POST /user/verify {verificationCode, verificationToken}
 * - POST /user/register {...} → {token}
 * - POST /user/change-password / edit-profile / update / delete
 */
const config = require("../config/index");
const store = require("./store");
const jwtUtil = require("./jwt");
const bus = require("./bus");
const { request, ensureAnonymousToken } = require("./request");

/** 当前登录态（无 token/过期 → 匿名游客态，不阻塞浏览） */
function getUser() {
  const token = store.getToken();
  const user = jwtUtil.parseUser(token);
  if (user) return user;
  return { uuid: jwtUtil.ANONYMOUS_UUID, role: "anonymous", isLoggedIn: false };
}

function isLoggedIn() {
  return getUser().isLoggedIn;
}

function hasRole(roles) {
  const user = getUser();
  return user.isLoggedIn && roles.indexOf(user.role) >= 0;
}

/** 是否已登录（userRoles：可组队/提交代码/评论） */
function isUser() {
  return hasRole(config.ROLES.userRoles);
}

/** 是否清华身份（tsinghuaRoles：信息化平台） */
function isTsinghua() {
  return hasRole(config.ROLES.tsinghuaRoles);
}

/** 账号密码登录（支持用户名/邮箱，与 web 端一致） */
function login(user, password) {
  return request({
    url: "/user/login",
    method: "POST",
    data: { user, password },
    withAuth: false,
    silent: true
  }).then((data) => {
    if (!data || !data.token) throw { statusCode: 500, message: "登录失败：服务端未返回凭证" };
    store.setToken(data.token);
    bus.emit("auth:login", getUser());
    return getUser();
  });
}

/** 退出登录：清凭证并回到匿名态 */
function logout() {
  store.clearAll();
  bus.emit("auth:logout");
  return ensureAnonymousToken().catch(() => null);
}

/** 注销账号（邮箱验证码确认后调用），成功后清空全部本地数据 */
function deleteAccount(verificationCode, verificationToken) {
  return request({
    url: "/user/delete",
    method: "POST",
    data: { verificationCode, verificationToken },
    silent: true
  }).then(() => {
    store.clearAll();
    bus.emit("auth:logout");
  });
}

/** 发送邮箱验证码 → 返回 10min 验证码 JWT（仅存内存，不落盘） */
function sendCode(email) {
  return request({
    url: "/user/send-code",
    method: "POST",
    data: { email },
    withAuth: false,
    silent: true
  }).then((data) => {
    if (!data || !data.token) throw { statusCode: 500, message: "验证码发送失败" };
    return data.token;
  });
}

/** 校验验证码 */
function verifyCode(verificationCode, verificationToken) {
  return request({
    url: "/user/verify",
    method: "POST",
    data: { verificationCode, verificationToken },
    withAuth: false,
    silent: true
  });
}

/** 注册 → JWT（自动登录）。payload 与 api register 路由一致 */
function register(payload) {
  return request({
    url: "/user/register",
    method: "POST",
    data: payload,
    withAuth: false,
    silent: true
  }).then((data) => {
    if (!data || !data.token) throw { statusCode: 500, message: "注册失败" };
    store.setToken(data.token);
    bus.emit("auth:login", getUser());
    return getUser();
  });
}

/** 修改密码（忘记密码场景，无需登录） */
function changePassword(payload) {
  return request({
    url: "/user/change-password",
    method: "POST",
    data: payload,
    withAuth: false,
    silent: true
  });
}

/** 更新资料（已登录）。字段：username/realname/department/class/student_no/phone */
function updateUser(payload) {
  return request({
    url: "/user/update",
    method: "POST",
    data: payload,
    silent: true
  }).then(() => {
    bus.emit("auth:profile-updated");
  });
}

/** 换绑邮箱 / 清华邮箱认证升级（重签 token 由后端返回） */
function editProfile(payload) {
  return request({
    url: "/user/edit-profile",
    method: "POST",
    data: payload,
    silent: true
  }).then((data) => {
    if (data && data.token) {
      store.setToken(data.token);
      bus.emit("auth:login", getUser());
    }
    return data;
  });
}

module.exports = {
  getUser,
  isLoggedIn,
  isUser,
  isTsinghua,
  hasRole,
  login,
  logout,
  deleteAccount,
  sendCode,
  verifyCode,
  register,
  changePassword,
  updateUser,
  editProfile
};
