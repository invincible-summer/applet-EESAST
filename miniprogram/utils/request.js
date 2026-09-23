/**
 * 统一网络请求封装
 * - 自动注入 Authorization: Bearer <token>
 * - 401 统一降级（清 token → 匿名态 → 通知全局事件）
 * - 错误规范化为 { statusCode, message }
 */
const config = require("../config/index");
const store = require("./store");
const bus = require("./bus");
const jwtUtil = require("./jwt");

let anonymousPromise = null; // 并发去重：获取匿名 token

function ensureAnonymousToken() {
  if (anonymousPromise) return anonymousPromise;
  anonymousPromise = new Promise((resolve, reject) => {
    wx.request({
      url: `${config.API_BASE}/user/anonymous`,
      method: "GET",
      timeout: 15000,
      success(res) {
        if (res.statusCode === 200 && res.data && res.data.token) {
          store.setToken(res.data.token);
          resolve(res.data.token);
        } else {
          reject(normalizeError(res));
        }
      },
      fail(err) {
        reject(normalizeError(null, err));
      },
      complete() {
        anonymousPromise = null;
      }
    });
  });
  return anonymousPromise;
}

/** 保证本地存在可用 token（与 web 端行为一致：匿名也可读公开数据） */
function ensureToken() {
  const token = store.getToken();
  if (token && jwtUtil.parseUser(token)) return Promise.resolve(token);
  return ensureAnonymousToken();
}

function normalizeError(res, err) {
  if (res) {
    const data = res.data;
    let message = "";
    if (typeof data === "string") message = data;
    else if (data && typeof data === "object")
      message = data.error || data.message || data.msg || "";
    return {
      statusCode: res.statusCode,
      message: message || `请求失败 (${res.statusCode})`
    };
  }
  return { statusCode: -1, message: (err && err.errMsg) || "网络连接失败" };
}

/**
 * @param {object} opts
 * @param {string} opts.url        以 / 开头的路径（拼接 API_BASE）或完整 URL
 * @param {string} [opts.method]
 * @param {object} [opts.data]
 * @param {object} [opts.header]
 * @param {boolean} [opts.silent]  不弹错误提示
 * @param {boolean} [opts.withAuth=true] 是否携带 Bearer token
 */
function request(opts) {
  const {
    url,
    method = "GET",
    data,
    header = {},
    silent = false,
    withAuth = true
  } = opts;
  const fullUrl = /^https?:\/\//.test(url) ? url : config.API_BASE + url;

  const doRequest = (token) => {
    return new Promise((resolve, reject) => {
      const reqHeader = Object.assign({ "Content-Type": "application/json" }, header);
      if (withAuth && token) reqHeader.Authorization = `Bearer ${token}`;
      wx.request({
        url: fullUrl,
        method,
        data,
        header: reqHeader,
        timeout: 20000,
        success(res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else if (res.statusCode === 401) {
            // token 失效：降级匿名并广播（页面自行决定跳转）
            store.clearToken();
            bus.emit("auth:expired");
            const e = normalizeError(res);
            if (!silent) showToast(e.message || "登录状态失效，请重新登录");
            reject(e);
          } else {
            const e = normalizeError(res);
            if (!silent) showToast(e.message);
            reject(e);
          }
        },
        fail(err) {
          const e = normalizeError(null, err);
          if (!silent) showToast("网络连接失败，请检查网络");
          reject(e);
        }
      });
    });
  };

  if (!withAuth) return doRequest(null);
  return ensureToken().then(doRequest);
}

let toastShowing = false;
function showToast(title) {
  if (toastShowing) return;
  toastShowing = true;
  wx.showToast({ title: String(title).slice(0, 30), icon: "none", duration: 2200 });
  setTimeout(() => {
    toastShowing = false;
  }, 2300);
}

module.exports = { request, ensureToken, ensureAnonymousToken };
