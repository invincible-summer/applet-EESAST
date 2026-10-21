/**
 * 小程序工程结构校验（零依赖）
 *
 * - app.json 注册的页面是否四件套齐全（wxss 缺失仅告警）
 * - tabBar 页面是否已注册、图标文件是否存在
 * - preloadRule 引用的页面/分包是否存在
 * - wx.navigateTo / redirectTo / switchTab / reLaunch 的目标页是否已注册
 *   （switchTab 必须指向 tabBar 页面）
 * - WXML 事件处理器是否在对应 JS 中存在
 * - usingComponents 路径是否可解析
 *
 * 用法：node scripts/test_structure.cjs [miniprogram 目录]
 * 退出码：0 = 通过，1 = 有问题
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(
  process.argv[2] || path.join(__dirname, "..", "miniprogram"),
);
const app = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));

const errors = [];
const warnings = [];

const pages = [...(app.pages || [])];
const subPackages = app.subPackages || [];
for (const pkg of subPackages) {
  for (const p of pkg.pages || []) pages.push(`${pkg.root}/${p}`);
}

/* ---------- 页面文件 ---------- */
for (const page of pages) {
  for (const ext of [".js", ".json", ".wxml"]) {
    const f = path.join(ROOT, page + ext);
    if (!fs.existsSync(f)) errors.push(`缺少文件：${page}${ext}`);
  }
  if (!fs.existsSync(path.join(ROOT, page + ".wxss"))) {
    warnings.push(`无独立样式（可能复用全局）：${page}.wxss`);
  }
}

const pageSet = new Set(pages.map((p) => "/" + p));

/* ---------- tabBar ---------- */
const tabList = (app.tabBar && app.tabBar.list) || [];
const tabPages = new Set();
for (const item of tabList) {
  const p = "/" + item.pagePath;
  tabPages.add(p);
  if (!pageSet.has(p)) errors.push(`tabBar 页面未在 pages 中注册：${item.pagePath}`);
  for (const icon of [item.iconPath, item.selectedIconPath]) {
    if (icon && !fs.existsSync(path.join(ROOT, icon))) {
      errors.push(`tabBar 图标不存在：${icon}`);
    }
  }
}

/* ---------- preloadRule ---------- */
const pkgNames = new Set(subPackages.map((p) => p.name));
for (const [page, rule] of Object.entries(app.preloadRule || {})) {
  if (!pageSet.has("/" + page)) errors.push(`preloadRule 页面未注册：${page}`);
  for (const name of rule.packages || []) {
    if (!pkgNames.has(name)) errors.push(`preloadRule 引用了不存在的分包：${name}`);
  }
}

/* ---------- 遍历源码 ---------- */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const files = walk(ROOT);

/* ---------- 导航目标 ---------- */
const navRe = /wx\.(navigateTo|redirectTo|switchTab|reLaunch)\(\s*\{[\s\S]{0,200}?url:\s*[`'"]([^`'"]+)[`'"]/g;
for (const file of files) {
  if (!file.endsWith(".js")) continue;
  const src = fs.readFileSync(file, "utf8");
  let m;
  while ((m = navRe.exec(src))) {
    const api = m[1];
    const target = m[2].split("?")[0];
    if (!target.startsWith("/")) continue;
    if (!pageSet.has(target)) {
      errors.push(`${path.relative(ROOT, file)} → ${api} 目标未注册：${target}`);
    } else if (api === "switchTab" && !tabPages.has(target)) {
      errors.push(`${path.relative(ROOT, file)} → switchTab 指向非 tabBar 页面：${target}`);
    }
  }
}

/* ---------- 事件处理器 / usingComponents ---------- */
const handlerRe = /\b(?:bind|catch|capture-bind|capture-catch|mut-bind):?([a-zA-Z]+)\s*=\s*"([^"{}]+)"/g;
for (const file of files) {
  if (!file.endsWith(".wxml")) continue;
  const wxml = fs.readFileSync(file, "utf8");
  const jsPath = file.replace(/\.wxml$/, ".js");
  const js = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, "utf8") : "";
  let hm;
  const seen = new Set();
  while ((hm = handlerRe.exec(wxml))) {
    const name = hm[2];
    if (seen.has(name)) continue;
    seen.add(name);
    const defRe = new RegExp("(^|[\\s,{;])(async\\s+)?" + name + "\\s*[:(]", "m");
    if (!defRe.test(js)) {
      errors.push(`${path.relative(ROOT, file)} → 事件处理器 "${name}" 未在 ${path.basename(jsPath)} 中定义`);
    }
  }

  const jsonPath = file.replace(/\.wxml$/, ".json");
  if (!fs.existsSync(jsonPath)) continue;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch (e) {
    errors.push(`${path.relative(ROOT, jsonPath)} → JSON 解析失败`);
    continue;
  }
  for (const [name, rel] of Object.entries(cfg.usingComponents || {})) {
    const target = rel.startsWith("/")
      ? path.join(ROOT, rel)
      : path.resolve(path.dirname(jsonPath), rel);
    if (!fs.existsSync(target + ".js") && !fs.existsSync(target + ".json")) {
      errors.push(`${path.relative(ROOT, jsonPath)} → 组件 ${name}:${rel} 不存在`);
    }
  }
}

/* ---------- 输出 ---------- */
console.log(`structure: 页面 ${pages.length} 个（主包 ${(app.pages || []).length} + 分包 ${subPackages.length} 组）`);
for (const w of warnings) console.log(`  ⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log(`\n${errors.length} 个问题`);
  process.exit(1);
}
console.log("ALL STRUCTURE OK");
