# KML 点位留言、举报与审核治理全局执行清单

> 文档用途：记录从 Phase 0 到生产闭环的任务、决策、耗时、验证证据和下一步计划。每次执行阶段性工作后同步更新。
> 
> 首选留言方案：Artalk（通过 Interaction Adapter 接入；内部服务掌握最终审核、资源身份和审计事实）。
> 
> 当前状态：Phase 0、Phase 1A-F、Phase 2 受控 POC 与 Phase 3 AI 审核均已完成；Artalk 生产部署仍明确延期，不作为内部事实源的上线前置条件。
>
> 部署、初始化、接入、备份恢复和 agent 执行入口见 [交互功能部署与接入手册](./interaction-deployment-and-integration.md)。
> 
> 首次建立：2026-08-23（Asia/Shanghai）
> 
> 最近更新：2026-08-24

## 1. 交付目标

- 在公开 KML 点位媒体预览中提供留言入口、数量角标、信息说明和举报入口。
- 登录用户和受策略控制的匿名用户可以提交留言；未审核内容永不公开。
- 关键词规则、人工审核、可选 AI 审核和完整审计形成闭环。
- 举报只对管理员可见，支持不良内容、侵权/下架和其他内容问题的工单处理。
- Comment、Moderation、Report 与地图前端通过 Interaction Adapter 解耦，首期同仓库同进程、独立模块/表，后续可拆部署。
- Artalk 负责可复用的评论基础能力；资源授权、审核最终状态、举报和审计仍以本系统为准。

## 2. 总体阶段与状态

状态枚举：`已完成`、`进行中`、`待开始`、`阻塞`、`不适用`。

| 阶段 | 内容 | 状态 | 开始/完成 | 预计耗时 | 验收出口 |
| --- | --- | --- | --- | --- | --- |
| Phase 0 | 需求、状态机、权限、资源引用、第三方 POC | 已完成 | 2026-08-22 / 2026-08-23 | 约 1 天 | `npm run check`、`npm test`、`npm run build` |
| Phase 1A | 共享契约、独立 interaction.sqlite（版本 1）、加密/脱敏 | 已完成 | 2026-08-23 / 2026-08-23 | 约 1 天 | 定向测试 28/28、全量测试 778/778、check/build 通过 |
| Phase 1B | Comment/Moderation/Report/Adapter 服务与 outbox | 已完成 | 2026-08-23 / 2026-08-23 | 2-4 天 | 留言、举报、人工审核、幂等和审计定向测试通过 |
| Phase 1C | `/api/v1` 公开 facade 与管理 API | 已完成 | 2026-08-23 / 2026-08-23 | 1-2 天 | 公开/管理留言、举报、info 和 provider API 集成测试通过 |
| Phase 1D | 媒体预览留言/信息/举报交互，2D/3D 共用 | 已完成 | 2026-08-23 / 2026-08-23 | 2-4 天 | UI、窄屏、焦点、故障降级和真实契约测试通过 |
| Phase 1E | 管理后台留言审核、举报工单、策略页面 | 已完成 | 2026-08-23 / 2026-08-23 | 2-4 天 | RBAC/UI/API 联测通过 |
| Phase 1F | 保留策略、指标、日志脱敏、部署与恢复演练 | 已完成 | 2026-08-23 / 2026-08-23 | 1-2 天 | 保留、指标、备份恢复和迁移回滚测试通过 |
| Phase 2 | Artalk 版本/API/export-import 受控 POC 与适配边界 | 已完成（生产部署延期） | 2026-08-23 / 2026-08-23 | 1-3 天 | 官方版本、OpenAPI、CLI smoke；Docker 运行条件缺失已记录 |
| Phase 3 | AI provider、提示词版本、预算熔断、自动审核增强 | 已完成 | 2026-08-23 / 2026-08-24 | 2-4 天 | 正常/超时/坏 JSON/低置信度/人工覆盖/加密保留通过 |

## 3. 当前执行批次

### 批次 2026-08-23-1：Phase 0 与 Phase 1A 收口

- 当前负责人：Codex `/root`
- 批次开始：2026-08-23
- 已耗时：本次会话约 0.5 小时（以工具执行和验证为准）
- 批次状态：已完成。
- 完成结果：独立 interaction schema、输入/序列化契约、加密/哈希边界和数据库不变量均已实现并通过全量验证；随后完成 Comment/Moderation/Report、公开与管理 API、2D/3D 交互、运维 helper、Artalk 受控 POC 和 AI 审核闭环。
- 当前风险：工作区还包含用户已有的分享生命周期/删除改动；这些改动不在 Phase 0 提交中，保持未暂存并继续保留。

## 4. 任务清单

### 4.1 Phase 0：契约冻结

- [x] 冻结留言内容/审核状态机及合法流转。
- [x] 冻结举报状态、处理动作和管理员权限。
- [x] 冻结匿名留言默认关闭、邮箱/手机联系方式策略。
- [x] 冻结公开/非公开/匿名联系方式/AI 原始结果/举报保留期。
- [x] 为公开快照建立稳定 Feature/Media `resourceRefs`，兼容历史快照并 fail-closed。
- [x] 完成 Artalk、Remark42、Isso、Cusdis POC；确定 Artalk 为首选。
- [x] 补充 Phase 0 纯函数、资源引用、POC 和 RBAC 回归测试。
- [x] 运行 `npm run check`、`npm test`（765/765）、`npm run build`。
- [x] 提交 Phase 0 契约与 POC 变更并记录提交号：`840f713`。
- [x] 提交 Phase 0 公开快照资源引用集成与回归测试。

### 4.2 Phase 1A：领域契约与持久化

- [x] 新增安全文本、联系方式、游标、幂等键和资源范围校验纯函数。
- [x] 新增独立 `interaction.sqlite` schema/迁移版本 1，迁移可重复执行且失败可回滚；不改 UserDatabase 版本。
- [x] 建立 `comments`、`comment_moderation_decisions`、`comment_outbox`、策略/关键词版本表。
- [x] 建立 `reports`、`report_events` 表和必要索引。
- [x] 联系方式和受限原文加密存储，哈希用于限流/去重，公开 serializer 默认去除 PII。
- [x] 为 orphaned、soft-delete、legal-hold、保留期字段建立模型和测试。
- [x] 同意策略版本改为服务端显式传入，并由留言/举报外键引用真实版本。
- [x] 锁定回复父级资源、层级和公开状态级联，阻止跨资源、未审核父级、三级回复和父级后续破坏不变量。
- [x] 严格校验 AES-256-GCM v1 密文格式，并区分密钥缺失、格式非法和认证失败。
- [x] 运行定向测试 28/28、`npm run check`、全量测试 778/778、`npm run build`。

### 4.3 Phase 1B：服务与审核流水线

- [x] 实现 Interaction Adapter：公开 `publicId` 授权、快照资源归属和 canonical share 身份解析。
- [x] 实现 Comment Service：提交、幂等、一级回复、公开查询、角标计数、软删除。
- [x] 实现确定性关键词审核：硬拒绝、人工复核、白名单和规则版本。
- [x] 实现 outbox/worker：重试上限、失败状态、幂等消费、人工队列。
- [x] 实现 Report Service：匿名/登录举报、侵权必填、去重合并、管理员动作和审计。
- [x] 保证举报正文不进入 AI、关键词拒绝或公开留言流。

### 4.4 Phase 1C：API 契约

- [x] 公开：`GET/POST /public/kml-shares/:publicId/comments`。
- [x] 公开：`GET /public/kml-shares/:publicId/comments/policy`。
- [x] 公开：`GET /public/kml-shares/:publicId/comments/count`。
- [x] 公开：`POST /public/kml-shares/:publicId/reports`。
- [x] 公开：`GET /public/kml-shares/:publicId/info`。
- [x] 管理：留言列表/详情/审核/软删除、策略和关键词读取/发布。
- [x] 统一 `jsonSuc/jsonErr`、`no-store`、错误码、分页、CSRF、权限和防枚举行为（已覆盖已接入路由）。
- [x] 同步 `docs/api.md`、`docs/api-user-system.md` 和专题 API 文档；举报与 info 契约均已按实现更新。

### 4.5 Phase 1D：前端交互

- [x] 媒体预览右上角新增留言图标、角标和信息图标。
- [x] 新增可复用留言面板、信息弹窗、举报表单；复用 `src/ui/dialog.js`。
- [x] 2D/3D 共用稳定 `resourceRef` 和公开授权上下文。
- [x] 支持无媒体点位的信息/举报兜底入口，API 故障不阻塞媒体浏览。
- [x] 覆盖焦点恢复、Esc、移动端、窄屏、转义和受控 HTTPS 外链。

### 4.6 Phase 1E：管理与所有者视图

- [x] 管理后台留言审核工作台、批量限制、逐条审计。
- [x] 管理后台举报工单、影响预览、分派、合并和受控动作。
- [x] 管理后台策略/关键词/provider 配置，敏感设置脱敏返回。
- [x] 分享所有者只看已公开留言摘要/数量，不接触待审原文、AI 细节或举报 PII。

### 4.7 Phase 1F：运维闭环

- [x] 保留清理 helper：公开 730 天、非公开 90 天、匿名联系方式 90 天、AI 原始结果 30 天、举报 730 天。
- [x] 指标：提交/通过/拒绝、待审年龄、规则命中、举报 SLA、重复率、服务错误。
- [x] 日志脱敏、任务重放、死信/失败状态、备份恢复和迁移回滚演练。
- [x] 更新开发记录和变更日志。

### 4.8 Phase 2/3：Artalk 与 AI

- [x] （Phase 2 POC）锁定 Artalk 版本，验证容器/API/OpenAPI 契约和 export/import smoke。
- [ ] （明确延期）使用受控 HTTPS origin 部署 Artalk；当前内部 headless Comment Service 继续作为事实源。
- [x] 完成 Adapter 页面键、外部用户/匿名字段、审核同步边界和 CORS/CSRF 设计联调。
- [x] 完成评论/审核历史导入导出边界与恢复 smoke；生产迁移需独立维护窗口。
- [x] 接入 AI provider registry、密钥引用、提示词版本、结构化 JSON 校验、超时/重试/预算熔断。
- [x] AI 原文脱敏、`unknown` fail-closed、人工覆盖和 30 天原始结果保留。

## 5. 关键架构不变量

- `canonicalShareId` 是留言线程/举报工单的内部身份；`sharePublicId` 只能作为外部别名和快照，轮换别名不得生成新线程。
- 公开留言必须同时满足 `contentStatus=active` 和 `moderationStatus=approved`；待审数量不得进入公开角标。
- 回复必须引用同资源、公开可见的一级父留言；父留言已有回复后资源身份和层级不可变，父留言失去公开资格时回复 fail-closed 转为非公开，恢复不得自动复活回复。
- 留言和举报的同意策略版本由服务端选择并引用版本表，禁止静默使用默认版本或接受不存在的版本。
- 举报永不进入公开留言、AI 或敏感词拒绝流水线。
- 所有公开资源引用必须来自已发布快照；资源不一致、损坏或部分缺失时 fail-closed。
- AI/第三方 provider 故障时地图和媒体继续可用，留言进入人工队列或返回明确的 503。
- 原文、联系方式、Token、密钥、IP/UA 摘要不得进入公开响应或普通日志。
- 分享级封禁/暂停动作必须展示影响范围并写审计；未实现的媒体隐藏不得伪造成功。

## 6. 验证矩阵

| 层级 | 命令/方式 | 通过标准 |
| --- | --- | --- |
| 语法/静态 | `npm run check` | 退出码 0 |
| 单元/服务 | `node --test tests/interaction-*.test.js` | 全部通过 |
| 回归 | `npm test` | 无失败、无新增 flaky |
| 构建 | `npm run build` | 构建成功；仅允许已知体积警告 |
| API | 用户/管理员/公开分享集成测试 | 鉴权、CSRF、状态、错误码和脱敏均符合契约 |
| 浏览器 | Playwright/现有 UI 测试 | 2D/3D、键盘、移动端和故障降级通过 |
| 运维 | 迁移、worker 重启、保留清理、备份恢复 | 幂等、可恢复、无 PII 泄漏 |

## 7. 变更记录

| 时间 | 事件 | 证据/提交 |
| --- | --- | --- |
| 2026-08-23 | 建立全局执行清单；确定 Artalk 首选，采用内部服务为最终事实源 | 本文档、需求文档 v1.0 |
| 2026-08-23 | Phase 0 验证完成 | `npm run check`、`npm test` 765/765、`npm run build` |
| 2026-08-23 | Phase 1A 完成独立交互契约与 SQLite v1 实现 | 定向测试 28/28、全量测试 778/778、`npm run check`、`npm run build` |
| 2026-08-23 | Phase 1B/C 留言垂直切片接入 | Interaction Adapter、Comment/Moderation Service、outbox、公开留言策略/列表/计数/提交及管理审核/重新审核/策略/关键词 API；重新审核按内容与当前策略版本幂等并保留决策链 |
| 2026-08-23 | Phase 0 相关内容提交；独立 interaction DB、Artalk spike 决策冻结 | `840f713` |

## 8. 收尾与延期事项

Phase 0、Phase 1A-F、Phase 2 受控 POC 和 Phase 3 AI 审核均已完成；最终质量门需保留全量测试、静态检查、构建、清理报告、独立代码/架构审查和架构不变量审计的证据。Artalk 真实生产部署仍明确延期，不作为内部服务事实源或本阶段交付的前置条件；后续部署必须沿用已锁定的 `2.10.0` 版本、受控 HTTPS origin 和现有 Interaction Adapter 边界。
