# 交互功能部署与接入手册

> 状态：适用于当前内部 Interaction Service 实现
>
> 更新日期：2026-08-24
>
> 事实源：service/bin/interaction/、shared/interaction-contracts.js、shared/interaction-policy.js、[交互 API 契约](./api.md#交互领域契约-phase-1bc)

本文是留言、审核、举报和可选 AI 审核的主运行手册。系统维护者可以按本文完成安装、初始化、上线、升级、备份、恢复和故障排查；前端或受控自动化 agent 可以按本文完成 API 接入。

本文描述的是当前同仓库、同进程、单机单写进程的内部服务。Artalk 2.10.0 只完成了受控 POC，生产部署明确延期，不是本系统上线前置条件；当前 interaction.sqlite 和内部 Comment/Moderation/Report Service 才是留言、审核和举报的最终事实源。

## 1. 运行边界

### 1.1 已交付能力

- 公开分享中的 Feature 留言、数量、策略摘要、来源信息和举报入口。
- 留言的确定性关键词审核、人工审核、重新审核、软删除、回复可见性和 outbox 审计。
- 分享、Feature、Media 三种举报目标，以及去重、幂等、工单状态和分享暂停/封禁动作。
- 可选的服务端 AI provider、健康验证、超时、重试、并发、每日预算、熔断、原始结果加密保留和人工最终裁决。
- 独立 SQLite 数据库、每日保留清理、脱敏日志、聚合指标和带 manifest 的备份恢复 helper。

### 1.2 明确不包含的能力

- 不支持通过浏览器提交任意 AI 函数、请求头、密钥或任意 URL；AI provider 必须使用服务端注册的 adapter 和 HTTPS host allowlist。
- hide_media、hide_comment 举报动作在受控治理能力接入前会明确拒绝，不会返回伪造成功。
- 不承诺多实例横向扩展。登录/注册/分享密码/留言限流包含单进程内存状态，SQLite 也按单写进程部署。
- 不要求先部署 Artalk；如果未来接入，必须继续经过 Interaction Adapter，不能绕过本系统资源授权、审核最终状态或审计。

## 2. 架构和数据流

~~~text
浏览器/受控客户端
        |
        v
Express /api/v1
  |-- 分享访问、站点访问、已发布快照授权
  |-- Cookie 会话 + CSRF 或匿名同源校验
  v
InteractionService
  |-- InteractionAdapter      -> canonical share / resource proof
  |-- CommentService          -> comments / outbox
  |-- ModerationService       -> keyword / human / AI audit decisions
  |-- ReportService           -> reports / report_events
  |-- AiModerationEngine      -> server-owned provider adapter
  v
.db/interaction.sqlite (schema migration version 1 + additive AI tables)
~~~

公开留言只有同时满足 content_status=active 和 moderation_status=approved 才可见或计数。公开请求使用 publicId，服务端会解析为内部 canonicalShareId，再验证 shareItemId + featureId (+ mediaId) 是否属于已发布快照。无法区分“资源不存在”和“无权访问”时统一返回 RESOURCE_NOT_FOUND。

留言原文、举报说明、证据和联系方式使用交互密钥加密；联系方式另保存 HMAC 用于去重和限流。公开响应、普通日志和 provider 管理响应不包含密文、Token、Cookie、IP、User-Agent、内部用户 ID 或 AI 原始响应。

## 3. 部署前置条件

### 3.1 软件和目录

- Node.js >=22.13.0。
- npm >=10.0.0；本项目只使用 npm，不重新引入 Yarn。
- 持久化磁盘至少保存 .db/、.db/admin/、log/ 和 logs/pm2/。
- 生产进程以专用非 root 账号运行；数据库目录和密钥文件只授予服务账号及备份账号。
- 反向代理必须提供 HTTPS，并将真实协议、Host 和客户端来源按实际拓扑传给应用。

### 3.2 生产必配密钥

交互数据库首次真正使用时才检查密钥；生产必须在启动前配置以下变量之一：

~~~bash
MAP_SERVICE_INTERACTION_SECRET_KEY='replace-with-a-long-random-stable-secret'
# 或复用已经稳定保存的分享密钥
MAP_SERVICE_SHARE_SECRET_KEY='replace-with-a-long-random-stable-secret'
~~~

优先使用独立的 MAP_SERVICE_INTERACTION_SECRET_KEY。密钥必须跨发布、重启、备份恢复和 PM2 重建保持不变；更换密钥会使已有交互密文无法解密。不要把密钥写入仓库、日志、API 请求体或备份 manifest。

用户体系仍需要自己的生产初始化配置，详见[用户体系部署与运维](./user-system-deployment.md)，至少包括安全的首个超级管理员和 MAP_SERVICE_SHARE_SECRET_KEY 的持久化策略。

## 4. 配置参考

配置最终读取 config.staticService.interaction。环境变量未设置时使用下表默认值；生产应显式设置密钥、数据库路径和需要改变的安全边界。

### 4.1 数据库、反向代理和限流

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| MAP_SERVICE_INTERACTION_DATABASE | .db/interaction.sqlite | 交互 SQLite 路径；相对路径相对于项目根目录 |
| MAP_SERVICE_INTERACTION_SECRET_KEY | 生产为空 | 交互密文 AES-256-GCM/HMAC 密钥；生产必须配置 |
| MAP_SERVICE_TRUST_PROXY | 不信任 | 仅按实际可信跳数或网段设置，影响 req.ip、req.secure、Cookie 和限流 |
| MAP_SERVICE_COMMENT_RATE_MAX | 10 | 单个留言提交 key 的窗口上限 |
| MAP_SERVICE_COMMENT_RATE_WINDOW_MS | 60000 | 留言限流窗口，单位毫秒 |

MAP_SERVICE_ENABLE_AUTO_PULL 只适用于受控本地维护，生产更新必须走发布流程，不要在生产开启。

### 4.2 AI 审核

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| MAP_SERVICE_AI_ENABLED | false | 是否创建异步 AI 审核引擎 |
| MAP_SERVICE_AI_PROVIDER_ID | 空 | 指定默认 provider；也可使用数据库中的 default 指针 |
| MAP_SERVICE_AI_PROMPT_VERSION | interaction-moderation-v1 | AI 提示词版本标识 |
| MAP_SERVICE_AI_POLICY_VERSION | 与 prompt 相同 | AI 策略版本标识 |
| MAP_SERVICE_AI_TIMEOUT_MS | 3000 | AI 请求超时 |
| MAP_SERVICE_AI_MAX_ATTEMPTS | 2 | 总尝试次数，包含第一次请求 |
| MAP_SERVICE_AI_DAILY_BUDGET | 0 | 正数为每日硬上限；0 表示无限制，不是立即耗尽 |
| MAP_SERVICE_AI_MAX_CONCURRENCY | 2 | provider 执行并发槽位 |
| MAP_SERVICE_AI_PROVIDER_VERIFICATION_TTL_MS | 86400000 | provider 健康验证有效期，默认 24 小时 |
| MAP_SERVICE_AI_ALLOWED_HOSTS | 空 | 逗号分隔的精确 hostname allowlist；没有 allowlist 时 provider 不可注册 |

provider 的密钥不放在数据库明文中。当前默认 resolver 只接受如下形式：

~~~text
secretRef: env://MAP_SERVICE_AI_PROVIDER_KEY
~~~

运行进程必须能读取 MAP_SERVICE_AI_PROVIDER_KEY，但 API 响应永远不会返回 secretRef 或密钥内容。

### 4.3 数据保留

| 环境变量 | 默认天数 | 清理对象 |
| --- | ---: | --- |
| MAP_SERVICE_INTERACTION_PUBLIC_RETENTION_DAYS | 730 | 已公开留言 |
| MAP_SERVICE_INTERACTION_PRIVATE_RETENTION_DAYS | 90 | 非公开留言 |
| MAP_SERVICE_INTERACTION_CONTACT_RETENTION_DAYS | 90 | 匿名联系方式密文和哈希 |
| MAP_SERVICE_INTERACTION_AI_RETENTION_DAYS | 30 | AI 原始结果密文 |
| MAP_SERVICE_INTERACTION_REPORT_RETENTION_DAYS | 730 | 举报工单 |
| MAP_SERVICE_INTERACTION_REPORT_EVENTS_RETENTION_DAYS | 30 | 举报事件 |
| MAP_SERVICE_INTERACTION_OUTBOX_RETENTION_DAYS | 90 | 已完成或失败 outbox 事件 |

legal_hold=1 的留言和举报不删除。清理留言前会先擦除过期联系方式，再按留言保留期删除；回复会在父留言之前按深度删除。

## 5. 首次部署

以下步骤适用于新主机或新工作区。生产发布前应先在隔离环境使用同一 Node/npm 主版本完成一次演练。

### 5.1 安装、检查和构建

~~~bash
cd /path/to/map-service
npm ci
npm run check
node --test tests/interaction-*.test.js
npm test
npm run build
~~~

没有使用 lockfile 的开发环境可用 npm install，生产发布优先使用 npm ci 保证 package-lock.json 一致。

### 5.2 准备目录和环境

~~~bash
mkdir -p .db .db/admin log logs/pm2
export NODE_ENV=production
export MAP_SERVICE_INTERACTION_SECRET_KEY='replace-with-a-long-random-stable-secret'
export MAP_SERVICE_SHARE_SECRET_KEY='replace-with-a-long-random-stable-secret'
export MAP_SERVICE_ADMIN_USERNAME='map-root'
export MAP_SERVICE_ADMIN_PASSWORD='replace-with-a-long-unique-password'
export MAP_SERVICE_REQUIRE_SECURE_BOOTSTRAP=true
~~~

生产环境不要使用 admin/admin。更推荐把上述变量写入权限为 0600 的主机密钥文件，由发布系统或进程管理器加载；不要把带密钥的 shell 历史或 PM2 dump 提交到仓库。

### 5.3 初始化用户体系

首次启动时，用户数据库会执行自己的幂等迁移并创建首个超级管理员。启动后立即：

1. 使用引导账号登录 /api/v1/auth/login 或 /api/v1/admin/auth/login。
2. 完成强密码修改。
3. 创建第二个受控应急超级管理员。
4. 为日常审核人员分配最小权限角色，不把 system.super_admin 当作日常角色。

用户数据库默认是 .db/map-service.sqlite，可由 MAP_SERVICE_USER_DATABASE 覆盖。不要手工修改 schema_migrations、密码哈希、会话哈希或角色关系。

### 5.4 启动和健康检查

直接运行：

~~~bash
npm run exec
~~~

PM2 运行：

~~~bash
pm2 start pm2.config.cjs --update-env
pm2 save
~~~

默认监听 :: 的 3088 端口。检查：

~~~bash
curl --fail --silent http://127.0.0.1:3088/health
curl --fail --silent http://127.0.0.1:3088/api/v1/health
~~~

GET /health 和 GET /api/v1/health 只证明进程存活，不代表交互密钥、策略或 AI provider 已完成配置。InteractionService facade 会在第一次访问交互接口时惰性打开数据库并执行迁移；保留 cron 在每日 tick 时会用独立连接打开数据库，因此空库也可能在首次清理任务运行时出现。

### 5.5 发布第一版交互策略

交互数据库没有活动同意策略时，留言和举报写入会 fail-closed 返回 INTERACTION_SERVICE_UNAVAILABLE。首次部署必须由拥有 admin.comment.policy.manage 的账号通过管理后台或 API 发布策略。

最小安全策略示例：

~~~json
{
  "comments": {
    "enabled": true,
    "anonymous": {
      "enabled": false,
      "contactRequirement": "email_or_phone",
      "requireConsent": true
    },
    "maxLength": 2000,
    "moderationRequired": true,
    "publicReplyEnabled": false
  },
  "moderation": {
    "autoApproveLevels": [],
    "ai": { "enabled": false },
    "keywords": { "enabled": true }
  },
  "reports": {
    "enabled": true,
    "types": ["unsafe_content", "illegal_content", "copyright_takedown", "privacy", "misleading", "other"],
    "targetScopes": ["share", "feature", "media"]
  },
  "mediaDetails": {
    "generalDescription": "媒体资源可能来自网络公开分享或用户自行上传；如发现资源存在违规或侵权，可通过举报投诉渠道反馈。"
  }
}
~~~

如果要开放匿名留言，必须同时把 comments.anonymous.enabled 设为 true，并保留联系方式要求和同意勾选；不要仅在前端隐藏登录门槛。策略发布后，再通过关键词管理接口发布第一版规则（没有规则时可发布空数组以建立版本）：

~~~json
{
  "rules": [],
  "changeReason": "首次上线建立关键词版本"
}
~~~

策略和关键词发布均是管理写请求，使用当前管理员 Cookie 和 `X-CSRF-Token` 调用：

~~~http
PUT /api/v1/admin/moderation/settings
Content-Type: application/json
X-CSRF-Token: <map_csrf_token>
~~~

~~~http
PUT /api/v1/admin/moderation/keywords
Content-Type: application/json
X-CSRF-Token: <map_csrf_token>
~~~

两个接口都返回新版本号。发布后用 `GET /api/v1/admin/moderation/settings` 和 `GET /api/v1/admin/moderation/keywords` 核对 `published=true`；没有活动策略时不要继续排查前端，因为服务端会主动拒绝写入。

### 5.6 前台入口与匿名留言配置

管理员登录后台后，进入 `/admin/interaction-policy`（菜单名称：**留言与举报设置**）。该页面需要 `admin.comment.policy.manage`；只有 `admin.comment.read` 的账号可以读取策略，但不能保存。

页面中的关键开关与服务端策略字段一一对应：

- **启用留言**：控制公开留言总开关。
- **允许匿名留言**：控制未登录访客是否可以提交；关闭时前端提示先登录，服务端仍会返回 `AUTH_REQUIRED`，不能依赖前端隐藏作为安全边界。
- **匿名联系方式要求**：邮箱、手机号、二选一或同时填写。
- **匿名留言必须同意相关条款**：控制匿名表单的同意勾选。
- **留言提交后需要审核**：控制初始审核策略；公开列表始终只返回 `active + approved`。
- **启用举报 / 允许匿名举报**：分别控制举报总开关和匿名举报权限。举报入口不在媒体预览顶部直接展示，而是在“媒体详情”对话框内展示。
- **媒体详情通用说明**：维护 `mediaDetails.generalDescription`，展示在公开分享媒体详情的摘要区。建议使用简短、稳定的合规说明；未来类似全局文案继续扩展到 `mediaDetails` 命名空间。

保存时页面会保留 AI、关键词、自动动作、保留期、举报类型和目标范围等未展示字段。策略保存后建议用公开接口重新读取 `/api/v1/public/kml-shares/:publicId/comments/policy` 与 `/api/v1/public/kml-shares/:publicId/info`，确认前台得到的摘要与后台一致。匿名留言同意项在策略要求时默认勾选，用户仍可主动取消后无法提交。

媒体预览的留言按钮要求当前项来自公开分享并携带 `sharePublicId + shareItemId + featureId`；媒体详情按钮对本地 KML 和公开分享媒体都可用。资源集合中的媒体项还会携带稳定 `mediaId`，从详情面板进入举报时自动使用 `scope=media`。

## 6. 反向代理、Cookie 和 CSRF

### 6.1 站点拓扑

- 对外只暴露反向代理的 HTTPS origin，应用端口 3088 仅允许本机或受控内网访问。
- 应用根据 req.secure 设置 Secure Cookie；反向代理终止 HTTPS 时，只有可信代理配置正确，Cookie 才会按预期工作。
- MAP_SERVICE_TRUST_PROXY 只填实际可信跳数或网段，例如 1 或 loopback,10.0.0.0/8；公网直连应用时不要设置过宽的 true。
- 代理、CDN 和负载均衡日志不能记录完整查询串中的密码、Token、Cookie、CSRF 或分享密码。

### 6.2 会话写请求

登录成功后服务端写入同源 map_user_session（HttpOnly）和 map_csrf_token（前端可读）Cookie。所有登录态的非 GET/HEAD/OPTIONS 请求都要发送：

~~~http
X-CSRF-Token: <map_csrf_token>
~~~

登录、注册和匿名交互写请求还需要 Fetch Metadata 或严格的 Origin/Referer 同源校验。跨站脚本、随意伪造 X-Map-Embed-Context 或关闭 CSRF 都不是受支持的接入方式。

## 7. 前端和受控客户端接入

### 7.1 接入原则

1. 先通过正常分享页获得站点访问和分享访问授权，再调用公开交互接口。
2. 只使用公开 publicId、shareItemId、featureId、mediaId；不要把 canonicalShareId、数据库主键或中文名称放入 URL。
3. 先读取 GET /comments/policy，根据服务端返回的长度、匿名开关和联系方式要求渲染表单；不要把固定策略硬编码成事实源。
4. 客户端必须提交 consent: true，但不要自行填写或伪造 consentPolicyVersion；服务端会从活动策略版本注入数据库外键。
5. 每次写请求生成稳定的 clientRequestId，网络重试复用同一个值，避免重复留言或重复举报。
6. 待审核留言只展示“已提交，等待审核”的通用回执，不把请求正文当作已公开内容回显到其他访客视图。

### 7.2 公共读取接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /api/v1/public/kml-shares/:publicId/comments/policy | 策略摘要、匿名开关、长度和审核摘要 |
| GET | /api/v1/public/kml-shares/:publicId/info | 来源说明、媒体详情通用说明、协议链接、举报能力 |
| GET | /api/v1/public/kml-shares/:publicId/comments/count | 当前资源已公开留言准确计数 |
| GET | /api/v1/public/kml-shares/:publicId/comments | 读取 active + approved 留言；支持 shareItemId、featureId、cursor、limit |

留言读取的 shareItemId 和 featureId 必须成对对应已发布快照中的 Feature。游标是不透明值，只能原样回传给同一资源查询；客户端不得解码、拼接或跨资源复用。

### 7.3 提交留言

留言只支持 scope=feature，正文最多 2000 个 Unicode 字符。登录用户提交时使用会话身份；匿名提交还必须满足策略允许、显示名和联系方式要求。

~~~http
POST /api/v1/public/kml-shares/shr_xxx/comments
Content-Type: application/json
X-CSRF-Token: <map_csrf_token>
~~~

~~~json
{
  "body": "这里的路线说明需要补充。",
  "displayName": "访客",
  "email": "user@example.com",
  "phone": "",
  "clientRequestId": "cmt_req_20260824_001",
  "consent": true,
  "resourceRef": {
    "sharePublicId": "shr_xxx",
    "shareItemId": "shi_xxx",
    "featureId": "feature_xxx",
    "scope": "feature"
  }
}
~~~

成功返回 HTTP 202，表示已接收，不表示已经公开：

~~~json
{
  "accepted": true,
  "commentId": "cmt_xxx",
  "status": "pending",
  "publiclyVisible": false,
  "duplicate": false,
  "message": "留言已提交，审核通过后显示"
}
~~~

登录用户的 displayName 由服务端账号资料决定；匿名用户的显示名必须为 2～64 个字符。服务端会执行 NFKC、换行、控制字符、HTML/脚本、事件属性和 javascript:/data:/file: 协议校验。

### 7.4 提交举报

举报允许 scope=share|feature|media。说明最多 4000 个字符，证据说明最多 8000 个字符。copyright_takedown 还必须提供权利人名称、联系方式和 rightsAttestation: true。

~~~http
POST /api/v1/public/kml-shares/shr_xxx/reports
Content-Type: application/json
X-CSRF-Token: <map_csrf_token>
~~~

~~~json
{
  "type": "copyright_takedown",
  "description": "该媒体未经授权使用。",
  "evidenceText": "权利证明已准备，可按工单联系。",
  "displayName": "权利人",
  "email": "rightsholder@example.com",
  "phone": "",
  "rightsAttestation": true,
  "clientRequestId": "rpt_req_20260824_001",
  "consent": true,
  "resourceRef": {
    "sharePublicId": "shr_xxx",
    "shareItemId": "shi_xxx",
    "featureId": "feature_xxx",
    "mediaId": "media_xxx",
    "scope": "media"
  }
}
~~~

成功返回 HTTP 202 和通用回执。举报正文不会进入公开留言、关键词或 AI 审核流；服务端按资源、范围、类型、联系方式摘要和日期窗口生成 dedupe key，重复举报会合并为已有工单事件。

### 7.5 curl 登录态示例

以下示例仅用于同源或受控维护客户端；生产脚本应通过安全的凭据注入方式提供密码，不要把密码写入脚本。

~~~bash
BASE_URL='https://maps.example.com'
COOKIE_JAR="$(mktemp)"

curl --fail --silent --show-error \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -H "Origin: $BASE_URL" \
  -d '{"username":"map-root","password":"replace-at-runtime","remember":false}' \
  "$BASE_URL/api/v1/auth/login"

CSRF_TOKEN="$(awk '$6 == "map_csrf_token" { print $7 }' "$COOKIE_JAR")"

curl --fail --silent --show-error \
  -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -H "Origin: $BASE_URL" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"body":"测试留言","clientRequestId":"agent-cmt-001","consent":true,"resourceRef":{"sharePublicId":"shr_xxx","shareItemId":"shi_xxx","featureId":"feature_xxx","scope":"feature"}}' \
  "$BASE_URL/api/v1/public/kml-shares/shr_xxx/comments"
~~~

受控 CLI 如果没有浏览器来源头，登录态写请求仍必须使用会话和 CSRF；匿名写请求没有会话时必须提供严格同源来源，不能用任意 Origin 伪装通过。

## 8. 管理后台和权限

管理接口使用用户 Cookie 会话、逐路由权限和写操作 CSRF。新登录不签发旧式 Bearer Token。超级管理员具有全部权限；内置 admin 角色只包含日常留言读取/审核和举报读取/处理，不包含策略、关键词或 AI provider 配置权限。

| 权限 | 作用 |
| --- | --- |
| admin.comment.read | 留言列表、详情、策略读取 |
| admin.comment.moderate | 人工审核、重新审核、软删除 |
| admin.comment.policy.manage | 发布留言/举报策略版本 |
| admin.moderation.keyword.manage | 读取和发布关键词版本 |
| admin.moderation.ai.manage | provider 列表、配置、验证、设为默认 |
| admin.report.read | 举报列表和详情 |
| admin.report.manage | 举报动作和治理审计 |

完整管理路由：

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| GET | /api/v1/admin/comments | admin.comment.read |
| GET | /api/v1/admin/comments/:id | admin.comment.read |
| POST | /api/v1/admin/comments/:id/review | admin.comment.moderate + CSRF |
| POST | /api/v1/admin/comments/:id/reprocess | admin.comment.moderate + CSRF |
| DELETE | /api/v1/admin/comments/:id | admin.comment.moderate + CSRF |
| GET | /api/v1/admin/moderation/settings | admin.comment.read |
| PUT | /api/v1/admin/moderation/settings | admin.comment.policy.manage + CSRF |
| GET | /api/v1/admin/moderation/keywords | admin.moderation.keyword.manage |
| PUT | /api/v1/admin/moderation/keywords | admin.moderation.keyword.manage + CSRF |
| GET | /api/v1/admin/moderation/providers | admin.moderation.ai.manage |
| POST/PUT | /api/v1/admin/moderation/providers | admin.moderation.ai.manage + CSRF |
| POST | /api/v1/admin/moderation/providers/:id/verify | admin.moderation.ai.manage + CSRF |
| POST | /api/v1/admin/moderation/providers/:id/default | admin.moderation.ai.manage + CSRF |
| GET | /api/v1/admin/reports | admin.report.read |
| GET | /api/v1/admin/reports/:id | admin.report.read |
| POST | /api/v1/admin/reports/:id/actions | admin.report.manage + CSRF |

人工审核是最终权威。审核状态、内容状态和回复父子约束由服务层和 SQLite trigger 共同保护；父留言失去公开资格时回复会隐藏，父留言孤立时回复会进入 orphaned，恢复父留言不会自动恢复旧回复。

举报可用动作：no_action、mark_duplicate、request_more_info、escalate_legal、block_share、pause_share。执行 mark_duplicate 必须提供关联工单，所有动作必须填写处理原因。

## 9. AI provider 配置

AI 是可选的异步建议链路，不是公开留言主链路的前置依赖。留言创建后 AI 只追加 stage=ai 决策；AI 故障、超时、坏 JSON、低置信度、预算耗尽、熔断和验证过期统一 fail-closed 为 unknown + review，不会自动公开留言。

### 9.1 配置前检查

1. 申请 provider 的 HTTPS endpoint 和模型名称。
2. 将 endpoint 的精确 hostname 加入 MAP_SERVICE_AI_ALLOWED_HOSTS，例如 api.example-ai.com，不要填 URL、通配符或内网地址。
3. 将 provider 密钥放入运行账号可读的秘密管理系统，并映射为环境变量，例如 MAP_SERVICE_AI_PROVIDER_KEY。
4. 重启或 reload 进程使 allowlist 和密钥进入运行环境。

provider endpoint 必须是无用户名/密码的 HTTPS URL；服务端会拒绝 localhost、内网、环回、link-local、metadata、文档保留地址、DNS 重绑定地址和重定向。

### 9.2 注册、验证和设为默认

先在运行环境中设置非敏感配置和 provider 密钥：

~~~bash
export MAP_SERVICE_AI_ALLOWED_HOSTS='api.example-ai.com'
export MAP_SERVICE_AI_PROVIDER_KEY='replace-at-runtime'
export MAP_SERVICE_AI_ENABLED=true
export MAP_SERVICE_AI_PROVIDER_ID='provider-main'
~~~

通过拥有 admin.moderation.ai.manage 的会话创建 provider：

~~~json
{
  "id": "provider-main",
  "name": "主审核模型",
  "adapterId": "openai-compatible",
  "endpoint": "https://api.example-ai.com/v1/chat/completions",
  "model": "moderation-model",
  "secretRef": "env://MAP_SERVICE_AI_PROVIDER_KEY",
  "enabled": true,
  "isDefault": false,
  "timeoutMs": 3000,
  "maxAttempts": 2,
  "dailyBudget": 0,
  "maxConcurrency": 2,
  "promptVersion": "interaction-moderation-v1",
  "redaction": {}
}
~~~

调用顺序必须是：

1. POST /api/v1/admin/moderation/providers。
2. POST /api/v1/admin/moderation/providers/provider-main/verify。
3. 验证成功后，POST /api/v1/admin/moderation/providers/provider-main/default。
4. 确认 GET /api/v1/admin/moderation/providers 显示 healthStatus=verified、已启用和 default 指针正确。

verify 只发送 health-check 探针，不发送真实留言。新增或修改 endpoint、secretRef、adapter、model、prompt、timeout、重试、预算、并发或 redaction 后，provider 会自动失效并必须重新验证。验证默认 24 小时有效，过期后自动禁用并清除 default。

MAP_SERVICE_AI_ENABLED=true 只表示启用 AI 引擎；没有已验证且启用的 provider 时，留言仍可提交，但 AI 结果为 unknown + review。AI 原始 JSON 只有不超过 64KB 时才会以交互密文保存，默认 30 天后由保留任务擦除。

## 10. 定时任务、指标和日志

服务启动时自动加载 service/bin/cronJob/*.js。交互保留任务：

- cron：00 20 03 * * *。
- 时区：Asia/Shanghai。
- 每日 03:20 执行一次。
- 使用交互数据库独立连接、单实例互斥和事务。
- 失败只记录脱敏错误，等待下一次调度；不会删除 WAL 或直接修复数据库。

PM2 日志位置由 pm2.config.cjs 定义：

~~~text
logs/pm2/out.log
logs/pm2/err.log
logs/pm2/combined.outerr.log
~~~

日志排查只记录时间、事件类型、错误码、数量和脱敏 ID。不要把正文、联系方式、完整 URL 查询串、Cookie、CSRF、Token、provider 原始响应放入日志。

service/bin/interaction/operations.js 提供：

- previewRetention()：只读预览将要清理的留言、举报、AI 原始结果、事件和 outbox 数量。
- applyRetention({ dryRun: false })：单事务真实清理，重复执行安全。
- aggregateInteractionMetrics()：只返回提交量、通过/拒绝/待审、审核/举报 SLA 和 outbox 失败数等聚合值。
- sanitizeInteractionLog()：统一脱敏敏感键和值并限制字符串长度。
- createInteractionBackup() / restoreInteractionBackup()：带大小、SHA-256、时间和版本 manifest 的 SQLite 备份/恢复。

这些 helper 当前没有单独的 HTTP 管理入口，维护脚本应在本机用受控 Node 命令调用，不能把原始数据库内容暴露给浏览器。

只读预览和指标示例（在项目根目录执行）：

~~~bash
node --input-type=module <<'NODE'
import config from './service/config.js'
import InteractionDatabase from './service/bin/interaction/database.js'
import { previewRetention, aggregateInteractionMetrics } from './service/bin/interaction/operations.js'

const interaction = config.staticService.interaction
const database = new InteractionDatabase({ filePath: interaction.databasePath })
try {
  const retention = {
    reportEvents: interaction.retention.reportEventsDays,
    outbox: interaction.retention.outboxDays,
  }
  console.log(JSON.stringify({
    retention: previewRetention(database, { retention }),
    metrics: aggregateInteractionMetrics(database),
  }))
} finally {
  database.close()
}
NODE
~~~

该命令不会返回留言正文或联系方式。真实清理由 cron 执行；若维护窗口必须手工调用 `applyRetention({ dryRun: false })`，应先保存备份、记录预览结果，并在单写进程停止或隔离后执行。

## 11. 备份和恢复

### 11.1 备份范围

完整发布备份至少包括：

~~~text
.db/map-service.sqlite*
.db/interaction.sqlite*
.db/admin/
MAP_SERVICE_SHARE_SECRET_KEY
MAP_SERVICE_INTERACTION_SECRET_KEY
MAP_SERVICE_ADMIN_TOKEN_SECRET（若历史配置仍被其他能力使用）
~~~

用户数据库和交互数据库属于不同 schema，不能只备份其中一个。SQLite 使用 WAL 时，服务运行中不能只复制主 .sqlite 文件拼接快照；优先在维护窗口停止写入后备份，或使用经过恢复演练验证的 SQLite Online Backup 工具。

### 11.2 交互数据库 manifest 备份

先停止或隔离写入进程，再执行：

~~~bash
mkdir -p /var/backups/map-service/interaction
node --input-type=module <<'NODE'
import { createInteractionBackup } from './service/bin/interaction/operations.js'
import config from './service/config.js'

const manifest = await createInteractionBackup({
  sourcePath: config.staticService.interaction.databasePath,
  destinationDir: '/var/backups/map-service/interaction',
})
console.log(JSON.stringify({ file: manifest.file, size: manifest.size, sha256: manifest.sha256, createdAt: manifest.createdAt }))
NODE
~~~

备份文件旁边会生成同名 .manifest.json。把 manifest、应用版本、两个数据库路径和备份时间写入备份目录的受控记录；不要把交互正文或密钥打印到终端记录。

### 11.3 恢复

恢复是会覆盖当前交互状态的维护操作，只能在明确维护窗口执行：

1. 停止应用并确认只有一个进程退出。
2. 将当前 .db/interaction.sqlite* 移到故障留存目录，不直接删除。
3. 校验备份文件和 manifest 的 SHA-256。
4. 使用与备份兼容的代码恢复到原路径。
5. 启动服务，确认健康检查、管理员会话、策略读取和公开留言读取。
6. 使用一个测试 Feature 完成留言提交、人工审核、举报详情和保留预览。
7. 恢复成功后再按组织保留策略处理故障留存副本。

恢复命令示例：

~~~bash
node --input-type=module <<'NODE'
import { restoreInteractionBackup } from './service/bin/interaction/operations.js'
import config from './service/config.js'

await restoreInteractionBackup({
  backupPath: '/var/backups/map-service/interaction/interaction-2026-08-24T00-00-00-000Z.sqlite',
  manifestPath: '/var/backups/map-service/interaction/interaction-2026-08-24T00-00-00-000Z.sqlite.manifest.json',
  targetPath: config.staticService.interaction.databasePath,
})
console.log('interaction database restored')
NODE
~~~

用户数据库和 .db/admin/ 按[用户体系部署与运维](./user-system-deployment.md)的同一备份批次恢复。恢复后不要用文本编辑器改 SQLite schema、密文、Token hash、权限关系或 migration 版本。

## 12. 升级、回滚和发布验收

### 12.0 161 内网一键发布

本机工作区根目录的 `deploy-161.sh` 是 161 内测环境的唯一推荐发布入口。该脚本属于本机运维资产，已加入 `.gitignore`，不会进入 GitHub；部署机或新工作区需要通过受控运维方式单独配置。它默认连接 `root@192.168.0.161`，部署到 `/opt/1panel/apps/local/map-service/map-service`，映射端口 `33088`，容器名 `map-service-161`。

发布前脚本会在本地依次执行 `npm run check`、`npm test`、`npm run build` 和 `git diff --check`，并要求工作树干净；随后打包当前 Git HEAD、校验 SHA-256，通过 SSH 传输。远端会：

1. 在 `/opt/1panel/backup/map-service/YYYY/MM/DD/` 创建发布前备份。
2. 备份应用代码、容器/镜像信息和 1Panel 模板；原地保留 `.env`、`admin-password.txt` 以及整个 `data/` 持久化目录。
3. 构建并启动 `map-service:<package.json.version>`，执行 `/health` 与 `/api/v1/health` 双探活。
4. 校验运行镜像、容器内包版本和单实例数量；失败时自动恢复发布前代码并重新启动旧 Compose。

常用命令：

~~~bash
cd /path/to/map-service
./deploy-161.sh
~~~

回滚到某次发布前备份（目录必须位于远端允许的备份根目录内）：

~~~bash
./deploy-161.sh --rollback /opt/1panel/backup/map-service/YYYY/MM/DD/<backup-name>
~~~

脚本支持少量非敏感覆盖项：`REMOTE_HOST`、`REMOTE_APP_DIR`、`REMOTE_TEMPLATE_DIR`、`REMOTE_BACKUP_ROOT`、`CONTAINER_NAME`、`PORT`、`RELEASE_VERSION` 和 `RUN_CHECKS=0`。默认发布不要关闭检查，也不要通过环境变量注入交互密钥；密钥只从 161 现有 `.env` 读取并保持原位。发布完成后把版本、备份路径、健康检查和回滚目录写入 161 操作日志，并同步到 Outline 的“操作记录”集合。

66 服务器使用本机同样不入库的 `deploy-66.sh`，通过 SSH 推送已提交 commit 后执行依赖预检、数据库和代码备份、PM2 环境保留、健康检查及失败回滚。两个脚本均不应通过 GitHub 分发，也不应把服务器密钥写入脚本或环境覆盖项。

### 12.1 升级流程

1. 记录当前代码版本、Node/npm 版本、PM2 进程、数据库路径和环境变量名（不记录密钥值）。
2. 创建用户数据库、交互数据库、.db/admin/ 和密钥的可恢复备份。
3. 在隔离环境用备份副本启动新代码，验证 migration、登录、策略、公开读取和管理审核。
4. 在发布工作区执行 npm ci、npm run check、交互定向测试、npm test 和 npm run build。
5. 维护窗口停止旧进程，切换代码和依赖，使用同一环境文件启动。
6. 使用 pm2 restart pm2.config.cjs --update-env，不要在 SQLite 迁移期间启动第二个写进程。
7. 完成第 12.3 节验收清单后再删除或缩短升级前备份保留期。

当前交互 public schema 版本仍为 1；AI 表采用幂等 additive migration。版本升级失败时应停止进程、保留错误日志和数据库副本，并使用升级前代码/备份恢复，不要手工修改版本号强行启动。

### 12.2 回滚

- 代码回滚和数据库回滚必须作为同一发布批次处理。
- 如果新版本已经执行了只向前兼容的 migration，先在备份副本上验证旧代码是否能打开；不能打开时使用升级前数据库副本恢复。
- 不要把新版本生成的数据库文件直接覆盖旧备份，也不要删除 -wal/-shm 以“修复”锁定。
- AI provider 配置存放在交互数据库中；回滚时必须同时恢复对应数据库，或者确认旧代码可以读取该 additive schema。

### 12.3 发布验收

- /health 与 /api/v1/health 返回成功。
- 管理员可读取活动策略，未发布策略时写入明确返回 503。
- 登录留言写请求能通过 CSRF；匿名留言按策略正确允许或拒绝。
- 公开列表和 count 只包含 active + approved。
- 重复 clientRequestId 不产生第二条留言或举报。
- 人工通过后留言可见；软删除、拒绝、父留言隐藏会按契约影响回复。
- 举报详情可读脱敏正文和掩码联系方式；hide_media/hide_comment 明确拒绝。
- AI provider 在 verify 前不可用，verify 后可设为 default；修改配置后再次变为未验证。
- PM2 只有一个 map-service 写进程，cron 日志显示交互保留任务已注册。
- 备份 manifest 可校验，至少完成一次隔离恢复演练。

## 13. Agent 执行协议

自动化 agent 只能执行可审计、可回滚的本地维护动作；不能通过绕过 API、直接修改 SQLite 或关闭 CSRF 获得权限。

### 13.1 只读预检

~~~bash
set -e
node --version
npm --version
test -f package-lock.json
printenv MAP_SERVICE_INTERACTION_SECRET_KEY >/dev/null 2>&1 || printenv MAP_SERVICE_SHARE_SECRET_KEY >/dev/null 2>&1
node --input-type=module -e "import config from './service/config.js'; console.log(JSON.stringify({port: config.staticService.port, interactionDatabase: config.staticService.interaction.databasePath, aiEnabled: config.staticService.interaction.ai.enabled}))"
~~~

预检失败时先报告缺失的配置名或路径，不读取、打印或猜测密钥值。

### 13.2 发布验证顺序

~~~bash
npm ci
npm run check
node --test tests/interaction-*.test.js
npm test
npm run build
git diff --check
~~~

若只修改 Markdown，仍应运行 git diff --check 和交互定向测试；npm run check 可作为代码未改动的回归证据。任何命令失败都要保留退出码、短错误摘要和下一步，不要把整份日志或数据库内容发送到外部模型。

### 13.3 受控启动和探活

~~~bash
pm2 start pm2.config.cjs --update-env
curl --fail --silent http://127.0.0.1:3088/health
curl --fail --silent http://127.0.0.1:3088/api/v1/health
pm2 status map-service
~~~

agent 不得把 instances 改成大于 1，不得开启生产 MAP_SERVICE_ENABLE_AUTO_PULL，不得在未备份时执行恢复或迁移回滚。

### 13.4 管理操作边界

- 发布策略、关键词、人工审核、举报动作和 AI provider 配置必须使用有权限的用户会话和 CSRF。
- agent 可以生成请求体和检查响应契约，但不得从浏览器 Cookie、密钥文件或数据库中回显敏感值。
- 看到 hide_media/hide_comment 被拒绝时，应报告“能力未接入”，不能重试为任意数据库更新。
- 看到 RESOURCE_NOT_FOUND 时，先检查 publicId、已发布快照和分享访问授权；不要用内部 ID 猜测或枚举资源。
- 看到 migration、密钥或数据库锁错误时，先停止下游写操作，保留副本并升级给系统维护者。

## 14. 故障排查

### 交互接口返回 INTERACTION_SERVICE_UNAVAILABLE

检查：

1. 生产进程是否加载了 MAP_SERVICE_INTERACTION_SECRET_KEY 或稳定的 MAP_SERVICE_SHARE_SECRET_KEY。
2. MAP_SERVICE_INTERACTION_DATABASE 的父目录是否存在且服务账号可写。
3. 活动策略是否已经发布；GET /api/v1/admin/moderation/settings 应返回 published=true。
4. SQLite 是否正在被第二个 map-service 进程或不受控备份工具占用。

不要在响应中暴露密钥缺失、密文内容或数据库堆栈；这些只写入脱敏维护日志。

### 留言已返回 202 但公开列表没有

这是预期的待审行为。检查管理列表中的 moderationStatus、关键词决策、AI unknown/review 决策和人工审核链；只有人工或符合明确自动通过条件后才会变为公开。不要让前端直接把提交回执当作公开留言。

### 返回 AUTH_REQUIRED、CSRF_INVALID 或 PERMISSION_DENIED

确认请求使用同一 HTTPS origin、Cookie jar 未丢失、X-CSRF-Token 与当前 Cookie 一致、反向代理的可信协议配置正确，并确认账号拥有对应权限。登录态写请求不要改用旧 Bearer Token；匿名写请求不要伪造 CSRF。

### 返回 RESOURCE_NOT_FOUND

检查分享是否仍为可访问状态、站点访问密码是否已通过、publicId 是否轮换、shareItemId + featureId (+ mediaId) 是否来自当前已发布快照。该错误刻意隐藏不存在和无权访问的差异。

### 常见错误码速查

| 错误码 | 常见 HTTP 状态 | 处理方向 |
| --- | ---: | --- |
| `AUTH_REQUIRED` | 401 | 登录或确认匿名策略是否允许 |
| `CSRF_INVALID` | 403 | 重新读取当前 CSRF Cookie，确认 Origin/Referer 和代理 HTTPS 配置 |
| `PERMISSION_DENIED` | 403 | 给账号分配对应最小权限，或使用受控超级管理员 |
| `RESOURCE_NOT_FOUND` | 404 | 检查 publicId、已发布快照和分享授权；不要枚举内部 ID |
| `CONTENT_TOO_LARGE` | 413 | 按正文、举报说明或证据上限截断并重新提交 |
| `DUPLICATE_REQUEST` | 409 | 复用原 `clientRequestId` 查询结果，不要生成第二个业务动作 |
| `RATE_LIMITED` | 429 | 等待窗口结束，检查是否误启多写进程或过宽代理信任 |
| `INTERACTION_SERVICE_UNAVAILABLE` | 503 | 检查交互密钥、数据库目录、活动策略和 SQLite 锁 |

### AI provider 不执行或变为 unknown

按顺序检查 MAP_SERVICE_AI_ENABLED、MAP_SERVICE_AI_ALLOWED_HOSTS、secretRef 对应环境变量、adapter 是否为 openai-compatible、endpoint 是否 HTTPS、provider 是否已 verify 且未超过 TTL、default 指针和 PM2 环境是否为最新。查看 provider 脱敏状态和 AI_PROVIDER_* 错误码，不打印原始请求或响应。

### 保留任务没有清理

检查 PM2 是否只有一个进程、cron 是否注册、时区是否为 Asia/Shanghai、系统时间是否正确，以及记录是否处于 legal_hold=1。任务固定每日 03:20 执行；失败不会删除数据，下一次调度会重试。不要直接删除 WAL、表或 migration。

### SQLite 被锁或写入超时

确认没有多实例、长事务、在线复制工具或人工数据库浏览器正在写入。停止所有写进程后在副本上诊断；保留 -wal/-shm，不要用删除文件的方式解锁。若长期需要多实例，应先设计共享数据库/限流和新的部署架构，再修改需求和测试。

## 15. 相关文档

- [交互 API 契约](./api.md#交互领域契约-phase-1bc)：字段、路由、错误和公开脱敏边界。
- [用户体系与多 KML 分享 API](./api-user-system.md)：登录、Cookie、CSRF、用户 RBAC 和分享访问。
- [用户体系部署与运维](./user-system-deployment.md)：用户数据库初始化、超级管理员、完整备份恢复。
- [交互运维闭环](./interaction-operations.md)：保留清理、指标、日志脱敏和 SQLite helper 细节。
- [KML 点位留言、内容举报与审核治理需求](./requirements/kml-comments-and-reports.md)：状态机、权限和产品边界。
- [交互开发计划](./interaction-development-plan.md)：Phase 0～3 验证记录和 Artalk 延期说明。
