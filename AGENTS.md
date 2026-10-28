# EESAST applet 协作规范

## 适用范围

本文件适用于仓库根目录及其所有子目录。这个仓库只包含 EESAST 微信小程序客户端：

- 小程序代码位于 [miniprogram/](./miniprogram/)。
- 工程配置位于 [project.config.json](./project.config.json)。
- 校验脚本位于 [scripts/](./scripts/)。
- 工程文档位于 [docs/](./docs/)。
- 同级目录中的 `web`、`api`、`hasura` 属于其他仓库，禁止在本仓库任务中修改。

## 工程约定

### 页面与分包

- 页面必须在 `miniprogram/app.json` 中注册；主包页面和分包页面保持与目录一致。
- 页面新增或修改时，至少同步维护 `.js`、`.json`、`.wxml`；页面专属样式放在同名 `.wxss`。
- 五个底部 Tab 页面必须留在主包：`pages/home`、`pages/contest`、`pages/info`、`pages/share`、`pages/user`。
- 赛事、信息化、资源的深层页面分别放在 `packages/contest`、`packages/info`、`packages/share`。
- 页面导航、TabBar、预加载规则和组件路径修改后，必须运行结构校验。

### JavaScript 与网络

- 项目保持原生 WXML/WXSS/JavaScript 和零 npm 依赖；不要引入构建链或第三方运行时，除非先记录 ADR。
- REST 请求统一经过 `miniprogram/utils/request.js`；GraphQL 查询集中在 `miniprogram/services/` 并经过 `utils/graphql.js`。
- 认证、角色判断和 COS 操作分别复用现有 `utils/auth.js`、`utils/request.js`、`utils/cos.js`，不要在页面内复制协议逻辑。
- 不在代码、日志、剪贴板或文档中写入永久密钥、密码、JWT 或 COS Secret；临时凭证只在内存中使用。
- 小程序客户端权限判断只能改善体验，不能替代后端权限；不要接入文档列出的危险端点。

### WXSS 与交互

- 全局设计 Token 只在 [miniprogram/app.wxss](./miniprogram/app.wxss) 和 [miniprogram/theme.json](./miniprogram/theme.json) 维护。
- 尺寸、间距、字号优先使用 `rpx`；页面使用 `.page`、`.readable` 等现有布局工具类。
- 新组件必须同时考虑浅色、深色、窄屏、宽屏和安全区；可点击元素要有明确的按压反馈。
- 公共空态、Markdown 渲染和加载状态优先复用 `miniprogram/components/`。

## 文档规范

- [docs/architecture/README.md](./docs/architecture/README.md) 描述当前实现状态；实现变化后同步更新。
- [docs/adr/](./docs/adr/) 记录会影响结构、协议、安全或运行方式的决策。文件使用四位序号和短横线名称，例如 `0004-cos-storage.md`；ADR 一旦采纳只追加后续决策，不改写历史结论。
- [docs/VERSION.md](./docs/VERSION.md) 是当前版本和版本规则的入口。
- [docs/releases/CHANGELOG.md](./docs/releases/CHANGELOG.md) 记录用户可感知的版本变化。
- [docs/TESTING.md](./docs/TESTING.md) 记录开发者工具和真机验收步骤。
- README 只保留项目入口、运行方式和文档链接；详细设计放在 docs 下。

## 本地验证

在提交前，从仓库根目录运行：

```bash
node scripts/test_structure.cjs
node scripts/test_wxml_balance.cjs
node scripts/test_bindings.cjs
node scripts/test_module_load.cjs
node scripts/test_utils.cjs
node scripts/test_cos_signature.cjs
find miniprogram -name '*.js' -print0 | xargs -0 -n1 node --check
```

同时检查所有 JSON 可解析、`git diff --check` 通过，并确认没有把 `project.private.config.json` 或其他本地凭据加入提交。

## 微信开发者工具

- 导入仓库根目录，而不是只导入 `miniprogram/`。
- 以 `project.config.json` 的 `miniprogramRoot` 为准。
- WSL 下使用 `scripts/devtools.sh`；脚本会把当前 applet 工程镜像到 Windows 盘后调用 CLI。工具的服务端口需要在「设置 → 安全设置」中开启。
- 开发者工具中的「不校验合法域名」只用于本地调试，发布前必须关闭并配置正式域名。

## 提交与审查

- 一个提交只解决一个主题；提交消息使用简短的动词短语，例如 `fix: handle missing playback`。
- 不要提交生成物、缓存、测试账号、临时二维码或开发者工具私有配置。
- 修改接口、权限、分包边界、存储策略或设计 Token 时，要在同一变更中补充对应 ADR 或架构文档。
- Pull Request 描述应包含行为变化、影响范围和已运行的验证命令。
