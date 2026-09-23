/**
 * 本地存储封装：token 等敏感信息只落在微信小程序沙箱存储中
 */
const KEYS = {
  token: "token",
  user: "user_profile_cache",
  theme: "theme_mode"
};

function getToken() {
  try {
    return wx.getStorageSync(KEYS.token) || "";
  } catch (e) {
    return "";
  }
}

function setToken(token) {
  try {
    if (token) wx.setStorageSync(KEYS.token, token);
    else wx.removeStorageSync(KEYS.token);
  } catch (e) {
    console.error("[store] setToken failed");
  }
}

function clearToken() {
  setToken("");
  try {
    wx.removeStorageSync(KEYS.user);
  } catch (e) {
    /* ignore */
  }
}

function getProfileCache() {
  try {
    return wx.getStorageSync(KEYS.user) || null;
  } catch (e) {
    return null;
  }
}

function setProfileCache(profile) {
  try {
    if (profile) wx.setStorageSync(KEYS.user, profile);
    else wx.removeStorageSync(KEYS.user);
  } catch (e) {
    /* ignore */
  }
}

/** 退出/注销时清空全部本地数据（含 LLM 会话） */
function clearAll() {
  try {
    wx.clearStorageSync();
  } catch (e) {
    /* ignore */
  }
}

module.exports = { getToken, setToken, clearToken, getProfileCache, setProfileCache, clearAll };
