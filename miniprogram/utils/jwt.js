/**
 * JWT 解码（仅读取 payload，不验签——验签由服务端完成）
 * 与后端 api/src/middlewares/authenticate.ts 的 JwtUserPayload 对齐
 */

function base64UrlDecode(str) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bytes = [];
  for (let i = 0; i < s.length; i += 4) {
    const c1 = chars.indexOf(s[i]);
    const c2 = chars.indexOf(s[i + 1]);
    const c3 = s[i + 2] === "=" || s[i + 2] === undefined ? -1 : chars.indexOf(s[i + 2]);
    const c4 = s[i + 3] === "=" || s[i + 3] === undefined ? -1 : chars.indexOf(s[i + 3]);
    const n = (c1 << 18) | (c2 << 12) | ((c3 & 0xff) << 6) | (c4 & 0xff);
    if (c1 < 0 || c2 < 0) break;
    bytes.push((n >> 16) & 0xff);
    if (c3 >= 0) bytes.push((n >> 8) & 0xff);
    if (c4 >= 0) bytes.push(n & 0xff);
  }
  // bytes -> utf8 string
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i += 1;
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b < 0xf0) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)
      );
      i += 3;
    } else {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      const off = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (off >> 10), 0xdc00 + (off & 0x3ff));
      i += 4;
    }
  }
  return out;
}

/**
 * 解码 JWT payload
 * @returns {null|{uuid:string, role:string, exp:number, isLoggedIn:boolean}}
 */
function decodeJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return payload;
  } catch (e) {
    return null;
  }
}

const ANONYMOUS_UUID = "00000000-0000-0000-0000-000000000000";

/** 解析登录态：过期或匿名返回游客态 */
function parseUser(token) {
  const payload = decodeJwt(token);
  if (!payload || !payload.exp) return null;
  const now = Math.floor(Date.now() / 1000);
  if (now > payload.exp) return null;
  return {
    uuid: payload.uuid,
    role: payload.role || "anonymous",
    isLoggedIn: !!payload.uuid && payload.uuid !== ANONYMOUS_UUID,
    exp: payload.exp
  };
}

module.exports = { decodeJwt, parseUser, ANONYMOUS_UUID };
