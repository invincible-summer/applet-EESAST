/**
 * 外部链接打开策略。
 *
 * web-view 不能无条件打开任意 URL：
 * - 关联公众号文章可直接尝试打开；
 * - 其他网页必须同时满足 HTTPS、代码白名单和小程序后台业务域名配置。
 */
const WECHAT_ARTICLE_RE = /^https?:\/\/mp\.weixin\.qq\.com\/s(?:[/?#]|$)/i;
const WEBVIEW_ALLOWED_HOSTS = ["mp.weixin.qq.com"];

function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (WECHAT_ARTICLE_RE.test(value)) {
    return value.replace(/^http:\/\//i, "https://");
  }
  return value;
}

function isHttpsUrl(url) {
  return /^https:\/\/[^\s]+$/i.test(String(url || ""));
}

function isAllowedWebViewUrl(url) {
  const normalized = normalizeUrl(url);
  if (!isHttpsUrl(normalized)) return false;
  const match = normalized.match(/^https:\/\/([^/?#]+)/i);
  if (!match) return false;
  return WEBVIEW_ALLOWED_HOSTS.indexOf(match[1].toLowerCase()) >= 0;
}

function getOpenMode(raw) {
  const url = normalizeUrl(raw);
  return {
    url,
    mode: isAllowedWebViewUrl(url) ? "webview" : "copy"
  };
}

module.exports = {
  WEBVIEW_ALLOWED_HOSTS,
  normalizeUrl,
  isAllowedWebViewUrl,
  getOpenMode
};
