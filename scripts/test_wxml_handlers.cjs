/* WXML 事件绑定 ↔ JS 处理器存在性 + usingComponents 路径校验 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "miniprogram");
const wxmlFiles = [];
const jsonFiles = [];
(function walk(dir) {
  fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".wxml")) wxmlFiles.push(p);
    else if (f.endsWith(".json")) jsonFiles.push(p);
  });
})(root);

// bind:tap / bindtap / catch:tap / catchtap / mut-bind: / capture-bind: / capture-catch:
const EVENT_RE = /(?:bind|catch|mut-bind|capture-bind|capture-catch):?([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;

let issues = [];

wxmlFiles.forEach((f) => {
  const src = fs.readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const jsPath = f.replace(/\.wxml$/, ".js");
  const js = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, "utf8") : null;
  let m;
  EVENT_RE.lastIndex = 0;
  while ((m = EVENT_RE.exec(src))) {
    const handler = m[2].trim();
    // 绑定值必须是简单标识符（不含 {{ }} 表达式）
    if (!/^[A-Za-z_$][\w$]*$/.test(handler)) {
      issues.push(`${path.relative(root, f)}: 非简单处理器表达式 bind${m[1]}="${handler}"`);
      continue;
    }
    if (!js) {
      issues.push(`${path.relative(root, f)}: 缺少同名 JS 文件（bind${m[1]}="${handler}"）`);
      continue;
    }
    // 方法定义形式：name() { / name: function / name: (...)=>
    const defRe = new RegExp(`(^|[^\\w$.])${handler}\\s*[:(]`, "m");
    if (!defRe.test(js)) {
      issues.push(`${path.relative(root, f)}: 悬空处理器 bind${m[1]}="${handler}"（JS 中未定义）`);
    }
  }
});

jsonFiles.forEach((f) => {
  let conf;
  try {
    conf = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {
    issues.push(`${path.relative(root, f)}: JSON 解析失败`);
    return;
  }
  const uc = conf && conf.usingComponents;
  if (!uc || typeof uc !== "object") return;
  Object.keys(uc).forEach((tag) => {
    const ref = uc[tag];
    const base = ref.startsWith("/")
      ? path.join(root, ref.slice(1))
      : path.resolve(path.dirname(f), ref);
    [".js", ".json", ".wxml"].forEach((ext) => {
      if (!fs.existsSync(base + ext)) {
        issues.push(`${path.relative(root, f)}: usingComponents "${tag}" 缺少 ${path.basename(base + ext)}`);
      }
    });
  });
});

console.log(issues.length ? issues.join("\n") : `ALL ${wxmlFiles.length} WXML HANDLERS RESOLVED`);
process.exit(issues.length ? 1 : 0);
