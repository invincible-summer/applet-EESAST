/* 临时校验脚本：比对小程序 COS 签名实现与官方 SDK 算法（逐行复刻自 cos-js-sdk-v5/src/util.js） */
const path = require("path");
const CryptoJS = require("/home/invincible/daily/work/EESAST/web/node_modules/cos-js-sdk-v5/lib/crypto.js");

function obj2str(obj) {
  const list = [];
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      let val = obj[key] === undefined || obj[key] === null ? "" : "" + obj[key];
      list.push(encodeURIComponent(key) + "=" + encodeURIComponent(val));
    }
  }
  return list.sort().join("&");
}

function sdkGetAuth(SecretId, SecretKey, KeyTime, method, Key, headers) {
  const pathname = "/" + Key;
  const qHeaderList = Object.keys(headers).join(";").toLowerCase();
  const signKey = CryptoJS.HmacSHA1(KeyTime, SecretKey).toString();
  const formatString = [method, pathname, obj2str({}), obj2str(headers), ""].join("\n");
  const stringToSign = ["sha1", KeyTime, CryptoJS.SHA1(formatString).toString(), ""].join("\n");
  const qSignature = CryptoJS.HmacSHA1(stringToSign, signKey).toString();
  return [
    "q-sign-algorithm=sha1",
    "q-ak=" + SecretId,
    "q-sign-time=" + KeyTime,
    "q-key-time=" + KeyTime,
    "q-header-list=" + qHeaderList,
    "q-url-param-list=",
    "q-signature=" + qSignature
  ].join("&");
}

// —— 加载 applet 的真实实现（通过导出 cos.js 源码中的 buildSignature） ——
global.wx = {
  getStorageSync: () => "",
  setStorageSync: () => {},
  removeStorageSync: () => {}
};
const fs = require("fs");
const src = fs.readFileSync(path.join(__dirname, "../miniprogram/utils/cos.js"), "utf8");
const fnSource = src.match(/function buildSignature[\s\S]*?\n}/)[0];
const { hmacSha1Hex, sha1Hex } = require("../miniprogram/utils/sha1.js");

const host = "testbucket-125000000.cos.ap-beijing.myqcloud.com";
function cosHost() {
  return host;
}
function encodePath(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}
function sortParams(params) {
  return Object.keys(params)
    .sort()
    .map((k) => k + "=" + encodeURIComponent(params[k]))
    .join("&");
}

const buildSignature = eval("(" + fnSource.replace(/^function buildSignature/, "function") + ")");

const sts = {
  tmpSecretId: "AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q",
  tmpSecretKey: "BQYIM75p8x0iWVFSIgqEKwFprpRSVH09",
  startTime: "1417773892",
  expiredTime: "1417800292",
  sessionToken: "TESTTOKEN"
};

const cases = [
  { method: "put", key: "testfile2" },
  { method: "get", key: "中文/目录/file name.pdf" },
  { method: "head", key: "a/b/c.cpp" }
];

let allOk = true;
cases.forEach((c) => {
  const expect = sdkGetAuth(sts.tmpSecretId, sts.tmpSecretKey, sts.startTime + ";" + sts.expiredTime, c.method, c.key, { host });
  const mine = buildSignature({ method: c.method, key: c.key, sts, presign: false });
  const ok = expect === mine;
  if (!ok) {
    allOk = false;
    console.log("MISMATCH for", c.method, c.key);
    console.log(" SDK :", expect);
    console.log(" MINE:", mine);
  }
});
console.log(allOk ? "*** ALL COS SIGNATURES MATCH OFFICIAL SDK ***" : "*** FAILED ***");
