/**
 * COS 签名实现 × 官方 SDK 交叉校验
 *
 * 1) 始终校验内置基准向量（由 cos-js-sdk-v5 的 util.getAuth 生成，含 Signed/Presign 两种）。
 * 2) 若找到官方 SDK（COS_SDK_DIR 或 node_modules/cos-js-sdk-v5），再逐条实时比对，
 *    防止基准向量本身过期/被误改。CI 中通过 --require-sdk 强制要求 SDK。
 *
 * 用法：
 *   node scripts/test_cos_signature.cjs                    # 仅基准向量（SDK 缺失时）
 *   node scripts/test_cos_signature.cjs --require-sdk      # SDK 必须存在
 *   COS_SDK_DIR=/path/to/cos-js-sdk-v5 node scripts/test_cos_signature.cjs
 */
const fs = require("fs");
const path = require("path");

// cos.js 依赖 wx 存储 API，仅在被调用时使用；这里给个最小 stub 以便在 Node 加载
global.wx = global.wx || {
  getStorageSync: () => "",
  setStorageSync: () => {},
  removeStorageSync: () => {},
};

const { buildSignature } = require("../miniprogram/utils/cos.js");

const STS = {
  tmpSecretId: "AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q",
  tmpSecretKey: "BQYIM75p8x0iWVFSIgqEKwFprpRSVH09",
  startTime: "1417773892",
  expiredTime: "1417800292",
  sessionToken: "TESTTOKEN",
};
const HOST = "eesast-1255334966.cos.ap-beijing.myqcloud.com";
const KEY_TIME = `${STS.startTime};${STS.expiredTime}`;

// 由官方 SDK（cos-js-sdk-v5/src/util.js getAuth）生成的基准向量
const CASES = [
  { name: "put signed", method: "put", key: "testfile2", presign: false, expect: "q-sign-algorithm=sha1&q-ak=AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q&q-sign-time=1417773892;1417800292&q-key-time=1417773892;1417800292&q-header-list=host&q-url-param-list=&q-signature=edf01e775bf4d2d0769ed6a1a879a5a1bcdd0221" },
  { name: "get signed (中文键名)", method: "get", key: "中文/目录/file name.pdf", presign: false, expect: "q-sign-algorithm=sha1&q-ak=AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q&q-sign-time=1417773892;1417800292&q-key-time=1417773892;1417800292&q-header-list=host&q-url-param-list=&q-signature=0e87d4065afbf2a842a94bfa03e42c7188ae6400" },
  { name: "head signed", method: "head", key: "a/b/c.cpp", presign: false, expect: "q-sign-algorithm=sha1&q-ak=AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q&q-sign-time=1417773892;1417800292&q-key-time=1417773892;1417800292&q-header-list=host&q-url-param-list=&q-signature=910391695bafcc37c17e9ca191f0b8c45466740a" },
  { name: "put presign", method: "put", key: "testfile2", presign: true, expect: "q-sign-algorithm=sha1&q-ak=AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q&q-sign-time=1417773892;1417800292&q-key-time=1417773892;1417800292&q-header-list=&q-url-param-list=&q-signature=f8a849f0b153a0573e949f7798576f2fbf0063f1" },
  { name: "get presign (中文键名)", method: "get", key: "中文/目录/file name.pdf", presign: true, expect: "q-sign-algorithm=sha1&q-ak=AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q&q-sign-time=1417773892;1417800292&q-key-time=1417773892;1417800292&q-header-list=&q-url-param-list=&q-signature=b17658b6fb76c3b07449165332647c057b3833c5" },
  { name: "head presign", method: "head", key: "a/b/c.cpp", presign: true, expect: "q-sign-algorithm=sha1&q-ak=AKIDQjz3ltompVjBni5LitkWHFlFpwkn9U5q&q-sign-time=1417773892;1417800292&q-key-time=1417773892;1417800292&q-header-list=&q-url-param-list=&q-signature=cf732d2de4700d0f4f636bac38972a12f5e3fc1f" },
];

function findSdk() {
  const candidates = [
    process.env.COS_SDK_DIR,
    path.join(__dirname, "..", "node_modules", "cos-js-sdk-v5"),
  ].filter(Boolean);
  for (const dir of candidates) {
    const utilPath = path.join(dir, "src", "util.js");
    if (fs.existsSync(utilPath)) return { dir, utilPath };
  }
  return null;
}

function sdkAuth(util, c) {
  const opts = {
    SecretId: STS.tmpSecretId,
    SecretKey: STS.tmpSecretKey,
    KeyTime: KEY_TIME,
    method: c.method,
    Key: c.key,
  };
  if (c.presign) {
    opts.Headers = {};
    opts.ForceSignHost = false;
  } else {
    opts.Headers = { host: HOST };
  }
  return util.getAuth(opts);
}

let failed = 0;

// 1) 基准向量
for (const c of CASES) {
  const got = buildSignature({
    method: c.method,
    key: c.key,
    sts: STS,
    presign: c.presign,
  });
  if (got === c.expect) {
    console.log(`✅ ${c.name}`);
  } else {
    failed++;
    console.log(`❌ ${c.name}`);
    console.log(`   expect: ${c.expect}`);
    console.log(`   actual: ${got}`);
  }
}

// 2) 官方 SDK 实时交叉校验（可选）
const sdk = findSdk();
if (!sdk) {
  if (process.argv.includes("--require-sdk")) {
    console.log("❌ 未找到 cos-js-sdk-v5（--require-sdk 要求必须存在）");
    console.log("   安装：npm install --prefix /tmp/cos-sdk cos-js-sdk-v5 并设置 COS_SDK_DIR");
    process.exit(1);
  }
  console.log("ℹ️  未找到 cos-js-sdk-v5，跳过实时交叉校验（基准向量已通过）");
} else {
  const util = require(sdk.utilPath);
  for (const c of CASES) {
    const expect = sdkAuth(util, c);
    const got = buildSignature({
      method: c.method,
      key: c.key,
      sts: STS,
      presign: c.presign,
    });
    if (got !== expect) {
      failed++;
      console.log(`❌ SDK 不一致：${c.name}`);
      console.log(`   sdk:    ${expect}`);
      console.log(`   actual: ${got}`);
    }
  }
  console.log(
    failed === 0
      ? `✅ 与官方 SDK 逐字节一致（${CASES.length} 组，${sdk.dir}）`
      : "❌ SDK 交叉校验存在差异",
  );
}

if (failed) {
  console.log(`\n失败 ${failed} 项`);
  process.exit(1);
}
console.log("\nALL COS SIGNATURES OK");
