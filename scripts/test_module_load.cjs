/* 全量 JS 模块加载冒烟测试：wx/Page/App/Component 打桩后 require 所有模块 */
const fs = require("fs");
const path = require("path");

const noop = () => {};
global.wx = new Proxy(
  {
    getStorageSync: () => "",
    setStorageSync: noop,
    removeStorageSync: noop,
    request: noop,
    getSystemInfoSync: () => ({ theme: "light", pixelRatio: 2, windowWidth: 375 })
  },
  { get: (t, k) => (k in t ? t[k] : noop) }
);
global.App = noop;
global.Page = noop;
global.Component = noop;
global.Behavior = noop;
global.getApp = () => ({});
global.getCurrentInstance = () => ({});

const root = path.join(__dirname, "..", "miniprogram");
const files = [];
(function walk(dir) {
  fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".js")) files.push(p);
  });
})(root);

const failed = [];
files.forEach((f) => {
  try {
    require(f);
  } catch (e) {
    failed.push(`${path.relative(root, f)}: ${e.message}`);
  }
});

console.log(failed.length ? failed.join("\n") : `ALL ${files.length} MODULES LOADED`);
process.exit(failed.length ? 1 : 0);
