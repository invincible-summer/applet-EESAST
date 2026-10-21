/**
 * 公告附件归一化
 *
 * 后端历史上存过三种形态的 notice.files：
 *   1) [{ filename, url }]  门户公告（web/src/app/InfoSite/NoticePage.tsx）
 *      - url 形如 "/upload/xxx.pdf"（COS key 去掉前导 "/"）
 *   2) [{ filename }]       赛事公告（web/src/app/ContestSite/NoticePage.tsx）
 *      - key 需要按 "{赛事名}/notice/{filename}" 拼接
 *   3) ["path/to/file"]     早期纯字符串
 *
 * 统一输出 { name, key, url }：
 *   - key：COS 对象 key（用于 STS 预签名）
 *   - url：绝对 URL（历史数据里若已存完整链接，直接复制，不再签名）
 *
 * 注意：旧版小程序直接对元素调用 split()，遇到对象会抛错并被 catch 成空数组，
 * 导致「公告附件永远不显示」，这里必须兼容对象形态。
 */

const HTTP_RE = /^https?:\/\//i;

function parseNoticeFiles(raw, defaultPrefix) {
  let list = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try {
      list = JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];

  const prefix = defaultPrefix || "";
  const out = [];
  const seen = {};

  for (const item of list) {
    let name = "";
    let key = "";
    let url = "";

    if (typeof item === "string") {
      key = item.replace(/^\/+/, "");
      name = key.split("/").pop();
    } else if (item && typeof item === "object") {
      const rawUrl = typeof item.url === "string" ? item.url.trim() : "";
      name = typeof item.filename === "string" ? item.filename.trim() : "";
      if (HTTP_RE.test(rawUrl)) {
        url = rawUrl;
        if (!name) name = rawUrl.split("/").pop().split("?")[0];
      } else if (rawUrl) {
        key = rawUrl.replace(/^\/+/, "");
        if (!name) name = key.split("/").pop();
      } else if (name) {
        key = prefix + name;
      }
    } else {
      continue;
    }

    if (!key && !url) continue;
    const id = url || key;
    if (seen[id]) continue;
    seen[id] = true;
    out.push({
      name: name || (key || url).split("/").pop() || "附件",
      key,
      url
    });
  }
  return out;
}

module.exports = { parseNoticeFiles };
