# EESAST 微信小程序（applet）设计文档

> 版本：v1.0 ｜ 日期：2026-09-23
> 本仓库为独立新增仓库，**不修改**同目录下 `web`、`api`、`hasura` 三个原有仓库的任何内容。

---

## 1. 项目背景与目标

EESAST（清华大学电子工程系学生科协）现有平台由三个仓库组成：

| 仓库 | 技术栈 | 职责 |
|---|---|---|
| `web` | React 18 + Antd + Apollo + styled-components | 门户前端 `https://eesast.com`（HashRouter） |
| `api` | Express + TypeScript + graphql-request + 腾讯云 COS | 业务 REST API `https://api.eesast.com`（认证/文件/竞赛/导师/荣誉/课程/LLM 等） |
| `hasura` | Hasura GraphQL Engine + PostgreSQL | 数据层 `https://api.eesast.com/v1/graphql`，53 张表，行级权限 |

目标：构建一个**微信小程序**，把 EESAST 网站的主要功能以符合微信交互习惯、适配多种屏幕尺寸的方式呈现给用户，复用现有后端 API 与数据，不改动任何原有仓库。

### 1.1 原有系统调研结论（支撑后续设计）

**子站与功能全景（web）**

```
eesast.com
├─ /home    HomeSite   轮播新闻、部门展示、赛事展示墙（静态数据）
├─ /contest ContestSite 赛事列表/详情/时间线/公告、组队(邀请码)、代码提交
│                      (THUAI上COS+编译、SOFT/RL链接)、天梯榜、对战记录、
│                      管理端(赛事编辑/开赛/地图/公告管理)
├─ /info    InfoSite   [需清华身份 student/teacher/counselor]
│                      门户公告、新生导师制(申请/谈话记录/私信)、
│                      荣誉(奖学金)申请
├─ /share   ShareSite  课程评测(评论/点赞/收藏/六维评分)、SAST Weekly、
│                      部门/赛事介绍、Minecraft 等
├─ /user    UserSite   登录/注册(邮箱验证码)/找回密码/个人资料/注销
└─ /chat    LLMChat    多会话大模型对话(SSE 流式, 配额管理)
```

**认证机制（api）**
- 登录方式：用户名/邮箱（+历史手机号）+ 密码，`POST /user/login` → JWT（24h）
- JWT payload：`{uuid, role, "https://hasura.io/jwt/claims": {x-hasura-allowed-roles / default-role / user-id}, exp}`，同一 token 可直接访问 Hasura GraphQL（行级权限）
- 注册/找回密码：`POST /user/send-code` 发邮箱验证码（返回 10min 短 JWT，内含 bcrypt 哈希）→ `/user/verify` → `/user/register` / `/user/change-password`
- 匿名：`GET /user/anonymous` → 匿名 JWT（uuid 全零）
- **无 refresh token**：过期需重新登录；**无微信登录接口**（后端无 code2session 逻辑，且本项目禁止修改后端）

**角色体系**：`anonymous / user / student / teacher / counselor`（+ 隐式 admin；赛事管理员由 `contest_manager` 表按行级控制）
- `userRoles = [user, student, teacher, counselor]`：组队、代码提交等
- `tsinghuaRoles = [student, teacher, counselor]`：整个信息化平台
- `counselor`：门户公告管理、荣誉审批、导师制管理

**文件存储**：腾讯云 COS（bucket `eesast-1255334966`，region `ap-beijing`），后端 `GET /static/{prefix}` 按路径前缀+角色发放 **STS 临时密钥**（返回 `{credentials:{tmpSecretId,tmpSecretKey,sessionToken}, startTime, expiredTime}`），前端用临时密钥直传 COS。静态资源 CDN：`https://static.eesast.com`。

**实时能力**：Web 端用 GraphQL Subscription（编译状态、对战房间）；小程序侧以**轮询**替代（见 §5.4）。

### 1.2 调研中发现的原系统安全隐患（小程序侧规避）

调研中发现原系统存在若干安全隐患（详见 §6.5），小程序在**不修改原仓库**的前提下，通过客户端设计规避：
- `users` 表对 anonymous 开放 select（含 email/phone 列）→ 小程序**不提供**任意用户信息检索界面，仅查本人资料；列表类数据集只取必要字段。
- `/notification/broadcast` 无鉴权 → 小程序不接入该端点。
- `/files/upload` 无鉴权 → 小程序不接入该端点。
- Web 端 token 存 localStorage（XSS 可读）→ 小程序改存微信沙箱存储（见 §6.1）。

---

## 2. 微信小程序构建方法调研

### 2.1 技术路线对比

| 方案 | 说明 | 优势 | 劣势 | 结论 |
|---|---|---|---|---|
| **原生小程序**（WXML/WXSS/JS） | 微信官方框架 | 100% 贴合小程序能力（分包、tabBar、暗色模式、chunked 流式请求）；零构建链；任何版本开发者工具可直接打开 | 无法复用 React 代码 | **✅ 采用** |
| Taro 3/4（React DSL） | 跨端编译到微信/支付宝/H5 | 可复用 web 的 React 组件思路与 TS 类型 | Antd/styled-components 无法直接复用，仍需重写 UI；引入 webpack 构建链与版本耦合风险 | ✗ |
| uni-app（Vue DSL） | 跨端 | 生态大 | 同上，且团队无 Vue 代码可复用 | ✗ |
| web-view 套壳 | 小程序内嵌 eesast.com | 开发量最小 | 需配置业务域名且域名须主体校验；体验差；Unity/桌面交互在小屏不可用；本质不是"小程序化" | ✗ |

**结论：原生小程序 + CommonJS 模块化 + 零 npm 依赖。**
理由：① 本项目是"功能呈现"而非"代码移植"，Web 端组件（Antd/Apollo/Unity）均无法直接复用，跨端框架无收益；② 原生对小程序独有能力（`enableChunked` SSE、分包、`darkmode`、rpx）支持最直接；③ 零依赖意味着克隆即可在微信开发者工具打开运行，无 `npm install`/构建步骤。

### 2.2 关键平台约束（影响设计的硬性规则）

1. **服务器域名白名单**：小程序正式运行时，`wx.request`/`wx.uploadFile`/`wx.downloadFile` 只能访问在小程序管理后台配置过的**https 已备案域名**。本项目需配置（见 §7.4 部署清单）。
2. **包体限制**：主包 ≤ 2MB（启用分包时单个分包 ≤ 2MB，总包 ≤ 30MB）→ 采用**分包加载**。
3. **tabBar 页必须在主包**，tabBar 2~5 个，iconPath 仅支持本地 png。
4. **无 DOM/无 TextDecoder/无 fetch**：SSE 流式需用 `wx.request({enableChunked:true})` + `onChunkReceived`（ArrayBuffer），自写增量 UTF-8 解码器。
5. **WebSocket 可用**（`wx.connectSocket`），但 graphql-ws 协议需自行实现且后台连接易被回收 → 实时数据用**页面级轮询**，成本更低更稳。
6. **CORS 不适用**：小程序非浏览器，服务端 CORS 白名单（`eesast.com` 等）不拦截小程序请求；真正门槛是上述域名白名单。
7. **微信登录需后端改造**（`code2session` + AppSecret），受"禁止修改原仓库"约束 → v1 使用**账号密码登录**（见 §6.2）。
8. **个人隐私合规**：收集邮箱/学号/姓名需在小程序后台申报《用户隐私保护指引》；`wx.getPrivacySetting` 处理授权弹窗（基础库 2.32.3+）。

### 2.3 屏幕适配调研（结论）

- **rpx 基准**：`750rpx = 屏幕宽度`，所有间距/字号用 rpx，天然等比缩放（iPhone SE ~ iPad）。
- **宽屏优化**：阅读型页面（公告、课程、聊天）设 `max-width: 700px; margin: 0 auto`，避免平板/折叠屏上行宽过长。
- **安全区**：自定义导航与底部操作栏用 `env(safe-area-inset-bottom)` 适配全面屏；`onWindowResize`/媒体查询处理折叠屏与分屏。
- **深色模式**：`app.json` 声明 `"darkmode": true` + `theme.json` 定义 `@navBgColor` 等变量，WXSS 用 CSS 变量（`prefers-color-scheme` 媒体查询在小程序中生效）双主题一套代码。
- **字号/触控**：正文 ≥ 28rpx（≈14px），可点区域 ≥ 88rpx 高，符合移动端可读性与触控标准。

---

## 3. 总体架构

```
┌───────────────────────────────────────────────┐
│              微信小程序（本仓库 applet）          │
│  原生框架 · 主包 + 4 分包 · 深色模式 · rpx 适配    │
│                                              │
│  utils: request / graphql / auth / cos /      │
│         markdown / sse / poll / format        │
└──────────────┬────────────────────────────────┘
               │ HTTPS (wx.request, Bearer JWT)
               ▼
   ┌────────────────────────────────────┐
   │ api.eesast.com（现有，零改动）        │
   │ ├─ /v1/graphql  → Hasura(行级权限)   │
   │ └─ /user /team /code /arena /       │
   │      /application /notice /course / │
   │      /share /weekly /llm /static    │
   └───────┬───────────────────┬────────┘
           │ STS 临时密钥        │
           ▼                   ▼
   腾讯云 COS 直传/下载    static.eesast.com 静态资源
```

**架构原则**
1. **零后端改动**：小程序是现有 API 的一个新客户端；所有鉴权、行级权限、开关控制仍在服务端强制执行，客户端拦截只是体验层。
2. **协议对齐**：REST/GraphQL 请求体与 web 端逐字段对齐（query 直接复刻 `web/src/graphql/*.graphql`）。
3. **单一请求出口**：所有网络请求经 `utils/request.js`（token 注入、401 统一降级、错误规范化），GraphQL 经 `utils/graphql.js`。

---

## 4. 功能范围（网站主要功能 → 小程序映射）

### 4.1 v1 实现（本仓库交付）

| 网站 功能 | 小程序呈现 | 数据源 |
|---|---|---|
| 首页轮播/部门/赛事展示墙 | 首页 tab：轮播 + 部门横滑 + 赛事墙 + 快捷入口 | 静态配置（与 web 同源数据）+ static CDN 图片 |
| 赛事列表 | 赛事 tab：卡片（名称/描述/起止/状态） | GraphQL `GetContests` |
| 赛事详情（介绍/倒计时/时间线/统计） | 分包详情页 + 段落 tabs | `GetContestInfo/Times/Switch`、统计聚合、REST `/team/member_limit` |
| 赛事公告（列表/正文/附件） | 公告列表 + Markdown 详情 + 附件下载 | `GetContestNotices`、COS 下载 |
| 组队（创建/邀请码加入/队伍管理/退出解散） | 组队页（未入队=创建/加入，已入队=管理） | `AddTeam`/`UpdateTeam`/`DeleteTeam(Member)`、REST `/team/*` |
| 代码提交（THUAI 上传+编译状态；SOFT/RL 链接） | 代码页按赛事类型三套 UI | `GetTeamCodes`(轮询) + `compile-start` + COS 直传；REST `/competition/*` |
| 天梯积分榜 / RL 积分榜 | 积分榜页（排名/队伍/分值，THUAI/RL 两视图） | `getTeams` / `GetRLScores` |
| 对战记录（房间/比分/回放下载） | 对战记录页（轮询刷新房间） | `GetArenaRooms`(轮询) + COS 回放下载 |
| 信息化公告（5 类） | 信息化 tab：分类 + 列表 + Markdown 详情 | `GetNotices`(info_notice) |
| 新生导师制（学生） | 分包导师页：导师列表/时间表/我的申请/提交与修改/谈话记录 | REST `/application/info/mentor/*` |
| 导师-学生私信 | 分包聊天页（轮询消息 + 发送） | `GetApprovedMentorApplications`、`mentor_message`、REST `/chat/send` |
| 荣誉（奖学金）申请（学生） | 分包荣誉页：时间表/类型/我的申请/提交(陈述+附件)/撤销 | REST `/application/info/honor`、`honor_application` CRUD、COS 上传 |
| 课程评测（列表/详情/评论/点赞收藏/六维评分） | 分包课程页 + 详情页（评分滑条 + 评论楼中楼） | `course`/`course_rating` GraphQL、REST `/course/comments/*` |
| SAST Weekly | 分包 Weekly 列表（标题/日期/标签 + 复制链接） | `GetWeekly` |
| LLM 大模型对话 | 分包对话页：多会话(本地存储)、模型选择、SSE 流式、配额显示 | `llm_list` GraphQL、REST `/llm/status`、`/llm/chat`(chunked) |
| 登录/注册/找回密码 | 我的 tab：登录表单；分包注册向导(身份→邮箱→验证码→信息→密码)；重置密码页 | `/user/login /send-code /verify /register /change-password` |
| 个人资料（查看/编辑/头像上传/换绑邮箱/注销） | 我的 tab（已登录态）：资料编辑、头像裁剪上传、修改密码、注销、退出 | `GetProfile`、`/user/update /edit-profile /delete`、COS |
| 院系/班级数据 | 表单下拉 | `department`/`classes` GraphQL |

### 4.2 v1 明确不做（及原因）

| 功能 | 原因 | 替代方案 |
|---|---|---|
| Unity WebGL 试玩/直播/在线回放 | 小程序不支持 Unity WebGL；web-view 需业务域名 | 详情页提供"去网页端"复制链接 |
| 赛事管理端（开赛/地图/开关/导出） | 管理操作低频、重表格交互，移动端体验差 | 提示前往网页端管理 |
| 微信一键登录 | 需后端新增 `code2session`，禁止改原仓库 | v1 账号密码登录；预留 `utils/auth.js` 扩展点（§6.2） |
| Web Push 消息订阅 | 小程序无 Web Push；模板消息需服务端改造 | v1 不做；后续可用订阅消息（需后端配合） |
| 门户公告发布/管理（counselor） | 管理端统一走网页 | 仅保留查看 |
| 导师/辅导员管理视图 | 低频重管理 | 仅实现学生视图（最高频） |

---

## 5. 技术设计

### 5.1 工程结构

```
applet/
├── DESIGN.md                 # 本文档
├── README.md                 # 使用/部署说明
├── project.config.json       # 开发者工具项目配置（miniprogramRoot: miniprogram/）
├── sitemap.json
├── scripts/gen_tab_icons.py  # tabBar 图标生成脚本（产物已入库）
└── miniprogram/
    ├── app.js / app.json / app.wxss / theme.json
    ├── config/index.js       # API_BASE / GRAPHQL / STATIC / COS 常量
    ├── assets/               # logo、tab 图标
    ├── data/                 # 首页静态数据（news/divisions/displayWall，与 web 同源）
    ├── utils/                # request/graphql/auth/cos/sha1/markdown/sse/poll/format
    ├── components/           # markdown / empty / loading / tag / section 等通用组件
    ├── pages/                # 主包页面（tab 页 + 登录注册）
    └── packages/             # 分包
        ├── contest/          # intro / notice / notice-detail / team / code / score / arena
        ├── info/             # mentor / mentor-chat / honor
        ├── share/            # course / course-detail / weekly
        └── chat/             # chat（LLM）
```

**分包与预加载**（主包预算 < 500KB，图标全部本地、CDN 图片不打包）：

```jsonc
// app.json（节选）
"pages": ["pages/home/home","pages/contest/contest","pages/info/info",
          "pages/share/share","pages/user/user",
          "pages/register/register","pages/reset/reset"],
"subPackages": [
  {"root":"packages/contest","pages":[...]},
  {"root":"packages/info","pages":[...]},
  {"root":"packages/share","pages":[...]},
  {"root":"packages/chat","pages":[...]}
],
"preloadRule": { "pages/contest/contest": {"network":"all","packages":["packages/contest"]} }
```

### 5.2 网络层

**REST（`utils/request.js`）**
- 封装 `request({url, method, data, auth=true, ...})` → Promise
- 自动注入 `Authorization: Bearer <token>`；匿名态自动先取 `/user/anonymous` 匿名 token（与 web 行为一致，保证 Hasura 匿名角色可读公开数据）
- 统一错误规范：`{statusCode, message}`；401 → 清 token → 发全局 `auth:expired` 事件 → 跳登录；403 → 提示无权限；网络错误 → 提示重试
- 超时 15s；**release 模式禁用** console 日志输出 token

**GraphQL（`utils/graphql.js`）**
- `gql(query, variables)` 单入口 POST `/v1/graphql`
- Query 字符串集中管理（`services/*.js`），与 `web/src/graphql/*.graphql` 字段一一对应
- 返回 `errors` 时抛出带 `extensions` 的错误；`data` 直接返回

**轮询器（`utils/poll.js`）**
- `createPoller(fn, interval)`：`onShow` 启动 / `onHide` 暂停，页面卸载自动清理；替代 Web 的 Subscription（编译状态 5s、对战房间 10s、私信 8s）

### 5.3 文件存储（`utils/cos.js` + `utils/sha1.js`，零依赖实现 COS XML API）

- **临时凭证**：按操作前缀 `GET /static/{prefix}` 取 STS（与 web 相同的权限收敛：avatar/比赛公告附件只读/队伍代码读写等由服务端判定）
- **签名**：纯 JS 实现 SHA-1 + HMAC-SHA1，生成 COS 请求头签名
  `q-sign-algorithm=sha1&q-ak=…&q-sign-time=…&q-key-time=…&q-header-list=host&q-url-param-list=&q-signature=…`，并携带 `x-cos-security-token`
- **上传**：`FileSystemManager.readFile` → ArrayBuffer → `wx.request PUT https://eesast-1255334966.cos.ap-beijing.myqcloud.com/{key}`
  - 代码：`{比赛名}/code/{team_id}/…`；头像：`avatar/{uuid}/avatar_*.png`；荣誉附件：`honor_application/{uuid}/{year}/…`（均与 web 路径约定一致）
- **下载/预签名 URL**：同算法对 GET 生成带签名的临时 URL（默认 2h），用于附件下载（`wx.downloadFile` + `wx.openDocument`）与图片展示
- **凭证缓存**：按 prefix 缓存 STS 至 `expiredTime - 60s`，避免重复申请

### 5.4 LLM 流式对话（`utils/sse.js`）

- `wx.request({url: /llm/chat, enableChunked: true, responseType: 'arraybuffer'…})`
- `onChunkReceived` 收 ArrayBuffer → **增量 UTF-8 解码器**（跨 chunk 多字节安全）→ 按行解析 `data: {json}` / `data: [DONE]`（SSE）
- 回调上屏 `content`/`reasoning`（深度思考折叠块）；`abort` 支持（RequestTask.abort 保留半截回答）
- 认证：与 web 一致 `llmToken = base64(uuid)`；401/402/403/429 分别提示（重置/配额超限/无权限/限流）
- 会话保存于本地存储 `llm_sessions_{uuid}`（与 web localStorage 语义一致，微信侧为沙箱存储）

### 5.5 Markdown 渲染（`utils/markdown.js` + `components/markdown`）

公告/赛事简介/荣誉陈述为 Markdown。自研轻量解析器：
- 块级：标题 h1-h4、无序/有序列表、代码块、引用、分割线、表格（转简单网格）、图片、段落
- 行内：`**粗** *斜* \`code\``、链接（显示为可复制文本）、自动转义 HTML
- 块级用原生 WXML 渲染（长列表性能好、可点击复制），行内富文本转有限 HTML 交给 `rich-text`
- 图片走预签名 URL 或 CDN 域名，自动限宽

### 5.6 状态管理

不引入状态库。两级方案：
- **全局**：`app.globalData`（token、用户信息、主题）+ 事件总线（`auth:expired`、`auth:login`、`auth:logout`）
- **页面**：Page data + 组件 properties；跨页刷新用事件总线（如登录后"我的"页刷新）

---

## 6. 数据安全与权限设计

### 6.1 凭证安全

| 风险 | 设计 |
|---|---|
| token 泄露 | JWT 仅存微信小程序**沙箱存储**（`wx.setStorageSync`，每个小程序独立隔离、非 root 不可导出），不写入任何日志/剪贴板；release 构建移除调试输出 |
| token 过期 | 解析 `exp`（自实现 JWT payload base64 解码，**不引第三方库**）；过期/无效 → 静默降级匿名 token（只读浏览不受影响），写操作再引导登录 |
| 传输 | 全部 `https`；不降级、不允许 `urlCheck:false` 提交该配置 |
| 密码 | 密码仅在登录/改密请求体中出现（bcrypt 在服务端），本地**绝不**存储明文密码；登录表单不提供"记住密码" |
| 验证码 JWT | 与 web 一致：10min 短 token，仅存内存（页面级变量），不落盘 |
| COS | 只用 STS 临时密钥（≤2h、按前缀最小授权），密钥只在内存；预签名 URL 短时效；**无任何永久密钥进入客户端** |
| 注销 | `POST /user/delete` 成功后立即清空 storage 中 token/用户/LLM 会话并回首页 |

### 6.2 认证与账号

- 登录：`/user/login`（用户名/邮箱）；登录态 = JWT 有效期 24h（服务端语义，客户端不续签）
- 前端路由守卫对齐 web：`userRoles`（组队/代码/课程评论…）与 `tsinghuaRoles`（信息化平台入口）两级；守卫仅做体验拦截，**真正权限由后端 Hasura 行级权限强制**（即使客户端被绕过，越权请求仍被服务端 401/403 拒绝）
- 微信登录：v1 不做。`utils/auth.js` 预留 `wxLogin()` 接口位，后续若 api 仓库愿意新增 `POST /user/wechat-login`（code→session_key→绑定 uuid），客户端仅需 ~50 行改动

### 6.3 权限映射（客户端拦截 + 服务端强制双闸）

| 模块 | 客户端拦截 | 服务端强制（现有） |
|---|---|---|
| 赛事浏览/公告/榜单 | 无（匿名可读） | Hasura anonymous select |
| 组队/代码/对战记录 | 未登录 → 引导登录 | Hasura user 角色 + 队伍成员行级过滤 |
| 信息化平台全部 | 非 tsinghuaRoles → Forbidden 页 + 引导升级（清华邮箱认证） | `/info` REST `authenticate(student/teacher/counselor)` + Hasura |
| 荣誉申请读写 | 仅 student 本人 | Hasura `(student_uuid == user-id)` 行级 + REST 校验 |
| 导师私信 | 仅配对双方 | `mentor_message` from/to 行级过滤 |
| 课程评论/评分 | 登录（courseRoles） | REST `authenticate` |
| LLM | 登录 + 配额 | `/llm/*` quota/限流 |

### 6.4 输入与内容安全

- 所有用户输入（队名/简介/评论/申请陈述）前端长度与格式校验 + 提交前后端校验；渲染用户内容一律过 Markdown 转义（防 HTML 注入，rich-text 白名单标签）
- 不做任何客户端"管理员判断即放行"逻辑；管理入口不呈现

### 6.5 已识别原系统隐患的规避清单（不改原仓库的前提下）

1. `/notification/broadcast`、`/files/upload`、`/docs/get_video_link`：小程序**不调用**。
2. `users` 表匿名可查（含 email/phone）：小程序查询一律限定本人 uuid 或仅取展示必需字段（用户名/真实姓名），不提供全局用户搜索。
3. `static.ts` 模块级变量并发串号风险：客户端对同一前缀的 STS 请求做**串行化 + 缓存**，降低触发面。
4. `course_comment` 无行级 update/delete 限制（同角色可改他人评论）：小程序仅开放"编辑/删除**自己**评论"入口，操作前比对本地 uuid 与评论作者。

---

## 7. UI / 适配设计

### 7.1 信息架构（5 tab）

```
[首页]      [赛事]        [信息化]      [资源]        [我的]
 轮播        赛事卡片列表   公告分类列表   资源导航       未登录:登录表单
 部门横滑    →详情分包页    →导师/荣誉    →课程评测      已登录:资料/头像/
 赛事墙      (介绍/公告/    分包页        →Weekly      改密/注销/退出
 LLM入口     组队/代码/                  →LLM对话
             榜单/对战)
```

### 7.2 视觉规范

| Token | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `--brand` | `#4F46E5` | `#818CF8` | 主色（靛蓝，科技感，与 EESAST 紫蓝调性一致） |
| `--brand-grad` | `#4F46E5→#7C3AED` | 同左 | 渐变强调（卡片头/按钮） |
| `--bg` | `#F5F6FA` | `#0F1115` | 页面背景 |
| `--card` | `#FFFFFF` | `#1A1D24` | 卡片 |
| `--text` | `#1F2329` | `#E5E7EB` | 主文本 |
| `--text-2` | `#6B7280` | `#9CA3AF` | 次文本 |
| `--border` | `#EBEDF2` | `#2A2E38` | 分隔线 |
| success/warn/danger | `#10B981/#F59E0B/#EF4444` | 同左 | 状态 |

- 字号：页面标题 40rpx / 卡片标题 32rpx / 正文 28rpx / 辅助 24rpx；行高 1.6
- 圆角 16rpx、卡片投影轻量（深色模式关闭投影改描边）
- 状态色映射：未开始(灰)/进行中(绿)/已结束(灰蓝)；编译状态等待/编译中/成功/失败

### 7.3 响应式策略（不同屏幕）

1. **rpx 全覆盖**：布局、间距、字号全部 rpx（iPhone SE 320pt ~ 大屏等比）
2. **宽屏断点**：`@media (min-width: 600px)` 时阅读容器 `max-width:700px; margin:0 auto`；列表改两列网格（首页赛事墙、赛事列表）
3. **安全区**：底部按钮 `padding-bottom: calc(16rpx + env(safe-area-inset-bottom))`
4. **深色模式**：`darkmode:true` + `theme.json`（导航栏/TabBar 跟随系统），WXSS CSS 变量双套
5. **横屏/折叠屏**：未锁定方向，布局均为纵向流式 + 弹性容器，天然兼容

---

## 8. 开发计划（里程碑）

| # | 里程碑 | 内容 | 产出 |
|---|---|---|---|
| M0 | 调研 | 三仓库功能/API/权限调研；小程序构建方法调研 | 本文档 |
| M1 | 骨架 | 仓库/工程配置/主题/网络层/COS/工具库/tab 图标 | 可运行的空壳（tab 导航） |
| M2 | 主包 | 首页、赛事列表、信息化公告、资源导航、登录/注册/找回/我的 | 核心浏览+账号闭环 |
| M3 | contest 分包 | 详情/公告/组队/代码/榜单/对战记录 | 赛事闭环（不含管理端） |
| M4 | info 分包 | 导师申请/导师聊天/荣誉申请 | 信息化闭环（学生视图） |
| M5 | share+chat 分包 | 课程评测/详情/Weekly/LLM 对话 | 全功能覆盖 |
| M6 | 验证 | 全量 JS `node --check`、JSON 校验、真机预览清单、README | 可交付仓库 |

---

## 9. 部署与运维前提（上线前需管理员操作，均不涉及改代码）

1. 注册小程序（建议企业/组织主体，类目：教育>在线教育 或 工具），取得 AppID，替换 `project.config.json` 的 `touristappid`
2. 小程序后台配置**服务器域名**（request 合法域名）：
   - `https://api.eesast.com`（REST + GraphQL）
   - `https://eesast-1255334966.cos.ap-beijing.myqcloud.com`（COS 直传，request）
   - `https://static.eesast.com`（静态图片，若用 downloadFile 需另加 downloadFile 域名）
3. 申报《用户隐私保护指引》：收集"邮箱、姓名、学号、院系班级"（注册/资料）；接入 `wx.requirePrivacyAuthorize`
4. 如 api 侧 CORS 后续按 UA 放行小程序（可选，非必需）
5. 审核：教育类目可能需要资质；可先用"工具>信息查询"类目灰度

---

## 10. 风险与开放问题

| 风险 | 影响 | 缓解 |
|---|---|---|
| 域名白名单未配置时真机不可用 | 开发者工具可勾选"不校验"调试；真机需 §9.2 完成 | README 置顶说明 |
| 服务端无微信登录 | 用户需输入网页端账号 | 文档说明；预留 auth 扩展点 |
| 原 API 移动端可用性（SSE/大响应） | LLM 流式在弱网体验 | 已实现 chunk 解析容错 + 失败降级为一次性响应 |
| Subscription 不可用 | 实时性下降 | 轮询替代（页面级，onHide 暂停） |
| 包体 | 主包超限 | 已分包 + 零 npm + CDN 图片 |

---

## 11. 实现与验证记录（M1-M6 完成情况）

实现范围与 §4.1 一致，共 **22 个页面**（主包 8 + 分包 14）、2 个通用组件（markdown/empty）、9 个工具模块、2 个服务模块，零 npm 依赖。

验证结果（脚本留存于 `scripts/`）：

| 验证项 | 结果 |
|---|---|
| 全部 JS `node --check` | ✅ 41 个文件通过 |
| 全部 JSON 解析 / 页面四件套完整性 / tabBar 图标 | ✅ |
| JS 模块在 wx stub 环境下 require 加载 | ✅ 41/41 |
| WXML 标签闭合平衡 | ✅ 24/24（`scripts/test_wxml_balance.cjs`） |
| WXML 事件处理器 ↔ JS 方法对应 | ✅ 全部解析 |
| usingComponents 路径 / WXSS 括号 | ✅ |
| SHA-1 / HMAC-SHA1（RFC 3174 / RFC 2202 向量） | ✅ |
| JWT 解码（过期/匿名/中文 payload） | ✅ |
| Markdown 解析（块级/行内/转义防注入） | ✅ |
| SSE 增量 UTF-8 解码（跨 chunk 多字节切割） | ✅ |
| **COS 签名 vs 官方 cos-js-sdk-v5**（put/get/head + 中文键名） | ✅ **逐字节一致**（`scripts/test_cos_signature.cjs`） |

实现过程中修正的关键问题：
1. `hmacSha1Hex(key, message)` 参数顺序（SignKey 需以 SecretKey 为 key）
2. COS 签名 pathname 使用**未编码原始路径**（与 SDK 一致），URL 才编码
3. `/user/update` 的班级字段为 `className`（非 `class`），且不支持 phone/tsinghua_email
4. `/chat/send` 载荷为 `{receiver_id, content: JSON.stringify({text})}`，消息按 `JSON.parse(payload).text` 渲染
5. 清华认证流程：直接向清华邮箱发码 → `/user/edit-profile {isTsinghua:true}`（后端从验证码 token 回写 tsinghua_email + 升级 role）
6. 轮询器由页面显式 onShow/onHide 管理（避免 onLoad 后挂生命周期在不同运行时不生效）
