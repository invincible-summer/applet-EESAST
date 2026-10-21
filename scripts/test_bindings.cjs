/**
 * WXML ↔ JS 绑定一致性校验（零依赖）
 *
 * 检查两件容易在开发中悄悄写错、却只在运行时表现为「界面空白/样式不生效」的事：
 *   1. WXML 里 {{}} 引用的根字段，是否在页面/组件 JS 里声明（data/properties）或被 setData 写过；
 *   2. <template> 调用（is="x"）是否与本文件同名定义匹配，且其字段由 data="{{...src}}" 提供。
 *
 * 已知假阳性已排除：字符串字面量（如 'tag-success'）、连字符类名、wx:for 的 item/index
 * 与自定义 wx:for-item/wx:for-index 变量、<template> 定义体与 data="{{...}}" 载荷。
 *
 * 用法：node scripts/test_bindings.cjs [miniprogram 目录]
 * 退出码：0 = 通过，1 = 有问题
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(
  process.argv[2] || path.join(__dirname, "..", "miniprogram"),
);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** 取 `marker` 后第一个花括号块的直接属性名（缩进 2~6 空格） */
function blockKeys(src, marker) {
  const keys = new Set();
  let at = src.indexOf(marker);
  while (at >= 0) {
    const open = src.indexOf("{", at);
    if (open < 0) break;
    let depth = 0;
    let end = open;
    for (; end < src.length; end++) {
      if (src[end] === "{") depth++;
      else if (src[end] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const re = /^\s{2,6}([A-Za-z_$][\w$]*)\s*:/gm;
    let m;
    while ((m = re.exec(src.slice(open + 1, end)))) keys.add(m[1]);
    at = src.indexOf(marker, end);
  }
  return keys;
}

/** 表达式里的根标识符（跳过字符串字面量、模板字符串与连字符类名片段） */
function rootIdentifiers(expr) {
  const cleaned = expr
    .replace(/'[^']*'/g, " ")
    .replace(/"[^"]*"/g, " ")
    .replace(/`[^`]*`/g, " ");
  const ids = new Set();
  const re = /(^|[^.\w$\-])([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(cleaned))) {
    const after = cleaned.slice(m.index + m[0].length);
    if (/^[\w$-]/.test(after)) continue;
    ids.add(m[2]);
  }
  return ids;
}

function identifiersIn(text) {
  const ids = new Set();
  const re = /\{\{([\s\S]*?)\}\}/g;
  let m;
  while ((m = re.exec(text))) for (const id of rootIdentifiers(m[1])) ids.add(id);
  return ids;
}

const RESERVED = new Set(["item", "index", "true", "false", "null", "undefined"]);

function checkFile(wxmlPath) {
  const jsPath = wxmlPath.replace(/\.wxml$/, ".js");
  if (!fs.existsSync(jsPath)) return null;

  const src = fs
    .readFileSync(wxmlPath, "utf8")
    .replace(/<!--[\s\S]*?-->/g, "");
  const js = fs.readFileSync(jsPath, "utf8");

  // --- 页面/组件级字段 ---
  const declared = new Set([
    ...blockKeys(js, "data: {"),
    ...blockKeys(js, "properties: {"),
  ]);
  const written = new Set();
  const reSetData = /setData\(\s*\{([\s\S]{0,800}?)\}\s*\)/g;
  let ms;
  while ((ms = reSetData.exec(js))) {
    const reKey = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:|`([A-Za-z_$][\w$]*)\.[^`]*`\s*:|\[`([A-Za-z_$][\w$]*)/g;
    let mk;
    while ((mk = reKey.exec(ms[1]))) written.add(mk[1] || mk[2] || mk[3]);
  }

  // wx:for 局部变量
  const locals = new Set(RESERVED);
  let mf;
  const reItem = /wx:for-item\s*=\s*"([^"]+)"/g;
  while ((mf = reItem.exec(src))) locals.add(mf[1]);
  const reIndex = /wx:for-index\s*=\s*"([^"]+)"/g;
  while ((mf = reIndex.exec(src))) locals.add(mf[1]);

  // 模板定义体、模板 data 载荷不参与页面级检查
  const pageBody = src
    .replace(/<template\s+name="[^"]+"[^>]*>[\s\S]*?<\/template>/g, " ")
    .replace(/data="\{\{\.\.\.[^}]*\}\}"/g, " ");

  const missing = [];
  for (const id of identifiersIn(pageBody)) {
    if (locals.has(id)) continue;
    if (!declared.has(id) && !written.has(id)) missing.push(id);
  }

  // --- 模板定义与调用 ---
  const templates = new Map();
  const reTpl = /<template\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/template>/g;
  let mt;
  while ((mt = reTpl.exec(src))) templates.set(mt[1], identifiersIn(mt[2]));

  const badTemplates = [];
  const hasImport = /<import\s/.test(src);
  if (!hasImport) {
    const reIs = /<template[^>]*is="([^"]+)"/g;
    let mi;
    const seen = new Set();
    while ((mi = reIs.exec(src))) {
      const name = mi[1].replace(/\{\{[\s\S]*?\}\}/g, "").trim();
      if (name && !templates.has(name) && !seen.has(name)) {
        seen.add(name);
        badTemplates.push(`is="${name}"：本文件没有同名 <template name> 定义`);
      }
    }
  }
  for (const [name] of templates) {
    const reCall = new RegExp('<template[^>]*is="' + name + '"[^>]*>', "g");
    let mc;
    while ((mc = reCall.exec(src))) {
      const spread = mc[0].match(/data="\{\{\.\.\.([A-Za-z_$][\w$]*)/);
      if (!spread) {
        badTemplates.push(`${name}：调用处缺少 data="{{...x}}" 展开，模板内字段无来源`);
      } else if (
        !declared.has(spread[1]) &&
        !written.has(spread[1]) &&
        !locals.has(spread[1])
      ) {
        badTemplates.push(`${name}：data 源 "${spread[1]}" 未在 JS 中声明`);
      }
    }
  }

  if (!missing.length && !badTemplates.length) return null;
  return {
    file: path.relative(ROOT, wxmlPath),
    missing: [...missing].map((id) => ({ id, sample: "{{" + id + "}}" })),
    badTemplates,
  };
}

const files = walk(ROOT).filter((f) => f.endsWith(".wxml"));
const problems = files.map(checkFile).filter(Boolean);

console.log(`bindings: 检查 ${files.length} 个 WXML`);
if (!problems.length) {
  console.log("ALL BINDINGS OK");
  process.exit(0);
}
for (const p of problems) {
  console.log(`\n✗ ${p.file}`);
  for (const m of p.missing) console.log(`    ${m.sample} 未在 JS 中声明/赋值`);
  for (const t of p.badTemplates) console.log(`    <template> ${t}`);
}
console.log(`\n${problems.length} 个文件存在问题`);
process.exit(1);
