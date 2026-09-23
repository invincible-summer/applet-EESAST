/**
 * 纯 JS SHA-1 / HMAC-SHA1（用于腾讯云 COS 请求签名，避免引入 npm 依赖）
 * 输入为 UTF-8 字符串，输出十六进制小写；内部保留字节级实现供 HMAC 复用
 */

function utf8Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (lo - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return bytes;
}

function toHex(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] & 0xff;
    s += (b < 16 ? "0" : "") + b.toString(16);
  }
  return s;
}

/** SHA-1，输入字节数组，返回 20 字节摘要 */
function sha1Bytes(bytes) {
  const ml = bytes.length;
  const bitLenHi = Math.floor((ml * 8) / 0x100000000);
  const bitLenLo = (ml * 8) >>> 0;

  // padding
  const data = bytes.slice();
  data.push(0x80);
  while (data.length % 64 !== 56) data.push(0);
  data.push((bitLenHi >>> 24) & 0xff);
  data.push((bitLenHi >>> 16) & 0xff);
  data.push((bitLenHi >>> 8) & 0xff);
  data.push(bitLenHi & 0xff);
  data.push((bitLenLo >>> 24) & 0xff);
  data.push((bitLenLo >>> 16) & 0xff);
  data.push((bitLenLo >>> 8) & 0xff);
  data.push(bitLenLo & 0xff);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Array(80);
  const rotl = (n, c) => ((n << c) | (n >>> (32 - c))) | 0;

  for (let offset = 0; offset < data.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] =
        ((data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3]) | 0;
    }
    for (let i = 16; i < 80; i++) {
      w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const tmp = (rotl(a, 5) + f + e + k + w[i]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = tmp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  const out = [];
  [h0, h1, h2, h3, h4].forEach((h) => {
    out.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  });
  return out;
}

function sha1Hex(str) {
  return toHex(sha1Bytes(utf8Bytes(str)));
}

/** HMAC-SHA1，key/message 为字符串，返回十六进制（RFC 2204 结构：字节级拼接） */
function hmacSha1Hex(key, message) {
  let keyBytes = utf8Bytes(key);
  if (keyBytes.length > 64) keyBytes = sha1Bytes(keyBytes);
  keyBytes = keyBytes.slice();
  while (keyBytes.length < 64) keyBytes.push(0);
  const oKey = keyBytes.map((b) => (b ^ 0x5c) & 0xff);
  const iKey = keyBytes.map((b) => (b ^ 0x36) & 0xff);
  const innerDigest = sha1Bytes(iKey.concat(utf8Bytes(message)));
  return toHex(sha1Bytes(oKey.concat(innerDigest)));
}

module.exports = { sha1Hex, sha1Bytes, hmacSha1Hex, utf8Bytes, toHex };
