# 交互运维闭环

> 主部署、初始化、接入、升级、备份恢复和故障排查请先阅读[交互功能部署与接入手册](./interaction-deployment-and-integration.md)。本文是保留清理、指标、日志脱敏和 SQLite helper 的专题补充，不替代主运行手册。

交互数据使用独立 SQLite 数据库。`service/bin/interaction/operations.js` 提供保留清理、聚合指标、日志脱敏和备份恢复 helper，内部 Comment/Moderation/Report 表是唯一事实源，浏览器不会获得密钥或原始内容。

默认窗口为：公开留言 730 天、非公开留言 90 天、匿名联系方式 90 天、AI 原始结果 30 天、举报 730 天；审核决策、举报事件和已完成 outbox 事件分别按 30/30/90 天清理。留言创建时写入 `retention_expires_at`，联系方式另写入 `contact_expires_at`；清理会先擦除联系方式密文/哈希，再按保留期删除留言。`previewRetention()` 是只读 dry-run；`applyRetention({ dryRun: false })` 在单事务内执行，重复执行安全。`legal_hold=1` 的留言和举报永不删除。

生产配置入口是 `config.staticService.interaction`，不是顶层 `config.interaction`。窗口对应环境变量为：`MAP_SERVICE_INTERACTION_PUBLIC_RETENTION_DAYS`、`MAP_SERVICE_INTERACTION_PRIVATE_RETENTION_DAYS`、`MAP_SERVICE_INTERACTION_CONTACT_RETENTION_DAYS`、`MAP_SERVICE_INTERACTION_AI_RETENTION_DAYS`、`MAP_SERVICE_INTERACTION_REPORT_RETENTION_DAYS`、`MAP_SERVICE_INTERACTION_REPORT_EVENTS_RETENTION_DAYS`、`MAP_SERVICE_INTERACTION_OUTBOX_RETENTION_DAYS`。其中留言/举报创建时写入的到期时间由服务层配置决定，worker 额外读取 report events 和 outbox 窗口；缺失或非正值回退到上述默认值。

`aggregateInteractionMetrics()` 只返回提交、通过、拒绝、待审、审核/举报 SLA、举报数和 outbox 失败数等聚合值，不返回正文、联系方式、IP、Token 或请求头。`sanitizeInteractionLog()` 对敏感键和值做统一脱敏并限制字符串长度。

`createInteractionBackup()` 生成带大小、SHA-256、时间和版本的 manifest；恢复前必须校验哈希，校验通过后写入临时目标并原子替换。生产演练应在维护窗口执行并保留恢复前副本。

服务启动时注册 `service/bin/cronJob/interactionRetention.js`，每天 Asia/Shanghai 03:20 执行一次真实清理；任务从 `config.staticService.interaction.databasePath` 打开独立数据库连接，使用单实例互斥和事务，失败只记录脱敏错误并等待下一次调度。该路径和窗口解析由 `getInteractionRetentionConfig()` 统一，避免 cron 与服务层读取不同配置。

现有 `InteractionDatabase.claimEvents/markEventFailed/drainEvents` 提供幂等领取、指数退避和 `failed` 死信状态。重放前应人工审查失败事件，成功后才标记 `sent`。
