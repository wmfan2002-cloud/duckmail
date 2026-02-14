<div align="center">
  <img src="https://img.116119.xyz/img/2025/06/08/547d9cd9739b8e15a51e510342af3fb0.png" alt="DuckMail Logo" width="120" height="120">

  # DuckMail - 临时邮件服务

  **安全、即时、快速的临时邮箱服务**

  [English](./README.en.md) | 中文

  一个基于 Next.js 和 Mail.tm API 构建的现代化临时邮件服务，提供安全、快速、匿名的一次性邮箱功能。

  **🌐 [立即使用 duckmail.sbs](https://duckmail.sbs)**
</div>

## ✨ 特性

- 🔒 **安全可靠** - 使用 Mail.tm 的可靠基础设施
- ⚡ **即时可用** - 立即获得临时邮箱地址
- 🌐 **多语言支持** - 支持中文和英文，自动检测浏览器语言
- 🎨 **现代化界面** - 基于 HeroUI 的精美设计
- 🔄 **实时更新** - 支持 Mercure SSE 实时消息推送
- 🌙 **深色模式** - 支持明暗主题切换
- 📧 **多账户管理** - 支持创建和管理多个临时邮箱
- 🔧 **多API提供商** - 支持 DuckMail API 和 Mail.tm API 切换
- 🔑 **API Key 支持** - 可选配置 API Key 获得更多域名选择和私有域名权限
- 🔗 **开源透明** - 支持社区贡献

## 📸 应用展示

<div align="center">
  <img src="./img/display1.png" alt="DuckMail 主界面" width="800">
  <p><em>主界面 - 简洁现代的设计</em></p>

  <img src="./img/display2.png" alt="DuckMail 邮件管理" width="800">
  <p><em>邮件管理 - 实时接收和管理临时邮件</em></p>
</div>

## 🚀 快速开始

### 一键部署

#### Netlify 部署（推荐）

点击下面的按钮，一键部署到 Netlify：

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/moonwesif/duckmail)

> 🎉 **零配置部署** - 点击按钮后，Netlify 会自动 fork 项目到你的 GitHub 账户并开始部署，无需任何额外配置！

#### Vercel 部署

点击下面的按钮，一键部署到 Vercel：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/moonwesif/duckmail)

> ⚠️ **注意**：Vercel 部署仅支持 DuckMail API，不支持 Mail.tm API（因为 Mail.tm 屏蔽了 Vercel 的 IP 地址）。部署后请在设置中禁用 Mail.tm 提供商。
>
> 🚀 **零配置**：Vercel 会自动检测 Next.js 项目并使用最佳配置进行部署。

## 📧 API 说明

本项目使用 DuckMail 自建的邮箱后端服务器，支持以下操作

- **账户管理**: 创建、登录临时邮箱账户
- **邮件接收**: 实时接收和查看邮件
- **域名获取**: 获取可用的邮箱域名
- **实时通知**: 通过 Mercure Hub 获取实时消息推送

通过 https://www.duckmail.sbs/api-docs 界面来获取接口文档与调试

## 🗄️ 归档数据库迁移（Neon + Drizzle）

项目内置了归档库基础 schema（`mailboxes/messages/sync_runs/sync_events`）与可回滚迁移脚手架。

### 环境变量

- `DATABASE_URL`：Neon Postgres 连接串
- `ARCHIVE_MASTER_KEY`：归档凭据加密主密钥（至少 32 字节）

### 常用命令

```bash
pnpm db:migrate        # 执行待迁移脚本
pnpm db:rollback       # 回滚最近 1 条迁移（可加 -- --steps=2）
pnpm db:smoke          # 插入+查询 smoke 验证（事务内回滚）
pnpm db:migrate -- --plan
```

迁移文件位于 `db/migrations`，采用 `.up.sql / .down.sql` 成对维护，确保可重复执行与失败回滚。

### 凭据加密与配置校验

- `mailboxes.password_enc` 使用 `AES-256-GCM`（`lib/archive/crypto.ts`）进行加密存储；
- 启动配置会校验 `ARCHIVE_MASTER_KEY`（>=32 字节）与 `DATABASE_URL`；
- 受控解密仅在 `GET /api/archive/mailboxes?revealCredential=1` 且请求头带 `x-archive-debug-token` 时开放。

```bash
ARCHIVE_MASTER_KEY=01234567890123456789012345678901 DATABASE_URL=postgres://demo/demo pnpm archive:check-config
ARCHIVE_MASTER_KEY=01234567890123456789012345678901 pnpm archive:crypto-self-test
pnpm archive:import-parser-self-test
pnpm archive:test-login-self-test
```

### 邮箱管理 API（归档）

- 前端管理页：`/archive`（表格、导入弹窗、错误回显、启停操作）
- 检索与日志页：`/archive/search`（检索、详情、删除反馈、同步日志）
- `POST /api/archive/mailboxes`：单条新增/更新邮箱（自动加密 `password_enc`）
- `GET /api/archive/mailboxes`：列表查询；支持 `email` 精确查询
- `PATCH /api/archive/mailboxes/:id`：启停邮箱（`isActive`）
- `POST /api/archive/mailboxes/import`：批量导入（`format=csv|text`，返回逐行 `line/status/reason`）
- `POST /api/archive/mailboxes/test-login`：凭据探测，返回稳定错误码（如 `INVALID_CREDENTIALS`）

### 同步 Worker（归档）

- `POST /api/archive/sync/run`：手动触发同步（支持 `mailboxIds`、`triggerType`、`maxPages`）
- `POST /api/archive/sync/dispatch`：挑选 due 邮箱写入 `sync_runs(status=queued)`
- `POST /api/archive/sync/background`：消费 queued 任务并调用 worker（重任务路径）
- `POST /api/archive/sync/scheduled`：串联 `dispatch -> background`（可由外部 cron 每 10 分钟触发）
- `GET /api/archive/sync/runs`：读取最近同步 run 与错误事件
- 同步流程：`token -> messages list -> message detail -> upsert`
- 失败策略：每一步最多 3 次指数退避重试，失败写入 `sync_events`
- 限流策略：`ARCHIVE_SYNC_QPS` 最大 6；`ARCHIVE_SYNC_CONCURRENCY` 3~4

建议在部署平台配置定时器（例如每 10 分钟）调用 `POST /api/archive/sync/scheduled`，并通过 `ARCHIVE_ADMIN_TOKEN` 保护调度入口。

### 消息检索与删除 API（归档）

- `GET /api/archive/messages`：支持 `mailbox/domain/from/subject/q/start/end/page/pageSize` 组合筛选
- `GET /api/archive/messages/:id`：读取正文详情（含 `body_text/body_html`）
- `DELETE /api/archive/messages/:id?mode=local|remote|both`：删除策略

删除模式说明：

- `local`：只做本地软删除（`deleted_at`）
- `remote`：仅删除上游 mail.tm 消息，保留本地归档
- `both`：优先远端删除，远端失败会降级为本地删除并返回 `DELETE_PARTIAL`

### API Key 功能（可选）

应用支持可选的 API Key 配置，提供增强功能：

- **无 API Key**: 使用公共域名，基础功能完整可用
- **有 API Key**: 获得更多域名选择和私有域名创建权限

**配置方法**：
1. 点击右上角设置按钮
2. 在 "API Key 设置" 区域输入您的 API Key
3. 点击保存即可生效

#### API Key 获取方式
1. 访问 https://domain.duckmail.sbs
2. LinuxDo 鉴权登录
3. 点击左侧栏 API Key 选项，新建 API key

### API 限制

- 请求频率限制: 8 QPS, 如有特殊需求（如公益行为等），请邮件申请提高配额。
- 邮箱有效期: 邮件均保存三天，之后自动删除。账号不会删除，仍可以通过相同的信息登录接码
- 无密码找回功能

#### 关于鉴权

1. 所有接口无需API Key均可使用，创建邮箱时会获取邮箱的 Token 用于邮箱相关操作的鉴权
2. Domains 与 accounts 接口支持额外传入API Key Header以进行鉴权，传入 API Key 后，可获取该 API Key 下的私有域名，同时使用私有域名创建新的邮箱账户，其他操作均相同。

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [Mail.tm](https://mail.tm) - 提供免费可靠的临时邮件 API 服务

## 📞 联系

如有问题或建议，请通过以下方式联系：

- 创建 [Issue](https://github.com/moonwesif/duckmail/issues)
- 发送邮件到: syferie@proton.me

## 💖 赞助支持

如果这个项目对你有帮助，欢迎赞助支持开发者继续维护和改进项目，项目后端成本高昂，您的支持将会帮助项目持续发展。：

[![爱发电](https://img.shields.io/badge/%E7%88%B1%E5%8F%91%E7%94%B5-syferie-946ce6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K)](https://afdian.com/a/syferie)

你的支持是项目持续发展的动力！🚀

---

⭐ 如果这个项目对你有帮助，请给它一个星标！
