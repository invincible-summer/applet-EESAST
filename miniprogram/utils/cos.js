/**
 * 腾讯云 COS 直连（零依赖实现 XML API 签名）
 * - 临时凭证：GET /static/{prefix}（服务端按角色+路径收敛权限，与 web 一致）
 * - 上传：PUT Object（ArrayBuffer via wx.request）
 * - 下载：预签名 GET URL → wx.downloadFile
 * 协议参考：https://cloud.tencent.com/document/product/436/7778
 */
const config = require("../config/index");
const { request } = require("./request");
const { sha1Hex, hmacSha1Hex } = require("./sha1");

const stsCache = {}; // prefix -> { sts, expireAt }
const stsPending = {}; // 前缀级串行化，规避服务端并发缺陷

function cosHost() {
  return `${config.COS.bucket}.cos.${config.COS.region}.myqcloud.com`;
}

function cosBaseUrl() {
  return `https://${cosHost()}`;
}

/** 获取（并缓存）指定前缀的 STS 临时密钥 */
function getSTS(prefix) {
  const norm = prefix.endsWith("/") ? prefix : prefix + "/";
  const cached = stsCache[norm];
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expireAt > now + 60) return Promise.resolve(cached.sts);

  if (stsPending[norm]) return stsPending[norm];

  stsPending[norm] = request({
    url: `/static/${norm}`,
    method: "GET",
    silent: true
  })
    .then((data) => {
      if (!data || !data.credentials || !data.credentials.tmpSecretId) {
        throw { statusCode: 403, message: "无权访问该存储路径" };
      }
      const sts = {
        tmpSecretId: data.credentials.tmpSecretId,
        tmpSecretKey: data.credentials.tmpSecretKey,
        sessionToken: data.credentials.sessionToken,
        startTime: data.startTime,
        expiredTime: data.expiredTime
      };
      stsCache[norm] = { sts, expireAt: data.expiredTime };
      delete stsPending[norm];
      return sts;
    })
    .catch((e) => {
      delete stsPending[norm];
      throw e;
    });
  return stsPending[norm];
}

/** 匹配 key 所属的最短已知前缀（简化：直接按传入业务前缀申请） */
function encodePath(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function sortParams(params) {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
}

/**
 * 生成 COS 请求 Authorization / 预签名串
 * 与官方 cos-js-sdk-v5 getAuth 逐字段一致：
 * - SignKey = HMAC-SHA1(qKeyTime, SecretKey)
 * - FormatString = method\npathname\nparams\nheaders\n
 * - StringToSign = sha1\nKeyTime\nsha1(FormatString)\n
 * - 列表分隔符 ";"，值不做 URL 编码（与 SDK 相同）
 */
function buildSignature(opts) {
  const { method, key, sts, params, presign } = opts;
  const keyTime = `${sts.startTime};${sts.expiredTime}`;
  // HMAC(key=SecretKey, message=KeyTime)
  const signKey = hmacSha1Hex(sts.tmpSecretKey, keyTime);

  // 签名使用原始（未编码）路径，与 cos-js-sdk-v5 一致；URL 中才做编码
  const pathname = key === null || key === undefined || key === "" ? "/" : `/${key}`;
  const httpParams = params ? sortParams(params) : "";
  const signedHeaders = presign ? "" : `host=${cosHost()}`;

  const httpString = `${method.toLowerCase()}\n${pathname}\n${httpParams}\n${signedHeaders}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1Hex(signKey, stringToSign);

  return [
    "q-sign-algorithm=sha1",
    `q-ak=${sts.tmpSecretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${presign ? "" : "host"}`,
    `q-url-param-list=${Object.keys(params || {})
      .sort()
      .join(";")}`,
    `q-signature=${signature}`
  ].join("&");
}

/** 上传本地文件到 COS（PUT Object） */
function putObject(prefix, key, filePath) {
  return getSTS(prefix).then(
    (sts) =>
      new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
          filePath,
          success: (readRes) => {
            const auth = buildSignature({ method: "PUT", key, sts });
            wx.request({
              url: `${cosBaseUrl()}/${encodePath(key)}`,
              method: "PUT",
              data: readRes.data,
              header: {
                Authorization: auth,
                "x-cos-security-token": sts.sessionToken
              },
              timeout: 60000,
              success(res) {
                if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
                else reject({ statusCode: res.statusCode, message: "上传失败" });
              },
              fail(err) {
                reject({ statusCode: -1, message: err.errMsg || "上传失败" });
              }
            });
          },
          fail: (err) => {
            reject({ statusCode: -1, message: err.errMsg || "读取文件失败" });
          }
        });
      })
  );
}

/** 生成预签名下载 URL（默认 2 小时，与 web 一致；token 以未签名参数追加，与 SDK 一致） */
function getSignedUrl(prefix, key, expiresSeconds) {
  return getSTS(prefix).then((sts) => {
    const qs = buildSignature({ method: "GET", key, sts, presign: true });
    return `${cosBaseUrl()}/${encodePath(key)}?${qs}&x-cos-security-token=${sts.sessionToken}`;
  });
}

/** 对象是否存在（200 true / 404 false） */
function headObject(prefix, key) {
  return getSTS(prefix).then(
    (sts) =>
      new Promise((resolve, reject) => {
        const auth = buildSignature({ method: "HEAD", key, sts });
        wx.request({
          url: `${cosBaseUrl()}/${encodePath(key)}`,
          method: "HEAD",
          header: {
            Authorization: auth,
            "x-cos-security-token": sts.sessionToken
          },
          success(res) {
            if (res.statusCode === 200) resolve(true);
            else if (res.statusCode === 404) resolve(false);
            else if (res.statusCode === 403) reject({ statusCode: 403, message: "无权限访问" });
            else reject({ statusCode: res.statusCode, message: "查询失败" });
          },
          fail: (err) => reject({ statusCode: -1, message: err.errMsg || "查询失败" })
        });
      })
  );
}

/** XML 实体还原（COS 的 Key 会把 & < > 等转义） */
function xmlUnescape(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlTag(block, name) {
  const m = block.match(new RegExp("<" + name + ">([\\s\\S]*?)</" + name + ">"));
  return m ? xmlUnescape(m[1].trim()) : "";
}

/**
 * 解析 GET Bucket 的 XML 响应。
 * COS 的 XML API 返回 XML（不是 JSON）；旧实现直接读 res.data.Contents，
 * 导致列举结果恒为空（头像、谈话记录下载全部失效）。
 */
function parseListBucketXml(xml) {
  const text = typeof xml === "string" ? xml : "";
  const contents = [];
  const re = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m;
  while ((m = re.exec(text))) {
    const key = xmlTag(m[1], "Key");
    if (!key) continue;
    contents.push({
      Key: key,
      LastModified: xmlTag(m[1], "LastModified")
    });
  }
  return {
    contents,
    truncated: /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(text),
    nextMarker: xmlTag(text, "NextMarker")
  };
}

/** 兼容网关若返回 JSON 的情况 */
function parseListObjectsResponse(data) {
  if (data && typeof data === "object" && Array.isArray(data.Contents)) {
    return {
      contents: data.Contents,
      truncated: !!data.IsTruncated,
      nextMarker: data.NextMarker || ""
    };
  }
  return parseListBucketXml(data);
}

/**
 * 列举对象（GET Bucket /?prefix=）
 * 自动翻页（COS 单页最多 1000 个，返回 IsTruncated/NextMarker），默认最多 10 页。
 */
function listObjects(prefix, listPrefix, options) {
  const maxPages = (options && options.maxPages) || 10;
  return getSTS(prefix).then((sts) => {
    const all = [];

    const fetchPage = (marker, page) =>
      new Promise((resolve, reject) => {
        const params = { "max-keys": "1000", prefix: listPrefix };
        if (marker) params.marker = marker;
        const auth = buildSignature({ method: "GET", key: "", sts, params });
        const qs = sortParams(params);
        wx.request({
          url: `${cosBaseUrl()}/?${qs}`,
          method: "GET",
          header: {
            Authorization: auth,
            "x-cos-security-token": sts.sessionToken
          },
          success(res) {
            if (res.statusCode !== 200) {
              reject({ statusCode: res.statusCode, message: "列举文件失败" });
              return;
            }
            const parsed = parseListObjectsResponse(res.data);
            for (const item of parsed.contents) all.push(item);
            if (parsed.truncated && parsed.nextMarker && page < maxPages) {
              resolve(fetchPage(parsed.nextMarker, page + 1));
            } else {
              resolve(all);
            }
          },
          fail: (err) =>
            reject({ statusCode: -1, message: err.errMsg || "列举文件失败" })
        });
      });

    return fetchPage("", 1);
  });
}

/** 下载并用系统能力打开文档（doc/pdf/zip 等走 openDocument，其余提示） */
function downloadAndOpen(prefix, key, filename) {
  return getSignedUrl(prefix, key).then((url) => {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success(res) {
          if (res.statusCode !== 200) {
            reject({ statusCode: res.statusCode, message: "下载失败" });
            return;
          }
          const ext = (filename || key).split(".").pop().toLowerCase();
          const docExts = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf"];
          if (docExts.indexOf(ext) >= 0) {
            wx.openDocument({
              filePath: res.tempFilePath,
              fileType: ext,
              showMenu: true,
              success: () => resolve(res.tempFilePath),
              fail: () => {
                wx.showToast({ title: "文件已下载，但暂不支持预览", icon: "none" });
                resolve(res.tempFilePath);
              }
            });
          } else {
            wx.setClipboardData({ data: url });
            wx.showToast({ title: "下载链接已复制", icon: "none" });
            resolve(res.tempFilePath);
          }
        },
        fail: (err) => reject({ statusCode: -1, message: err.errMsg || "下载失败" })
      });
    });
  });
}

module.exports = {
  getSTS,
  putObject,
  getSignedUrl,
  headObject,
  listObjects,
  downloadAndOpen,
  cosBaseUrl,
  // 以下导出仅供 scripts/ 下的单测使用（小程序内不使用）
  buildSignature,
  parseListBucketXml,
  parseListObjectsResponse
};
