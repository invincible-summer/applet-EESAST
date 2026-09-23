/* WXML 标签闭合校验（临时脚本） */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "miniprogram");
const files = [];
(function walk(dir) {
  fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".wxml")) files.push(p);
  });
})(root);

const alwaysVoid = new Set(["import", "include", "wxs"]);
const pairable = new Set([
  "image", "input", "checkbox", "radio", "slider", "switch", "progress",
  "icon", "textarea", "camera", "live-player", "live-pusher"
]);

let issues = [];
files.forEach((f) => {
  const clean = fs.readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>'"])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(clean))) {
    const closing = m[1] === "/";
    const tag = m[2];
    const selfClose = m[4] === "/";
    if (closing) {
      if (stack.length && stack[stack.length - 1] === tag) {
        stack.pop();
      } else if (pairable.has(tag)) {
        // `<image ...></image>` 成对写法：开标签未入栈，忽略该闭合
      } else {
        issues.push(`${path.relative(root, f)}: unexpected </${tag}> (top=${stack[stack.length - 1] || "-"})`);
        break;
      }
    } else if (!selfClose && !alwaysVoid.has(tag) && !pairable.has(tag)) {
      stack.push(tag);
    }
  }
  if (stack.length) issues.push(`${path.relative(root, f)}: unclosed: ${stack.join(",")}`);
});

console.log(issues.length ? issues.join("\n") : `ALL ${files.length} WXML BALANCED`);
process.exit(issues.length ? 1 : 0);
