# EESAST 微信小程序（applet）

清华大学电子工程系学生科协（EESAST）平台的微信小程序客户端，将 [eesast.com](https://eesast.com) 的主要功能以原生小程序的方式呈现。

> 设计文档见 [DESIGN.md](./DESIGN.md)。本仓库为**独立新增仓库**，不修改同目录下 `web` / `api` / `hasura` 三个原有仓库的任何内容，作为现有后端（`api.eesast.com` + Hasura GraphQL + 腾讯云 COS）的新客户端运行。

## 功能总览

| 模块 | 功能 |
|---|---|
| 首页 | 轮播新闻、科协部门、赛事展示墙、快捷入口 |
| 赛事互动 | 赛事列表（状态筛选）、赛事详情（简介/时间线/统计）、公告列表与 Markdown 详情（附件下载）、组队（创建/邀请码加入/队伍管理/退出解散）、代码提交（THUAI 上传+编译状态轮询+选码；SOFT/RL 链接提交）、天梯/RL 积分榜、对战记录（轮询刷新/回放下载） |
| 信息化平台 | 门户公告（5 分类）、新生导师制（导师列表/申请/谈话记录上传下载）、导师-学生私信、荣誉（奖学金）申请（附件 COS 直传） |
| 资源共享 | 课程评测（搜索/六维评分/评论/点赞收藏）、SAST Weekly |
| AI 对话 | 多会话大模型对话（SSE 流式、深度思考、配额显示、会话本地保存） |
| 我的 | 账号密码登录、分步注册（邮箱验证码）、找回密码、个人资料编辑、头像上传、清华邮箱认证（升级学生身份）、LLM Token、注销账号、退出登录 |

暂不包含（详见 DESIGN.md §4.2）：Unity WebGL 试玩/直播/在线回放（平台不支持，引导网页端）、赛事管理端、微信一键登录（需后端改造）。

## 快速开始

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入本仓库目录（`appid` 已设为测试号 `touristappid`，也可换成自己的 AppID）
3. 项目零 npm 依赖，导入即可预览
4. 开发者工具中请保持「不校验合法域名」仅用于本地调试（已放在 `project.private.config.json`，该文件不入库）

## 上线前配置清单（管理员操作）

1. 注册小程序取得正式 AppID（类目建议：教育 > 在线教育，或工具 > 信息查询），替换 `project.config.json`
2. 小程序后台「开发管理 → 服务器域名」配置 **request 合法域名**：
   - `https://api.eesast.com`（REST + GraphQL）
   - `https://eesast-1255334966.cos.ap-beijing.myqcloud.com`（COS 直传/下载）
   - `https://static.eesast.com`（静态图片）
3. 申报《用户隐私保护指引》（收集：邮箱、姓名、学号、院系班级）
4. 基础库要求 ≥ 2.20.1（`enableChunked` 流式对话），推荐 ≥ 2.32.3

## 目录结构

```
applet/
├── DESIGN.md                  # 设计文档（调研/架构/安全/适配/计划）
├── project.config.json
├── scripts/                   # 图标生成与校验脚本（不打包）
└── miniprogram/
    ├── app.{js,json,wxss}     # 5-tab 应用骨架，darkmode + theme.json
    ├── config/index.js        # API/COS/角色常量（与 web .env 对齐）
    ├── utils/                 # request/graphql/auth/cos/sha1/markdown/sse/poll
    ├── services/              # GraphQL 查询（复刻 web/src/graphql）
    ├── components/            # markdown 渲染 / empty 空态
    ├── data/                  # 首页静态数据（与 web 同源）
    ├── pages/                 # 主包：home/contest/info/share/user/register/reset/notice-detail
    └── packages/              # 分包
        ├── contest/           # intro/notice/notice-detail/team/code/score/arena
        ├── info/              # mentor/mentor-chat/honor
        ├── share/             # course/course-detail/weekly
        └── chat/              # LLM 对话
```

## 技术与安全要点

- **零 npm 依赖**：COS XML API 签名（SHA-1/HMAC-SHA1）、JWT 解码、Markdown 解析、SSE 增量 UTF-8 解码均为纯 JS 自实现；COS 签名已与官方 `cos-js-sdk-v5` 算法逐字节比对一致（含中文键名场景）
- **凭证安全**：JWT 仅存微信沙箱存储；验证码 JWT 只存内存；COS 仅用后端发放的 STS 临时密钥（按前缀最小授权）；密码永不落盘
- **权限双闸**：前端按 `userRoles`/`tsinghuaRoles`/`counselor` 分级拦截，后端 Hasura 行级权限强制兜底；管理端接口一律不接入
- **不接入的原系统危险端点**：`/notification/broadcast`、`/files/upload`（无鉴权）
- **响应式**：全 rpx 布局 + 宽屏 `max-width` 阅读容器 + `env(safe-area-inset-bottom)` 安全区 + 深浅双主题

## 已验证

- 全部 JS `node --check` 通过；全部 JSON 可解析；41 个 JS 模块在 stub 环境加载成功
- 24 个 WXML 标签闭合平衡；全部事件处理器与 JS 方法对应；组件引用路径有效
- SHA-1 / HMAC-SHA1 通过 RFC 3174/2202 测试向量；JWT 解码（含中文/过期/匿名）通过
- COS 签名与官方 SDK 三组样例（put/get/head + 中文路径）完全一致：`node scripts/test_cos_signature.cjs`

## 约束说明

- 原系统 CORS/域名未变：小程序请求不受浏览器 CORS 限制，但真机必须在后台配置域名白名单（见上）
- 微信登录需要后端新增 `code2session` 逻辑；受「不修改原仓库」约束，v1 使用与网页端一致的账号密码登录（`utils/auth.js` 预留扩展点）
