/**
 * 工具模块单元校验（零依赖，纯 Node）
 * - SHA-1 / HMAC-SHA1：RFC 3174 / RFC 2202 向量
 * - JWT：正常 / 过期 / 匿名 / 畸形 / 中文 payload
 * - Markdown：块级解析 + HTML 转义 + 行内语法
 * - SSE：增量 UTF-8 解码（逐字节切分多字节字符）
 * - 赛事状态：未开始 / 进行中 / 已结束
 *
 * 用法：node scripts/test_utils.cjs
 */
const path = require("path");

const U = path.join(__dirname, "..", "miniprogram", "utils");
const { sha1Hex, hmacSha1Hex } = require(path.join(U, "sha1.js"));
const { decodeJwt, parseUser, ANONYMOUS_UUID } = require(path.join(U, "jwt.js"));
const { parseMarkdown, inlineToHtml } = require(path.join(U, "markdown.js"));
const { createUtf8Decoder } = require(path.join(U, "sse.js"));
const { contestStatus } = require(path.join(U, "format.js"));

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}`);
    console.log(`   expect: ${JSON.stringify(expected)}`);
    console.log(`   actual: ${JSON.stringify(actual)}`);
  }
}

function checkTrue(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}${detail ? "  " + detail : ""}`);
  }
}

/* ---------- SHA-1 / HMAC-SHA1 ---------- */
check("SHA1('')", sha1Hex(""), "da39a3ee5e6b4b0d3255bfef95601890afd80709");
check("SHA1('abc')", sha1Hex("abc"), "a9993e364706816aba3e25717850c26c9cd0d89d");
check(
  "SHA1(56 字节消息)",
  sha1Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
  "84983e441c3bd26ebaae4aa1f95129e5e54670f1"
);
check("SHA1(1,000,000 个 'a')", sha1Hex("a".repeat(1000000)), "34aa973cd4c4daa4f61eeb2bdbad27316534016f");
check(
  "HMAC-SHA1 RFC 2202 #1",
  hmacSha1Hex("\x0b".repeat(20), "Hi There"),
  "b617318655057264e28bc0b6fb378c8ef146be00"
);

/* ---------- JWT ---------- */
function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fake-signature`;
}
const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;

const normal = makeJwt({ uuid: "11111111-2222-3333-4444-555555555555", role: "student", exp: future });
check("JWT decode payload", decodeJwt(normal).role, "student");
check("JWT 正常登录态", parseUser(normal), {
  uuid: "11111111-2222-3333-4444-555555555555",
  role: "student",
  isLoggedIn: true,
  exp: future,
});

const anon = makeJwt({ uuid: ANONYMOUS_UUID, role: "anonymous", exp: future });
check("JWT 匿名态 isLoggedIn=false", parseUser(anon).isLoggedIn, false);

check("JWT 过期返回 null", parseUser(makeJwt({ uuid: "11111111-2222-3333-4444-555555555555", role: "student", exp: past })), null);
check("JWT 畸形返回 null", parseUser("not-a-jwt"), null);
check("JWT 中文 payload", decodeJwt(makeJwt({ uuid: ANONYMOUS_UUID, role: "学生", exp: future })).role, "学生");

/* ---------- Markdown ---------- */
checkTrue("Markdown 空输入", parseMarkdown("").length === 0);

const md = parseMarkdown("# 标题\n\n**粗体** *斜体* `code`\n\n- a\n- b\n\n```js\n1 + 1\n```");
check("Markdown 块数量", md.length, 4);
check("Markdown 标题", md[0].type, "h1");
checkTrue("Markdown 粗体", md[1].html.includes("<strong>粗体</strong>"));
checkTrue("Markdown 斜体", md[1].html.includes("<em>斜体</em>"));
checkTrue("Markdown 行内代码", md[1].html.includes('<code class="md-code">code</code>'));
check("Markdown 无序列表", md[2].type, "ul");
check("Markdown 列表项数", md[2].items.length, 2);
check("Markdown 代码块语言", md[3].lang, "js");
check("Markdown 代码块内容", md[3].text, "1 + 1");

const escaped = inlineToHtml('<script>alert("x")</script>');
checkTrue("Markdown 转义 <", escaped.includes("&lt;script&gt;"));
checkTrue("Markdown 不放行原始标签", !escaped.includes("<script>"));

const link = inlineToHtml("[文档](https://example.com/a)");
checkTrue("Markdown 链接渲染为 md-link", link.includes('class="md-link"') && link.includes("文档"));
checkTrue("Markdown 链接不生成 <a>", !link.includes("<a "));

const table = parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
check("Markdown 表格", table[0].type, "table");
check("Markdown 表头", table[0].header.length, 2);
check("Markdown 表格行", table[0].rows.length, 1);

const img = parseMarkdown("![图](https://static.eesast.com/a.png)");
check("Markdown 图片", img[0].type, "img");
check("Markdown 图片地址", img[0].src, "https://static.eesast.com/a.png");

/* ---------- SSE 增量 UTF-8 ---------- */
const text = "你好，世界 🌍 EESAST";
const bytes = Buffer.from(text, "utf8");
const decoder = createUtf8Decoder();
let out = "";
for (let i = 0; i < bytes.length; i++) out += decoder.push(new Uint8Array([bytes[i]]));
out += decoder.flush();
check("SSE 逐字节切分多字节字符", out, text);

const decoder2 = createUtf8Decoder();
const mid = Math.floor(bytes.length / 2);
check("SSE 两段切分", decoder2.push(new Uint8Array(bytes.slice(0, mid))) + decoder2.push(new Uint8Array(bytes.slice(mid))) + decoder2.flush(), text);

/* ---------- 赛事状态 ---------- */
check("赛事：已结束", contestStatus("2020-01-01T00:00:00Z", "2020-12-31T00:00:00Z"), "finished");
check("赛事：未开始", contestStatus("2099-01-01T00:00:00Z", "2099-12-31T00:00:00Z"), "not_started");
check("赛事：进行中", contestStatus("2020-01-01T00:00:00Z", "2099-12-31T00:00:00Z"), "ongoing");

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
