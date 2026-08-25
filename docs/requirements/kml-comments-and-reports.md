# KML 点位留言、内容举报与审核治理需求

> 状态：Phase 0、Phase 1A-F、Phase 2 受控 POC/161 隔离 sidecar 实测与 Phase 3 AI 审核已完成；内部 Interaction Service 已独立提供全部留言、审核和举报能力，Artalk 仅作为 161 可选单向镜像，公开生产嵌入仍延期。
> 版本：v1.0
> 更新日期：2026-08-25
> 适用范围：2D/3D 地图、公开 KML 分享、KML 点位富媒体浏览、用户体系、管理后台
> 关联文档：[KML 点位富媒体内容展示](./kml-feature-rich-content.md)、[KML 媒体预览与 3D 地图界面精简](./kml-media-preview-and-3d-ui-polish.md)、[KML 分享发布控制与地图交互性能](./kml-share-publishing-and-map-interaction.md)、[KML 分享密码链接、访问记录、统计脚本与瓦片限流](./kml-share-password-links-access-analytics-and-rate-limits.md)、[用户体系、角色权限、个人空间与多 KML 分享](./user-system-rbac-and-multi-kml-sharing.md)

## 1. 文档目的与结论

当前系统已经可以将 KML 点位及其富媒体内容通过公开分享链接提供给其他用户查看，但缺少两类闭环能力：

1. 查看者无法在点位上下文中留言、交流或反馈。
2. 查看者发现违法、侵权、不良或不应公开的内容时，没有结构化的举报和处理渠道。

本需求将两类能力拆成独立的业务边界，并通过 map-service 的适配层接入现有地图和分享页面：

```text
map-service 前端/公开分享页
        │  同源 API、分享授权、稳定资源引用
        ▼
Interaction Adapter（集成适配层）
        ├── Comment Service（留言服务）
        ├── Moderation Service（规则、AI、人工审核）
        └── Report Service（举报与下架工单）
```

推荐的核心决策如下：

- 留言按“点位 Feature”归属，默认不按单个媒体资源拆分；举报可以针对分享、点位或当前媒体资源。
- 未进入 `approved` 状态的留言绝不出现在公开留言列表和留言数量角标中。
- 匿名留言是管理员可配置的站点能力，不是前端自行决定的降级路径；默认关闭。
- 关键词过滤是确定性前置规则，AI 是可配置的辅助判断，人工复核拥有最终覆盖权。
- 举报不进入公开留言流，不做 AI 审核或敏感词过滤；举报只进入管理员工单和审计链路。
- 内部 Interaction Service 是当前正式留言实现；安装、配置或运行 Artalk 不是留言、审核、举报或 AI 审核的前置条件。
- 第三方评论系统只能作为可选 UI、旁路镜像或未来候选实现，不能直接成为本项目的业务事实源。必须通过适配器映射稳定资源 ID、审核状态、权限和审计数据。
- 第一阶段可以在同一仓库中按独立模块和独立数据库表实现，第二阶段再拆成独立进程或容器；服务边界、事件和 API 从第一天按可拆部署设计。

## 2. 现有系统基线

### 2.1 前端集成点

- `src/ui/media-preview.js` 是 2D/3D 共用的媒体预览器，当前右上角已有缩略图、宽屏、小窗、原始资源和关闭等动作图标。
- `src/map/kml-content-panel.js` 负责 KML 点位详情、媒体分组和打开媒体预览。
- `src/map/kml-media-gallery.js` 负责从点位内容生成媒体画廊项目；媒体项目包含点位和 KML 上下文，可用于构建稳定的留言/举报资源引用。
- `src/ui/dialog.js` 是统一 Web 弹窗组件，禁止新增 `alert`、`confirm`、`prompt`。
- 2D/3D 公开分享都使用同一套公开清单和媒体内容模型，不能为某一个地图入口单独定义留言规则。

### 2.2 后端与授权基线

- `service/bin/simpleApi.js` 是 `/api/v1` 路由注册入口，路由层只负责鉴权、参数读取、服务调用和响应封装。
- `service/bin/service.js` 是服务编排层，业务规则应继续放入独立服务模块，而不是堆入 `simpleApi.js`。
- 公开分享接口已经存在：
  - `GET /api/v1/public/kml-shares/:publicId`
  - `GET /api/v1/public/kml-shares/:publicId/files/:shareItemId`
  - `GET /api/v1/public/kml-shares/:publicId/files/:shareItemId/export`
  - `POST /api/v1/public/kml-shares/:publicId/access`
- 公开分享可能受分享密码、站点访问密码、空间范围和限流控制。留言和举报不得绕过这些已有授权边界。
- 用户体系使用 HttpOnly Cookie 会话、可读 CSRF Cookie、`X-CSRF-Token` 和权限码；匿名写请求需要使用同源校验、限流和反滥用策略。
- 用户数据当前默认存储在 `.db/map-service.sqlite`，数据库通过 `service/bin/user/database.js` 做版本迁移；后台运行态配置使用 `service/bin/admin/store.js` 或用户系统设置。
- 公开接口统一使用 `jsonSuc/jsonErr` 风格，敏感字段、认证信息和内部错误不得返回。

### 2.3 需要保持的现有约束

- 公开读取只使用已发布 KML 快照，不在请求时读取所有者当前草稿。
- URL 中使用稳定 ID，不使用中文名称作为留言、举报或分享主键。
- 不新增任意 URL 代理；举报中的证据 URL 只保存为文本，服务端不主动抓取。
- 媒体预览必须保持 Leaflet/Cesium 的连续画面和原有资源释放行为；留言或举报服务不可阻塞媒体加载。
- 所有对外展示的文本必须经过转义或安全 Markdown 处理；留言不允许任意 HTML、脚本、内嵌 iframe 和图片上传。

## 3. 目标与非目标

### 3.1 目标

- 在媒体预览器右上角提供清晰、可访问的留言入口和媒体详情入口；举报入口在媒体详情对话框内提供，不直接暴露在媒体预览工具栏或点位 popup 中。
- 支持登录用户和受控的匿名用户留言，所有留言经过审核后才可公开显示。
- 提供关键词前置过滤、AI 分级审核和人工复核，允许管理员按等级配置自动放行规则。
- 提供仅管理员可见的内容举报、侵权/下架请求和处理闭环。
- 把留言、审核、举报拆成可独立演进和部署的系统，避免将审核规则、AI 供应商和举报工单耦合进地图渲染代码。
- 形成可测试的 API、状态机、数据模型、权限模型、审计和保留策略。

### 3.2 非目标

- 本期不建设通用社交网络、关注、私信、点赞、收藏或复杂推荐系统。
- 本期不允许留言者上传图片、视频、文件或要求服务端抓取外部证据 URL。
- 本期不承诺 AI 自动判断违法、侵权或事实真伪；AI 结果必须可解释、可复核且可被人工覆盖。
- 本期不把举报内容公开给分享所有者或其他查看者；是否通知分享所有者属于后续策略。
- 本期不要求一次性迁移到微服务平台、消息队列或独立搜索集群；先定义边界和契约，再按规模拆部署。
- 本期不要求部署 Artalk，也不把 Artalk 后台作为正式审核入口；Artalk 缺失或故障不得影响内部交互主链路。

## 4. 用户角色与主要场景

| 角色 | 主要场景 | 关键约束 |
| --- | --- | --- |
| 访客/匿名查看者 | 查看公开点位、留言、提交留言或举报 | 受分享授权、匿名开关、反滥用和最小 PII 采集约束 |
| 登录用户 | 使用账号留言、查看公开留言、查看自己的审核状态 | 使用现有用户会话和 CSRF；自己的待审留言只能自己看到 |
| 分享所有者 | 了解点位反馈、查看评论数量，必要时关闭某个分享的留言 | 不默认拥有审核权限；不能绕过平台审核直接发布留言 |
| 内容/安全审核员 | 处理待审留言、复核 AI 结果、维护关键词规则 | 只能访问被授权的审核和举报数据，操作必须审计 |
| 管理员 | 配置留言策略、AI、关键词、举报处理和封禁动作 | 权限按 `admin.*` 细分，密钥不可回显 |
| 超级管理员 | 配置高风险安全策略、AI 凭据引用和角色权限 | 需要最近再验证，影响性操作显示影响预览 |

典型闭环：

1. 查看者打开分享地图，点击点位媒体预览右上角留言图标。
2. 系统根据外部 `publicId` 通过现有分享授权解析到内部 `canonicalShareId`，再结合 `shareItemId + featureId` 读取已审核留言和准确总数。
3. 查看者以登录用户或匿名身份提交留言，接口立即返回 `202 Accepted`，留言进入待审队列。
4. 关键词规则先判断；未被硬拒绝的留言进入 AI/人工审核流水线。
5. 合规留言转为 `approved` 并出现在列表和角标中；风险或违规留言保持不可见。
6. 查看者从信息图标打开来源说明和用户协议，提交不良内容或侵权下架举报。
7. 管理员在举报队列中查看目标快照、证据和历史操作，决定驳回、标记重复、隐藏资源、封禁分享或升级处理。

## 5. 资源身份与领域模型

### 5.1 稳定资源引用

所有留言和举报都必须引用稳定的 `resourceRef`，不能只保存显示名称或当前 URL：

```json
{
  "siteId": "map-service",
  "sharePublicId": "shr_public_xxx",
  "shareItemId": "shi_xxx",
  "featureId": "feature_xxx",
  "mediaId": "media_xxx",
  "scope": "feature"
}
```

约束：

- `sharePublicId` 仅是公开访问别名。Interaction Adapter 必须先通过现有分享授权将其解析为内部稳定的 `shareId`/`canonicalShareId`；匿名客户端永远不能直接提交或读取内部 ID。
- Comment/Report 的持久化记录必须保存 `canonicalShareId`（内部线程/工单身份）；`sharePublicId` 只作为提交时的外部输入快照和审计快照保存，不能作为线程主键，也不能在分享链接轮换后覆盖原身份。
- `shareItemId` 和 `featureId` 必须来自已发布快照，且在同一分享内稳定。
- `publicId` 兼容现有随机 Base64URL 分享别名；新建交互服务不得把是否带 `shr_public_` 前缀当作权限依据。
- Feature ID 优先沿用 KML 中可安全外部引用的稳定 `id`，不强制历史数据改成 `feature_*` 前缀；含空白或 URL/标记分隔符等不适合外部引用的历史 ID 会派生为 opaque `feature_*`，原始 KML ID 保留用于地图兼容。
- Media ID 统一使用 `media_*` opaque ID，不使用媒体数组索引、中文标题或原始 URL 直接作为外部主键。
- `scope` 取 `share`、`feature`、`media`。留言第一阶段只允许 `feature`；举报三种范围都允许。
- `mediaId` 为空时不能声明 `scope=media`。
- 同一资源在 KML 内容重新发布后继续沿用稳定 Feature ID；若目标被删除或不可见，关联留言设为 `orphaned`，不再公开显示，但保留给管理员审计。
- 描述中的媒体按规范化来源 URL 派生 Media ID，标题变化不改变 ID、URL 变化视为新资源；资源集合按集合项 ID 派生，同一集合项更新标题或 URL 仍视为原资源，只有集合项 ID 变化才形成新资源。旧引用只能进入 `orphaned`，不能静默绑定到其他媒体。
- 管理后台可以展示资源快照标题、KML 名称、媒体类型和来源摘要，但这些字段只是提交时快照，不是主键。

### 5.2 留言状态

留言状态分为内容状态和审核状态两层，避免把“已删除”和“审核未通过”混成一个状态：

| 字段 | 值 | 说明 |
| --- | --- | --- |
| `contentStatus` | `active` | 记录仍存在，可能公开或待审 |
| `contentStatus` | `hidden` | 被管理员隐藏，仍保留审计记录 |
| `contentStatus` | `deleted` | 软删除，不再公开 |
| `moderationStatus` | `pending` | 等待规则、AI 或人工处理 |
| `moderationStatus` | `approved` | 可公开显示 |
| `moderationStatus` | `rejected` | 不允许公开 |
| `moderationStatus` | `quarantined` | 风险隔离，等待人工复核 |
| `moderationStatus` | `spam` | 垃圾内容或重复灌水 |
| `moderationStatus` | `orphaned` | 目标资源已删除或无法访问 |

公开接口只返回 `contentStatus=active` 且 `moderationStatus=approved` 的留言。

### 5.3 审核等级与动作

AI 和规则统一输出以下等级；管理员可以配置各等级的默认动作，但不能配置为“未经任何审核直接公开”：

| 等级 | 含义 | 默认动作 |
| --- | --- | --- |
| `normal` | 完全合规、正常交流 | 可自动放行 |
| `risk` | 疑似引战、骚扰、广告、隐私泄露或其他需要关注的内容 | 人工复核 |
| `violation` | 明显违反站点规则、辱骂、色情、违法倾向等 | 拒绝或人工复核 |
| `illegal_or_ip` | 涉及违法、侵权、冒充权利人或下架请求语义 | 隔离并转举报/人工队列，不由 AI 自动作法律结论 |
| `spam` | 重复、营销灌水、机器提交 | 拒绝或限流 |
| `unknown` | AI 超时、格式错误、置信度不足 | 人工复核，禁止自动公开 |

## 6. 系统拆分与边界

### 6.1 Interaction Adapter（集成适配层）

职责：

- 在 map-service 公开 API 下提供同源 facade，复用现有分享授权、站点访问授权、CSRF 和错误格式。
- 把 `publicId/shareItemId/featureId/mediaId` 解析成 Comment/Report Service 可识别的 `resourceRef`。
- 向前端返回已脱敏的留言策略、数量、来源摘要和用户协议链接。
- 处理服务不可用降级：媒体和地图继续正常工作，留言/举报按钮显示不可用状态，不阻塞点位浏览。
- 接收 `comment.published`、`comment.hidden`、`report.actioned` 等事件，刷新角标缓存和公开资源状态。

不负责：留言状态机、AI 调用、关键词库、举报工单处理和密钥保存。

### 6.2 Comment Service（留言服务）

职责：

- 留言线程、父子关系、作者快照、匿名联系方式、资源引用和公开查询。
- 公开留言列表、数量聚合、留言提交、自己的待审留言查询。
- 只接受已经通过 Interaction Adapter 授权的资源引用；不直接解析 KML 文件。
- 通过 outbox/队列向 Moderation Service 投递新留言事件。

不负责：AI 模型选择、关键词规则解释、举报下架决定和地图渲染。

### 6.3 Moderation Service（审核服务）

职责：

- 文本规范化、敏感词/关键词规则、反垃圾规则和可选验证码策略。
- AI provider 适配器、提示词版本、结构化结果校验、重试、超时和人工队列。
- 审核决策、人工复核、重新标注、放行/拒绝/隐藏和审计。
- 向 Comment Service 回写最终可见状态；向管理后台提供队列和配置 API。

AI 凭据只保存在该服务或外部密钥管理系统中；map-service 和浏览器永不接触明文密钥。

### 6.4 Report Service（举报服务）

职责：

- 接收分享、点位、媒体三种目标的举报。
- 保存举报人类型、联系方式、证据文本、权利声明和目标快照。
- 维护工单状态、优先级、分派、重复合并、处理动作和审计。
- 通过受控动作调用 Interaction Adapter 的分享封禁/隐藏接口。

不负责：公开留言展示、AI 判定和敏感词拦截。举报文本仍需做长度、结构和注入安全校验，但不能以敏感词命中为由丢弃用户的举报证据。

### 6.5 管理后台集成

第一阶段可以继续复用 `src/admin/` 的导航和登录，但以独立页面/模块呈现：

- 留言审核队列。
- 审核规则和 AI 设置。
- 举报工单。
- 留言/举报审计与运行指标。

第二阶段可以把这些页面拆成独立管理前端，通过管理 API 和 SSO/反向代理接入；不允许把审核业务重新堆回地图页面。

### 6.6 部署演进

| 阶段 | 部署方式 | 数据边界 | 适用目的 |
| --- | --- | --- | --- |
| P0 | 同仓库独立模块、独立表/数据库文件 | Comment、Moderation、Report 各自 schema | 快速验证契约和 UI，不形成跨模块 SQL 依赖 |
| P1 | 同主机独立 Node 进程或容器 | 各服务独立 SQLite/Postgres，HTTPS 内部 API | 隔离故障、独立升级和限制 AI 资源 |
| P2 | 独立服务 + outbox/event bus | 服务各自数据库，事件可重放 | 多实例、异步审核和更高吞吐 |

在 P0/P1 中不强行引入 RabbitMQ/Kafka；使用带幂等键的 outbox 和定时 worker 即可。需要水平扩展时，再将 outbox 消费替换为 NATS/SQS 等受控消息系统。

Artalk 不属于上述阶段的必需基础设施。当前仅由可选 outbox consumer 将内部已批准留言投影到 161 sidecar；关闭 consumer 或不存在 sidecar 时，Comment/Moderation/Report Service 的数据模型、API 和状态机不发生变化。

## 7. 留言产品需求

### 7.1 入口与交互

- 在媒体预览器右上角增加“留言”图标按钮，使用项目现有图标风格和 Tooltip。
- 角标显示当前资源已审核留言总数；`0` 时隐藏角标，不显示待审、拒绝或举报数量。
- 点击后打开留言面板：桌面端为媒体预览右侧面板或覆盖层，移动端为全屏子面板；关闭后返回当前媒体和焦点位置。
- 面板标题显示点位名称，无法取得名称时使用“点位留言”，不得使用中文名称作为请求主键。
- 留言面板支持分页/游标加载、加载中、空状态、服务不可用、提交成功、待审核和限流状态。
- 公开列表只显示审核通过内容、公开显示名和相对时间；不显示邮箱、手机号、审核分数、规则命中和管理员备注。
- 登录用户提交后可看到自己的“待审核”占位状态，但该状态只对本人可见，不能被其他访客通过计数或列表推断。
- 回复在第一阶段限制为一级回复；是否允许普通用户互相回复由站点设置决定，管理员回复始终可配置。
- 回复只能引用同一资源、`active + approved` 的一级父留言。父留言已有回复后不得改变稳定资源身份或层级；父留言失去公开资格时回复同步转为非公开，父留言进入 `orphaned` 时回复同步进入 `orphaned`，恢复父留言不自动恢复旧回复。
- 留言编辑会生成新 revision 并重新进入审核；第一阶段不提供公开编辑入口，用户可删除自己的留言，删除为软删除。

### 7.2 登录留言

- 使用现有账号会话和权限；至少要求 `account.self.read`，提交写请求需要当前会话和 CSRF。
- 默认显示账号 `displayName`；用户可以设置公开昵称，服务端保存提交时快照。
- 不向留言公开账号邮箱、手机号、用户名规范化值、会话信息或内部用户 ID。
- 账号被停用、锁定或要求修改密码时不能提交留言。

### 7.3 匿名留言

- 匿名留言由管理员站点设置控制，默认关闭；关闭时服务端返回 `ANONYMOUS_COMMENTS_DISABLED`，前端不得仅隐藏控件而依赖前端限制。
- 匿名表单默认要求：公开昵称、邮箱或手机二选一、同意隐私与留言规则。是否同时要求邮箱和手机由管理员策略决定，但默认不收集不必要的双重联系方式。
- 邮箱和手机只用于反滥用、人工联系或可选通知，不公开、不写入普通日志，不进入 AI 请求正文；数据库使用加密密文和不可逆联系哈希分开保存。
- 第一阶段不要求 OTP 验证；站点出现滥用时可按策略启用邮箱/手机验证码或 CAPTCHA，不得把“填写了联系方式”误当作已验证身份。
- 同一匿名会话、联系哈希、IP/UA 摘要、资源和时间窗口均参与限流和重复检测；原始 IP 和完整 UA 不进入业务表。
- 匿名用户无法查询其他匿名留言的审核状态；提交接口返回通用成功消息，避免通过错误差异枚举账号或联系方式。

### 7.4 留言字段和限制

推荐默认值，均可在站点策略中收紧，不允许超过服务端上限：

| 字段 | 规则 |
| --- | --- |
| `body` | 必填，去除首尾空白，最大 2000 个 Unicode 字符；仅安全 Markdown 子集 |
| `displayName` | 登录用户可选覆盖，匿名必填，2～64 字符 |
| `email` | 与 `phone` 至少填写一个；标准化后最大 254 字符 |
| `phone` | E.164 或管理员配置的地区格式；最大 32 字符 |
| `parentId` | 可选，只允许引用同一资源且状态为 `approved` 的一级留言 |
| `consent` | 必须明确同意留言规则和隐私说明，记录规则版本 |
| `clientRequestId` | 可选幂等键，防止移动端重复提交 |

客户端只提交明确的同意结果；具体 `consentPolicyVersion` 由服务端从当前策略选择并写入，留言和举报记录必须引用真实存在的策略版本，不允许静默使用固定默认版本或信任客户端自报版本。

服务端应拒绝控制字符、过长链接串、明显的脚本标签、重复提交和超出资源/账号配额的请求。

### 7.5 分享所有者反馈视图

- 分享所有者在用户中心的“我的分享”中可以查看自己分享下已经 `approved` 的留言数量和最近留言摘要；该视图复用公开可见数据，不显示待审原文、AI 评分、规则命中、举报人和匿名联系方式。
- 分享所有者可以将单个分享的留言模式设置为 `inherit`、`enabled` 或 `disabled`。`disabled` 只影响新访问和新提交，不删除历史留言；管理员封禁或全局关闭拥有更高优先级。
- 分享所有者如果需要回复，回复作为其账号发表的新留言，仍需经过同一关键词和审核流程；不能因为作者是分享所有者而直接公开。
- 所有者视图和公开留言视图均使用稳定资源引用；分享标题、点位名称变化不会改变线程主键。
- 第一阶段不向分享所有者展示待审数量，避免把审核队列当作公开反馈统计；后续如有运营需要，可增加仅数量级的脱敏指标。

### 7.6 留言公开规则

- 只有 `contentStatus=active && moderationStatus=approved` 的留言可公开。
- 公开排序默认按 `approvedAt ASC` 保持对话顺序；管理员可以配置“最新优先”，但必须稳定且有分页游标。
- 公开内容使用纯文本或安全 Markdown 渲染；链接只允许 `https`、`http`，不允许 `javascript:`、`data:`、`file:` 和任意嵌入。
- 留言服务异常时不返回缓存中的待审内容；可返回最近的已审核缓存，但缓存必须带版本和失效时间。
- 目标分享暂停、撤销、封禁、过期或空间授权失效时，留言列表和提交接口沿用分享授权结果，不泄漏资源是否存在。

## 8. 留言审核需求

### 8.1 审核流水线

```text
提交
  → 结构校验与规范化
  → 反滥用/速率限制
  → 关键词确定性规则
  → 入库 pending
  → AI 审核（可选）
  → 策略映射
  → 自动放行 / 隔离 / 拒绝 / 人工队列
  → 发布 approved 或保持不可见
```

关键要求：

- 留言先持久化为 `pending`，不能等待浏览器端或外部 AI 返回后才决定是否写入。
- 关键词硬拒绝可以在入库前快速返回，但必须保存脱敏的拒绝审计事件，不保存完整敏感原文到日志。
- AI 超时、供应商错误、JSON 格式错误、置信度不足时必须 fail-closed：进入 `unknown/quarantined`，不能自动公开。
- 每次决策都记录规则版本、模型/供应商、提示词版本、分数、动作、操作者和时间；人工操作覆盖 AI 时不能删除原始决策链。
- 重新审核必须是幂等任务；同一 `commentId + contentRevision + policyRevision` 不重复计费或重复改变最终状态。

### 8.2 关键词/敏感词规则

规则库由管理员维护，至少支持：

- 词条、语言/地区、分类、等级、动作（`reject`、`quarantine`、`flag`、`replace`）。
- 词条版本、启用状态、生效时间、创建者和变更原因。
- 全角/半角、大小写、Unicode NFKC、常见空白和字符混淆的规范化。
- 精确词、短语和安全的有限模式匹配；禁止执行未经验证的任意正则，避免 ReDoS。
- 规则白名单和上下文例外；白名单只能降低误杀，不能绕过明显的脚本/XSS 安全校验。
- 后台试运行：管理员可以输入测试文本查看命中规则和预期动作，但不会写入留言或审计原文。
- 规则变更默认只影响新留言；对历史留言重扫必须显式创建任务、显示预计影响数量并可暂停。

关键词命中“硬拒绝”时，不调用 AI，减少成本和数据外发；命中“风险标记”时仍可进入 AI 或人工复核。

### 8.3 AI 审核配置

管理员可以配置多个 provider，但同一时间只有一个默认 provider 生效：

```json
{
  "enabled": true,
  "providerId": "ai-provider-1",
  "model": "provider-model-id",
  "timeoutMs": 8000,
  "maxAttempts": 2,
  "promptVersion": "comment-moderation-v3",
  "redaction": {
    "removeContactFields": true,
    "removeSessionIdentifiers": true
  },
  "autoActions": {
    "normal": "approve",
    "risk": "human_review",
    "violation": "reject",
    "illegal_or_ip": "human_review",
    "spam": "reject",
    "unknown": "human_review"
  }
}
```

约束：

- provider 配置包含名称、协议、endpoint、模型、限额和健康状态；API Key/Secret 只保存于服务端密钥存储，GET 接口只返回 `configured=true`。
- 只允许管理员选择预定义的工具和 JSON Schema；提示词不得动态执行任意函数、访问内部网络或把 AI 变成 URL 抓取代理。
- 发送给第三方 AI 前默认删除邮箱、手机、会话令牌、IP/UA 摘要和内部用户 ID；是否发送外部链接文本由管理员单独配置并显示风险提示。
- AI 输出必须通过严格 JSON Schema 校验：`level`、各分类 `score`、`confidence`、`reasonCodes`、`suggestedAction`、`policyVersion`。
- `reasonCodes` 使用受控枚举，管理后台可以展示解释，但不得把模型原始长文本直接暴露给公众。
- AI 只提供审核建议，不能自动判定法律责任、权利归属或事实真假；`illegal_or_ip` 默认转人工/举报队列。
- provider 健康检查、单次/每日预算、并发数、超时、重试和熔断均可配置；健康检查不得把真实留言发送给外部服务。
- `dailyBudget` 为正整数时是每日硬上限，`0` 表示无限制但仍受并发、超时和熔断约束；默认 `timeoutMs=3000`、`maxAttempts=2`、`maxConcurrency=2`。
- 健康验证默认 TTL 为 24 小时（可配置）；过期 provider 自动降为 `unknown`、禁用并清除默认指针。修改 endpoint、密钥引用、adapter、模型、提示词版本、超时、重试、预算、并发或脱敏配置后必须重新验证，并写审计日志。

### 8.4 人工审核

审核员可以：

- 查看原文、脱敏作者信息、资源快照、规则命中、AI 评分和历史决策。
- 标记为 `approved`、`rejected`、`quarantined`、`spam`、`hidden`，并选择受控原因码。
- 重新标注等级、覆盖 AI 建议、要求重新审核或锁定该留言不再自动重审。
- 查看同一匿名联系哈希/账号在时间窗口内的重复提交摘要，但不得批量导出原始联系方式。
- 对明显滥用执行账号/匿名指纹/资源级限流或封禁；封禁动作必须有范围、期限和原因。

人工放行后才公开；人工拒绝不能删除原始审计链。审核员不应看到无关的完整邮箱、手机或认证凭据。

## 9. 举报产品需求

### 9.1 信息入口

- 在媒体预览器右上角新增“媒体详情”图标，和留言图标并列；本地 KML 与公开分享媒体均可打开详情，无媒体但有点位详情时，点位内容面板也应提供同一入口作为可达性兜底。
- 信息弹窗使用统一 Dialog，包含：
  - 点位/媒体来源摘要和统一资源来源说明。
  - 内容由分享者或第三方提供的责任边界说明。
  - 用户协议、社区/留言规则、隐私说明入口。
  - “举报此内容”按钮。
- 信息弹窗不直接渲染第三方 HTML；来源、协议和链接由服务端生成受控 descriptor，外链仅允许 HTTPS。
- 点击详情对话框内的“举报此内容”后打开举报表单，保留当前目标引用和媒体上下文；提交后返回详情对话框或媒体预览，不丢失导航状态。

### 9.2 举报类型

举报表单至少支持：

| 类型 | 说明 | 额外要求 |
| --- | --- | --- |
| `unsafe_content` | 色情、暴力、骚扰、诈骗、恶意或其他不良内容 | 描述问题，可选联系方式 |
| `illegal_content` | 疑似违法内容 | 描述和联系方式建议必填 |
| `copyright_takedown` | 违法侵权、未经授权展示、要求下架 | 必须填写权利/代理身份、联系方式、权利声明和具体目标 |
| `privacy` | 泄露个人隐私或敏感信息 | 描述泄露字段和影响范围 |
| `misleading` | 内容与标题/来源严重不符 | 描述事实，不作自动法律结论 |
| `other` | 其他问题 | 需要具体描述 |

举报字段：`type`、`resourceRef`、`description`、`reporterMode`、`displayName`、`email`、`phone`、`rightsAttestation`、`evidenceText`、`consent`、`clientRequestId`。

字段上限：`description` 必填且最多 4000 个 Unicode 字符；`evidenceText` 可选且最多 8000 个字符；`displayName` 最多 64 个字符；`clientRequestId` 最多 128 个 ASCII 字符。`rightsAttestation` 是布尔确认，`copyright_takedown` 必须为 `true`，并同时提供权利人/代理人名称和至少一个联系方式。

本期不允许上传附件，也不由服务端请求 `evidenceText` 中的 URL；后续如增加附件，必须单独设计病毒扫描、对象存储和保留策略。

### 9.3 举报提交与隐私

- 举报可以由登录用户或匿名访客提交；是否允许匿名举报由管理员单独配置，默认允许但对侵权下架类型要求可联系的邮箱或手机。
- 举报成功只返回通用 `202 Accepted` 和工单回执 ID；不返回是否已有相同举报、目标是否已被处理或其他举报人的信息。
- 举报正文不进入公开留言列表、公开接口、分享所有者页面、AI 审核和敏感词拒绝流程。
- 举报人联系方式加密保存，只有具备举报处理权限的管理员可查看脱敏摘要；普通审计日志只记录类型、目标、状态和操作人。
- 同一资源、联系哈希和时间窗口内的重复举报可合并为一张工单，但原始举报数量和来源仍可审计。

### 9.4 举报处理状态和动作

状态：`new`、`triaged`、`investigating`、`actioned`、`dismissed`、`duplicate`、`closed`。

管理员处理动作：

- `no_action`：证据不足或不属于平台处理范围。
- `mark_duplicate`：关联既有工单。
- `hide_comment`：隐藏指定留言（仅当目标是留言时）。
- `hide_media`：隐藏指定媒体（需要媒体级公开快照支持；未实现前不得伪造成功）。
- `block_share`：调用现有分享治理能力封禁整个分享，必须要求原因和影响预览。
- `pause_share`：暂时暂停分享，保留恢复路径。
- `request_more_info`：向举报人发送可选通知；第一阶段可只记录状态，不自动发送邮件/短信。
- `escalate_legal`：标记为法律/权利处理，不在系统内自动判定或自动下架。

处理结果必须记录目标、动作、原因、操作者、时间、是否影响公开内容和关联审计事件。针对整份分享的动作需要显示影响范围，避免把单点举报误操作成全量封禁。

## 10. 管理后台需求

### 10.1 权限建议

新增权限码，继续使用服务端最终鉴权：

```text
admin.comment.read
admin.comment.moderate
admin.comment.policy.manage
admin.moderation.ai.manage
admin.moderation.keyword.manage
admin.report.read
admin.report.manage
```

权限含义：

- `admin.comment.read`：查看脱敏留言和审核历史。
- `admin.comment.moderate`：改变留言状态、人工复核和批量处理。
- `admin.comment.policy.manage`：改变留言开关、匿名字段、长度、限流和默认动作。
- `admin.moderation.ai.manage`：管理 provider、模型、提示词版本、预算和自动动作；高风险设置需要超级管理员或额外授权。
- `admin.moderation.keyword.manage`：管理敏感词、白名单、规则版本和试运行。
- `admin.report.read`：查看举报列表和目标快照。
- `admin.report.manage`：分派、合并、处理举报和执行受控内容动作。

内置管理员角色可以按最小权限组合；不能仅凭页面隐藏代替服务端授权。

### 10.2 留言审核工作台

支持：

- 按状态、等级、资源、分享、作者类型、规则命中、AI provider、时间和分派人筛选。
- 游标或分页列表，显示待审时长、优先级、资源标题、脱敏作者和风险原因。
- 详情页显示原文、规范化文本、AI 评分、关键词命中、历史版本、相关重复提交摘要和资源快照。
- 批量操作必须有数量确认、最大批量限制和逐条审计；批量自动放行默认关闭。
- “重新审核”使用当前策略生成新决策链，不覆盖历史策略版本。
- 公开留言数量和待审数量分开统计，不让运营误把待审量当作公开量。

### 10.3 规则和 AI 设置

- 全局留言策略：开启、匿名开关、匿名必填字段、长度、回复深度、限流、验证码触发阈值、保留天数。
- 分享级策略：`inherit`、`enabled`、`disabled`；管理员可以强制关闭或冻结，分享所有者只能在全局允许范围内选择。
- AI provider 列表：连接测试、启停、默认 provider、模型、超时、预算、提示词版本、脱敏选项。
- 自动动作矩阵：等级到动作的映射，必须显示“未知/错误始终人工复核”的不可取消安全约束。
- 关键词库：版本、分类、动作、白名单、试运行和历史变更。
- 每次高风险设置变更必须显示影响预览，例如待审留言数量、将被重新处理的数量、当前分享受影响数量。

### 10.4 举报工作台

- 按类型、状态、优先级、分享、目标范围、时间、分派人和重复组筛选。
- 详情展示举报原文、权利声明、联系方式脱敏视图、目标快照、当前公开状态、相关分享治理记录和相似工单。
- 支持分派、备注、请求补充信息、标记重复、执行动作和关闭。
- 举报内容不可被普通分享所有者查看；如未来需要通知所有者，必须增加独立的脱敏通知模型。

## 11. API 契约草案

以下契约已同步至 `docs/api.md`、`docs/api-user-system.md` 和服务专用 API 文档；实现状态以对应 API 文档和集成测试为准。Artalk 生产部署仍是明确延期项，不影响内部留言、举报、来源信息和 AI/provider 闭环。

### 11.1 公开 facade

所有路径均基于 `/api/v1`，由 Interaction Adapter 暴露并复用公开分享授权。

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/public/kml-shares/:publicId/comments` | 分享访问授权 | 已实现：获取当前分享/点位已审核留言 |
| `GET` | `/public/kml-shares/:publicId/comments/count` | 分享访问授权 | 已实现：获取准确公开留言计数 |
| `POST` | `/public/kml-shares/:publicId/comments` | 分享访问授权；登录写请求还需 CSRF，匿名需同源校验 | 已实现：提交留言，返回 `202` |
| `GET` | `/public/kml-shares/:publicId/comments/policy` | 分享访问授权 | 已实现：获取匿名开关、字段策略和规则版本摘要 |
| `POST` | `/public/kml-shares/:publicId/reports` | 分享访问授权；按策略允许匿名 | 提交举报，返回 `202` |
| `GET` | `/public/kml-shares/:publicId/info` | 分享访问授权 | 获取来源说明、协议链接和举报能力 descriptor |

留言查询参数：`scope=feature`、`shareItemId`、`featureId`、`cursor`、`limit`。`limit` 默认 20，最大 100；公开查询只能用当前分享公开引用，不能传内部 KML ID。

留言提交示例：

```http
POST /api/v1/public/kml-shares/shr_public_xxx/comments
Content-Type: application/json
X-CSRF-Token: <登录用户当前 CSRF，可选>

{
  "resourceRef": {
    "shareItemId": "shi_xxx",
    "featureId": "feature_xxx",
    "scope": "feature"
  },
  "body": "这里的路线信息在雨季是否仍然适用？",
  "displayName": "地图访客",
  "email": "visitor@example.com",
  "parentId": null,
  "consent": true,
  "clientRequestId": "req_xxx"
}
```

成功响应示例：

```json
{
  "code": 0,
  "result": {
    "accepted": true,
    "commentId": "cmt_xxx",
    "status": "pending",
    "publiclyVisible": false,
    "message": "留言已提交，审核通过后显示"
  },
  "error": null
}
```

公开查询成功响应示例：

```json
{
  "code": 0,
  "result": {
    "count": 12,
    "items": [
      {
        "id": "cmt_xxx",
        "displayName": "地图访客",
        "body": "这里的路线信息在雨季是否仍然适用？",
        "createdAt": "2026-08-22T10:00:00.000Z",
        "replies": []
      }
    ],
    "nextCursor": "cursor_xxx"
  },
  "error": null
}
```

### 11.2 举报提交示例

```http
POST /api/v1/public/kml-shares/shr_public_xxx/reports
Content-Type: application/json

{
  "resourceRef": {
    "shareItemId": "shi_xxx",
    "featureId": "feature_xxx",
    "mediaId": "media_xxx",
    "scope": "media"
  },
  "type": "copyright_takedown",
  "description": "该图片疑似未经授权使用我的作品。",
  "displayName": "权利人",
  "email": "rightsholder@example.com",
  "rightsAttestation": true,
  "consent": true,
  "clientRequestId": "req_xxx"
}
```

举报成功只返回通用回执：

```json
{
  "code": 0,
  "result": {
    "accepted": true,
    "reportId": "rpt_xxx",
    "status": "new",
    "message": "举报已提交，平台会按规则处理"
  },
  "error": null
}
```

### 11.3 管理 API 草案

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/admin/comments` | `admin.comment.read` | 留言审核队列 |
| `GET` | `/admin/comments/:id` | `admin.comment.read` | 留言详情和审核链 |
| `POST` | `/admin/comments/:id/review` | `admin.comment.moderate` | 人工审核/重新标注/放行/拒绝 |
| `POST` | `/admin/comments/:id/reprocess` | `admin.comment.moderate` | 使用当前策略重新审核 |
| `GET` | `/admin/moderation/settings` | 对应设置权限 | 获取脱敏审核设置 |
| `PUT` | `/admin/moderation/settings` | `admin.comment.policy.manage` 等 | 更新审核策略 |
| `GET/POST/PUT` | `/admin/moderation/providers` | `admin.moderation.ai.manage` | 管理 AI provider 元数据 |
| `GET/POST/PUT` | `/admin/moderation/keywords` | `admin.moderation.keyword.manage` | 管理关键词规则 |
| `GET` | `/admin/reports` | `admin.report.read` | 举报工单列表 |
| `GET` | `/admin/reports/:id` | `admin.report.read` | 举报详情 |
| `POST` | `/admin/reports/:id/actions` | `admin.report.manage` | 分派、合并、隐藏、封禁、关闭 |

管理接口统一分页、过滤、`no-store`、权限和最近再验证规则；敏感字段使用脱敏视图，不能返回 AI Key、原始 IP、完整联系方式、Cookie、Token 或请求头。

### 11.4 错误码建议

| HTTP | 错误码 | 说明 |
| --- | --- | --- |
| `400` | `VALIDATION_FAILED` | 请求结构、字段或资源引用不合法 |
| `401` | `AUTH_REQUIRED` | 需要登录但当前没有有效会话 |
| `403` | `ANONYMOUS_COMMENTS_DISABLED` | 匿名留言未开启 |
| `403` | `COMMENT_POLICY_BLOCKED` | 站点策略禁止当前留言方式 |
| `403` | `SHARE_ACCESS_REQUIRED` | 分享密码/站点访问/范围授权未通过 |
| `403` | `CSRF_INVALID` | 登录写请求 CSRF 失败 |
| `404` | `RESOURCE_NOT_FOUND` | 资源不可见或不存在，避免枚举 |
| `409` | `DUPLICATE_REQUEST` | 幂等键已处理 |
| `413` | `CONTENT_TOO_LARGE` | 留言/举报超过长度或配额 |
| `429` | `RATE_LIMITED` | 触发账号、匿名、资源或 IP 限流 |
| `503` | `INTERACTION_SERVICE_UNAVAILABLE` | 交互服务暂时不可用，地图浏览不受影响 |

## 12. 数据模型与保留策略

### 12.1 Comment Service 核心实体

`comments`：

- `id`：`cmt_*`。
- `site_id`、`canonical_share_id`、`share_public_id_snapshot`、`share_item_id`、`feature_id`、`media_id`、`scope`。其中 `canonical_share_id` 是线程身份，`share_public_id_snapshot` 仅用于提交/审计追溯。
- `content_revision`、`resource_snapshot_json`。
- `parent_id`、`thread_depth`。
- `author_type`：`user`、`anonymous`、`admin`。
- `author_user_id`（可空）、`display_name_snapshot`。
- `body_raw_encrypted`（仅受限审核使用）、`body_normalized`、`body_rendered`。
- `contact_ciphertext`、`contact_hash`、`contact_type`；普通查询不返回。
- `content_status`、`moderation_status`、`moderation_level`、`visible_at`。
- `created_at`、`updated_at`、`approved_at`、`deleted_at`。
- `client_request_id` 唯一约束（按作者和资源范围）。

`comment_moderation_decisions`：

- `id`、`comment_id`、`content_revision`、`stage`（`keyword`/`ai`/`human`）。
- `level`、`scores_json`、`reason_codes_json`、`suggested_action`。
- `provider_id`、`model`、`prompt_version`、`keyword_policy_version`。
- `raw_result_ciphertext` 可选且短期保留；默认只保存脱敏摘要和结果哈希。
- `actor_user_id`、`created_at`。

### 12.2 Report Service 核心实体

`reports`：

- `id`：`rpt_*`。
- `report_type`、`canonical_share_id`、`share_public_id_snapshot`、其他资源引用字段、`resource_snapshot_json`。其中 `canonical_share_id` 是举报关联的内部分享身份，外部别名只作为快照保留。
- `reporter_type`、`reporter_user_id`、`display_name_snapshot`。
- `contact_ciphertext`、`contact_hash`、`description_ciphertext`、`evidence_text_ciphertext`。
- `rights_attestation`、`consent_policy_version`。
- `status`、`priority`、`assigned_to`、`duplicate_of`。
- `action_summary_json`、`created_at`、`updated_at`、`closed_at`。

`report_events`：保存状态变化、分派、处理动作和脱敏原因，禁止记录完整认证信息和原始请求头。

### 12.3 保留和删除

- 已公开留言默认保留 730 天；管理员可按站点策略缩短或延长，变更必须记录。
- 拒绝、垃圾和待审留言默认保留 90 天，用于申诉、规则调优和审计；到期删除原文，只保留计数和不可逆摘要。
- 举报原文和联系方式默认保留 730 天；法律/权利工单可由管理员标记为 legal hold，暂停自动删除。
- 匿名联系方式默认保留 90 天，AI 原始响应默认保留 30 天；不得因为审计需要永久保存完整 PII。
- 举报、举报事件和已完成 outbox 事件的默认窗口分别为 730、30、90 天；服务配置统一位于 `config.staticService.interaction.retention`，对应 `MAP_SERVICE_INTERACTION_*_RETENTION_DAYS` 环境变量。`service/bin/cronJob/interactionRetention.js` 按 Asia/Shanghai 每日 03:20 执行清理，法律保留记录不删除。
- 用户删除账号时，账号关联留言按站点策略匿名化或软删除；不得删除正在 legal hold 的举报证据。
- 所有删除任务必须幂等、可观测、可暂停，并在审计中记录数量而非原文。

## 13. 安全、隐私与反滥用

### 13.1 输入与输出安全

- 留言只允许纯文本/安全 Markdown；服务端统一转义，拒绝任意 HTML、事件属性、脚本、iframe 和危险 URL 协议。
- 举报证据 URL 只作为文本保存，不执行 DNS、HTTP、图片下载或网页解析，避免 SSRF。
- AI provider endpoint 只允许管理员配置的 HTTPS 地址或受控内部服务标识；禁止从用户输入读取 endpoint、模型或工具名。
- 公开响应不得包含邮箱、手机号、IP、UA、内部用户 ID、AI 评分、规则词条、管理员备注、Token 或 provider 凭据。

### 13.2 授权与防枚举

- 公开留言和举报都必须先通过现有分享访问上下文；密码分享使用同一 HttpOnly 分享授权 Cookie。
- 资源不存在、分享被暂停和无权访问尽量使用统一错误，不允许通过留言数量、提交错误或响应时间枚举隐藏资源。
- 登录留言写请求使用现有会话和 CSRF；匿名写请求执行同源/Fetch Metadata 校验、Origin 校验和反滥用令牌。
- 管理 API 每个接口按权限码鉴权，不能只依赖后台导航是否展示。

### 13.3 反垃圾与限流

至少配置以下维度：账号、匿名会话、联系哈希、资源、分享、IP 摘要、设备摘要和全局出口。限流响应使用 `429 RATE_LIMITED`，不返回内部桶状态。

可选措施按风险触发：CAPTCHA、邮箱/手机验证、链接数量限制、重复内容冷却、黑名单指纹和分享级留言关闭。验证码供应商脚本必须走现有外部脚本安全策略，不允许任意页面注入。

### 13.4 PII 与第三方 AI

- 联系方式加密存储，密钥与数据库分离；后台只显示部分掩码。
- 审计日志不写原文和联系方式；开发环境也不能为了调试打印完整留言。
- 发送外部 AI 前执行字段级脱敏，保存 provider、模型、提示词版本和结果哈希，便于复核数据流。
- 管理员开启外部 AI 时必须看到数据外发、保留期、失败闭环和成本风险提示，并能一键关闭。

## 14. 非功能需求

- 公开留言列表 p95 目标小于 300 ms（不含冷启动和外部 AI）；留言提交接口 p95 小于 500 ms，并以异步 `202` 返回。
- 留言角标查询不应触发完整 KML 解析；可使用按 `resourceRef` 聚合的缓存，发布/隐藏事件必须使缓存失效。
- 单个 AI provider 不可用时，地图、媒体、信息弹窗和举报入口仍可用；留言进入待审/人工队列。
- 所有异步任务具备幂等键、重试上限、死信/失败状态和管理员可重放入口。
- 指标至少包括：提交数、通过数、拒绝数、待审年龄、AI 延迟/错误/成本、关键词命中、人工覆盖率、举报 SLA、重复举报率、匿名拒绝率。
- 服务日志只记录请求 ID、资源类型、服务状态和脱敏摘要；敏感原文只能在受控数据库中按权限读取。
- 前端面板支持键盘焦点、Esc 关闭、移动端全屏、窄屏换行和 `aria-live` 状态；不能破坏媒体预览焦点恢复和小窗拖拽。
- 数据迁移必须幂等；服务拆分时不得要求一次性停机迁移全部分享内容。

## 15. 第三方开源方案评估

### 15.1 候选结论（2026-08-22 核验）

| 候选 | 已核验能力 | 适配价值 | 主要缺口/风险 | 建议 |
| --- | --- | --- | --- | --- |
| [Remark42](https://github.com/umputun/remark42) | 自托管、Docker、可选匿名访问、多个登录方式、评论审核/封禁；仓库声明 MIT | 适合快速获得成熟评论 UI 和基础审核 | 需要验证点位级稳定 ID、现有 Cookie/CSRF、AI 分级、举报工单和中文运营体验 | 优先做适配器 POC |
| [Artalk](https://github.com/ArtalkJS/Artalk) | 自托管、Docker、HTTP API、评论审核、关键词拦截、验证码；仓库声明 MIT | 中文界面和关键词/验证码能力较接近需求 | 仍需验证匿名字段、外部用户体系、审核结果 webhook、AI 扩展和媒体预览嵌入体验 | 与 Remark42 并行 POC |
| [Isso](https://github.com/isso-comments/isso) | 自托管、SQLite、轻量评论系统；仓库声明 MIT | 部署简单，适合低复杂度评论 | 内置审核、AI、举报和管理能力相对有限，前端/中文生态需额外适配 | 仅作为轻量备选 |
| [Cusdis](https://github.com/djyde/cusdis) | 隐私友好的轻量评论系统 | 集成概念简单 | GitHub 仓库已归档，仓库声明 GPL-3.0，长期维护和扩展风险较高 | 不列为首选 |

### 15.2 采用原则

第三方组件只有在以下 POC 验收全部通过后才可采用。Phase 0 仅完成候选能力、许可证和适配器契约评审；真实 provider 部署、跨域/CSRF 联调、审核 webhook 双向同步和恢复演练属于 Phase 1 的实施验收：

1. 能将外部 `sharePublicId` 解析为内部 `canonicalShareId`，并把 `canonicalShareId + shareItemId + featureId` 映射为稳定、不可碰撞的评论页面键；分享别名轮换不得改变线程身份。
2. 可以复用现有公开分享授权，不因嵌入组件引入任意跨域读写或独立绕过认证。
3. 待审核内容不会被组件默认公开；组件的审核状态可通过 API/webhook 与内部 Moderation Service 双向同步。
4. 匿名邮箱/手机字段可按项目策略采集、加密和脱敏，且不会被第三方前端公开。
5. 能够禁用内置不符合需求的 HTML、附件、头像抓取、第三方统计或社交登录。
6. 能够导出完整评论、审核历史和删除事件，避免供应商锁定。
7. 许可证、维护活跃度、漏洞响应、中文本地化、升级方式和备份恢复经过评审。

当前已经采用的技术姿态是“内部 headless Comment/Moderation/Report Service 负责正式存储、公开 API 和最终状态，第三方只做可选 UI、旁路镜像、导出迁移或未来替代方案验证”。如果未来改为由第三方承担公开评论 UI 或基础存储，必须另立需求、完成双向同步与迁移验收，不能把现有 161 单向镜像直接视为生产切换完成。

## 16. 分阶段交付

### Phase 0：契约和策略冻结（已完成）

- 确定资源引用、留言/举报状态机、权限码、匿名必填字段和保留策略。
- 为现有公开分享补充稳定 Feature/Media 引用检查。
- 完成 Remark42/Artalk 适配器 POC 和许可证评审，不在生产接入未验证组件。

Phase 0 已冻结的实现基线：

- 现有随机 Base64URL `publicId`、`shi_*` 分享项 ID 和历史用户 Feature ID 继续可读；新交互引用通过 `resourceRefs` 统一校验。
- 发布快照为每个 Feature 保存 `resourceRefs.featureId` 和派生的 `resourceRefs.media[]`；媒体摘要不保存原始 URL，只保存 opaque `media_*`、类型和来源类别。
- 描述媒体按规范化 URL 派生 ID；资源集合媒体按集合项 ID 派生，同一集合项可更新 URL，集合项 ID 变化才形成新资源。旧引用进入 orphaned 处理，不静默重绑。
- 公开 manifest/file 读取前执行 fail-closed 校验；旧快照缺少 `resourceRefs` 时只做一次兼容性派生，已有但不一致的元数据直接返回 `PUBLISHED_RESOURCE_REFERENCE_INVALID`。
- 第三方适配器仅生成 provider locator，内部稳定 shareId 和最终审核状态仍由 Interaction Adapter/Comment Service 掌握。

Phase 0 交付物已落库：资源引用和状态策略纯函数、权限码种子、公开分享引用检查、第三方 provider locator POC、对应 `node:test` 测试和本评审文档。

### Phase 1：留言 + 举报基础闭环（已完成）

- [x] 独立 Comment schema、Comment/Moderation/Adapter 服务接口和 outbox。
- [x] 同源留言 facade、留言列表/计数/策略/提交及管理审核/重新审核/策略/关键词接口。
- [x] 独立 Report Service、公开举报/来源信息 facade、举报表单和管理员工单。
- [x] 确定性校验、关键词规则和人工审核；AI 仅作为辅助审计，不改变人工最终状态。
- [x] 管理后台完成留言队列、举报队列、审计和基础限流。

### Phase 2：Artalk 受控 POC（已完成 161 隔离实测，公开生产接入延期）

- 锁定 `2.10.0` 与镜像 digest，完成 HTTP API/OpenAPI、pending 隔离、管理审核/删除、Artrans 导出、临时 SQLite 导入、重启持久化和 CORS 验收。
- 161 入口为 `http://192.168.0.161:33089`，仅对内网维护人员开放；数据、管理凭据和 1Panel 模板均保留在 161 受控目录。
- Artalk 不作为内部事实源；公开页面仍调用 map-service 同源 Interaction Adapter。后续公开生产接入需要独立 HTTPS origin、审核双向同步方案和维护窗口。
- Phase 2 是可选技术验证，不是 Phase 1 留言闭环的运行依赖。代码默认关闭 Artalk 镜像，161 内测显式开启，66 生产保持关闭；未安装或停用 Artalk 时 Phase 1/3 能力仍必须全部可用。
- Artalk 后台仅用于查看镜像和受控导出，不作为正式审核工作台；在 Artalk 中直接修改的状态不会回写内部服务，且可能被后续校准覆盖或重建。

### Phase 3：AI 审核和运营配置（已完成）

- 服务端受控 provider adapter、提示词版本、结构化输出、预算/熔断和健康验证。
- 等级到动作配置、人工覆盖、重新审核、规则试运行和影响预览。
- PII 脱敏、外发审计、指标和失败重放；provider 故障 fail-closed。
- 后台入口：`/admin/interaction-ai`（菜单“AI 审核与规则”）；AI 运行策略使用独立管理 API `/api/v1/admin/moderation/ai/settings`，provider 使用 `/api/v1/admin/moderation/providers`，关键词使用 `/api/v1/admin/moderation/keywords`。
- 运营工具 API：`POST /api/v1/admin/moderation/keywords/preview`、`POST /api/v1/admin/moderation/ai/impact-preview`、`GET/POST /api/v1/admin/moderation/ai/prompts`、`POST /api/v1/admin/moderation/events/replay`、`POST /api/v1/admin/comments/:id/ai-replay`。
- 活动策略发布后立即同步运行时引擎；策略只影响 AI 开关、provider 选择、版本、预算、并发和等级动作，不越权修改留言/举报开关。

Phase 3 的实际代码和入口：

- 运行时：`service/bin/interaction/aiModeration.js`、`providerRegistry.js`、`interactionService.js`、`moderationService.js`；AI 扩展表和提示词版本表由 `service/bin/interaction/database.js` 的幂等迁移创建。
- 管理后台：`/admin/interaction-ai`，菜单名为“AI 审核与规则”。页面包含 AI 运行配置、provider、关键词规则、提示词版本、影响预览、失败事件重放和可选 Artalk 镜像状态卡；进入页面仍由服务端权限 `admin.moderation.ai.manage`、`admin.moderation.keyword.manage`、`admin.comment.policy.manage` 控制。
- 管理 API：`/api/v1/admin/moderation/ai/settings`、`/moderation/providers`、`/moderation/keywords`、`/moderation/ai/prompts`、`/moderation/ai/impact-preview`、`/moderation/events/replay` 和 `/admin/comments/:id/ai-replay`。所有写操作使用会话、细粒度 RBAC、CSRF 和审计。
- Artalk 161 可选镜像：`service/bin/interaction/artalkMirror.js` 与 `service/bin/cronJob/artalkMirror.js`。内部留言状态是唯一事实源，只有 `active + approved` 才会投影到 Artalk；Artalk 不可用时留言、举报和公开审核链路继续运行。默认关闭，161 通过受控 `.env` 开启，66 保持关闭；镜像 Endpoint、账号和凭据不通过后台页面修改。

### Phase 4：通知和更细粒度治理（待开始）

- 可选邮件/站内通知，通知内容不泄露审核内部信息。
- 媒体级隐藏、分享所有者脱敏通知、侵权工单补充材料和 legal hold。
- 异步事件总线和多实例部署。

## 17. 验收标准

### 17.1 留言

- 管理员关闭匿名留言时，匿名表单不出现或提交返回 `ANONYMOUS_COMMENTS_DISABLED`；服务端测试覆盖绕过前端的请求。
- 未审核留言永远不出现在公开列表、公开缓存和数量角标；审核放行后数量和列表一致增加。
- 登录用户、匿名用户均能按策略提交；匿名表单按管理员必填字段校验，联系方式不在公开响应和普通日志中出现。
- 同一 `clientRequestId` 重试不会产生重复留言；重复内容和资源级限流返回明确 `429/409`。
- 关键词硬拒绝不会调用 AI；风险命中进入人工/AI 队列；AI 超时不会自动公开。
- 管理员可以将 AI 判定重新标注、放行或拒绝；每次覆盖保留原决策和审计记录。
- 留言服务不可用时，地图、点位媒体、来源信息和举报入口仍可用。

### 17.2 举报

- 信息弹窗包含来源说明、协议入口和举报按钮；桌面/移动端均可通过键盘或触控打开、关闭和返回。
- 举报只能由管理员 API 查询；普通用户、分享所有者和公开接口无法列出举报内容或其他举报人信息。
- 侵权/下架类型要求权利声明和可联系信息；举报文本不会因敏感词命中被静默丢弃。
- 管理员可以分派、合并、驳回、关闭和执行受控分享动作；全量封禁操作显示影响范围并写审计。
- 重复举报可合并但保留原始计数，处理状态和 SLA 指标可查询。

### 17.3 工程质量

- 纯函数测试覆盖资源引用规范化、状态机、关键词匹配、AI 输出 schema、动作矩阵、匿名字段策略和分页游标。
- API 集成测试覆盖公开分享授权、密码分享、站点访问、CSRF、权限失败、敏感字段脱敏、服务异常和幂等。
- 浏览器回归覆盖 2D/3D 媒体预览、留言面板、信息/举报弹窗、移动端全屏、焦点恢复和连续缩放。
- 管理后台测试覆盖最小权限、设置影响预览、人工覆盖、重审、举报动作和审计。
- 实现阶段按项目要求运行 `npm run check`、相关 `node:test`、`npm test`、`npm run build` 和 `git diff --check`。

## 18. 风险、权衡与待决策项

### 18.1 主要风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 第三方评论组件默认公开或状态模型不够细 | 违规内容先曝光、迁移困难 | POC 先验证；内部审核状态作为最终事实源 |
| AI 误判或供应商不可用 | 合规留言被拦截、违规留言漏过 | 关键词确定性规则 + fail-closed + 人工覆盖 + 版本化 |
| 匿名 PII 泄露 | 隐私和合规风险 | 最小采集、加密、字段级脱敏、短保留和权限隔离 |
| 举报被恶意灌水 | 管理员队列被淹没 | 资源/联系哈希/会话/出口多维限流、重复合并和优先级 |
| Feature ID 在发布时变化 | 留言和举报指向错误点位 | 发布前稳定 ID 校验；变更目标设为 orphaned，不静默重绑 |
| 分享被暂停/撤销后的缓存泄漏 | 已不可见内容继续可读 | 复用分享授权、事件失效、公开接口 no-store/短缓存 |
| 服务拆分过早导致运维复杂 | 交付变慢、故障点增多 | P0 模块边界先行，P1 进程隔离，规模触发后再上事件总线 |

### 18.2 需要产品确认的事项

以下事项不影响本需求文档成立，但实现前必须在配置或需求补充中定稿：

1. 是否允许公开用户互相回复，还是只允许管理员回复。
2. 留言是否允许分享所有者看到脱敏的待审反馈摘要；本版默认不授予审核权。
3. 侵权下架是否需要对接邮件通知、工单系统或外部法律流程。
4. legal hold 的审批角色和解除流程。
5. 是否接受第三方评论组件的独立登录 UI，还是必须完全复用 map-service 登录。

## 19. 参考资料与外部核验

以下链接用于候选方案评估，采用前应重新核验版本、许可证、安全公告和部署文档：

- Remark42 项目：[GitHub](https://github.com/umputun/remark42)、[官方文档](https://remark42.com/docs/)。
- Artalk 项目：[GitHub](https://github.com/ArtalkJS/Artalk)、[评论审核文档](https://artalk.js.org/guide/backend/moderator.html)、[HTTP API 文档](https://artalk.js.org/http-api.html)。
- Isso 项目：[GitHub](https://github.com/isso-comments/isso)。
- Cusdis 项目：[GitHub](https://github.com/djyde/cusdis)；当前仓库归档，不作为首选依赖。

外部项目的功能和许可证结论只用于候选筛选，不替代本项目的隐私评估、漏洞评审、中文内容策略和正式供应链审批。
