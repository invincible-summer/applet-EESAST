# 当前架构

> 状态：Current
> 更新日期：2026-10-28
> 对应版本：[1.2.0-dev](../VERSION.md)

本文件描述仓库当前实现状态。架构决策的原因和取舍见 [ADR](../adr/)；用户可感知的变化见 [变更记录](../releases/CHANGELOG.md)。

## 系统边界

EESAST 小程序是现有平台的客户端，复用现有 API、Hasura GraphQL 和腾讯云 COS，不修改 `web`、`api`、`hasura` 仓库。

```
微信小程序（本仓库）
  ├─ 原生 WXML / WXSS / JavaScript
  ├─ 主包：5 个 Tab + 账号流程
  └─ 分包：contest / info / share
          │ HTTPS + Bearer JWT
          ▼
api.eesast.com
  ├─ REST：账号、导师、荣誉、课程评论、赛事操作
  └─ /v1/graphql：Hasura 查询与行级权限
          │ STS 临时凭证
          ▼
腾讯云 COS / static.eesast.com
```

小程序不接入微信 `code2session` 登录、Unity WebGL 试玩/直播、赛事管理端、广播通知和无鉴权文件上传端点。网页端能力通过提示或复制链接引导用户使用电脑端。

## 仓库结构

```
applet/
├── AGENTS.md                  # 协作与验证规范
├── README.md                  # 快速开始和项目入口
├── project.config.json        # 微信开发者工具配置
├── docs/
│   ├── README.md              # 文档入口
│   ├── VERSION.md             # 当前版本与版本规则
│   ├── TESTING.md             # 真机/开发者工具验收
│   ├── adr/                   # 架构决策记录
│   ├── architecture/         # 当前架构
│   └── releases/              # 版本变更
├── scripts/                   # 结构、绑定、签名和模块校验
└── miniprogram/
    ├── app.{js,json,wxss}     # 全局生命周期、主题和 TabBar
    ├── config/                # API、GraphQL、COS 常量
    ├── services/              # 领域 GraphQL 查询
    ├── utils/                 # request、graphql、auth、cos、poll 等
    ├── components/            # markdown、empty
    ├── pages/                 # 主包页面
    └── packages/
        ├── contest/           # 赛事详情、公告、组队、代码、榜单、对战
        ├── info/              # 导师、聊天、荣誉
        └── share/             # 课程、课程详情、Weekly
```

页面四件套和导航注册必须同步：页面文件在目录中存在，路径在 `miniprogram/app.json` 注册，页面事件处理器在同名 JS 中定义，组件引用可解析。

## 运行时分层

### 入口与状态

- `app.js` 初始化匿名或登录认证，并把当前用户摘要放到 `globalData`。
- `utils/store.js` 管理本地缓存；认证状态通过 `utils/bus.js` 的登录、退出和过期事件刷新页面。
- 页面状态使用 Page data；不引入全局状态库。

### 网络与数据

- `utils/request.js` 是 REST 唯一出口，负责 Bearer JWT、匿名 token、超时和统一错误处理。
- `utils/graphql.js` 是 GraphQL 唯一出口；`services/contest.js`、`services/portal.js` 等集中维护查询字符串。
- Web 端 Subscription 在小程序中改为页面生命周期控制的轮询：`utils/poll.js` 在 `onShow` 启动，在 `onHide` 或卸载时停止。
- `utils/cos.js` 使用后端发放的 STS 临时凭证完成上传、列表、HEAD 和预签名下载；永久密钥不进入客户端。

### 外部网页打开策略

- SAST Weekly 的线上 URL 是 `mp.weixin.qq.com/s` 公众号文章。Weekly 页面会将 `http` 链接规范化为 `https`，通过分包内的 `web-view` 页面尝试直接阅读；网页加载失败时仍可复制原链接。
- 微信官方 [`web-view` 说明](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html) 可以打开与小程序关联的公众号文章；其他网页必须在小程序后台配置业务域名。Docs、网页端赛事介绍和 Minecraft 等普通网页目前继续复制链接，不能假定所有环境都已配置业务域名。
- `utils/external-link.js` 集中维护 URL 规范化、允许域名和打开模式；`web-view` 页面只接受策略允许的 HTTPS URL，不接受任意页面参数，避免把小程序变成开放跳转器。当前线上 382 条 Weekly 全部属于公众号文章形态。
- 如果未来 Weekly 使用新的网页域名，需要同时把域名加入该策略白名单，并在小程序后台配置业务域名后再切换为内嵌打开。

## 页面与功能边界

| 区域 | 主包入口 | 分包 |
|---|---|---|
| 首页 | `pages/home/home` | — |
| 赛事 | `pages/contest/contest` | `packages/contest` |
| 信息化 | `pages/info/info` | `packages/info` |
| 资源 | `pages/share/share` | `packages/share` |
| 我的 | `pages/user/user` | 注册、找回密码在主包 |

公开赛事列表、公告和榜单允许匿名浏览；组队、代码、课程互动和个人资料需要登录；信息化平台还需要清华身份。前端做入口拦截，Hasura 行级权限和 REST 角色校验负责最终授权。

## 安全边界

- JWT 存在微信沙箱存储，验证码 token 只在页面内存中存在。
- 密码不落盘；日志、剪贴板和提交内容不能包含凭据。
- COS 仅使用短时 STS 和按前缀收敛的权限。
- Markdown 和用户输入经过现有转义/校验路径；页面不提供管理员操作。
- 不调用 `/notification/broadcast`、`/files/upload` 等已知危险端点。

## UI 与适配

- 设计 Token 位于 `app.wxss`，导航与 TabBar Token 位于 `theme.json`。
- 视觉基线与网页端 Ant Design 默认主题对齐：浅色主色 `#1677ff`、背景 `#ffffff`、文本 `rgba(0,0,0,.88)`、边框 `rgba(5,5,5,.06)`；深色背景 `#141414`、卡片 `#1f1f1f`、文本 `rgba(255,255,255,.85)`。
- 统一使用 `rpx`、`.page`、`.readable` 和安全区变量；宽屏阅读容器限制为 700px。
- `prefers-color-scheme` 驱动浅色/深色主题；首页、列表、空态和登录态共享同一套卡片、标签和按钮语义。
- 赛事墙和赛事列表在宽屏使用两列布局；窄屏收紧边距和控件高度。

## 构建与验证

项目没有 npm 构建步骤。导入仓库根目录即可预览；WSL 下使用 `scripts/devtools.sh` 同步到 Windows 盘后启动开发者工具。

提交前至少运行：

```bash
node scripts/test_structure.cjs
node scripts/test_wxml_balance.cjs
node scripts/test_bindings.cjs
node scripts/test_module_load.cjs
node scripts/test_utils.cjs
node scripts/test_cos_signature.cjs
```

更完整的真机验收步骤见 [TESTING.md](../TESTING.md)。
