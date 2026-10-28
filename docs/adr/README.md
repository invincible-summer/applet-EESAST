# Architecture Decision Records

ADR 文件记录会影响工程结构、数据协议、安全边界或运行方式的长期决策。

## 编号与状态

- 文件名使用四位序号：`0001-short-name.md`。
- 状态使用 `Proposed`、`Accepted`、`Superseded` 或 `Deprecated`。
- 已采纳的 ADR 不回写历史；新方案使用更高编号，并在新 ADR 中注明替代关系。
- 只记录决策和结果，当前实现细节放在 [architecture/](../architecture/)。

## 当前决策

| 编号 | 决策 | 状态 |
|---|---|---|
| [0001](./0001-native-zero-dependency.md) | 原生小程序与零运行时依赖 | Accepted |
| [0002](./0002-packages-and-polling.md) | 按领域分包，以页面轮询替代订阅 | Accepted |
| [0003](./0003-auth-and-server-authorization.md) | 账号密码认证，服务端最终授权 | Accepted |
| [0004](./0004-cos-temporary-credentials.md) | COS 使用临时凭证和前缀权限 | Accepted |

## 新 ADR 模板

```markdown
# ADR-XXXX：标题

- 状态：Proposed
- 日期：YYYY-MM-DD
- 影响范围：...

## 背景

## 决策

## 结果

## 替代方案（可选）
```
