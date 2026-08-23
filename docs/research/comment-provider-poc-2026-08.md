# 第三方评论系统 POC 评审（2026-08）

> 评审日期：2026-08-22（Asia/Shanghai）
>
> 范围：Remark42、Artalk、Isso、Cusdis。只采用项目官方仓库、官方文档和 GitHub 官方 API 作为证据。这里的“匿名”指不要求第三方社交登录即可提交评论；是否要求昵称、邮箱或验证码另行说明。
>
> 状态：Phase 0 评审已完成；真实 provider 部署与联调属于 Phase 1，尚未接入生产。

## 结论摘要

**POC 首选 Artalk，Remark42 作为第二候选；Isso 仅适合轻量、低管理要求的部署；Cusdis 排除。**

Artalk 在当前四个候选中同时满足：MIT 许可证、活跃版本发布、匿名/免验证评论、后台审核与反垃圾能力、OpenAPI HTTP API，以及明确的导入导出格式。Remark42 的数据备份/API/权限能力最完整，但部署时至少要配置一个 OAuth2 提供商，匿名只是可选 provider；另外近期安全公告要求严格配置可信反向代理。Isso 仍有维护提交且支持匿名和审核队列，但以 SQLite 和较窄的服务 API 为主，官方资料没有提供像 Artalk/Remark42 那样清晰的通用批量导出链路。Cusdis 官方 README 已明确标记为 deprecated，仓库 archived，且数据导出需要联系作者，不适合作为新项目依赖。

## 采用门槛（Phase 1 实施验收）

1. 可自托管，许可证可用于本项目（优先 MIT/宽松许可证）。
2. 支持匿名或免社交登录评论，且能配置审核/反垃圾边界。
3. 能通过稳定 API 读取、创建、审核和删除评论。
4. 能完成数据导出或迁移，避免供应商锁定。
5. 维护状态满足新项目采用要求：有近期发布或提交，且官方文档可追溯。

## 候选对比

| 候选 | 当前版本/维护证据 | 许可证与热度 | 匿名与审核 | API / 导出 | POC 结论 |
|---|---|---|---|---|---|
| **Artalk** | v2.10.0，2026-07-24 发布；最近提交同日（GitHub 官方 Release/Commits） | MIT；约 2,319 stars、204 forks；非 archived | 默认填写昵称和邮箱即可评论、无需邮箱验证；可启用“Allow Anonymous Comments”；支持审核队列、关键词、Akismet、腾讯/阿里内容安全和验证码 | 官方 OpenAPI HTTP API；Dashboard/CLI 导入导出，统一 `.artrans` 格式 | **候选评审通过，首选**；待 Phase 1 实测 |
| **Remark42** | v1.16.4，2026-07-10 发布；2026-08-22 仍有提交 | MIT；约 5,584 stars、443 forks；非 archived | 可开启 `AUTH_ANON=true`；也支持 OAuth、邮箱；管理员可删除评论、封禁用户，支持审核/反垃圾文档 | `/api/v1` API；`/api/v1/admin/export` 可导出 JSON stream/gzip；自动备份和 Disqus/WordPress 导入 | **候选评审通过，第二候选**；待 Phase 1 实测，需先解决 OAuth 与反向代理安全配置 |
| **Isso** | v0.14.0，2026-03-26 发布；2026-08-21 仍有提交 | MIT；约 5,303 stars、463 forks；非 archived | 官方定位支持 anonymous comments；SQLite；支持 moderation queue，待审核评论不会公开；用户默认 15 分钟内可编辑/删除 | 有公开 Server API；支持 Disqus/WordPress 导入。官方文档未展示通用 bulk export/备份格式，需 POC 自行验证 SQLite 备份与 API 覆盖 | **候选评审有条件保留**；待 Phase 1 实测，适合低复杂度站点，不作为主方案 |
| **Cusdis** | 最新 Release v1.3.0（2021-11-30）；仓库 archived，官方 README 明确 deprecated；虽有 2026 README 提交，但不是功能维护 | GPL-3.0；约 2,781 stars、297 forks；archived | 不要求登录即可评论；无 spam filter，评论须手工审核且审批前不显示 | 官方 README 只列 webhook/基础能力；导出需给 `hi@cusdis.com` 发邮件并指定格式，没有自助 API/格式承诺 | **不通过，排除** |

## 详细核验

### 1. Artalk

- **维护与版本**：官方仓库最新 release 为 `v2.10.0`（2026-07-24），同日有发布脚本、OIDC/包发布相关提交；仓库未 archived。来源：[GitHub 仓库](https://github.com/ArtalkJS/Artalk)、[v2.10.0 Release](https://github.com/ArtalkJS/Artalk/releases/tag/v2.10.0)、[提交记录](https://github.com/ArtalkJS/Artalk/commits/master)。
- **许可证**：README 明确为 MIT。来源：[README License](https://github.com/ArtalkJS/Artalk#license)、[LICENSE](https://github.com/ArtalkJS/Artalk/blob/master/LICENSE)。
- **匿名/审核**：默认昵称+邮箱即可发言且不验证邮箱；登录文档说明可通过“Allow Anonymous Comments”保留匿名评论入口。审核文档支持 `pending_default`、关键词库、Akismet、腾讯云/阿里云内容安全，并可配合验证码。来源：[Social Login/Anonymous](https://artalk.js.org/en/guide/frontend/auth.html)、[Comment Moderation](https://artalk.js.org/en/guide/backend/moderator)。
- **API/导出**：官方提供 OpenAPI HTTP API；数据迁移文档定义 `.artrans` 标准 JSON 数组，并支持 Dashboard/CLI 导入、`artalk export` 导出，可将其他系统转换后导入。来源：[HTTP API](https://artalk.js.org/http-api.html)、[Data Migration](https://artalk.js.org/en/guide/transfer.html)。
- **集成风险**：前端约 40KB、Go 服务、Docker 部署简单；但 v2 API 有明确版本变更提示，客户端和服务端应锁定同一 minor/release，OIDC SSO 需要额外 issuer 和 token exchange 配置。来源：[README 安装与集成](https://github.com/ArtalkJS/Artalk#installation)、[v2.10.0 迁移说明](https://artalk.js.org/en/guide/releases/v2.10.0)、[HTTP API SSO](https://artalk.js.org/http-api.html)。

**候选评审结论**：能力和许可证检查通过，列为首选；尚未完成真实部署验收。Phase 1 必须验证匿名发帖、pending 审核、管理员删除/恢复、API 分页/鉴权、`.artrans` 导出再导入，以及前端跨域/CORS 和反向代理配置。

### 2. Remark42

- **维护与版本**：官方 release `v1.16.4` 于 2026-07-10 发布，2026-08-22 仍有提交；仓库未 archived。来源：[GitHub 仓库](https://github.com/umputun/remark42)、[v1.16.4 Release](https://github.com/umputun/remark42/releases/tag/v1.16.4)、[提交记录](https://github.com/umputun/remark42/commits/master)。
- **许可证**：MIT。来源：[LICENSE](https://github.com/umputun/remark42/blob/master/LICENSE)。
- **匿名/审核**：授权文档说明至少需配置一个 OAuth2 provider 才能让用户评论，匿名 provider 可选开启；参数为 `AUTH_ANON=true`。管理员可删除评论、永久/临时封禁用户、关闭文章评论。来源：[Authorization](https://remark42.com/docs/configuration/authorization/)、[CLI Parameters](https://remark42.com/docs/configuration/parameters/)、[Admin UI](https://remark42.com/docs/manuals/admin-interface/)。
- **API/导出**：官方 API 提供评论增删改查、用户数据导出、管理员导出；`GET /api/v1/admin/export?site=...&mode=stream|file` 返回 JSON stream 或 gzip 文件。默认每日自动备份，备份记录为 JSON，支持恢复；另有 Disqus/WordPress 导入。来源：[API](https://remark42.com/docs/contributing/api/)、[Backup](https://remark42.com/docs/backup/backup/)、[Migration](https://remark42.com/docs/backup/migration/)。
- **集成/安全风险**：跨域 OAuth、SMTP/通知、反向代理和可信 IP 配置较多。官方安全说明要求设置 `--trusted-proxy`，否则客户端可伪造 `X-Real-IP`/`X-Forwarded-For` 绕过限流；GitHub Security Advisories 还记录了 2026 年的 XSS、SSRF/IPv6、邮件模板注入等已修复问题，部署必须固定新版本并按文档设置代理。来源：[可信代理安全说明](https://remark42.com/docs/configuration/parameters/)、[GitHub Security Advisories](https://github.com/umputun/remark42/security/advisories)。

**候选评审结论**：能力和许可证检查通过，列为第二候选；尚未完成真实部署验收。Phase 1 需重点验证 OAuth callback/CORS、`AUTH_ANON` 与限流、管理员 API 鉴权、可信代理配置、导出文件中敏感字段的处理和恢复演练。

### 3. Isso

- **维护与版本**：官方 release `0.14.0` 于 2026-03-26 发布，2026-08-21 仍有合并提交；仓库未 archived。来源：[GitHub 仓库](https://github.com/isso-comments/isso)、[0.14.0 Release](https://github.com/isso-comments/isso/releases/tag/0.14.0)、[提交记录](https://github.com/isso-comments/isso/commits/master)。
- **许可证**：MIT。来源：[README License](https://github.com/isso-comments/isso#license)、[LICENSE](https://github.com/isso-comments/isso/blob/master/LICENSE)。
- **匿名/审核**：官方 getting started 明确支持 anonymous comments；核心特性为 moderation queue，待激活评论不会公开；默认允许作者在 15 分钟内编辑/删除。来源：[Getting Started](https://isso-comments.de/docs/)、[GitHub README](https://github.com/isso-comments/isso#features)。
- **API/导出**：官方提供自动生成的 Server API 文档，包含发布、删除、审核队列等端点；支持 Disqus/WordPress 导入。官方公开文档没有给出独立的通用 bulk export 文件格式或管理导出 API，因此数据迁移需以 SQLite 备份和实际 API POC 为准。来源：[API](https://isso-comments.de/docs/api/)、[Server API](https://isso-comments.de/docs/reference/server-api/)、[GitHub README](https://github.com/isso-comments/isso#features)。
- **集成风险**：Python 3.8+、SQLite、C 编译器要求；官方 quickstart 警告不要直接暴露 public interface，通常需独立 comments 域名和正确 CORS/reverse proxy。来源：[README 安装要求](https://github.com/isso-comments/isso#requirements)、[Quickstart](https://isso-comments.de/docs/guides/quickstart/)。

**候选评审结论**：有条件保留；尚未完成真实部署验收。Phase 1 必须补做 API 鉴权/审核端点、SQLite 备份恢复、跨域、并发写入和升级兼容性测试；若项目需要结构化导出或多站点管理，优先 Artalk/Remark42。

### 4. Cusdis

- **维护状态**：官方 README 顶部明确 “Cusdis is deprecated now”；GitHub 仓库 API 标记 `archived: true`，最新正式 release 为 `v1.3.0`（2021-11-30）。2026 年的 README 提交不改变其 deprecated 状态。来源：[官方 README](https://github.com/djyde/cusdis#readme)、[GitHub 仓库](https://github.com/djyde/cusdis)、[v1.3.0 Release](https://github.com/djyde/cusdis/releases/tag/v1.3.0)。
- **许可证**：GPL-3.0。若本项目不希望引入 GPL 的衍生作品义务，许可证风险高于 MIT 候选。来源：[README License](https://github.com/djyde/cusdis#license)、[LICENSE](https://github.com/djyde/cusdis/blob/master/LICENSE)。
- **匿名/审核**：README 说明无需登录即可评论；没有 spam filter，评论审批前不会显示，需要手工审核。来源：[官方 README FAQ](https://github.com/djyde/cusdis#compared-to-disqus)。
- **API/导出**：README 只列轻量 widget、邮件通知、webhook 等基础能力；官方要求导出数据时给 `hi@cusdis.com` 发邮件并指定格式，没有稳定的自助导出契约。来源：[官方 README 顶部弃用公告](https://github.com/djyde/cusdis#readme)。

**候选评审结论**：不通过，Phase 1 不再投入实测。弃用、归档、GPL-3.0 和无自助导出共同构成不可接受的长期维护与迁移风险。

## 最终建议与落地顺序

1. **Phase 1 先做 Artalk 实测**：以匿名评论、pending 审核、管理员删除、HTTP API、`.artrans` 导出/导入和反向代理为验收主线。通过后再锁定 Artalk 版本并提交供应链审批。
2. **保留 Remark42 备选**：当需求更看重 OAuth provider 丰富度、成熟备份/恢复、Disqus/WordPress 迁移时再做 provider 实测；部署前必须完成可信代理与安全公告核对。
3. **不投入 Cusdis POC**；Isso 仅在需要极简匿名评论、可接受自行验证导出和 SQLite 运维时考虑。

## 本仓库 POC 适配器

POC 代码位于 [`poc/comment-provider-adapters.js`](../../poc/comment-provider-adapters.js)，测试位于
[`tests/comment-provider-adapters-poc.test.js`](../../tests/comment-provider-adapters-poc.test.js)。它只生成
provider locator，不启动第三方服务，也不新增生产运行时依赖。

- 留言只接受 `scope=feature`；举报和未来媒体级能力不复用该 page key。
- 适配器先用现有分享授权把外部 `sharePublicId` 解析为服务端内部 `canonicalShareId`，再生成
  `msp_comment_v1_<32 位摘要>`。摘要不暴露内部分享 ID、点位 ID 或原始 URL。
- `publicId` 轮换只改变外部访问别名，不改变 `canonicalShareId`，所以同一分享的留言线程和举报工单不丢失；Comment/Report 持久化只把 `share_public_id` 作为提交/审计快照。
- Artalk 使用 `pageKey`，Remark42 使用受控同源 URL；两者都声明 `authMode=interaction-adapter`、
  `moderationAuthority=internal`，表示第三方不能绕过本项目的分享授权和最终审核状态。
- POC 明确拒绝 HTTP、带账号密码的 provider origin，以及未知 provider；真实部署还必须补做 CORS、
  CSRF、匿名联系方式脱敏、审核 webhook 双向同步和导入导出恢复演练。

Phase 0 POC 自动化验收覆盖：链接轮换后的线程稳定性、跨 provider key 一致性、媒体范围拒绝、HTTPS origin 校验和未知 provider 拒绝。它不等同于第三方服务已部署或生产可用；真实 provider API、审核同步、CORS/CSRF、数据导出恢复和隐私字段验收在 Phase 1 完成。

## 来源索引（官方/upstream）

- Remark42：<https://github.com/umputun/remark42>、<https://remark42.com/docs/configuration/authorization/>、<https://remark42.com/docs/contributing/api/>、<https://remark42.com/docs/backup/backup/>、<https://github.com/umputun/remark42/security/advisories>
- Artalk：<https://github.com/ArtalkJS/Artalk>、<https://artalk.js.org/en/guide/frontend/auth.html>、<https://artalk.js.org/en/guide/backend/moderator>、<https://artalk.js.org/http-api.html>、<https://artalk.js.org/en/guide/transfer.html>
- Isso：<https://github.com/isso-comments/isso>、<https://isso-comments.de/docs/>、<https://isso-comments.de/docs/api/>、<https://isso-comments.de/docs/reference/server-api/>、<https://isso-comments.de/docs/guides/quickstart/>
- Cusdis：<https://github.com/djyde/cusdis>、<https://github.com/djyde/cusdis#readme>、<https://github.com/djyde/cusdis/releases/tag/v1.3.0>
